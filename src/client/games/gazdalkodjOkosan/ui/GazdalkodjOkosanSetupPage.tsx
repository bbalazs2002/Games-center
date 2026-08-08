import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { GazdalkodjOkosanGamePage } from './GazdalkodjOkosanGamePage';
import styles from './GazdalkodjOkosanSetupPage.module.css';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6; // docs/gazdalkodj-okosan-0a-specifikacio.md §2.1

function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Játékos ${i + 1}`);
}

/**
 * Játékosnevek gyűjtése, mielőtt a motor elindul — a Dáma/Hotel mintáját
 * követve, egyszerű helyi state-tel (hot-seat, nincs hálózat). AI ellenfél
 * a 0a fázisnak még nincs hatókörében (lásd docs/gazdalkodj-okosan-0a-specifikacio.md §1).
 */
export function GazdalkodjOkosanSetupPage() {
  const [names, setNames] = useState<string[]>(defaultNames(MIN_PLAYERS));
  const [started, setStarted] = useState(false);

  function startFresh(): void {
    setStarted(false);
  }

  if (started) {
    return <GazdalkodjOkosanGamePage playerNames={names} onRequestNewGame={startFresh} />;
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
      <MenuNav backTo="/games/gazdalkodj-okosan" />
      <div className={styles.content}>
        <h1>Gazdálkodj okosan! — új játék</h1>
        <p>
          Játékosok ({MIN_PLAYERS}–{MAX_PLAYERS} fő):
        </p>
        {names.map((name, index) => (
          <div key={index} className={styles.playerRow}>
            <input className={styles.nameInput} value={name} onChange={(event) => updateName(index, event.target.value)} />
          </div>
        ))}
        <div className={styles.buttonRow}>
          <Button variant="secondary" onClick={removePlayer} disabled={names.length <= MIN_PLAYERS}>
            Játékos eltávolítása
          </Button>
          <Button variant="secondary" onClick={addPlayer} disabled={names.length >= MAX_PLAYERS}>
            Játékos hozzáadása
          </Button>
        </div>
        <Button className={styles.primaryButton} onClick={() => setStarted(true)} disabled={!canStart}>
          Játék indítása
        </Button>
      </div>
    </div>
  );
}

export default GazdalkodjOkosanSetupPage;
