import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import { RamsesGamePage } from './RamsesGamePage';
import styles from './RamsesSetupPage.module.css';

const MIN_PLAYERS = 2;
// Confirmed range per the official rulebook ("For 1 to 5 players") — the
// 1-player solo variant itself is out of scope for Ramses-0a, see
// docs/ramses-0a-specifikacio.md §1.
const MAX_PLAYERS = 5;

function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Játékos ${i + 1}`);
}

/**
 * Collects player count/names before the engine starts, then hands off to
 * RamsesGamePage — mirrors HotelSetupPage's role (hot-seat only, no network,
 * so plain local state is enough).
 */
export function RamsesSetupPage() {
  const [names, setNames] = useState<string[]>(defaultNames(MIN_PLAYERS));
  const [started, setStarted] = useState(false);

  if (started) {
    return <RamsesGamePage playerNames={names} />;
  }

  function updateName(index: number, value: string): void {
    setNames((prev) => prev.map((name, i) => (i === index ? value : name)));
  }

  function addPlayer(): void {
    setNames((prev) => (prev.length >= MAX_PLAYERS ? prev : [...prev, `Játékos ${prev.length + 1}`]));
  }

  function removePlayer(): void {
    setNames((prev) => (prev.length <= MIN_PLAYERS ? prev : prev.slice(0, -1)));
  }

  const canStart = names.every((name) => name.trim() !== '');

  return (
    <div className={styles.page}>
      <h1>Ramses — új játék</h1>
      <p>
        Játékosok ({MIN_PLAYERS}–{MAX_PLAYERS} fő):
      </p>
      {names.map((name, index) => (
        <input
          key={index}
          className={styles.nameInput}
          value={name}
          onChange={(event) => updateName(index, event.target.value)}
        />
      ))}
      <div className={styles.playerCountControls}>
        <Button variant="secondary" onClick={removePlayer} disabled={names.length <= MIN_PLAYERS}>
          Játékos eltávolítása
        </Button>
        <Button variant="secondary" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS}>
          Játékos hozzáadása
        </Button>
      </div>
      <Button onClick={() => setStarted(true)} disabled={!canStart}>
        Játék indítása
      </Button>
    </div>
  );
}

export default RamsesSetupPage;
