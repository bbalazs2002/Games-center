import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { OpaqueGameStateSchema } from '../../../core/transport/colyseusClient';
import { NEW_ROOM_PARAM } from '../../../core/transport/onlineRoomConstants';
import { useOnlineGameRoom, type PendingRequestView } from '../../../core/transport/useOnlineGameRoom';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { OnlineStatusScreen } from '../../../ui-kit/OnlineStatusScreen';
import onlineStatusStyles from '../../../ui-kit/OnlineStatusScreen.module.css';
import { useAuth } from '../../../shell/auth/AuthContext';
import type { GwentDeckDraft } from '@shared/games/gwent/engine/deckRules';
import { createPlaceholderGwentState } from '@shared/games/gwent/engine/initialState';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import { GwentDeckBuilder } from './GwentDeckBuilder';
import { GwentGamePage } from './GwentGamePage';
import { GwentOnlineTransport, type PrivateGwentHandPayload } from './GwentOnlineTransport';
import styles from './GwentSetupPage.module.css';

function decodeGwentState(colyseusState: OpaqueGameStateSchema): GwentState {
  return JSON.parse(colyseusState.stateJson) as GwentState;
}

function PendingRequestsList({ requests, onRespond }: { requests: PendingRequestView[]; onRespond: (sessionId: string, accept: boolean) => void }) {
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

interface GwentOnlineRoomScreensProps {
  ready: boolean;
  connectedRoomId: string | null;
  displayPassword: string | null;
  pendingRequests: PendingRequestView[];
  respondToJoinRequest: (sessionId: string, accept: boolean) => void;
  deckSubmitted: boolean;
  deckRejectionErrors: string[] | null;
  draft: GwentDeckDraft | null;
  onDraftChange: (draft: GwentDeckDraft | null) => void;
  onSubmitDeck: () => void;
  matchStarted: boolean;
  onlineTransport: GwentOnlineTransport | null;
  myPlayer: PlayerId | null;
  requestDeckReveal: () => Promise<CardInstance[]>;
  onRequestNewMatch: () => void;
}

/**
 * The "connected to the room" half of the online setup flow — split out of
 * `GwentOnlineGamePage` purely to keep each function under the project's
 * complexity-10 ESLint limit; the earlier guards there (error/rejected/
 * awaiting-approval/still-connecting) are a distinct phase (connection
 * itself) from this component's guards (waiting for the opponent/building a
 * deck/waiting for the match to start), so the split is also a natural
 * component boundary, not just an arbitrary complexity dodge.
 */
function GwentOnlineRoomScreens({
  ready,
  connectedRoomId,
  displayPassword,
  pendingRequests,
  respondToJoinRequest,
  deckSubmitted,
  deckRejectionErrors,
  draft,
  onDraftChange,
  onSubmitDeck,
  matchStarted,
  onlineTransport,
  myPlayer,
  requestDeckReveal,
  onRequestNewMatch,
}: GwentOnlineRoomScreensProps) {
  if (!ready) {
    return (
      <OnlineStatusScreen gameId="gwent">
        <p>
          Várakozás a másik játékosra… Szoba azonosítója: <strong>{connectedRoomId}</strong>
        </p>
        {displayPassword && (
          <p>
            Jelszó: <strong>{displayPassword}</strong>
          </p>
        )}
        <PendingRequestsList requests={pendingRequests} onRespond={respondToJoinRequest} />
      </OnlineStatusScreen>
    );
  }
  if (!deckSubmitted) {
    return (
      <div className={styles.page}>
        <MenuNav backTo="/games/gwent" />
        <div className={styles.content}>
          <h1>Állítsd össze a paklidat</h1>
          {deckRejectionErrors && (
            <ul>
              {deckRejectionErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}
          <GwentDeckBuilder onValidDraftChange={onDraftChange} />
          <div className={styles.matchActions}>
            <Button disabled={!draft} onClick={onSubmitDeck}>
              Kész, csatlakozás a mérkőzéshez
            </Button>
          </div>
        </div>
      </div>
    );
  }
  if (!matchStarted || !onlineTransport || !myPlayer) {
    return (
      <OnlineStatusScreen gameId="gwent">
        <p>Várakozás, amíg az ellenfél is elkészül a paklijával…</p>
      </OnlineStatusScreen>
    );
  }

  return (
    <GwentGamePage transport={onlineTransport} myPlayer={myPlayer} onRequestDeckReveal={requestDeckReveal} onRequestNewMatch={onRequestNewMatch} />
  );
}

/**
 * Connects to a Colyseus Gwent room (or creates a new one) and renders the
 * same GwentGamePage as hot-seat mode, once BOTH the connection is ready AND
 * this player's own deck has been submitted AND the opponent's has too — see
 * docs/gwent-0b-multiplayer-specifikacio.md §5. The deck-builder step runs
 * INSIDE this page (after connecting, not before) so useOnlineGameRoom's
 * hook can still be called unconditionally on every render, matching the
 * Rules of Hooks — connecting early is harmless, since no card data is
 * exchanged until each side explicitly 'submitDeck's.
 */
export function GwentOnlineGamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { auth } = useAuth();

  const isCreating = roomId === NEW_ROOM_PARAM;
  const [displayPassword] = useState(() => (isCreating ? searchParams.get('password') : null));

  const [draft, setDraft] = useState<GwentDeckDraft | null>(null);
  const [deckSubmitted, setDeckSubmitted] = useState(false);
  const [deckRejectionErrors, setDeckRejectionErrors] = useState<string[] | null>(null);
  const [onlineTransport, setOnlineTransport] = useState<GwentOnlineTransport | null>(null);

  const {
    transport,
    room,
    myPlayer,
    ready,
    connectedRoomId,
    pendingRequests,
    awaitingApproval,
    rejectedReason,
    error,
    respondToJoinRequest,
  } = useOnlineGameRoom<GwentState, GwentAction, OpaqueGameStateSchema, PlayerId>({
    gameId: 'gwent',
    roomId,
    token: auth?.token,
    rootSchema: OpaqueGameStateSchema,
    createInitialState: createPlaceholderGwentState,
    decode: decodeGwentState,
    buildCreateOptions: () => ({ password: searchParams.get('password') ?? undefined }),
    buildJoinOptions: () => ({
      password: searchParams.get('password') ?? undefined,
      requestOnly: searchParams.get('requestOnly') === '1',
    }),
  });

  useEffect(() => {
    if (!room) return;
    const unsubscribeRejected = room.onMessage('deckRejected', (msg: { errors: string[] }) => {
      setDeckRejectionErrors(msg.errors);
      setDeckSubmitted(false);
    });
    return () => unsubscribeRejected();
  }, [room]);

  useEffect(() => {
    if (!transport || !myPlayer) return;
    const wrapped = new GwentOnlineTransport(transport, myPlayer);
    setOnlineTransport(wrapped);
    return () => wrapped.dispose();
  }, [transport, myPlayer]);

  useEffect(() => {
    if (!room || !onlineTransport) return;
    const unsubscribePrivateHand = room.onMessage('privateHand', (payload: PrivateGwentHandPayload) =>
      onlineTransport.updatePrivateHand(payload),
    );
    return () => unsubscribePrivateHand();
  }, [room, onlineTransport]);

  const matchStarted = useMemo(() => onlineTransport?.getState().players.some((p) => p.hand.length > 0) ?? false, [onlineTransport]);

  /**
   * A real server round-trip — the deck stays masked even from its own
   * owner (see toPublicGwentState), EXCEPT for this one-off, request-scoped
   * reveal, only while legitimately activating one of the 2 deck-searching
   * leader abilities (GwentRoom validates this server-side too). Never
   * cached/reused past this single picker session.
   */
  function requestDeckReveal(): Promise<CardInstance[]> {
    return new Promise((resolve) => {
      if (!room) {
        resolve([]);
        return;
      }
      const unsubscribe = room.onMessage('deckRevealed', (payload: { deck: CardInstance[] }) => {
        unsubscribe();
        resolve(payload.deck);
      });
      room.send('requestDeckReveal');
    });
  }

  function submitDeck(): void {
    if (!draft || !room) return;
    room.send('submitDeck', { name: auth?.user.displayName ?? 'Játékos', faction: draft.faction, leaderId: draft.leaderId, cardCounts: draft.cardCounts });
    setDeckSubmitted(true);
    setDeckRejectionErrors(null);
  }

  if (error) {
    return (
      <OnlineStatusScreen gameId="gwent">
        <MenuNav backTo="/games/gwent/lobby" />
        <p>{error}</p>
      </OnlineStatusScreen>
    );
  }
  if (rejectedReason) {
    return (
      <OnlineStatusScreen gameId="gwent">
        <p>A csatlakozási kérelmedet elutasították: {rejectedReason}</p>
        <Button onClick={() => navigate('/games/gwent/lobby')}>Vissza a lobbyba</Button>
      </OnlineStatusScreen>
    );
  }
  if (awaitingApproval) {
    return (
      <OnlineStatusScreen gameId="gwent">
        <p>Kérelem elküldve, várakozás a szoba tulajdonosának jóváhagyására…</p>
        <Button
          variant="secondary"
          onClick={() => {
            void room?.leave();
            navigate('/games/gwent/lobby');
          }}
        >
          Mégse
        </Button>
      </OnlineStatusScreen>
    );
  }
  if (!transport) return <OnlineStatusScreen gameId="gwent"><p>Csatlakozás a szobához…</p></OnlineStatusScreen>;

  return (
    <GwentOnlineRoomScreens
      ready={ready}
      connectedRoomId={connectedRoomId}
      displayPassword={displayPassword}
      pendingRequests={pendingRequests}
      respondToJoinRequest={respondToJoinRequest}
      deckSubmitted={deckSubmitted}
      deckRejectionErrors={deckRejectionErrors}
      draft={draft}
      onDraftChange={setDraft}
      onSubmitDeck={submitDeck}
      matchStarted={matchStarted}
      onlineTransport={onlineTransport}
      myPlayer={myPlayer}
      requestDeckReveal={requestDeckReveal}
      onRequestNewMatch={() => navigate('/games/gwent/lobby')}
    />
  );
}

export default GwentOnlineGamePage;
