import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Room } from 'colyseus.js';

// colyseus.js's own SchemaConstructor<T> type isn't part of its public export
// surface (only used internally by Client.d.ts) — this mirrors that exact
// shape (including its `any[]` constructor args) so this hook's `rootSchema`
// param stays structurally assignable to what Client.create/joinById/reconnect expect.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchemaConstructor<T> = new (...args: any[]) => T;
import type { GameRoomState } from '@shared/core/GameRoomState';
import { ColyseusGameTransport } from './ColyseusGameTransport';
import { colyseusClient } from './colyseusClient';
import { NEW_ROOM_PARAM } from './onlineRoomConstants';
import { clearReconnectionToken, loadReconnectionToken, saveReconnectionToken } from './reconnectionStorage';

export interface PendingRequestView {
  sessionId: string;
  userId: string;
  displayName: string;
}

export type PlayerConnectionStatus = 'connected' | 'disconnected' | 'left';

/**
 * colyseus.js throws its own, English, internal error text on a failed
 * create/join/reconnect (e.g. `"room \"xyz\" not found"` for a deleted/expired
 * room) — real playtest report (2026-07-30): this was shown to the player
 * completely untranslated. Rather than trying to pattern-match every possible
 * message this library could ever throw, only the specific, well-known "room
 * not found" case gets its own translation; anything else falls back to the
 * same generic Hungarian message the non-Error branch already used — so
 * nothing raw/English ever reaches the screen either way.
 */
function translateConnectionError(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  if (/not found/i.test(message)) return 'A szoba már nem érhető el — lehet, hogy törölték, vagy lejárt.';
  return 'Nem sikerült csatlakozni a szobához.';
}

export interface UseOnlineGameRoomArgs<TState, TColyseusState> {
  /** Colyseus room name AND the route/reconnection-storage key — e.g. 'dama', 'hotel'. */
  gameId: string;
  /** From useParams — NEW_ROOM_PARAM means "create", anything else means "join this id". */
  roomId: string | undefined;
  token: string | undefined;
  rootSchema: SchemaConstructor<TColyseusState>;
  createInitialState: () => TState;
  /** Turns the wire-shape TColyseusState into the plain TState the engine/UI expect — see ColyseusGameTransport. */
  decode: (colyseusState: TColyseusState) => TState;
  /** Extra fields for the create() call, merged with `{token}` — e.g. Dáma's `{opponentType, password}`, Hotel's `{playerCount, password}`. */
  buildCreateOptions: () => Record<string, unknown>;
  /** Extra fields for the joinById() call, merged with `{token}` — e.g. `{password, requestOnly}`. */
  buildJoinOptions: () => Record<string, unknown>;
}

export interface UseOnlineGameRoomResult<TState, TAction, TColyseusState, TPlayerSlot extends string> {
  transport: ColyseusGameTransport<TState, TAction, TColyseusState> | null;
  room: Room | null;
  myPlayer: TPlayerSlot | null;
  ready: boolean;
  connectedRoomId: string | null;
  pendingRequests: PendingRequestView[];
  awaitingApproval: boolean;
  /** Per-slot connection status, populated from opponentDisconnected/opponentReconnected/opponentLeft broadcasts — deliberately per-slot (not a single "opponentStatus") since a 3-4 player room can have more than one other participant. */
  playerStatuses: Partial<Record<TPlayerSlot, PlayerConnectionStatus>>;
  rejectedReason: string | null;
  error: string | null;
  respondToJoinRequest: (sessionId: string, accept: boolean) => void;
}

/**
 * Game-agnostic Colyseus room connection lifecycle — connect (create or
 * join, with reconnection-token fallback), password/join-request UI state,
 * per-slot connection status, and building the resulting ColyseusGameTransport.
 * Extracted from DamaOnlineGamePage.tsx once Hotel-0b became the second
 * multiplayer-capable game (that component's own comment named this exact
 * threshold — see docs/hotel-0b-multiplayer-specifikacio.md §5/3, §6.3).
 *
 * Deliberately does NOT know about any single game's action/state shape
 * beyond the generic TState/TAction/TColyseusState/TPlayerSlot type params —
 * `*OnlineGamePage` components stay responsible for their own rendering and
 * for deriving anything game-specific (e.g. Dáma's single "opponent" concept)
 * from this hook's more general per-slot data.
 */
export function useOnlineGameRoom<TState, TAction, TColyseusState extends GameRoomState, TPlayerSlot extends string>(
  args: UseOnlineGameRoomArgs<TState, TColyseusState>,
): UseOnlineGameRoomResult<TState, TAction, TColyseusState, TPlayerSlot> {
  const { gameId, roomId, token, rootSchema, createInitialState, decode, buildCreateOptions, buildJoinOptions } = args;
  const navigate = useNavigate();
  const [transport, setTransport] = useState<ColyseusGameTransport<TState, TAction, TColyseusState> | null>(null);
  const [room, setRoom] = useState<Room<TColyseusState> | null>(null);
  const [myPlayer, setMyPlayer] = useState<TPlayerSlot | null>(null);
  const [ready, setReady] = useState(false);
  const [connectedRoomId, setConnectedRoomId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestView[]>([]);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [playerStatuses, setPlayerStatuses] = useState<Partial<Record<TPlayerSlot, PlayerConnectionStatus>>>({});
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // See DamaOnlineGamePage's original comment (now here): guards against both
  // React StrictMode's dev-mode double effect run AND our own replace-navigation
  // after create() re-triggering the effect via the changed roomId param.
  const startedRef = useRef(false);

  const isCreating = roomId === NEW_ROOM_PARAM;

  useEffect(() => {
    if (!roomId || !token || startedRef.current) return;
    startedRef.current = true;
    const targetRoomId = roomId;

    async function connect(): Promise<Room<TColyseusState>> {
      if (isCreating) {
        return colyseusClient.create<TColyseusState>(gameId, { token, ...buildCreateOptions() }, rootSchema);
      }

      const storedToken = loadReconnectionToken(gameId);
      if (storedToken?.startsWith(`${targetRoomId}:`)) {
        try {
          return await colyseusClient.reconnect<TColyseusState>(storedToken, rootSchema);
        } catch {
          clearReconnectionToken(gameId); // stale/expired token — fall back below
        }
      }

      return colyseusClient.joinById<TColyseusState>(targetRoomId, { token, ...buildJoinOptions() }, rootSchema);
    }

    connect()
      .then((joinedRoom) => {
        setConnectedRoomId(joinedRoom.roomId);
        if (isCreating) {
          navigate(`/games/${gameId}/online/${joinedRoom.roomId}`, { replace: true });
        }
        joinedRoom.onMessage('yourSlot', (slot: TPlayerSlot) => {
          setMyPlayer(slot);
          setAwaitingApproval(false);
          setPlayerStatuses({});
          saveReconnectionToken(gameId, joinedRoom.reconnectionToken);
        });
        joinedRoom.onMessage('requestPending', () => setAwaitingApproval(true));
        joinedRoom.onMessage('joinRejected', (msg: { reason: string }) => setRejectedReason(msg.reason));
        joinedRoom.onMessage('opponentDisconnected', (msg: { slot: TPlayerSlot }) =>
          setPlayerStatuses((prev) => ({ ...prev, [msg.slot]: 'disconnected' })),
        );
        joinedRoom.onMessage('opponentReconnected', (msg: { slot: TPlayerSlot }) =>
          setPlayerStatuses((prev) => ({ ...prev, [msg.slot]: 'connected' })),
        );
        joinedRoom.onMessage('opponentLeft', (msg: { slot: TPlayerSlot }) =>
          setPlayerStatuses((prev) => ({ ...prev, [msg.slot]: 'left' })),
        );
        joinedRoom.onStateChange((state) => {
          setReady(state.ready);
          setPendingRequests(
            state.pendingRequests.map((request) => ({
              sessionId: request.sessionId,
              userId: request.userId,
              displayName: request.displayName,
            })),
          );
        });
        setRoom(joinedRoom);
        setTransport(new ColyseusGameTransport<TState, TAction, TColyseusState>(joinedRoom, createInitialState(), decode));
      })
      .catch((err: unknown) => {
        setError(translateConnectionError(err));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, token, navigate]);

  useEffect(() => () => transport?.dispose(), [transport]);

  function respondToJoinRequest(sessionId: string, accept: boolean): void {
    room?.send('respondToJoinRequest', { sessionId, accept });
  }

  return {
    transport,
    room,
    myPlayer,
    ready,
    connectedRoomId,
    pendingRequests,
    awaitingApproval,
    playerStatuses,
    rejectedReason,
    error,
    respondToJoinRequest,
  };
}
