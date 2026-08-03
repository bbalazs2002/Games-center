import type { Client } from 'colyseus';
import type { AuthPayload } from '../../auth/jwt';
import { GameRoom, type GameRoomCreateOptions } from '../../core/GameRoom';
import { OpaqueGameStateSchema } from '../../../shared/core/OpaqueGameStateSchema';
import type { GwentAction } from '../../../shared/games/gwent/engine/actions';
import { validateDeckDraft } from '../../../shared/games/gwent/engine/deckRules';
import { createInitialState, createPlaceholderGwentState, type GwentPlayerConfig } from '../../../shared/games/gwent/engine/initialState';
import { canActivateLeaderAbility } from '../../../shared/games/gwent/engine/leaderAbilities';
import { EREDIN_BRINGER_OF_DEATH, EREDIN_COMMANDER_OF_THE_RED_RIDERS } from '../../../shared/games/gwent/engine/leaderConstants';
import { reducer } from '../../../shared/games/gwent/engine/reducer';
import { getPlayer, toPublicGwentState } from '../../../shared/games/gwent/engine/rules';
import type { GwentState, PlayerId } from '../../../shared/games/gwent/engine/state';
import type { Row } from '../../../shared/games/gwent/engine/types';

/** The only 2 leader abilities that legitimately need to "search" the deck — see toPublicGwentState's doc comment and GwentRoom.requestDeckReveal. */
const DECK_SEARCH_ABILITIES = new Set([EREDIN_COMMANDER_OF_THE_RED_RIDERS, EREDIN_BRINGER_OF_DEATH]);

function isRow(value: unknown): value is Row {
  return value === 'Melee' || value === 'Ranged' || value === 'Siege';
}

function isGwentPlayerConfig(value: unknown): value is GwentPlayerConfig {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  const validFaction = c.faction === 'NorthernRealms' || c.faction === 'Nilfgaard' || c.faction === 'Monsters' || c.faction === 'Scoiatael';
  return typeof c.name === 'string' && validFaction && typeof c.leaderId === 'string' && typeof c.cardCounts === 'object' && c.cardCounts !== null;
}

/** MULLIGAN_SWAP / CONFIRM_MULLIGAN / CHOOSE_STARTING_PLAYER — everything before a card is ever played. */
function isValidPreRoundAction(c: Record<string, unknown>): boolean {
  switch (c.type) {
    case 'MULLIGAN_SWAP':
      return typeof c.playerId === 'string' && typeof c.instanceId === 'string';
    case 'CONFIRM_MULLIGAN':
      return typeof c.playerId === 'string';
    case 'FLIP_STARTING_COIN':
      return true;
    case 'CHOOSE_STARTING_PLAYER':
      return typeof c.playerId === 'string' && typeof c.chosenPlayerId === 'string';
    default:
      return false;
  }
}

function isValidPlayCardAction(c: Record<string, unknown>): boolean {
  return (
    typeof c.playerId === 'string' &&
    typeof c.instanceId === 'string' &&
    (c.chosenRow === undefined || isRow(c.chosenRow)) &&
    (c.decoyTargetInstanceId === undefined || typeof c.decoyTargetInstanceId === 'string') &&
    (c.medicReviveInstanceId === undefined || typeof c.medicReviveInstanceId === 'string')
  );
}

function isValidActivateLeaderAbilityAction(c: Record<string, unknown>): boolean {
  return (
    typeof c.playerId === 'string' &&
    (c.targetInstanceId === undefined || typeof c.targetInstanceId === 'string') &&
    (c.secondaryInstanceIds === undefined || (Array.isArray(c.secondaryInstanceIds) && c.secondaryInstanceIds.every((x) => typeof x === 'string')))
  );
}

/** PLAY_CARD / PASS / ACTIVATE_LEADER_ABILITY / CONTINUE_AFTER_ROUND — round-in-progress and round-close actions. */
function isValidInRoundAction(c: Record<string, unknown>): boolean {
  switch (c.type) {
    case 'PLAY_CARD':
      return isValidPlayCardAction(c);
    case 'PASS':
      return typeof c.playerId === 'string';
    case 'ACTIVATE_LEADER_ABILITY':
      return isValidActivateLeaderAbilityAction(c);
    case 'CONTINUE_AFTER_ROUND':
      return true;
    default:
      return false;
  }
}

export class GwentRoom extends GameRoom<GwentState, GwentAction, PlayerId> {
  maxClients = 2;

  protected readonly gameType = 'gwent';
  protected reducer = reducer;
  // Unlike Hotel/Ramses, Gwent's real createInitialState() needs a FULL
  // deck/faction/leader choice from BOTH sides at once (a tuple, not just
  // names) — that choice happens on each client's own machine, in the
  // deck-builder, before the match can begin. Held as this placeholder until
  // both players actually submit their real GwentPlayerConfig via
  // 'submitDeck' (see registerDeckConfig) — docs/gwent-0b-multiplayer-specifikacio.md §4.5.
  protected createInitialState = createPlaceholderGwentState;
  private readonly deckConfigsBySlot = new Map<PlayerId, GwentPlayerConfig>();

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    await super.onCreate(options);

    this.onMessage('submitDeck', (client: Client, deckConfig: unknown) => {
      const slot = this.clientSlots.get(client.sessionId);
      if (!slot || !isGwentPlayerConfig(deckConfig)) return;
      const validation = validateDeckDraft(deckConfig);
      if (!validation.valid) {
        client.send('deckRejected', { errors: validation.errors });
        return;
      }
      this.registerDeckConfig(slot, deckConfig);
    });

    // A NEW message, not a re-registration of the generic requestFullSync
    // handler (deliberately — overwriting an existing onMessage handler
    // relies on undocumented Colyseus behavior, see docs/ramses-0b-specifikacio.md
    // §3.2's discussion of the same trade-off). Lets GwentOnlineTransport
    // reconcile the private-hand channel on the same cadence it already
    // uses for the game-agnostic fullSync safety net.
    this.onMessage('requestPrivateSync', (client: Client) => this.sendPrivateHandTo(client));

    // The deck is masked for EVERYONE, including its own owner — EXCEPT for
    // the instant this player is legitimately using one of the 2 leader
    // abilities that canonically "search" the deck (Eredin Commander of the
    // Red Riders' chosen weather card; Bringer of Death's chosen draw). This
    // is a one-off, request-scoped reveal, never part of the ongoing
    // synced/private state — confirmed by the user, 2026-08-03.
    this.onMessage('requestDeckReveal', (client: Client) => {
      const slot = this.clientSlots.get(client.sessionId);
      if (!slot) return;
      const player = getPlayer(this.gameState, slot);
      if (!DECK_SEARCH_ABILITIES.has(player.leaderId) || !canActivateLeaderAbility(this.gameState, slot)) return;
      client.send('deckRevealed', { deck: player.deck });
    });
  }

  protected createColyseusState(): OpaqueGameStateSchema {
    return new OpaqueGameStateSchema();
  }

  protected assignPlayerSlot(joinIndex: number): PlayerId {
    // Matches the engine's own fixed 'player-1'/'player-2' scheme —
    // createInitialState always builds players positionally, never from a
    // config-carried id (see initialState.ts) — same convention as Hotel/Ramses.
    return `player-${joinIndex + 1}`;
  }

  protected onPlayerAdmitted(_slot: PlayerId, _auth: AuthPayload): void {
    // No-op: unlike Hotel/Ramses, a Gwent player's display name comes from
    // their OWN deck-building step (GwentPlayerConfig.name, submitted via
    // 'submitDeck'), not from auth.displayName at admission time.
  }

  /**
   * Every GwentAction already carries the acting player's own id, and the
   * reducer's own rules.ts guards (canPlayCard/canPass/canMulliganSwap/...)
   * are the real "is this legal right now" gate — this method only checks
   * that the SENDER isn't acting on someone else's behalf. Mulligan/starting-
   * choice actions in particular are NOT gated by currentPlayerIndex (both
   * players mulligan independently, not turn-by-turn), so this can't reduce
   * to Dáma/Ramses's trivial "current player only" check.
   */
  protected isActionAllowed(_state: GwentState, playerSlot: PlayerId, action: GwentAction): boolean {
    switch (action.type) {
      case 'FLIP_STARTING_COIN':
      case 'CONTINUE_AFTER_ROUND':
        return true; // no single actor — the reducer's own phase guard is the real gate
      default:
        return action.playerId === playerSlot;
    }
  }

  protected isValidAction(action: unknown): action is GwentAction {
    if (typeof action !== 'object' || action === null) return false;
    const c = action as Record<string, unknown>;
    return isValidPreRoundAction(c) || isValidInRoundAction(c);
  }

  protected computeAiMove(): GwentAction | null {
    return null; // no AI opponent in Gwent-0b — see docs/gwent-0b-multiplayer-specifikacio.md §1
  }

  protected syncState(): void {
    // The neutral view — both players' hand/mulliganSetAside masked, deck
    // always masked — is what the shared, mindenki-egyforma Schema carries.
    // Each client's OWN real hand goes out separately, see afterSync().
    this.state.stateJson = JSON.stringify(toPublicGwentState(this.gameState, null));
  }

  protected buildFullSyncPayload(): GwentState {
    return toPublicGwentState(this.gameState, null);
  }

  protected afterSync(): void {
    for (const client of this.clients) this.sendPrivateHandTo(client);
  }

  /**
   * `deck` is NOT included — the draw pile is masked for EVERYONE, including
   * its own owner (confirmed by the user, 2026-08-03), so there's no "real"
   * deck view to privately deliver; the neutral public state already shows
   * the correct (masked) thing to its own owner too. Only `hand`/
   * `mulliganSetAside` are genuinely owner-only secrets.
   */
  private sendPrivateHandTo(client: Client): void {
    const slot = this.clientSlots.get(client.sessionId);
    if (!slot) return;
    const player = getPlayer(this.gameState, slot);
    client.send('privateHand', { hand: player.hand, mulliganSetAside: player.mulliganSetAside });
  }

  /** Once BOTH slots have submitted a validated deck, actually builds the real match state (replacing the placeholder) and pushes it out immediately — this bypasses the reducer on purpose, same as HotelRoom/RamsesRoom's onPlayerAdmitted mutating gameState directly for a non-player-initiated setup event. */
  private registerDeckConfig(slot: PlayerId, config: GwentPlayerConfig): void {
    if (this.deckConfigsBySlot.has(slot)) return; // already submitted — ignore a duplicate/late resend (e.g. after a reconnect)
    this.deckConfigsBySlot.set(slot, config);
    const player1Config = this.deckConfigsBySlot.get('player-1');
    const player2Config = this.deckConfigsBySlot.get('player-2');
    if (!player1Config || !player2Config) return; // still waiting on the other player
    this.gameState = createInitialState([player1Config, player2Config]);
    this.syncState();
    this.afterSync();
  }
}
