import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import theme from '../../../renderers/grid-2d/clusterBTheme.module.css';
import type { DamaAiDifficulty } from '../../../../shared/games/dama/ai';
import { DamaGamePage } from './DamaGamePage';
import type { HotSeatAiSlots } from './useDamaHotSeatAi';
import styles from './DamaSetupPage.module.css';

type OpponentType = 'HUMAN' | 'AI';

/**
 * Fixed 2-player LIGHT/DARK slot model, unlike Hotel/Ramses's N-player
 * player-N slots — the human always plays LIGHT (moves first, see
 * initialState.ts), matching the online room's assignPlayerSlot convention
 * (joinIndex 0 -> LIGHT). DamaGamePage has never shown player names (just
 * "Világos"/"Sötét"), so there's no name input here either, unlike
 * HotelSetupPage/RamsesSetupPage.
 */
function buildAiSlots(opponentType: OpponentType, difficulty: DamaAiDifficulty): HotSeatAiSlots {
  return opponentType === 'AI' ? { DARK: difficulty } : {};
}

/**
 * Collects the opponent choice (Ember/AI + nehézség) before the engine
 * starts, then hands off to DamaGamePage — mirrors HotelSetupPage/
 * RamsesSetupPage's role, simplified for Dáma's fixed 2-player model. AI
 * opponents reuse the exact same decision logic as online rooms
 * (shared/games/dama/ai) via useDamaHotSeatAi — see
 * docs/dama-0d-ai-specifikacio.md §9.
 */
export function DamaSetupPage() {
  const [opponentType, setOpponentType] = useState<OpponentType>('HUMAN');
  const [difficulty, setDifficulty] = useState<DamaAiDifficulty>('MEDIUM');
  const [started, setStarted] = useState(false);

  if (started) {
    return <DamaGamePage hotSeatAiSlots={buildAiSlots(opponentType, difficulty)} />;
  }

  return (
    <div className={[styles.page, theme.theme].join(' ')}>
      <span className={styles.eyebrow}>Rács · B klaszter</span>
      <h1>Dáma — új játék</h1>
      <div className={styles.card}>
        <fieldset className={styles.fieldset}>
          <legend>Ellenfél</legend>
          <div className={styles.radioRow}>
            <label>
              <input type="radio" checked={opponentType === 'HUMAN'} onChange={() => setOpponentType('HUMAN')} />
              Ember
            </label>
            <label>
              <input type="radio" checked={opponentType === 'AI'} onChange={() => setOpponentType('AI')} />
              AI
            </label>
          </div>
        </fieldset>
        {opponentType === 'AI' && (
          <fieldset className={styles.fieldset}>
            <legend>Nehézség</legend>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as DamaAiDifficulty)}>
              <option value="EASY">Könnyű</option>
              <option value="MEDIUM">Közepes</option>
              <option value="HARD">Nehéz</option>
            </select>
          </fieldset>
        )}
        <Button className={styles.primaryButton} onClick={() => setStarted(true)}>
          Játék indítása
        </Button>
      </div>
    </div>
  );
}

export default DamaSetupPage;
