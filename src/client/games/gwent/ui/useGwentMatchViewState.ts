import { useEffect, useReducer, useRef, useState } from 'react';
import { expectedViewerId, toPublicGwentState } from '@shared/games/gwent/engine/rules';
import type { CardInstance, GwentLogEntry, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import type { HotSeatAiSlots } from './useGwentHotSeatAi';

/**
 * Gwent-0c: a played/drawn/destroyed card's flight animation (cardFlight.tsx,
 * ~420-480ms) needs to actually be VISIBLE before the screen flips to
 * PassDeviceScreen — instantly swapping MatchBoard out (the previous
 * behavior) unmounted the animation mid-flight, so the acting player never
 * saw their own move. This grace window only applies while ROUND_IN_PROGRESS
 * (the only phase with card flights) — other phase transitions (mulligan →
 * starting choice, etc.) still switch instantly, nothing to wait for there.
 *
 * Gwent-0c.2 §Q: widened past the raw animation length — the felhasználó
 * wants a further ~1s breathing room AFTER the animation settles too, so the
 * outgoing player isn't rushed into handing the device over the instant the
 * card lands.
 */
const ANIMATION_SETTLE_MS = 550;
const EXTRA_PAUSE_MS = 1000;
const PASS_DEVICE_GRACE_MS = ANIMATION_SETTLE_MS + EXTRA_PAUSE_MS;

/**
 * Real playtest report, 2026-08-08: the coin-flip animation
 * (StartingChoiceScreen's `useCoinFlipAnimation`, ~900ms CSS spin) never got
 * to play — `applyFlipStartingCoin` sets `phase: 'ROUND_IN_PROGRESS'` in the
 * SAME dispatch that records the flip result, so `GwentMatchPhaseContent`
 * switches away from `StartingChoiceScreen` on the very next render, before
 * the spin (or even the "Eredmény: …" result line) is ever shown. Same class
 * of bug as the `PassDeviceScreen` grace window above, fixed the same way:
 * hold the screen on `StartingChoiceScreen` for a bit after a
 * `STARTING_COIN_FLIP` log entry appears, using the true state throughout
 * (its own `canFlipStartingCoin` check already goes false once the real
 * phase has moved on, so the flip button doesn't re-arm during the hold).
 *
 * Real playtest report, 2026-08-08 (2nd round): when the coin toss picks an
 * AI-controlled starting player, the game froze on this screen forever —
 * `useGwentHotSeatAi` schedules the AI's first move `GWENT_AI_MOVE_DELAY_MS`
 * (800ms) after ANY transport state change, well inside this grace window.
 * That move appended its own new `state.log` entries, which used to re-run
 * an effect-cleanup that cancelled the pending "turn grace off" timer with
 * nothing scheduled to replace it — `coinFlipGraceActive` got stuck `true`
 * forever. Fixed as part of the render-time redesign below (the deadline
 * now lives in a ref read fresh on every render, immune to effect-cleanup
 * races entirely).
 *
 * Real playtest report, 2026-08-08 (3rd round): the coin still visibly
 * never SPUN, even though the grace window itself worked (screen held, then
 * correctly advanced). Root cause was a one-render gap: `applyFlipStartingCoin`
 * sets `phase: 'ROUND_IN_PROGRESS'` in the SAME synchronous update that
 * appends the log entry, but the (then-)`useState`+`useEffect` version of
 * `coinFlipGraceActive` could only flip to `true` on the NEXT render (effects
 * run after commit, never inside the render that changed `state.log`). On
 * that one in-between render, `viewState.phase` was ALREADY `ROUND_IN_PROGRESS`
 * and `holdOnStartingChoiceScreen` was STILL `false` — so `GwentMatchPhaseContent`
 * briefly unmounted `StartingChoiceScreen`, then remounted it the very next
 * render once the effect caught up. That remount reset `CoinFlipPanel`'s own
 * local `spinning`/`landingDeg` state (`useCoinFlipAnimation`) back to its
 * defaults, discarding the `spinning: true` that `startFlip()` had just set
 * on click — the result text re-derives fine from `state.log` on the fresh
 * mount (so the screen LOOKED like it worked), but `landingDeg` never gets
 * set on that fresh mount, so the coin itself never visually spins.
 *
 * Fixed by computing the deadline SYNCHRONOUSLY during render (a ref
 * mutation, not `useState`) — see the hook body below — so a new coin flip
 * extends the hold in the very same render pass that advances `phase`,
 * `StartingChoiceScreen` never unmounts across a flip at all, and
 * `CoinFlipPanel`'s local animation state survives untouched.
 */
const COIN_FLIP_GRACE_MS = 1900;

type HandRevealEntry = Extract<GwentLogEntry, { type: 'LEADER_REVEALED_OPPONENT_HAND' }>;
type CoinFlipEntry = Extract<GwentLogEntry, { type: 'STARTING_COIN_FLIP' }>;

/** Extracted purely to keep `useGwentMatchViewState` under the project's complexity-10 ESLint limit. */
function resolveViewerId(useActiveViewer: boolean, activeViewerId: PlayerId | null, myPlayer: PlayerId | undefined): PlayerId | undefined {
  return useActiveViewer ? (activeViewerId ?? undefined) : myPlayer;
}

/** Same reasoning as `resolveViewerId` — the "still waiting to be acknowledged, and it's addressed to the current local viewer" check split out of the hook body. */
function resolveHandReveal(entries: HandRevealEntry[], acknowledgedCount: number, viewerForReveal: PlayerId | null | undefined): HandRevealEntry | null {
  if (entries.length <= acknowledgedCount) return null;
  const latest = entries[entries.length - 1];
  return latest.playerId === viewerForReveal ? latest : null;
}

/** Same reasoning as `resolveViewerId` — keeps the extra `coinFlipGraceActive` branch out of the hook body's own complexity count. */
function resolveShowPassDevice(transitionPending: boolean, gateReady: boolean, pendingHandReveal: HandRevealEntry | null, coinFlipGraceActive: boolean): boolean {
  return transitionPending && gateReady && !pendingHandReveal && !coinFlipGraceActive;
}

/**
 * Same reasoning as `resolveViewerId` — the render-time ref mutation (see
 * COIN_FLIP_GRACE_MS's doc comment for why it can't be an effect) split out
 * of the hook body purely to keep its own complexity count down. Mutates
 * both refs in place and returns nothing; the hook reads `deadlineRef`
 * itself right after calling this.
 */
function advanceCoinFlipDeadline(log: GwentState['log'], previousLengthRef: { current: number }, deadlineRef: { current: number | null }): void {
  if (log.length > previousLengthRef.current) {
    const newEntries = log.slice(previousLengthRef.current);
    if (newEntries.some((entry): entry is CoinFlipEntry => entry.type === 'STARTING_COIN_FLIP')) {
      deadlineRef.current = Date.now() + COIN_FLIP_GRACE_MS;
    }
  }
  previousLengthRef.current = log.length;
}

/**
 * An AI-controlled slot must NEVER trigger a "pass the device" moment —
 * there's exactly one human physically holding the device in an AI hot-seat
 * match, nobody to pass it TO, and revealing the AI's own hand to
 * `activeViewerId` would just spoil it for the human anyway (Gwent-0e real
 * playtest finding, 2026-08-07). Whenever the raw expected viewer is
 * AI-controlled, pins the transition target to whichever viewer is already
 * active (the human) — `transitionPending` then naturally stays false,
 * exactly as if it were still the human's own turn.
 */
function resolveExpectedViewer(rawExpectedViewer: PlayerId | null, activeViewerId: PlayerId | null, hotSeatAiSlots: HotSeatAiSlots): PlayerId | null {
  return rawExpectedViewer !== null && rawExpectedViewer in hotSeatAiSlots ? activeViewerId : rawExpectedViewer;
}

export interface GwentMatchViewState {
  /** Local mode: the current viewer's masked view of `state`. Online mode: `state` itself (GwentOnlineTransport already delivers a per-player-masked state). */
  viewState: GwentState;
  /** True for the entire "add tovább a gépet" gate window — see the module doc comment above for the animation-grace reasoning. */
  showPassDevice: boolean;
  nextPlayerName: string;
  onRevealDevice: () => void;
  pendingHandReveal: HandRevealEntry | null;
  onAcknowledgeHandReveal: () => void;
  matchBoardMyPlayer: PlayerId | undefined;
  bottomViewerId: PlayerId | undefined;
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
  /** True for the COIN_FLIP_GRACE_MS window right after a coin flip — see that constant's doc comment. Keeps `StartingChoiceScreen` mounted even though `state.phase` has already moved on to `ROUND_IN_PROGRESS`. */
  holdOnStartingChoiceScreen: boolean;
}

/**
 * All of `GwentGamePage`'s derived/gating state, extracted into its own hook
 * — partly for readability, partly because a custom hook is its own function
 * scope, so its branching no longer counts against `GwentGamePage`'s own
 * ESLint complexity budget (that component's job is now just "pick a screen
 * and render it").
 */
export function useGwentMatchViewState(
  state: GwentState,
  isLocalMode: boolean,
  myPlayer: PlayerId | undefined,
  onRequestDeckReveal: ((playerId: PlayerId) => Promise<CardInstance[]>) | undefined,
  hotSeatAiSlots: HotSeatAiSlots,
): GwentMatchViewState {
  // Initialized once, from the very first state — every LATER switch goes
  // through the explicit PassDeviceScreen "Megvan, mehet" button, never
  // automatically, so nothing ever flashes into view unannounced.
  const [activeViewerId, setActiveViewerId] = useState<PlayerId | null>(() => expectedViewerId(state));
  // Set once the grace window (see PASS_DEVICE_GRACE_MS) has actually
  // elapsed for the CURRENT pending transition — this is what `showPassDevice`
  // checks below, not `expected !== activeViewerId` directly.
  const [gateReady, setGateReady] = useState(false);
  // Gwent-0d §3: Emhyr var Emreis: Emperor of Nilfgaard's leader ability
  // (LEADER_ABILITY_ACTIVATED -> LEADER_REVEALED_OPPONENT_HAND) used to be a
  // silent log line — the felhasználó wants the revealed cards ACTUALLY
  // shown, and the "add tovább a gépet" hand-off held back until the
  // activating player has closed that view. Counts how many
  // LEADER_REVEALED_OPPONENT_HAND entries have been acknowledged (closed) so
  // far — any entry past that count, belonging to the CURRENT local viewer,
  // is still pending.
  const [acknowledgedRevealCount, setAcknowledgedRevealCount] = useState(0);
  const previousLogLengthForCoinRef = useRef(state.log.length);
  const coinFlipDeadlineRef = useRef<number | null>(null);
  const [, forceCoinFlipTick] = useReducer((tick: number) => tick + 1, 0);

  // Synchronous, DURING render (a ref mutation, not useState) — see
  // COIN_FLIP_GRACE_MS's doc comment for why this can't be an effect. Safe
  // as a render-time mutation: pure bookkeeping with no side effect, read
  // back immediately within the same render, and idempotent under
  // StrictMode's double-invoke (the length check is already false the
  // second time, since the ref was already advanced).
  advanceCoinFlipDeadline(state.log, previousLogLengthForCoinRef, coinFlipDeadlineRef);
  const coinFlipGraceActive = coinFlipDeadlineRef.current !== null && Date.now() < coinFlipDeadlineRef.current;

  // Nothing else forces a re-render exactly when the deadline passes (no
  // further log changes need happen) — this effect's only job is to
  // schedule one, so `coinFlipGraceActive` above gets re-evaluated and
  // correctly flips to false once real time catches up. Immune to the
  // earlier AI-freeze race: an unrelated log change during the window just
  // reschedules against the SAME ref-stored deadline (unchanged unless a
  // genuinely new flip happened above), never cancels it outright.
  useEffect(() => {
    if (coinFlipDeadlineRef.current === null) return;
    const remaining = coinFlipDeadlineRef.current - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(forceCoinFlipTick, remaining);
    return () => clearTimeout(timer);
  }, [state.log]);

  const expectedViewer = resolveExpectedViewer(expectedViewerId(state), activeViewerId, hotSeatAiSlots);
  const transitionPending = isLocalMode && expectedViewer !== null && expectedViewer !== activeViewerId;
  const revealEntries = state.log.filter((entry) => entry.type === 'LEADER_REVEALED_OPPONENT_HAND');
  const viewerForReveal = isLocalMode ? activeViewerId : myPlayer;
  const pendingHandReveal = resolveHandReveal(revealEntries, acknowledgedRevealCount, viewerForReveal);

  useEffect(() => {
    if (!transitionPending) {
      setGateReady(false);
      return;
    }
    if (state.phase !== 'ROUND_IN_PROGRESS') {
      setGateReady(true); // no card-flight to protect outside a round — switch instantly
      return;
    }
    const timer = setTimeout(() => setGateReady(true), PASS_DEVICE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [transitionPending, expectedViewer, state.phase]);

  const nextPlayer = state.players.find((p) => p.id === expectedViewer);

  return {
    viewState: isLocalMode ? toPublicGwentState(state, activeViewerId) : state,
    showPassDevice: resolveShowPassDevice(transitionPending, gateReady, pendingHandReveal, coinFlipGraceActive),
    holdOnStartingChoiceScreen: coinFlipGraceActive,
    nextPlayerName: nextPlayer?.name ?? '',
    onRevealDevice: () => setActiveViewerId(expectedViewer),
    pendingHandReveal,
    onAcknowledgeHandReveal: () => setAcknowledgedRevealCount((n) => n + 1),
    // During the grace window (transitionPending but !gateReady, ROUND_IN_PROGRESS
    // only), MatchBoard's own myPlayer gating locks the action bar to the OLD
    // viewer — reusing the exact mechanism built for online mode — so nobody can
    // act as the new player before the device is actually physically handed over,
    // while the just-played card's flight animation keeps playing undisturbed.
    matchBoardMyPlayer: resolveViewerId(transitionPending, activeViewerId, myPlayer),
    bottomViewerId: resolveViewerId(isLocalMode, activeViewerId, myPlayer),
    // Local default: reads straight from `state` (the TRUE, unmasked local
    // state — LocalGameTransport never masks internally) — there's no real
    // secret to protect from yourself in hot-seat, so no round-trip is needed.
    requestDeckReveal: onRequestDeckReveal ?? (async (playerId: PlayerId) => state.players.find((p) => p.id === playerId)?.deck ?? []),
  };
}
