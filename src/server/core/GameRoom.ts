import { Room, type Client } from 'colyseus';
import type { Prisma } from '@prisma/client';
import { ArraySchema, type Schema } from '@colyseus/schema';
import type { GameRoomState } from '../../shared/core/GameRoomState';
import { OpaqueGameStateSchema } from '../../shared/core/OpaqueGameStateSchema';
import { PendingJoinRequest } from '../../shared/core/PendingJoinRequestSchema';
import type { RoomMetadata } from '../../shared/core/RoomMetadata';
import type { Reducer } from '../../shared/core/types';
import { verifyToken, type AuthPayload } from '../auth/jwt';
import { prisma } from '../db/prismaClient';
import { ensureAiUser } from './aiUsers';

const FLUSH_INTERVAL_MS = 5000;
// Defensive upper bound for a chain-capture-triggered run of consecutive AI
// moves (see maybeTriggerAiMove) — currentPlayer doesn't change mid-chain.
const MAX_AI_MOVES_PER_TRIGGER = 40;
// How long an unexpectedly-dropped admitted player's seat stays reserved —
// generous on purpose (flaky WiFi, a phone lock screen, a laptop lid) since
// this is a casual family app, not a competitive one. Widened 120s -> 300s
// (2026-07-24, Hotel-0b planning) — same reasoning, just more generous.
const RECONNECTION_WINDOW_SECONDS = 300;

export interface GameRoomCreateOptions {
  token?: string;
  opponentType?: 'HUMAN' | 'AI';
  /** Already-resolved plain-text password (typed or client-generated) — omitted/empty means a public room. */
  password?: string;
  /** Hotel-only (2-4, chosen at creation) — meaningless/ignored for a fixed-player-count game like Dáma. */
  playerCount?: number;
}

export interface GameRoomJoinOptions {
  token?: string;
  password?: string;
  /** True when the client doesn't know the password and wants to send a join request instead — see docs/fazis-0c-dama-ai-specifikacio.md §3.2. */
  requestOnly?: boolean;
}

/**
 * Game-agnostic Colyseus Room. All it knows is that there's a reducer and an
 * initial state — nothing about the game itself. See
 * docs/fazis-0b-multiplayer-specifikacio.md §6.
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
 * see docs/fazis-0c-dama-ai-specifikacio.md's opening note: every future
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

  /** Server-side "virtual client" AI move, or null if the AI has no legal move — see docs/fazis-0c-dama-ai-specifikacio.md §2. */
  protected abstract computeAiMove(state: TState): TAction | null;

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

  /** protected, not private — game-specific `syncState()` implementations need to read the current state to write it into `this.state`. */
  protected gameState!: TState;
  private dbSessionId!: string;
  private dirty = false;
  private flushInterval?: ReturnType<typeof setInterval>;
  private readonly clientSlots = new Map<string, TPlayerSlot>();
  private joinCount = 0;
  private readonly aiSlots = new Set<TPlayerSlot>();
  private aiOpponentRequested = false;
  private roomPassword: string | null = null;
  private creatorSessionId: string | null = null;

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

    this.aiOpponentRequested = options.opponentType === 'AI';
    if (options.password?.trim()) {
      this.roomPassword = options.password.trim();
      await this.setMetadata({ hasPassword: true });
    }

    const session = await prisma.gameSession.create({
      data: { gameType: this.gameType, status: 'WAITING' },
    });
    this.dbSessionId = session.id;

    this.onMessage('action', (client: Client, action: unknown) => {
      const slot = this.clientSlots.get(client.sessionId);
      if (!slot || !this.isValidAction(action) || !this.isActionAllowed(this.gameState, slot, action)) return;
      this.applyAction(action);
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
      client.send('fullSync', JSON.stringify(this.gameState));
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
    await this.flushToDatabase();
  }

  /** Slot assignment + AI registration + capacity check — the single path shared by direct joins and accepted join requests. */
  private async admitPlayer(client: Client, auth: AuthPayload): Promise<void> {
    const slot = this.assignPlayerSlot(this.joinCount);
    this.joinCount += 1;
    this.clientSlots.set(client.sessionId, slot);
    client.send('yourSlot', slot);
    this.onPlayerAdmitted(slot, auth);
    this.syncState();

    await prisma.gameSessionPlayer.create({
      data: { gameSessionId: this.dbSessionId, userId: auth.userId, playerSlot: slot },
    });

    if (this.aiOpponentRequested && this.aiSlots.size === 0) {
      await this.registerAiOpponent();
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

  private applyAction(action: TAction): void {
    this.gameState = this.reducer(this.gameState, action);
    this.syncState();
    this.dirty = true;
  }

  /**
   * Runs the AI's virtual-client move(s) through the exact same reducer path
   * a human action would use. Computes a candidate move first, THEN checks
   * whether any AI slot is actually allowed to make it — the reverse order
   * from a naive "find whose turn it is, then compute their move," but
   * necessary now that turn-ownership is folded into the action-aware
   * `isActionAllowed` (no more standalone "whose general turn is it" check).
   * Cheap even when it's a human's turn (the computed move is just discarded
   * once no AI slot matches it).
   */
  private maybeTriggerAiMove(): void {
    for (let guard = 0; guard < MAX_AI_MOVES_PER_TRIGGER; guard += 1) {
      const action = this.computeAiMove(this.gameState);
      if (!action) return;
      const actingSlot = [...this.aiSlots].find((slot) => this.isActionAllowed(this.gameState, slot, action));
      if (!actingSlot) return;
      this.applyAction(action);
    }
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
