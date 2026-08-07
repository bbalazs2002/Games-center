import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { OpaqueGameStateSchema } from '../../../core/transport/colyseusClient';
import { NEW_ROOM_PARAM } from '../../../core/transport/onlineRoomConstants';
import {
  useOnlineGameRoom,
  type PendingRequestView,
  type PlayerConnectionStatus,
} from '../../../core/transport/useOnlineGameRoom';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { OnlineStatusScreen } from '../../../ui-kit/OnlineStatusScreen';
import onlineStatusStyles from '../../../ui-kit/OnlineStatusScreen.module.css';
import { useAuth } from '../../../shell/auth/AuthContext';
import type { DamaAction } from '@shared/games/dama/engine/actions';
import { createInitialState } from '@shared/games/dama/engine/initialState';
import type { DamaState, Player } from '@shared/games/dama/engine/state';
import { DamaGamePage } from './DamaGamePage';

function decodeDamaState(colyseusState: OpaqueGameStateSchema): DamaState {
  return JSON.parse(colyseusState.stateJson) as DamaState;
}

function OpponentStatusBanner({ status }: { status: PlayerConnectionStatus }) {
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
      <div className={onlineStatusStyles.pendingRequestsList}>
        {requests.map((request) => (
          <div key={request.sessionId} className={onlineStatusStyles.pendingRequestRow}>
            <span>{request.displayName} szeretne csatlakozni</span>
            <div className={onlineStatusStyles.pendingRequestActions}>
              <Button onClick={() => onRespond(request.sessionId, true)}>Elfogad</Button>
              <Button variant="secondary" onClick={() => onRespond(request.sessionId, false)}>
                Elutasít
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WaitingForOpponentScreen({
  connectedRoomId,
  displayPassword,
  pendingRequests,
  onRespond,
}: {
  connectedRoomId: string | null;
  displayPassword: string | null;
  pendingRequests: PendingRequestView[];
  onRespond: (sessionId: string, accept: boolean) => void;
}) {
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
      <PendingRequestsList requests={pendingRequests} onRespond={onRespond} />
    </div>
  );
}

/** Dáma only ever has one other participant — derives its single "opponent status" from the hook's more general per-slot map. */
function opponentStatusOf(myPlayer: Player | null, playerStatuses: Partial<Record<Player, PlayerConnectionStatus>>): PlayerConnectionStatus {
  if (!myPlayer) return 'connected';
  const opponentSlot: Player = myPlayer === 'LIGHT' ? 'DARK' : 'LIGHT';
  return playerStatuses[opponentSlot] ?? 'connected';
}

/**
 * Connects to a Colyseus Dáma room (or creates a new one), and renders the
 * same DamaGamePage as hot-seat mode with the resulting transport — see
 * docs/dama-0b-multiplayer-specifikacio.md §6.2. The room-connection
 * lifecycle itself (password/join-request UI, reconnection, per-slot
 * connection status) now lives in the game-agnostic `useOnlineGameRoom` hook
 * (extracted in Hotel-0b, once a second multiplayer game needed the exact
 * same thing — see docs/hotel-0b-multiplayer-specifikacio.md §5/3). This
 * component is now just the Dáma-specific glue: option-building, decoding,
 * and rendering.
 */
export function DamaOnlineGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const isCreating = roomId === NEW_ROOM_PARAM;
  // Captured once at mount — shown on the waiting screen so the creator can share it.
  // The URL itself gets replaced (without the query string) right after create()
  // resolves, so this can't just be re-read from searchParams later.
  const [displayPassword] = useState(() => (isCreating ? searchParams.get('password') : null));

  const {
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
  } = useOnlineGameRoom<DamaState, DamaAction, OpaqueGameStateSchema, Player>({
    gameId: 'dama',
    roomId,
    token: auth?.token,
    rootSchema: OpaqueGameStateSchema,
    createInitialState,
    decode: decodeDamaState,
    buildCreateOptions: () => {
      // Dáma's own UI is still the binary Ember/AI choice — translated here
      // into the generalized 0/1 aiOpponentCount the room now expects (see
      // docs/hotel-0d-ai-specifikacio.md §3.1).
      const opponentIsAi = searchParams.get('opponent') === 'ai';
      return {
        aiOpponentCount: opponentIsAi ? 1 : 0,
        aiDifficulty: opponentIsAi ? (searchParams.get('aiDifficulty') ?? undefined) : undefined,
        password: searchParams.get('password') ?? undefined,
      };
    },
    buildJoinOptions: () => ({
      password: searchParams.get('password') ?? undefined,
      requestOnly: searchParams.get('requestOnly') === '1',
    }),
  });

  if (error) {
    return (
      <OnlineStatusScreen gameId="dama">
        <MenuNav backTo="/games/dama/lobby" />
        <p>{error}</p>
      </OnlineStatusScreen>
    );
  }
  if (rejectedReason) {
    return (
      <OnlineStatusScreen gameId="dama">
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate('/games/dama/lobby')}>Vissza a lobbyba</Button>
      </OnlineStatusScreen>
    );
  }
  if (awaitingApproval) {
    return (
      <OnlineStatusScreen gameId="dama">
        <p>Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…</p>
        <Button
          variant="secondary"
          onClick={() => {
            void room?.leave();
            navigate('/games/dama/lobby');
          }}
        >
          Mégse
        </Button>
      </OnlineStatusScreen>
    );
  }
  if (!transport) return <OnlineStatusScreen gameId="dama"><p>Csatlakozás a szobához…</p></OnlineStatusScreen>;
  if (!ready) {
    return (
      <OnlineStatusScreen gameId="dama">
        <WaitingForOpponentScreen
          connectedRoomId={connectedRoomId}
          displayPassword={displayPassword}
          pendingRequests={pendingRequests}
          onRespond={respondToJoinRequest}
        />
      </OnlineStatusScreen>
    );
  }

  return (
    <div>
      <OpponentStatusBanner status={opponentStatusOf(myPlayer, playerStatuses)} />
      <DamaGamePage transport={transport} myPlayer={myPlayer ?? undefined} />
    </div>
  );
}

export default DamaOnlineGamePage;
