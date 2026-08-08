import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import formControls from '../../../ui-kit/FormControls.module.css';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { Select } from '../../../ui-kit/Select';
import { GameBackgroundVideo } from '../../../shell/GameBackgroundVideo';
import { useGameTheme } from '../../../shell/useGameTheme';
import type { HotelAiDifficulty } from '@shared/games/hotel/ai';
import { HotelGamePage } from './HotelGamePage';
import { clearPersistedHotelLocalGame, loadPersistedHotelLocalGame, type PersistedHotelLocalGame } from './hotelLocalGamePersistence';
import type { HotSeatAiSlots } from './useHotSeatAi';
import styles from './HotelSetupPage.module.css';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4; // confirmed range, docs/hotel-0a-specifikacio.md §8 — engine itself isn't hardcoded to this

const DIFFICULTY_OPTIONS = [
  { value: 'EASY', label: 'Könnyű' },
  { value: 'MEDIUM', label: 'Közepes' },
  { value: 'HARD', label: 'Nehéz' },
];

function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Játékos ${i + 1}`);
}

/** One shared difficulty applies to every AI-marked player in this game — mirrors the online lobby's room-wide (not per-slot) AI difficulty choice, see docs/hotel-0d-ai-specifikacio.md §6/§8. */
function buildAiSlots(names: string[], aiFlags: boolean[], difficulty: HotelAiDifficulty): HotSeatAiSlots {
  const slots: HotSeatAiSlots = {};
  names.forEach((_, index) => {
    if (aiFlags[index]) slots[`player-${index + 1}`] = difficulty;
  });
  return slots;
}

/**
 * Collects player count/names (and, per-player, which are AI-controlled)
 * before the engine starts, then hands off to HotelGamePage — kept as a
 * separate component (not a route) since a live Colyseus-style "Room object
 * through router state" hazard doesn't apply here (hot-seat only, no
 * network), so simple local state is enough. AI opponents reuse the exact
 * same decision logic as online rooms (shared/games/hotel/ai) via
 * useHotSeatAi — see docs/hotel-0d-ai-specifikacio.md §8.
 */
export function HotelSetupPage() {
  const themeClass = useGameTheme('hotel');
  const [names, setNames] = useState<string[]>(defaultNames(MIN_PLAYERS));
  const [aiFlags, setAiFlags] = useState<boolean[]>(() => Array(MIN_PLAYERS).fill(false));
  const [difficulty, setDifficulty] = useState<HotelAiDifficulty>('MEDIUM');
  const [started, setStarted] = useState(false);
  // Read once, at mount — a fresh HotelSetupPage mount is exactly what a page
  // reload produces, so this is the resume-across-reload entry point (see
  // hotelLocalGamePersistence.ts). null once the player deliberately starts a
  // new game (HotelGamePage's own "Új játék" clears storage first).
  const [resumedGame, setResumedGame] = useState<PersistedHotelLocalGame | null>(() => loadPersistedHotelLocalGame());

  // Clears storage HERE (not inside HotelGamePage's own "Új játék" confirm)
  // so the shared, game-agnostic LocalGameControls component never needs to
  // know Hotel specifically has a persisted-game concept at all — see
  // docs/shell-ux-specifikacio.md's LocalGameControls extraction.
  function startFresh(): void {
    clearPersistedHotelLocalGame();
    setResumedGame(null);
    setStarted(false);
  }

  if (resumedGame) {
    return (
      <HotelGamePage
        initialGameState={resumedGame.state}
        hotSeatAiSlots={resumedGame.hotSeatAiSlots}
        onRequestNewGame={startFresh}
      />
    );
  }

  if (started) {
    return (
      <HotelGamePage
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
      <GameBackgroundVideo gameId="hotel" />
      <MenuNav backTo="/games/hotel" />
      <div className={styles.content}>
        <h1>Hotel — új játék</h1>
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
              <input className={formControls.checkbox} type="checkbox" checked={aiFlags[index]} onChange={() => toggleAi(index)} />
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
          <div className={styles.difficultyRow}>
            <span>AI nehézsége:</span>
            <Select
              value={difficulty}
              onChange={(next) => setDifficulty(next as HotelAiDifficulty)}
              options={DIFFICULTY_OPTIONS}
            />
          </div>
        )}
        <Button onClick={() => setStarted(true)} disabled={!canStart}>
          Játék indítása
        </Button>
      </div>
    </div>
  );
}

export default HotelSetupPage;
