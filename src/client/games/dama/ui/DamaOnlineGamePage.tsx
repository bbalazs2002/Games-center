import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Room } from 'colyseus.js';
import { ColyseusGameTransport } from '../../../core/transport/ColyseusGameTransport';
import { colyseusClient, OpaqueGameStateSchema } from '../../../core/transport/colyseusClient';
import {
  clearReconnectionToken,
  loadReconnectionToken,
  saveReconnectionToken,
} from '../../../core/transport/reconnectionStorage';
import { Button } from '../../../ui-kit/Button';
import { useAuth } from '../../../shell/auth/AuthContext';
import type { DamaAction } from '../../../../shared/games/dama/engine/actions';
import { createInitialState } from '../../../../shared/games/dama/engine/initialState';
import type { DamaState, Player } from '../../../../shared/games/dama/engine/state';
import { NEW_ROOM_PARAM } from '../onlineRoomConstants';
import { DamaGamePage } from './DamaGamePage';

interface PendingRequestView {
  sessionId: string;
  userId: string;
  displayName: string;
}

type OpponentStatus = 'connected' | 'disconnected' | 'left';

function OpponentStatusBanner({ status }: { status: OpponentStatus }) {
  if (status === 'disconnected') {
    return <p>Az ellenfél kapcsolata megszakadt — várakozás az újracsatlakozására…</p>;
  }
  if (status === 'left') {
    return <p>Az ellenfél véglegesen lecsatlakozott.</p>;
  }
  return null;
}

function PendingRequestsList({
  requests,
  onRespond,
}: {
  requests: PendingRequestView[];
  onRespond: (sessionId: string, accept: boolean) => void;
}) {
  if (requests.length === 0) return null;
  return (
    <div>
      <h3>Csatlakozási kérelmek</h3>
      {requests.map((request) => (
        <p key={request.sessionId}>
          {request.displayName} szeretne csatlakozni{' '}
          <Button onClick={() => onRespond(request.sessionId, true)}>Elfogad</Button>{' '}
          <Button variant="secondary" onClick={() => onRespond(request.sessionId, false)}>
            Elutasít
          </Button>
        </p>
      ))}
    </div>
  );
}

/**
 * Connects to a Colyseus Dáma room (or creates a new one), and renders the
 * same DamaGamePage as hot-seat mode with the resulting transport — see
 * docs/fazis-0b-multiplayer-specifikacio.md §6.2.
 *
 * Important: a live Colyseus `Room` instance (holds a WebSocket connection,
 * callbacks) can NOT be passed through React Router navigation state — the
 * browser's History API (`pushState`) uses the structured clone algorithm,
 * which throws (`DataCloneError`) on non-cloneable objects (functions,
 * WebSockets). So this component ALWAYS connects itself — there's no "hand
 * off the already-open room" trick (see spec §11-12, fixed after that bug).
 *
 * `startedRef` is deliberately a plain "run only once" guard, not a
 * per-roomId cancel flag: it protects against both (a) React StrictMode's
 * dev-mode double effect run, AND (b) our own `navigate(realRoomId,
 * {replace:true})` call (which changes the `roomId` param) re-running the
 * effect and joining the same room a second time as the same user — that was
 * exactly the previous round's bug.
 *
 * The room-access (password/join-request/pending-requests-as-host) UI here
 * is Dáma-specific glue only — the actual access-control logic lives in the
 * game-agnostic `GameRoom` core class, see docs/fazis-0c-dama-ai-specifikacio.md.
 *
 * Dáma-specific for now (not a generic "MultiplayerGameLoader") — deliberately
 * not generalized yet, while there's only one multiplayer-capable game; the
 * games/dama core/games separation principle (see
 * fazis-0a-dama-specifikacio.md §2.5) applies here too: only worth factoring
 * out once a second game genuinely needs the same thing.
 */
export function DamaOnlineGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const [transport, setTransport] = useState<ColyseusGameTransport<DamaState, DamaAction> | null>(
    null,
  );
  // Held separately from `transport`: room-management concerns (respondToJoinRequest,
  // leave) are Colyseus-specific and don't belong on the transport-agnostic
  // GameTransport interface that LocalGameTransport also implements.
  const [room, setRoom] = useState<Room<OpaqueGameStateSchema> | null>(null);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [connectedRoomId, setConnectedRoomId] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestView[]>([]);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [opponentStatus, setOpponentStatus] = useState<OpponentStatus>('connected');
  const [rejectedReason, setRejectedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  const isCreating = roomId === NEW_ROOM_PARAM;
  // Captured once at mount — shown on the waiting screen so the creator can share it.
  // The URL itself gets replaced (without the query string) right after create()
  // resolves, so this can't just be re-read from searchParams later.
  const [displayPassword] = useState(() => (isCreating ? searchParams.get('password') : null));

  useEffect(() => {
    if (!roomId || !auth || startedRef.current) return;
    startedRef.current = true;
    const token = auth.token;
    const targetRoomId = roomId;

    async function connect(): Promise<Room<OpaqueGameStateSchema>> {
      if (isCreating) {
        return colyseusClient.create(
          'dama',
          {
            token,
            opponentType: searchParams.get('opponent') === 'ai' ? 'AI' : 'HUMAN',
            password: searchParams.get('password') ?? undefined,
          },
          OpaqueGameStateSchema,
        );
      }

      // A stored reconnectionToken only makes sense for the exact room the URL
      // points to — otherwise fall through to a normal join.
      const storedToken = loadReconnectionToken('dama');
      if (storedToken?.startsWith(`${targetRoomId}:`)) {
        try {
          return await colyseusClient.reconnect(storedToken, OpaqueGameStateSchema);
        } catch {
          clearReconnectionToken('dama'); // stale/expired token — fall back below
        }
      }

      return colyseusClient.joinById(
        targetRoomId,
        {
          token,
          password: searchParams.get('password') ?? undefined,
          requestOnly: searchParams.get('requestOnly') === '1',
        },
        OpaqueGameStateSchema,
      );
    }

    connect()
      .then((room) => {
        // Read room.roomId directly rather than relying on the (possibly not-yet-updated)
        // roomId route param, so the waiting screen always shows the real id right away.
        setConnectedRoomId(room.roomId);
        if (isCreating) {
          navigate(`/games/dama/online/${room.roomId}`, { replace: true });
        }
        room.onMessage('yourSlot', (slot: Player) => {
          setMyPlayer(slot);
          setAwaitingApproval(false);
          setOpponentStatus('connected');
          // Only admitted players (fresh join OR reconnect) ever receive this —
          // pending join-request clients never do, so nothing gets saved for them.
          saveReconnectionToken('dama', room.reconnectionToken);
        });
        room.onMessage('requestPending', () => setAwaitingApproval(true));
        room.onMessage('joinRejected', (msg: { reason: string }) => setRejectedReason(msg.reason));
        room.onMessage('opponentDisconnected', () => setOpponentStatus('disconnected'));
        room.onMessage('opponentReconnected', () => setOpponentStatus('connected'));
        room.onMessage('opponentLeft', () => setOpponentStatus('left'));
        room.onStateChange((state) => {
          setReady(state.ready);
          setPendingRequests(
            state.pendingRequests.map((request) => ({
              sessionId: request.sessionId,
              userId: request.userId,
              displayName: request.displayName,
            })),
          );
        });
        setRoom(room);
        setTransport(new ColyseusGameTransport<DamaState, DamaAction>(room, createInitialState()));
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nem sikerült csatlakozni a szobához.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, auth, navigate]);

  function respond(sessionId: string, accept: boolean): void {
    room?.send('respondToJoinRequest', { sessionId, accept });
  }

  if (error) return <p>{error}</p>;
  if (rejectedReason) {
    return (
      <div>
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate(`/games/dama/lobby`)}>Vissza a lobbyba</Button>
      </div>
    );
  }
  if (awaitingApproval) {
    return (
      <div>
        <p>Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…</p>
        <Button
          variant="secondary"
          onClick={() => {
            void room?.leave();
            navigate(`/games/dama/lobby`);
          }}
        >
          Mégse
        </Button>
      </div>
    );
  }
  if (!transport) return <p>Csatlakozás a szobához…</p>;
  if (!ready) {
    return (
      <div>
        <p>
          Várakozás az ellenfélre… Szoba azonosítója: <strong>{connectedRoomId}</strong>
        </p>
        {displayPassword && (
          <p>
            Jelszó: <strong>{displayPassword}</strong>
          </p>
        )}
        <PendingRequestsList requests={pendingRequests} onRespond={respond} />
      </div>
    );
  }

  return (
    <div>
      <OpponentStatusBanner status={opponentStatus} />
      <DamaGamePage transport={transport} myPlayer={myPlayer ?? undefined} />
    </div>
  );
}

export default DamaOnlineGamePage;
