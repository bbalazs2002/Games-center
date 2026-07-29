import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { useGameTheme } from '../../../shell/useGameTheme';
import type { RamsesAiDifficulty } from '../../../../shared/games/ramses/ai';
import { RamsesGamePage } from './RamsesGamePage';
import type { HotSeatAiSlots } from './useRamsesHotSeatAi';
import styles from './RamsesSetupPage.module.css';

const MIN_PLAYERS = 2;
// Confirmed range per the official rulebook ("For 1 to 5 players") — the
// 1-player solo variant itself is out of scope for Ramses-0a, see
// docs/ramses-0a-specifikacio.md §1.
const MAX_PLAYERS = 5;

function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Játékos ${i + 1}`);
}

/** One shared difficulty applies to every AI-marked player in this game — mirrors Hotel's room-wide (not per-slot) AI difficulty choice. */
function buildAiSlots(names: string[], aiFlags: boolean[], difficulty: RamsesAiDifficulty): HotSeatAiSlots {
  const slots: HotSeatAiSlots = {};
  names.forEach((_, index) => {
    if (aiFlags[index]) slots[`player-${index + 1}`] = difficulty;
  });
  return slots;
}

/**
 * Collects player count/names (and, per-player, which are AI-controlled)
 * before the engine starts, then hands off to RamsesGamePage — mirrors
 * HotelSetupPage's role (hot-seat only, no network, so plain local state is
 * enough). AI opponents reuse the exact same decision logic as online rooms
 * (shared/games/ramses/ai) via useRamsesHotSeatAi — see
 * docs/ramses-0c-ai-specifikacio.md §5.
 */
export function RamsesSetupPage() {
  const themeClass = useGameTheme('ramses');
  const [names, setNames] = useState<string[]>(defaultNames(MIN_PLAYERS));
  const [aiFlags, setAiFlags] = useState<boolean[]>(() => Array(MIN_PLAYERS).fill(false));
  const [difficulty, setDifficulty] = useState<RamsesAiDifficulty>('MEDIUM');
  const [started, setStarted] = useState(false);

  // No localStorage persistence for Ramses (unlike Hotel) — "Kilépés" simply
  // abandons the in-memory game, same as "Új játék" would.
  function startFresh(): void {
    setStarted(false);
  }

  if (started) {
    return (
      <RamsesGamePage
        playerNames={names}
        hotSeatAiSlots={buildAiSlots(names, aiFlags, difficulty)}
        onRequestNewGame={startFresh}
      />
    );
  }

  function updateName(index: number, value: string): void {
    setNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  }

  function toggleAi(index: number): void {
    setAiFlags((prev) => prev.map((flag, i) => (i === index ? !flag : flag)));
  }

  function addPlayer(): void {
    setNames((prev) => (prev.length >= MAX_PLAYERS ? prev : [...prev, `Játékos ${prev.length + 1}`]));
    setAiFlags((prev) => (prev.length >= MAX_PLAYERS ? prev : [...prev, false]));
  }

  function removePlayer(): void {
    setNames((prev) => (prev.length <= MIN_PLAYERS ? prev : prev.slice(0, -1)));
    setAiFlags((prev) => (prev.length <= MIN_PLAYERS ? prev : prev.slice(0, -1)));
  }

  const canStart = names.every((name) => name.trim() !== '');
  const anyAi = aiFlags.some(Boolean);

  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <MenuNav backTo="/games/ramses" />
      <div className={styles.content}>
        <h1>Ramses — új játék</h1>
        <p>
          Játékosok ({MIN_PLAYERS}–{MAX_PLAYERS} fő):
        </p>
        {names.map((name, index) => (
          <div key={index} className={styles.playerRow}>
            <input
              className={styles.nameInput}
              value={name}
              onChange={(event) => updateName(index, event.target.value)}
            />
            <label className={styles.aiToggle}>
              <input type="checkbox" checked={aiFlags[index]} onChange={() => toggleAi(index)} />
              AI
            </label>
          </div>
        ))}
        <div className={styles.playerCountControls}>
          <Button variant="secondary" onClick={removePlayer} disabled={names.length <= MIN_PLAYERS}>
            Játékos eltávolítása
          </Button>
          <Button variant="secondary" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS}>
            Játékos hozzáadása
          </Button>
        </div>
        {anyAi && (
          <label className={styles.difficultyRow}>
            AI nehézsége:{' '}
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as RamsesAiDifficulty)}>
              <option value="EASY">Könnyű</option>
              <option value="MEDIUM">Közepes</option>
              <option value="HARD">Nehéz</option>
            </select>
          </label>
        )}
        <Button onClick={() => setStarted(true)} disabled={!canStart}>
          Játék indítása
        </Button>
      </div>
    </div>
  );
}

export default RamsesSetupPage;
