import { useEffect, useMemo, useState } from 'react';
import { useGameTheme } from '../../../shell/useGameTheme';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { createPlaceholderGwentState } from '../../../../shared/games/gwent/engine/initialState';
import { reducer } from '../../../../shared/games/gwent/engine/reducer';
import { expectedViewerId, toPublicGwentState } from '../../../../shared/games/gwent/engine/rules';
import type { GwentAction } from '../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../shared/games/gwent/engine/state';
import { GwentBackdrop } from './GwentBackdrop';
import { preloadGwentMatchImages } from './imagePreload';
import { MatchBoard } from './board/MatchBoard';
import { MulliganScreen } from './board/MulliganScreen';
import { PassDeviceScreen } from './board/PassDeviceScreen';
import { StartingChoiceScreen } from './board/StartingChoiceScreen';
import styles from './GwentGamePage.module.css';

/**
 * Gwent-0c: a played/drawn/destroyed card's flight animation (cardFlight.tsx,
 * ~420-480ms) needs to actually be VISIBLE before the screen flips to
 * PassDeviceScreen — instantly swapping MatchBoard out (the previous
 * behavior) unmounted the animation mid-flight, so the acting player never
 * saw their own move. This grace window only applies while ROUND_IN_PROGRESS
 * (the only phase with card flights) — other phase transitions (mulligan →
 * starting choice, etc.) still switch instantly, nothing to wait for there.
 *
 * Gwent-0c.2 §Q: widened past the raw animation length — the felhasználó
 * wants a further ~1s breathing room AFTER the animation settles too, so the
 * outgoing player isn't rushed into handing the device over the instant the
 * card lands.
 */
const ANIMATION_SETTLE_MS = 550;
const EXTRA_PAUSE_MS = 1000;
const PASS_DEVICE_GRACE_MS = ANIMATION_SETTLE_MS + EXTRA_PAUSE_MS;

export interface GwentGamePageProps {
  /** Local mode only — seeds the LocalGameTransport built when no transport is provided. */
  initialState?: GwentState;
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/gwent-0b-multiplayer-specifikacio.md §5. */
  transport?: GameTransport<GwentState, GwentAction>;
  /**
   * Online mode only: which player slot the local client controls — when
   * set, the local "pass the device" gate (see below) is skipped entirely,
   * since GwentOnlineTransport already delivers a state masked/merged for
   * exactly this player, and there's no shared-screen concept online.
   */
  myPlayer?: PlayerId;
  /**
   * Online mode only — a real server round-trip (GwentRoom's
   * 'requestDeckReveal'/'deckRevealed') for the 2 leader abilities that
   * momentarily need to see the (otherwise fully masked, even from its own
   * owner) deck. Omitted in local mode, where a default reading straight
   * from the true local state is built below (no real secret to protect
   * from yourself in hot-seat) — see LeaderAbilityPanel's doc comment.
   */
  onRequestDeckReveal?: (playerId: PlayerId) => Promise<CardInstance[]>;
  onRequestNewMatch: () => void;
}

/**
 * Gwent's match page — local hot-seat (own LocalGameTransport) OR online
 * (a provided transport + myPlayer), same optional-transport pattern as
 * Hotel/Dáma/Ramses's GamePage components (docs/gwent-0b-multiplayer-specifikacio.md §5).
 *
 * Local mode ALSO gates the screen behind a `PassDeviceScreen` ("add tovább
 * a gépet") whenever the phase-appropriate viewer would change — the
 * felhasználó's explicit Gwent-0b request — feeding every child component a
 * `toPublicGwentState(state, activeViewerId)` view instead of the raw state,
 * so the outgoing player's hand is never left showing while the device is
 * handed over. `expectedViewerId`/`toPublicGwentState` (rules.ts) are the
 * SAME functions the online server-side masking uses — no duplicated logic.
 */
export function GwentGamePage({
  initialState,
  transport: providedTransport,
  myPlayer,
  onRequestDeckReveal,
  onRequestNewMatch,
}: GwentGamePageProps) {
  const themeClass = useGameTheme('gwent');
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<GwentState, GwentAction>(reducer, initialState ?? createPlaceholderGwentState()),
    // Deliberately NOT keyed on initialState — it only seeds the transport once, at mount
    // (same reasoning as HotelGamePage's identical comment on its own localTransport).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const loggedLocalTransport = useLocalGameLogger(localTransport, 'gwent');
  const transport = providedTransport ?? loggedLocalTransport;
  const [state, dispatch] = useGameTransport(transport);

  // Gwent-0c.3 §7: warm the image cache for the whole match right away —
  // only safe/meaningful in local hot-seat mode, where `initialState` is
  // already the TRUE, unmasked deal for both players (no secret to leak by
  // preloading it — see imagePreload.ts's own doc comment). Mount-only: a
  // deck's full card set never changes mid-match, cards just move between
  // piles, so one pass at the start already covers everything.
  useEffect(() => {
    if (isLocalMode && initialState) preloadGwentMatchImages(initialState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialized once, from the very first state — every LATER switch goes
  // through the explicit PassDeviceScreen "Megvan, mehet" button, never
  // automatically, so nothing ever flashes into view unannounced.
  const [activeViewerId, setActiveViewerId] = useState<PlayerId | null>(() => expectedViewerId(state));
  // Set once the grace window (see PASS_DEVICE_GRACE_MS) has actually
  // elapsed for the CURRENT pending transition — this is what the render
  // below checks, not `expected !== activeViewerId` directly.
  const [gateReady, setGateReady] = useState(false);
  // Gwent-0d §3: Emhyr var Emreis: Emperor of Nilfgaard's leader ability
  // (LEADER_ABILITY_ACTIVATED -> LEADER_REVEALED_OPPONENT_HAND) used to be a
  // silent log line — the felhasználó wants the revealed cards ACTUALLY
  // shown, and the "add tovább a gépet" hand-off held back until the
  // activating player has closed that view. Counts how many
  // LEADER_REVEALED_OPPONENT_HAND entries have been acknowledged (closed) so
  // far — any entry past that count, belonging to the CURRENT local viewer,
  // is still pending.
  const [acknowledgedRevealCount, setAcknowledgedRevealCount] = useState(0);

  const expectedViewer = expectedViewerId(state);
  const transitionPending = isLocalMode && expectedViewer !== null && expectedViewer !== activeViewerId;
  const revealEntries = state.log.filter((entry) => entry.type === 'LEADER_REVEALED_OPPONENT_HAND');
  const viewerForReveal = isLocalMode ? activeViewerId : myPlayer;
  const latestReveal = revealEntries[revealEntries.length - 1];
  const pendingHandReveal =
    revealEntries.length > acknowledgedRevealCount && latestReveal?.playerId === viewerForReveal ? latestReveal : null;

  useEffect(() => {
    if (!transitionPending) {
      setGateReady(false);
      return;
    }
    if (state.phase !== 'ROUND_IN_PROGRESS') {
      setGateReady(true); // no card-flight to protect outside a round — switch instantly
      return;
    }
    const timer = setTimeout(() => setGateReady(true), PASS_DEVICE_GRACE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionPending, expectedViewer, state.phase]);

  if (state.phase === 'FINISHED') {
    const winner = state.players.find((p) => state.winnerIds.includes(p.id));
    return (
      <div className={[styles.winnerScreen, themeClass].filter(Boolean).join(' ')}>
        <GwentBackdrop />
        <LocalGameControls gameId="gwent" onRequestNewGame={onRequestNewMatch} resumable={false} />
        <div className={styles.winnerBanner}>
          <h1>{winner?.name ?? 'Ismeretlen'} nyerte a mérkőzést!</h1>
        </div>
      </div>
    );
  }

  if (transitionPending && gateReady && !pendingHandReveal) {
    const nextPlayer = state.players.find((p) => p.id === expectedViewer);
    return (
      <div className={themeClass}>
        <GwentBackdrop />
        <PassDeviceScreen nextPlayerName={nextPlayer?.name ?? ''} onReveal={() => setActiveViewerId(expectedViewer)} />
      </div>
    );
  }

  const viewState = isLocalMode ? toPublicGwentState(state, activeViewerId) : state;
  // Local default: reads straight from `state` (the TRUE, unmasked local
  // state — LocalGameTransport never masks internally) — there's no real
  // secret to protect from yourself in hot-seat, so no round-trip is needed.
  const requestDeckReveal =
    onRequestDeckReveal ?? (async (playerId: PlayerId) => state.players.find((p) => p.id === playerId)?.deck ?? []);
  // During the grace window (transitionPending but !gateReady, ROUND_IN_PROGRESS
  // only), MatchBoard's own myPlayer gating locks the action bar to the OLD
  // viewer — reusing the exact mechanism built for online mode — so nobody can
  // act as the new player before the device is actually physically handed over,
  // while the just-played card's flight animation keeps playing undisturbed.
  const matchBoardMyPlayer = transitionPending ? (activeViewerId ?? undefined) : myPlayer;

  return (
    <div className={themeClass}>
      <GwentBackdrop />
      <LocalGameControls gameId="gwent" onRequestNewGame={onRequestNewMatch} resumable={false} />
      {viewState.phase === 'MULLIGAN' && <MulliganScreen state={viewState} dispatch={dispatch} myPlayer={myPlayer} />}
      {viewState.phase === 'AWAITING_START_CHOICE' && <StartingChoiceScreen state={viewState} dispatch={dispatch} myPlayer={myPlayer} />}
      {(viewState.phase === 'ROUND_IN_PROGRESS' || viewState.phase === 'ROUND_RESOLVED') && (
        <MatchBoard
          state={viewState}
          dispatch={dispatch}
          myPlayer={matchBoardMyPlayer}
          bottomViewerId={isLocalMode ? (activeViewerId ?? undefined) : myPlayer}
          requestDeckReveal={requestDeckReveal}
          pendingHandReveal={pendingHandReveal}
          onAcknowledgeHandReveal={() => setAcknowledgedRevealCount((n) => n + 1)}
        />
      )}
    </div>
  );
}
