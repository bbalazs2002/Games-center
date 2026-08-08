import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { GazdalkodjOkosanStateSchema } from '@shared/games/gazdalkodjOkosan/colyseus/GazdalkodjOkosanStateSchema';
import { decodeGazdalkodjOkosanStateSchema } from '@shared/games/gazdalkodjOkosan/colyseus/gazdalkodjOkosanStateCodec';
import type { GazdalkodjOkosanAction } from '@shared/games/gazdalkodjOkosan/engine/actions';
import { createInitialState } from '@shared/games/gazdalkodjOkosan/engine/initialState';
import type { GazdalkodjOkosanState, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
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
import { useAuth } from '../../../shell/auth/useAuth';
import { GazdalkodjOkosanGamePage } from './GazdalkodjOkosanGamePage';

function decodeGazdalkodjOkosanState(colyseusState: GazdalkodjOkosanStateSchema): GazdalkodjOkosanState {
  return decodeGazdalkodjOkosanStateSchema(colyseusState);
}

/** A single throwaway placeholder — real names arrive via GameRoom.onPlayerAdmitted, this is only ever rendered for the instant before the first real sync. */
function placeholderInitialState(): GazdalkodjOkosanState {
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

/** Bármennyi résztvevő lehet 2-6 közül, nem csak egy "ellenfél" — a Hotel mintáját követve, nem néven nevezve, kit érint. */
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
 * Connects to a Colyseus Gazdálkodj okosan room (or creates a new one) and
 * renders the same GazdalkodjOkosanGamePage as hot-seat mode with the
 * resulting transport — the 0b counterpart to HotelOnlineGamePage/
 * RamsesOnlineGamePage, sharing the exact same game-agnostic
 * useOnlineGameRoom connection lifecycle. No AI options (unlike Hotel/Ramses)
 * — 0b has no AI in scope, see docs/gazdalkodj-okosan-0b-multiplayer-specifikacio.md §1.
 */
export function GazdalkodjOkosanOnlineGamePage() {
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
  } = useOnlineGameRoom<GazdalkodjOkosanState, GazdalkodjOkosanAction, GazdalkodjOkosanStateSchema, PlayerId>({
    gameId: 'gazdalkodj-okosan',
    roomId,
    token: auth?.token,
    rootSchema: GazdalkodjOkosanStateSchema,
    createInitialState: placeholderInitialState,
    decode: decodeGazdalkodjOkosanState,
    buildCreateOptions: () => ({
      playerCount: Number(searchParams.get('playerCount')) || 2,
      password: searchParams.get('password') ?? undefined,
    }),
    buildJoinOptions: () => ({
      password: searchParams.get('password') ?? undefined,
      requestOnly: searchParams.get('requestOnly') === '1',
    }),
  });

  if (error) {
    return (
      <OnlineStatusScreen gameId="gazdalkodj-okosan">
        <MenuNav backTo="/games/gazdalkodj-okosan/lobby" />
        <p>{error}</p>
      </OnlineStatusScreen>
    );
  }
  if (rejectedReason) {
    return (
      <OnlineStatusScreen gameId="gazdalkodj-okosan">
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate('/games/gazdalkodj-okosan/lobby')}>Vissza a lobbyba</Button>
      </OnlineStatusScreen>
    );
  }
  if (awaitingApproval) {
    return (
      <OnlineStatusScreen gameId="gazdalkodj-okosan">
        <p>Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…</p>
        <Button
          variant="secondary"
          onClick={() => {
            void room?.leave();
            navigate('/games/gazdalkodj-okosan/lobby');
          }}
        >
          Mégse
        </Button>
      </OnlineStatusScreen>
    );
  }
  if (!transport) {
    return (
      <OnlineStatusScreen gameId="gazdalkodj-okosan">
        <p>Csatlakozás a szobához…</p>
      </OnlineStatusScreen>
    );
  }
  if (!ready) {
    return (
      <OnlineStatusScreen gameId="gazdalkodj-okosan">
        <WaitingForPlayersScreen
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
      <AnyDisconnectedBanner playerStatuses={playerStatuses} />
      <GazdalkodjOkosanGamePage transport={transport} myPlayer={myPlayer ?? undefined} />
    </div>
  );
}

export default GazdalkodjOkosanOnlineGamePage;
