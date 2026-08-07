import { getCardDef } from '../engine/cardDefs';
import type { GwentAction } from '../engine/actions';
import { canActivateLeaderAbility } from '../engine/leaderAbilities';
import { reducer } from '../engine/reducer';
import { computeRowTotal, getCurrentPlayer, getOpponent, getPlayer, ROWS, toPublicGwentState } from '../engine/rules';
import { getValidActions } from '../engine/selectors';
import type { CardInstance, GwentState, PlayerId, PlayerState } from '../engine/state';
import { enumerateCandidateActions } from './actionEnumerator';
import { estimateCardValue } from './cardValue';

export type GwentAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export function isGwentAiDifficulty(value: unknown): value is GwentAiDifficulty {
  return value === 'EASY' || value === 'MEDIUM' || value === 'HARD';
}

/**
 * "AI gondolkodik…" pause between consecutive AI-applied actions — shared by
 * GwentRoom.aiMoveDelayMs (online) and useGwentHotSeatAi.ts (local), so the
 * two never drift into separately-tuned magic numbers. Exact value is a
 * playtest question (see docs/gwent-0e-ai-specifikacio.md §12) — 800ms
 * chosen as a reasonable starting point between Hotel's 600ms (many small
 * sub-actions per turn) and Ramses's 1000ms (one big, single-glance move).
 */
export const GWENT_AI_MOVE_DELAY_MS = 800;

/**
 * The ONLY state an AI decision may be based on — see
 * docs/gwent-0e-ai-specifikacio.md §4. Structurally guarantees the opponent's
 * hand/deck are never visible (reusing `toPublicGwentState`, the same
 * function that masks a human client's own view), while leaving `slot`'s OWN
 * deck real — necessary for a CORRECT 1-ply simulation (Spy/Muster/deck-
 * search leader abilities must resolve against the real deck, exactly like
 * `GwentRoom`'s `requestDeckReveal` narrowly reveals a human's own deck only
 * at the moment they legitimately activate one of those abilities). This is
 * NOT the same as letting the AI "know" its own future draws when deciding —
 * see `scoreCandidateActions`'s `genericDrawValue` handling below, which
 * scores a not-yet-committed candidate's newly-drawn cards generically
 * rather than by their peeked identity, exactly matching what a human could
 * actually know before committing to an action.
 */
export function stateForAiDecision(state: GwentState, slot: PlayerId): GwentState {
  const masked = toPublicGwentState(state, slot);
  const realOwnDeck = getPlayer(state, slot).deck;
  return {
    ...masked,
    players: masked.players.map((p) => (p.id === slot ? { ...p, deck: realOwnDeck } : p)) as [PlayerState, PlayerState],
  };
}

// --- Mulligan / starting-choice (own-decision phases the AI DOES act on) ---

/**
 * Swaps out hand cards below the hand's own average value, one at a time
 * (mirrors how a human mulligans — see and each swap changes the hand, so
 * the next call re-evaluates fresh), then confirms once no more swaps are
 * worth making or the allowance runs out. Threshold is a playtest question
 * (see docs/gwent-0e-ai-specifikacio.md §1) — "below the current hand's own
 * average" is a simple, defensible starting point.
 */
function chooseMulliganAction(state: GwentState, slot: PlayerId): GwentAction | null {
  const valid = getValidActions(state, slot);
  if (valid.mulliganSwappableCardIds.length > 0) {
    const player = getPlayer(state, slot);
    const average = player.hand.reduce((sum, c) => sum + estimateCardValue(getCardDef(c.defId)), 0) / player.hand.length;
    const swappable = valid.mulliganSwappableCardIds
      .map((id) => player.hand.find((c) => c.instanceId === id)!)
      .sort((a, b) => estimateCardValue(getCardDef(a.defId)) - estimateCardValue(getCardDef(b.defId)));
    const weakest = swappable[0];
    if (estimateCardValue(getCardDef(weakest.defId)) < average) {
      return { type: 'MULLIGAN_SWAP', playerId: slot, instanceId: weakest.instanceId };
    }
  }
  if (valid.canConfirmMulligan) return { type: 'CONFIRM_MULLIGAN', playerId: slot };
  return null;
}

/**
 * Only ever acts on ITS OWN decisive Scoia'tael choice (always picks itself
 * to start — see docs/gwent-0e-ai-specifikacio.md §8.5). `FLIP_STARTING_COIN`
 * has no single actor (any connected client may send it) — the AI
 * deliberately leaves that to the human, same reasoning as never proactively
 * pressing CONTINUE_AFTER_ROUND (see chooseGwentAiAction below): auto-firing
 * a shared, no-actor action would race ahead of a human who might want to
 * see the coin-flip animation or read the round summary first.
 */
function chooseStartChoiceAction(state: GwentState, slot: PlayerId): GwentAction | null {
  const valid = getValidActions(state, slot);
  if (valid.startingChoicePlayerId === slot) {
    return { type: 'CHOOSE_STARTING_PLAYER', playerId: slot, chosenPlayerId: slot };
  }
  return null;
}

// --- In-round heuristic evaluation ---

function averageCardValue(deck: CardInstance[]): number {
  if (deck.length === 0) return 0;
  return deck.reduce((sum, c) => sum + estimateCardValue(getCardDef(c.defId)), 0) / deck.length;
}

interface EvalContext {
  beforeHandIds: Set<string>;
  /** Value used for any hand card NOT present before the candidate action — i.e. newly drawn by THIS
   * simulation (Spy's draw). Deliberately generic, not the drawn card's real identity — see
   * `stateForAiDecision`'s doc comment for why a peeked, not-yet-committed draw musn't sway scoring. */
  genericDrawValue: number;
  /** The OPPONENT's hand size right now (unaffected by the acting player's own candidate action) — see `HAND_COUNT_DEFICIT_WEIGHT`. */
  opponentHandCountBefore: number;
}

const HAND_VALUE_WEIGHT = 0.4; // deliberately BELOW 1 so playing a card still clearly beats holding it while the round is genuinely contested — see roundLeadValue below
const LEADER_POTENTIAL_BONUS = 1.5; // small "keep it available" nudge — see docs/gwent-0e-ai-specifikacio.md §8.3

/**
 * Only WHO wins a round matters for lives lost — not by how much. A raw,
 * uncapped row-score difference makes a purely greedy (HARD) evaluator
 * always prefer playing yet another card over passing, even once the round
 * is already safely won — which empties its hand round after round and
 * loses the multi-round war of attrition (confirmed empirically: an early,
 * uncapped version of this heuristic made HARD lose to EASY more often than
 * not on identical decks). Once a lead exceeds `LEAD_SAFETY_MARGIN`, further
 * lead is worth sharply less, letting hand-value (kept cards for future
 * rounds) compete with — and often beat — "play one more card" once already
 * comfortably ahead. Applied symmetrically to a deficit too (how far behind
 * doesn't matter much beyond "behind"). Exact margin/factor: playtest
 * question, same as every other weight here (see docs/gwent-0e-ai-specifikacio.md §1).
 */
const LEAD_SAFETY_MARGIN = 4;
const LEAD_DIMINISHING_FACTOR = 0.1;

function roundLeadValue(rowDiff: number): number {
  const magnitude = Math.abs(rowDiff);
  const value = magnitude <= LEAD_SAFETY_MARGIN ? magnitude : LEAD_SAFETY_MARGIN + (magnitude - LEAD_SAFETY_MARGIN) * LEAD_DIMINISHING_FACTOR;
  return Math.sign(rowDiff) * value;
}

function handValueAfter(hand: CardInstance[], ctx: EvalContext): number {
  return hand.reduce((sum, c) => sum + (ctx.beforeHandIds.has(c.instanceId) ? estimateCardValue(getCardDef(c.defId)) : ctx.genericDrawValue), 0);
}

/**
 * Directly penalizes ending up with FEWER cards than the opponent — the
 * single clearest signal against "dump the whole hand chasing an already-won
 * round" (confirmed empirically: `roundLeadValue`'s diminishing returns alone
 * weren't enough — a purely greedy HARD emptied its hand to 0 by round 1 in
 * testing, then had nothing left for rounds 2-3 and lost the match despite
 * winning round 1 outright). Only the DEFICIT matters (having MORE cards
 * than the opponent isn't separately rewarded beyond the cards' own
 * `estimateCardValue` already counted in `handValueAfter` — this term exists
 * purely to stop reckless over-commitment, not to encourage hoarding).
 */
const HAND_COUNT_DEFICIT_WEIGHT = 1.2;

function evaluateResultingState(state: GwentState, slot: PlayerId, ctx: EvalContext): number {
  const opponentId = getOpponent(state, slot).id;
  const ownScore = ROWS.reduce((sum, row) => sum + computeRowTotal(state, slot, row), 0);
  const opponentScore = ROWS.reduce((sum, row) => sum + computeRowTotal(state, opponentId, row), 0);
  const player = getPlayer(state, slot);
  const handScore = handValueAfter(player.hand, ctx) * HAND_VALUE_WEIGHT;
  const handCountDeficit = Math.max(0, ctx.opponentHandCountBefore - player.hand.length) * HAND_COUNT_DEFICIT_WEIGHT;
  const leaderBonus = !player.leaderAbilityUsed && canActivateLeaderAbility(state, slot) ? LEADER_POTENTIAL_BONUS : 0;
  return roundLeadValue(ownScore - opponentScore) + handScore - handCountDeficit + leaderBonus;
}

interface ScoredCandidate {
  action: GwentAction;
  score: number;
}

/**
 * Runs the REAL reducer for each candidate (needed for correct Muster/Spy/
 * row-scorch/Medic resolution — see `stateForAiDecision`'s doc comment), then
 * scores the resulting state from `slot`'s own perspective. `state` must
 * already be `stateForAiDecision`'s output.
 */
function scoreCandidateActions(state: GwentState, slot: PlayerId, candidates: GwentAction[]): ScoredCandidate[] {
  const player = getPlayer(state, slot);
  const ctx: EvalContext = {
    beforeHandIds: new Set(player.hand.map((c) => c.instanceId)),
    genericDrawValue: averageCardValue(player.deck),
    opponentHandCountBefore: getOpponent(state, slot).hand.length,
  };
  return candidates.map((action) => ({ action, score: evaluateResultingState(reducer(state, action), slot, ctx) }));
}

/**
 * How far from the top-scoring candidate a difficulty tier is willing to
 * settle — see docs/gwent-0e-ai-specifikacio.md §8.4 (mirrors Ramses's
 * EASY/MEDIUM/HARD ladder shape, not Hotel's search-depth one, since there's
 * no depth concept in a 1-ply evaluation). Exact spread is a playtest
 * question (§1).
 */
function pickByDifficulty(scored: ScoredCandidate[], difficulty: GwentAiDifficulty): GwentAction {
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  if (difficulty === 'HARD') return sorted[0].action;
  const pool = difficulty === 'MEDIUM' ? sorted.slice(0, Math.min(2, sorted.length)) : sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 2)));
  return pool[Math.floor(Math.random() * pool.length)].action;
}

/**
 * Top-level entry point for driving an AI-controlled slot — used by both
 * GwentRoom.computeAiMove (online) and useGwentHotSeatAi.ts (local hot-seat),
 * so the decision logic is never duplicated between the two transports (see
 * docs/gwent-0e-ai-specifikacio.md §7). `state` should be the TRUE state —
 * this function masks it itself via `stateForAiDecision` before making any
 * decision, so a caller can never accidentally hand it something already
 * (and differently) masked.
 *
 * Never acts during ROUND_RESOLVED/FINISHED, or on the shared, no-single-
 * actor FLIP_STARTING_COIN — those are left for the human to trigger, so an
 * eager AI can never race ahead of a human still reading a round summary or
 * watching the coin-flip. A Gwent hot-seat match always has at least one
 * human slot (see GwentMatchSetupPage.tsx's player1-is-always-human toggle),
 * and an online room always has exactly one human, so this never stalls a
 * real game — only `shared/games/gwent/ai/simulate.ts`'s AI-only driver needs
 * to advance those phases itself, deliberately outside this function.
 */
export function chooseGwentAiAction(state: GwentState, slot: PlayerId, difficulty: GwentAiDifficulty): GwentAction | null {
  const decisionState = stateForAiDecision(state, slot);

  if (decisionState.phase === 'MULLIGAN') return chooseMulliganAction(decisionState, slot);
  if (decisionState.phase === 'AWAITING_START_CHOICE') return chooseStartChoiceAction(decisionState, slot);
  if (decisionState.phase !== 'ROUND_IN_PROGRESS') return null;
  if (getCurrentPlayer(decisionState).id !== slot) return null;

  const candidates = enumerateCandidateActions(decisionState, slot);
  if (candidates.length === 0) return null;
  const scored = scoreCandidateActions(decisionState, slot, candidates);
  return pickByDifficulty(scored, difficulty);
}
