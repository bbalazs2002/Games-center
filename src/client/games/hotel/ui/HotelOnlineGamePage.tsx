import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HotelStateSchema } from '../../../../shared/games/hotel/colyseus/HotelStateSchema';
import { decodeHotelStateSchema } from '../../../../shared/games/hotel/colyseus/hotelStateCodec';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import { createInitialState } from '../../../../shared/games/hotel/engine/initialState';
import type { HotelState, PlayerId } from '../../../../shared/games/hotel/engine/state';
import { NEW_ROOM_PARAM } from '../../../core/transport/onlineRoomConstants';
import {
  useOnlineGameRoom,
  type PendingRequestView,
  type PlayerConnectionStatus,
} from '../../../core/transport/useOnlineGameRoom';
import { Button } from '../../../ui-kit/Button';
import { useAuth } from '../../../shell/auth/AuthContext';
import { HotelGamePage } from './HotelGamePage';

function decodeHotelState(colyseusState: HotelStateSchema): HotelState {
  return decodeHotelStateSchema(colyseusState);
}

/** A single throwaway placeholder — real names arrive via GameRoom.onPlayerAdmitted, this is only ever rendered for the instant before the first real sync. */
function placeholderInitialState(): HotelState {
  return createInitialState(['', '']);
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

/** Unlike Dáma's single "opponent," Hotel can have up to 3 other participants — just flags whether ANY of them is currently disconnected, without naming which (the wheel/board stay fully visible regardless — see docs/hotel-0b-multiplayer-specifikacio.md §5/4). */
function AnyDisconnectedBanner({ playerStatuses }: { playerStatuses: Partial<Record<PlayerId, PlayerConnectionStatus>> }) {
  const anyDisconnected = Object.values(playerStatuses).some((status) => status === 'disconnected');
  if (!anyDisconnected) return null;
  return <p>Egy játékos kapcsolata megszakadt — várakozás az újracsatlakozására…</p>;
}

function WaitingForPlayersScreen({
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
        Várakozás a többi játékosra… Szoba azonosítója: <strong>{connectedRoomId}</strong>
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

/**
 * Connects to a Colyseus Hotel room (or creates a new one) and renders the
 * same HotelGamePage as hot-seat mode with the resulting transport — the
 * Hotel-0b counterpart to DamaOnlineGamePage, sharing the exact same
 * game-agnostic `useOnlineGameRoom` connection lifecycle (see
 * docs/hotel-0b-multiplayer-specifikacio.md §5/3). This component is only
 * the Hotel-specific glue: option-building (playerCount instead of Dáma's
 * opponentType, no AI in Hotel-0b), decoding via the per-field schema codec,
 * and rendering.
 */
export function HotelOnlineGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const isCreating = roomId === NEW_ROOM_PARAM;
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
  } = useOnlineGameRoom<HotelState, HotelAction, HotelStateSchema, PlayerId>({
    gameId: 'hotel',
    roomId,
    token: auth?.token,
    rootSchema: HotelStateSchema,
    createInitialState: placeholderInitialState,
    decode: decodeHotelState,
    buildCreateOptions: () => ({
      playerCount: Number(searchParams.get('playerCount')) || 2,
      password: searchParams.get('password') ?? undefined,
    }),
    buildJoinOptions: () => ({
      password: searchParams.get('password') ?? undefined,
      requestOnly: searchParams.get('requestOnly') === '1',
    }),
  });

  if (error) return <p>{error}</p>;
  if (rejectedReason) {
    return (
      <div>
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate('/games/hotel/lobby')}>Vissza a lobbyba</Button>
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
            navigate('/games/hotel/lobby');
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
      <WaitingForPlayersScreen
        connectedRoomId={connectedRoomId}
        displayPassword={displayPassword}
        pendingRequests={pendingRequests}
        onRespond={respondToJoinRequest}
      />
    );
  }

  return (
    <div>
      <AnyDisconnectedBanner playerStatuses={playerStatuses} />
      <HotelGamePage transport={transport} myPlayer={myPlayer ?? undefined} />
    </div>
  );
}

export default HotelOnlineGamePage;
