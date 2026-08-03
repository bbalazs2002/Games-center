import { Room, type Client } from 'colyseus';
import type { Prisma } from '@prisma/client';
import { ArraySchema, type Schema } from '@colyseus/schema';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import type { GameRoomState } from '../../shared/core/GameRoomState';
import { OpaqueGameStateSchema } from '../../shared/core/OpaqueGameStateSchema';
import { PendingJoinRequest } from '../../shared/core/PendingJoinRequestSchema';
import type { RoomMetadata } from '../../shared/core/RoomMetadata';
import type { Reducer } from '../../shared/core/types';
import { verifyToken, type AuthPayload } from '../auth/jwt';
import { prisma } from '../db/prismaClient';
import { ensureAiUser } from './aiUsers';
import { GAME_LOG_DIR, gameLogFilePath } from './gameLogFile';

const FLUSH_INTERVAL_MS = 5000;
// Defensive upper bound for a chain-capture-triggered run of consecutive AI
// moves (see maybeTriggerAiMove) — currentPlayer doesn't change mid-chain.
const MAX_AI_MOVES_PER_TRIGGER = 40;
// How long an unexpectedly-dropped admitted player's seat stays reserved —
// generous on purpose (flaky WiFi, a phone lock screen, a laptop lid) since
// this is a casual family app, not a competitive one. Widened 120s -> 300s
// (2026-07-24, Hotel-0b planning) — same reasoning, just more generous.
const RECONNECTION_WINDOW_SECONDS = 300;
// Off by default for ONLINE rooms — meant for offline analysis of AI-only
// test games (see docs/hotel-0d-ai-specifikacio.md §4.8/7), not regular
// online play, so it isn't wired into any lobby UI, only reachable by
// passing enableGameLog at room-creation time. Local/hot-seat games log
// unconditionally instead, via the separate localGameLogRoutes.ts HTTP path
// (2026-07-29) — GAME_LOG_DIR/gameLogFilePath are shared with that module so
// both write into the exact same logs/games/ convention.

export interface GameRoomCreateOptions {
  token?: string;
  /**
   * How many of the remaining slots (after the creator) should be filled with
   * AI opponents — 0 means none. Generalized from the old binary
   * `opponentType: 'HUMAN'|'AI'` so Hotel's 2-4 player rooms can mix AI and
   * human slots (Dáma just uses 0 or 1, matching its old binary choice). See
   * docs/hotel-0d-ai-specifikacio.md §3.1. Always clamped to `maxClients - 1`
   * server-side, so a room can never end up with zero real players.
   */
  aiOpponentCount?: number;
  /** Hotel-only — which strategy AI opponents in this room use (see docs/hotel-0d-ai-specifikacio.md §4.4). Ignored by games without difficulty tiers. */
  aiDifficulty?: string;
  /** Already-resolved plain-text password (typed or client-generated) — omitted/empty means a public room. */
  password?: string;
  /** Hotel-only (2-4, chosen at creation) — meaningless/ignored for a fixed-player-count game like Dáma. */
  playerCount?: number;
  /** Simple on/off switch for full JSONL event logging (every applied action + resulting state) — see docs/hotel-0d-ai-specifikacio.md §4.8. */
  enableGameLog?: boolean;
  /** Ramses-only — whether the 2-3-as pakli speciális kártyáit (Homokvihar/Ajándék/Kockázat/Fata Morgana/Sivatagi póker/Záró) tartalmazza a húzópakli. Defaults to true — see docs/ramses-0a-specifikacio.md §8.3. Ignored by games without this concept. */
  includeSpecialCards?: boolean;
}

export interface GameRoomJoinOptions {
  token?: string;
  password?: string;
  /** True when the client doesn't know the password and wants to send a join request instead — see docs/dama-0c-ai-specifikacio.md §3.2. */
  requestOnly?: boolean;
}

/**
 * Game-agnostic Colyseus Room. All it knows is that there's a reducer and an
 * initial state — nothing about the game itself. See
 * docs/dama-0b-multiplayer-specifikacio.md §6.
 *
 * State sync strategy is a per-game choice via `TColyseusState` (default
 * `OpaqueGameStateSchema`, a single opaque JSON field — simple, but resends
 * the whole state on every change) or a real per-field `@colyseus/schema`
 * (binary diff sync — Hotel's choice, see docs/hotel-0b-multiplayer-specifikacio.md
 * §6). Either way, `TState`'s shape is still described in exactly one place
 * (shared/games/<game>/engine) — `TColyseusState` only describes the wire
 * envelope, never duplicates game logic.
 *
 * Room-access control (password, lobby visibility, join requests) and the
 * AI-opponent "virtual client" both live here, not in a per-game subclass —
 * see docs/dama-0c-ai-specifikacio.md's opening note: every future
 * game's room inherits this behavior unchanged.
 */
export abstract class GameRoom<
  TState,
  TAction,
  TPlayerSlot extends string = string,
  TColyseusState extends Schema & GameRoomState = OpaqueGameStateSchema,
> extends Room<TColyseusState, RoomMetadata, unknown, AuthPayload> {
  protected abstract readonly gameType: string;
  protected abstract reducer: Reducer<TState, TAction>;
  protected abstract createInitialState: () => TState;

  /** Fresh, empty Colyseus state instance — replaces the old hardcoded `new OpaqueGameStateSchema()`. */
  protected abstract createColyseusState(): TColyseusState;

  /** Which player slot the joinIndex-th (0-based) connecting client gets. */
  protected abstract assignPlayerSlot(joinIndex: number): TPlayerSlot;

  /**
   * May `playerSlot` legally send exactly this `action` right now? For most
   * games this only depends on whose turn it is (the `action` param goes
   * unused) — Hotel's auction bidding is the one exception in this codebase
   * (any non-auctioneer player may PLACE_BID/PASS_BID, not just the current
   * player), which is why this takes the action too, not just the slot. See
   * docs/hotel-0b-multiplayer-specifikacio.md §6.4.
   */
  protected abstract isActionAllowed(state: TState, playerSlot: TPlayerSlot, action: TAction): boolean;

  /** Runtime shape check for incoming actions — the network is not trusted input. */
  protected abstract isValidAction(action: unknown): action is TAction;

  /**
   * Server-side "virtual client" AI move for `slot`, or null if `slot` has
   * nothing to legally do right now — see docs/dama-0c-ai-specifikacio.md
   * §2. Takes the slot (not just the state) because Hotel's auction bidding
   * means more than one AI slot can be asked "what would you do right now"
   * in the same trigger (any non-auctioneer slot may bid/pass, not just
   * whoever's turn it nominally is) — see docs/hotel-0d-ai-specifikacio.md
   * §3.2. Games without that exception (Dáma) simply ignore `slot` beyond
   * checking it's actually their turn.
   */
  protected abstract computeAiMove(state: TState, slot: TPlayerSlot): TAction | null;

  /** Writes the current `gameState` into `this.state` (the live Colyseus Schema) — game-specific because the mapping depends entirely on TColyseusState's shape. */
  protected abstract syncState(): void;

  /**
   * Optional hook, called right after a slot is admitted (fresh join or an
   * accepted join request) — default no-op. Dáma doesn't need this (its
   * players are just anonymous LIGHT/DARK). Hotel does: `HotelState.Player.name`
   * isn't known until a real client actually joins with their `auth.displayName`,
   * unlike `createInitialState()` (called once, before anyone has joined) —
   * this is where a game can react to a newly-known player identity, e.g. by
   * mutating `this.gameState` directly (not through the reducer, since this
   * isn't player-initiated game logic) and calling `this.syncState()`.
   */
  protected onPlayerAdmitted(_slot: TPlayerSlot, _auth: AuthPayload): void {
    // Intentionally empty default — most games don't need this.
  }

  /**
   * Optional hook: lets a game replace/augment a just-validated client action
   * before it reaches the reducer — default is identity (most games trust the
   * action once isValidAction/isActionAllowed pass). Hotel overrides this to
   * discard the client-supplied dice/permit-die value and substitute a
   * server-generated one, since the client is not a trusted source for that
   * value in online play (see docs/hotel-0d-ai-specifikacio.md §4.6).
   */
  protected resolveServerAction(action: TAction): TAction {
    return action;
  }

  /**
   * What to send as the full-state snapshot for requestFullSync/fullSync —
   * default is the raw gameState (Dáma/Hotel have no hidden info, so this is
   * a safe identity, unchanged from before this hook existed). A game with
   * genuinely hidden information (Ramses: covered treasures — see
   * docs/ramses-0b-specifikacio.md §3.2) MUST override this to return a
   * masked view, otherwise this generic safety-net path would leak the true
   * state straight past the game-specific syncState()'s own masking.
   */
  protected buildFullSyncPayload(): TState {
    return this.gameState;
  }

  /**
   * Optional hook, called right after every `syncState()` call (onCreate,
   * admitPlayer, applyAction) — default no-op. For a game whose hidden
   * information is player-SPECIFIC (not symmetric like Ramses's covered
   * treasures), the shared `TColyseusState` broadcast can only ever carry a
   * single, neutral view — this is where a game sends each connected client
   * their OWN private data over a separate per-client message, outside the
   * Schema entirely (Gwent: each player's real hand — see
   * docs/gwent-0b-multiplayer-specifikacio.md §4.2/4.3).
   */
  protected afterSync(): void {
    // Intentionally empty default — most games have no player-specific private data to push.
  }

  /**
   * Optional artificial "AI is thinking…" delay (ms) between consecutive
   * AI-applied actions — default 0 (no delay), matching Dáma's confirmed
   * choice. Hotel overrides this because a single AI turn is many small
   * actions (roll → buy/build → end turn), and applying all of them in one
   * synchronous burst is hard to follow even with the animation system (see
   * docs/hotel-0d-ai-specifikacio.md §4.7).
   */
  protected aiMoveDelayMs(): number {
    return 0;
  }

  /** protected, not private — game-specific `syncState()` implementations need to read the current state to write it into `this.state`. */
  protected gameState!: TState;
  private dbSessionId!: string;
  private dirty = false;
  private flushInterval?: ReturnType<typeof setInterval>;
  // protected, not private — a subclass with its own per-slot custom message
  // handler (Gwent's 'submitDeck'/'requestPrivateSync', see afterSync() doc
  // comment) needs to resolve a client's slot the same way the base class does.
  protected readonly clientSlots = new Map<string, TPlayerSlot>();
  private joinCount = 0;
  private readonly aiSlots = new Set<TPlayerSlot>();
  private aiOpponentCountRequested = 0;
  private roomPassword: string | null = null;
  private creatorSessionId: string | null = null;
  private gameLogStream: WriteStream | null = null;
  private gameLogSeq = 0;
  private pendingAiMoveTimer: ReturnType<typeof setTimeout> | null = null;

  async onAuth(_client: Client, options: GameRoomJoinOptions): Promise<AuthPayload> {
    const auth = verifyToken(options.token);
    const passwordOk = !this.roomPassword || options.password === this.roomPassword || options.requestOnly;
    if (!passwordOk) throw new Error('Hibás szoba-jelszó.');
    return auth;
  }

  async onCreate(options: GameRoomCreateOptions): Promise<void> {
    this.state = this.createColyseusState();
    this.state.ready = false;
    this.state.pendingRequests = new ArraySchema<PendingJoinRequest>();
    this.gameState = this.createInitialState();
    this.syncState();
    this.afterSync();

    // Clamped so a room can never end up with zero real players — see
    // GameRoomCreateOptions.aiOpponentCount.
    this.aiOpponentCountRequested = Math.min(
      Math.max(0, Math.trunc(options.aiOpponentCount ?? 0)),
      this.maxClients - 1,
    );
    if (options.password?.trim()) {
      this.roomPassword = options.password.trim();
      await this.setMetadata({ hasPassword: true });
    }

    const session = await prisma.gameSession.create({
      data: { gameType: this.gameType, status: 'WAITING' },
    });
    this.dbSessionId = session.id;

    if (options.enableGameLog) {
      mkdirSync(GAME_LOG_DIR, { recursive: true });
      this.gameLogStream = createWriteStream(gameLogFilePath(this.gameType, this.dbSessionId), { flags: 'a' });
    }

    this.onMessage('action', (client: Client, action: unknown) => {
      const slot = this.clientSlots.get(client.sessionId);
      if (!slot || !this.isValidAction(action) || !this.isActionAllowed(this.gameState, slot, action)) return;
      this.applyAction(this.resolveServerAction(action), slot);
      this.maybeTriggerAiMove();
    });

    this.onMessage('respondToJoinRequest', (client: Client, msg: { sessionId: string; accept: boolean }) => {
      if (client.sessionId !== this.creatorSessionId) return; // only the host may decide
      void this.respondToJoinRequest(msg.sessionId, msg.accept);
    });

    // Safety net for the per-field Schema games (Hotel-0b onward) — a client
    // can ask for a fresh full snapshot at any time, reconciling away any
    // hypothetical missed/corrupted delta. Game-agnostic and harmless for
    // OpaqueGameStateSchema games too (every one of their syncs is already a
    // full snapshot). See docs/hotel-0b-multiplayer-specifikacio.md §5.1/2.
    this.onMessage('requestFullSync', (client: Client) => {
      client.send('fullSync', JSON.stringify(this.buildFullSyncPayload()));
    });

    this.flushInterval = setInterval(() => {
      void this.flushToDatabase();
    }, FLUSH_INTERVAL_MS);
  }

  async onJoin(client: Client, options: GameRoomJoinOptions, auth: AuthPayload): Promise<void> {
    if (this.joinCount === 0) this.creatorSessionId = client.sessionId;

    if (options.requestOnly && this.roomPassword) {
      const request = new PendingJoinRequest().assign({
        sessionId: client.sessionId,
        userId: auth.userId,
        displayName: auth.displayName,
      });
      this.state.pendingRequests.push(request);
      client.send('requestPending');
      return; // no player slot yet — waits for the host's decision
    }

    await this.admitPlayer(client, auth);
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const pendingIndex = this.state.pendingRequests.findIndex(
      (request) => request.sessionId === client.sessionId,
    );
    if (pendingIndex !== -1) this.state.pendingRequests.splice(pendingIndex, 1);

    const slot = this.clientSlots.get(client.sessionId);
    if (!slot || consented) return; // not an admitted player, or they left on purpose — nothing to reconnect

    this.broadcast('opponentDisconnected', { slot }, { except: client });
    try {
      await this.allowReconnection(client, RECONNECTION_WINDOW_SECONDS);
      // onJoin does NOT run again on reconnection, and the client's own React
      // state is gone after a reload — resend so it knows its slot again.
      client.send('yourSlot', slot);
      this.broadcast('opponentReconnected', { slot }, { except: client });
    } catch {
      this.broadcast('opponentLeft', { slot }, { except: client });
    }
  }

  async onDispose(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.pendingAiMoveTimer) clearTimeout(this.pendingAiMoveTimer);
    await this.flushToDatabase();
    this.gameLogStream?.end();
  }

  /** Slot assignment + AI registration + capacity check — the single path shared by direct joins and accepted join requests. */
  private async admitPlayer(client: Client, auth: AuthPayload): Promise<void> {
    const slot = this.assignPlayerSlot(this.joinCount);
    this.joinCount += 1;
    this.clientSlots.set(client.sessionId, slot);
    client.send('yourSlot', slot);
    this.onPlayerAdmitted(slot, auth);
    this.syncState();
    this.afterSync();

    await prisma.gameSessionPlayer.create({
      data: { gameSessionId: this.dbSessionId, userId: auth.userId, playerSlot: slot },
    });

    // Only right after the creator's own join (joinCount was just bumped to 1
    // above) — matches Dáma's original once-only timing, just repeated N times.
    if (this.joinCount === 1 && this.aiOpponentCountRequested > 0) {
      for (let i = 0; i < this.aiOpponentCountRequested; i += 1) {
        await this.registerAiOpponent();
      }
    }

    if (this.joinCount >= this.maxClients) {
      await this.setPrivate(true); // capacity is the ONLY reason a room ever disappears from the lobby list
      this.rejectRemainingPendingRequests('A szoba megtelt.');
      this.state.ready = true;
      await prisma.gameSession.update({ where: { id: this.dbSessionId }, data: { status: 'IN_PROGRESS' } });
    }
  }

  private async respondToJoinRequest(sessionId: string, accept: boolean): Promise<void> {
    const index = this.state.pendingRequests.findIndex((request) => request.sessionId === sessionId);
    if (index === -1) return;
    const request = this.state.pendingRequests[index];
    this.state.pendingRequests.splice(index, 1);

    const client = this.clients.getById(sessionId);
    if (!client) return; // requester disconnected in the meantime

    if (accept) {
      await this.admitPlayer(client, { userId: request.userId, displayName: request.displayName });
    } else {
      client.send('joinRejected', { reason: 'A szoba tulajdonosa elutasította a kérelmet.' });
      client.leave();
    }
  }

  private rejectRemainingPendingRequests(reason: string): void {
    for (const request of [...this.state.pendingRequests]) {
      const client = this.clients.getById(request.sessionId);
      client?.send('joinRejected', { reason });
      client?.leave();
    }
    this.state.pendingRequests.clear();
  }

  private async registerAiOpponent(): Promise<void> {
    const aiNumber = this.aiSlots.size + 1;
    const aiUserId = await ensureAiUser(aiNumber);
    const slot = this.assignPlayerSlot(this.joinCount);
    this.joinCount += 1;
    this.aiSlots.add(slot);

    await prisma.gameSessionPlayer.create({
      data: { gameSessionId: this.dbSessionId, userId: aiUserId, playerSlot: slot },
    });
  }

  private applyAction(action: TAction, actorSlot: TPlayerSlot | null = null): void {
    this.gameState = this.reducer(this.gameState, action);
    this.syncState();
    this.afterSync();
    this.dirty = true;
    this.logAction(actorSlot, action);
  }

  /** No-op unless `enableGameLog` was passed at creation (see onCreate) — see docs/hotel-0d-ai-specifikacio.md §4.8. */
  private logAction(actorSlot: TPlayerSlot | null, action: TAction): void {
    if (!this.gameLogStream) return;
    const entry = {
      seq: this.gameLogSeq++,
      timestamp: new Date().toISOString(),
      actorSlot,
      isAi: actorSlot !== null && this.aiSlots.has(actorSlot),
      action,
      state: this.gameState,
    };
    this.gameLogStream.write(`${JSON.stringify(entry)}\n`);
  }

  /**
   * Runs the AI's virtual-client move(s) through the exact same reducer path
   * a human action would use. Asks EACH AI slot individually "what would you
   * do right now" (not just whoever's turn it nominally is) — necessary for
   * Hotel, where an out-of-turn AI slot may need to bid/pass during another
   * player's auction (see docs/hotel-0d-ai-specifikacio.md §3.2). Cheap even
   * when it's a human's turn (every AI slot's computeAiMove just returns
   * null). With no artificial delay configured (aiMoveDelayMs() === 0, the
   * default — Dáma's case), this runs synchronously to completion exactly
   * like before; with a delay it paces itself via setTimeout instead of
   * blocking, so it never blocks the room's event loop (see docs/
   * hotel-0d-ai-specifikacio.md §4.7).
   */
  private maybeTriggerAiMove(): void {
    const delayMs = this.aiMoveDelayMs();
    if (delayMs <= 0) {
      for (let guard = 0; guard < MAX_AI_MOVES_PER_TRIGGER; guard += 1) {
        if (!this.tryApplyOneAiMove()) return;
      }
      return;
    }
    this.scheduleNextAiMove(delayMs, 0);
  }

  private scheduleNextAiMove(delayMs: number, guard: number): void {
    if (guard >= MAX_AI_MOVES_PER_TRIGGER) return;
    this.pendingAiMoveTimer = setTimeout(() => {
      this.pendingAiMoveTimer = null;
      if (this.tryApplyOneAiMove()) this.scheduleNextAiMove(delayMs, guard + 1);
    }, delayMs);
  }

  /** Tries each AI slot in turn for something it can legally do right now; applies (and logs) the first one found. Returns whether a move was applied. */
  private tryApplyOneAiMove(): boolean {
    for (const slot of this.aiSlots) {
      const action = this.computeAiMove(this.gameState, slot);
      if (!action || !this.isActionAllowed(this.gameState, slot, action)) continue;
      this.applyAction(action, slot);
      return true;
    }
    return false;
  }

  private async flushToDatabase(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    await prisma.gameSession.update({
      where: { id: this.dbSessionId },
      data: { stateJson: this.gameState as Prisma.InputJsonValue },
    });
  }
}
