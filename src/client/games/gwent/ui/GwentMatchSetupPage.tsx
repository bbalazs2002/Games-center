import { useMemo, useState } from 'react';
import { useGameTheme } from '../../../shell/useGameTheme';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { createInitialState } from '../../../../shared/games/gwent/engine/initialState';
import type { GwentState } from '../../../../shared/games/gwent/engine/state';
import type { GwentDeckDraft } from '../../../../shared/games/gwent/engine/deckRules';
import { loadPersistedGwentDeck } from './gwentDeckPersistence';
import { GwentDeckBuilder } from './GwentDeckBuilder';
import { GwentGamePage } from './GwentGamePage';
import styles from './GwentSetupPage.module.css';

type MatchStep = 'player1' | 'player2';

/**
 * Gwent-0a.2's entry point (replaces Gwent-0a.1's `GwentSetupPage` as the
 * `index.ts` default export) — walks BOTH hot-seat players through their own
 * deck build (two independent `GwentDeckBuilder` instances, kept mounted the
 * whole time via `hidden` rather than conditionally rendered, so switching
 * steps never loses either player's in-progress picks), then hands off to
 * `GwentGamePage` once both decks are valid. No route change, same pattern
 * as `HotelSetupPage -> HotelGamePage`.
 */
export function GwentMatchSetupPage() {
  const themeClass = useGameTheme('gwent');
  const persisted = useMemo(() => loadPersistedGwentDeck(), []);

  const [matchStep, setMatchStep] = useState<MatchStep>('player1');
  const [player1Name, setPlayer1Name] = useState('1. játékos');
  const [player2Name, setPlayer2Name] = useState('2. játékos');
  const [player1Draft, setPlayer1Draft] = useState<GwentDeckDraft | null>(null);
  const [player2Draft, setPlayer2Draft] = useState<GwentDeckDraft | null>(null);
  const [matchState, setMatchState] = useState<GwentState | null>(null);

  function resetMatch(): void {
    setMatchState(null);
    setMatchStep('player1');
    setPlayer1Draft(null);
    setPlayer2Draft(null);
  }

  if (matchState) {
    return <GwentGamePage initialState={matchState} onRequestNewMatch={resetMatch} />;
  }

  function startMatch(): void {
    if (!player1Draft || !player2Draft) return;
    setMatchState(
      createInitialState([
        { name: player1Name, faction: player1Draft.faction, leaderId: player1Draft.leaderId, cardCounts: player1Draft.cardCounts },
        { name: player2Name, faction: player2Draft.faction, leaderId: player2Draft.leaderId, cardCounts: player2Draft.cardCounts },
      ]),
    );
  }

  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <MenuNav backTo="/games/gwent" />
      <div className={styles.content}>
        <h1>Gwent — mérkőzés előkészítése</h1>

        <div hidden={matchStep !== 'player1'}>
          <input className={styles.nameInput} value={player1Name} onChange={(event) => setPlayer1Name(event.target.value)} />
          <GwentDeckBuilder title={`${player1Name} paklija`} persisted={persisted} onValidDraftChange={setPlayer1Draft} />
          <div className={styles.matchActions}>
            <Button disabled={!player1Draft} onClick={() => setMatchStep('player2')}>
              Tovább — {player2Name}
            </Button>
          </div>
        </div>

        <div hidden={matchStep !== 'player2'}>
          <input className={styles.nameInput} value={player2Name} onChange={(event) => setPlayer2Name(event.target.value)} />
          <GwentDeckBuilder title={`${player2Name} paklija`} onValidDraftChange={setPlayer2Draft} />
          <div className={styles.matchActions}>
            <Button variant="secondary" onClick={() => setMatchStep('player1')}>
              ← {player1Name}
            </Button>
            <Button disabled={!player1Draft || !player2Draft} onClick={startMatch}>
              Mérkőzés indítása
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GwentMatchSetupPage;
