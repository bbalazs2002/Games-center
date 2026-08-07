import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RamsesStateSchema } from '@shared/games/ramses/colyseus/RamsesStateSchema';
import { decodeRamsesStateSchema } from '@shared/games/ramses/colyseus/ramsesStateCodec';
import type { RamsesAction } from '@shared/games/ramses/engine/actions';
import { createInitialState } from '@shared/games/ramses/engine/initialState';
import type { PlayerId, RamsesState } from '@shared/games/ramses/engine/state';
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
import { RamsesGamePage } from './RamsesGamePage';

function decodeRamsesState(colyseusState: RamsesStateSchema): RamsesState {
  return decodeRamsesStateSchema(colyseusState);
}

/** A single throwaway placeholder — real names arrive via GameRoom.onPlayerAdmitted, this is only ever rendered for the instant before the first real sync. */
function placeholderInitialState(): RamsesState {
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

/** Mirrors HotelOnlineGamePage's AnyDisconnectedBanner — Ramses can have up to 4 other participants (2-5 fő), so this just flags whether ANY of them is currently disconnected, without naming which. */
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
 * Connects to a Colyseus Ramses room (or creates a new one) and renders the
 * same RamsesGamePage as hot-seat mode with the resulting transport — the
 * Ramses-0b/0c counterpart to HotelOnlineGamePage/DamaOnlineGamePage, sharing
 * the exact same game-agnostic `useOnlineGameRoom` connection lifecycle (see
 * docs/ramses-0b-specifikacio.md §3.6). This component is only the
 * Ramses-specific glue: option-building (playerCount + password +
 * aiOpponentCount/aiDifficulty, same shape as Hotel's — see
 * docs/ramses-0c-ai-specifikacio.md §6), decoding via the per-field schema
 * codec (which also masks still-covered treasures — see ramsesStateCodec.ts),
 * and rendering.
 */
export function RamsesOnlineGamePage() {
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
  } = useOnlineGameRoom<RamsesState, RamsesAction, RamsesStateSchema, PlayerId>({
    gameId: 'ramses',
    roomId,
    token: auth?.token,
    rootSchema: RamsesStateSchema,
    createInitialState: placeholderInitialState,
    decode: decodeRamsesState,
    buildCreateOptions: () => ({
      playerCount: Number(searchParams.get('playerCount')) || 2,
      aiOpponentCount: Number(searchParams.get('aiCount')) || 0,
      aiDifficulty: searchParams.get('aiDifficulty') ?? undefined,
      // Absent means "on" (the default) — see docs/ramses-0a-specifikacio.md §8.3;
      // LobbyPage only ever sends this param at all when explicitly turning it off.
      includeSpecialCards: searchParams.get('specialCards') !== '0',
      password: searchParams.get('password') ?? undefined,
    }),
    buildJoinOptions: () => ({
      password: searchParams.get('password') ?? undefined,
      requestOnly: searchParams.get('requestOnly') === '1',
    }),
  });

  if (error) {
    return (
      <OnlineStatusScreen gameId="ramses">
        <MenuNav backTo="/games/ramses/lobby" />
        <p>{error}</p>
      </OnlineStatusScreen>
    );
  }
  if (rejectedReason) {
    return (
      <OnlineStatusScreen gameId="ramses">
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate('/games/ramses/lobby')}>Vissza a lobbyba</Button>
      </OnlineStatusScreen>
    );
  }
  if (awaitingApproval) {
    return (
      <OnlineStatusScreen gameId="ramses">
        <p>Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…</p>
        <Button
          variant="secondary"
          onClick={() => {
            void room?.leave();
            navigate('/games/ramses/lobby');
          }}
        >
          Mégse
        </Button>
      </OnlineStatusScreen>
    );
  }
  if (!transport) return <OnlineStatusScreen gameId="ramses"><p>Csatlakozás a szobához…</p></OnlineStatusScreen>;
  if (!ready) {
    return (
      <OnlineStatusScreen gameId="ramses">
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
      <RamsesGamePage transport={transport} myPlayer={myPlayer ?? undefined} />
    </div>
  );
}

export default RamsesOnlineGamePage;
