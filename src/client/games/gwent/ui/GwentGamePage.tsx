import { useEffect, useMemo } from 'react';
import { useGameTheme } from '../../../shell/useGameTheme';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { createPlaceholderGwentState } from '@shared/games/gwent/engine/initialState';
import { reducer } from '@shared/games/gwent/engine/reducer';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import { GwentBackdrop } from './GwentBackdrop';
import { preloadGwentMatchImages } from './imagePreload';
import { MatchBoard } from './board/MatchBoard';
import { MulliganScreen } from './board/MulliganScreen';
import { PassDeviceScreen } from './board/PassDeviceScreen';
import { StartingChoiceScreen } from './board/StartingChoiceScreen';
import { useGwentMatchViewState, type GwentMatchViewState } from './useGwentMatchViewState';
import styles from './GwentGamePage.module.css';

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

function WinnerScreen({ state, themeClass, onRequestNewMatch }: { state: GwentState; themeClass: string | undefined; onRequestNewMatch: () => void }) {
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

interface GwentMatchPhaseContentProps {
  viewState: GwentState;
  dispatch: (action: GwentAction) => void;
  myPlayer: PlayerId | undefined;
  view: GwentMatchViewState;
}

/** The phase-appropriate screen inside the match shell — a plain if-chain instead of chained `&&`s in JSX, purely to keep `GwentGamePage` itself under the project's complexity-10 ESLint limit. */
function GwentMatchPhaseContent({ viewState, dispatch, myPlayer, view }: GwentMatchPhaseContentProps) {
  if (viewState.phase === 'MULLIGAN') return <MulliganScreen state={viewState} dispatch={dispatch} myPlayer={myPlayer} />;
  if (viewState.phase === 'AWAITING_START_CHOICE') return <StartingChoiceScreen state={viewState} dispatch={dispatch} myPlayer={myPlayer} />;
  if (viewState.phase === 'ROUND_IN_PROGRESS' || viewState.phase === 'ROUND_RESOLVED') {
    return (
      <MatchBoard
        state={viewState}
        dispatch={dispatch}
        myPlayer={view.matchBoardMyPlayer}
        bottomViewerId={view.bottomViewerId}
        requestDeckReveal={view.requestDeckReveal}
        pendingHandReveal={view.pendingHandReveal}
        onAcknowledgeHandReveal={view.onAcknowledgeHandReveal}
      />
    );
  }
  return null;
}

/**
 * Gwent's match page — local hot-seat (own LocalGameTransport) OR online
 * (a provided transport + myPlayer), same optional-transport pattern as
 * Hotel/Dáma/Ramses's GamePage components (docs/gwent-0b-multiplayer-specifikacio.md §5).
 *
 * Local mode ALSO gates the screen behind a `PassDeviceScreen` ("add tovább
 * a gépet") whenever the phase-appropriate viewer would change — the
 * felhasználó's explicit Gwent-0b request. All of that gating/derived state
 * lives in `useGwentMatchViewState` now (see its doc comment) — this
 * component's own job is just picking which screen to render.
 */
export function GwentGamePage({ initialState, transport: providedTransport, myPlayer, onRequestDeckReveal, onRequestNewMatch }: GwentGamePageProps) {
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

  const view = useGwentMatchViewState(state, isLocalMode, myPlayer, onRequestDeckReveal);

  if (state.phase === 'FINISHED') {
    return <WinnerScreen state={state} themeClass={themeClass} onRequestNewMatch={onRequestNewMatch} />;
  }

  if (view.showPassDevice) {
    return (
      <div className={themeClass}>
        <GwentBackdrop />
        <PassDeviceScreen nextPlayerName={view.nextPlayerName} onReveal={view.onRevealDevice} />
      </div>
    );
  }

  return (
    <div className={themeClass}>
      <GwentBackdrop />
      <LocalGameControls gameId="gwent" onRequestNewGame={onRequestNewMatch} resumable={false} />
      <GwentMatchPhaseContent viewState={view.viewState} dispatch={dispatch} myPlayer={myPlayer} view={view} />
    </div>
  );
}
