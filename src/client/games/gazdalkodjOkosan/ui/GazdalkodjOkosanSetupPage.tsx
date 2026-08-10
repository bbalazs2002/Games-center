import { useState } from 'react';
import { Button } from '../../../ui-kit/Button';
import formControls from '../../../ui-kit/FormControls.module.css';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { Select } from '../../../ui-kit/Select';
import type { GazdalkodjOkosanAiDifficulty } from '@shared/games/gazdalkodjOkosan/ai';
import { GazdalkodjOkosanGamePage } from './GazdalkodjOkosanGamePage';
import type { GazdalkodjOkosanHotSeatAiSlots } from './useGazdalkodjOkosanHotSeatAi';
import styles from './GazdalkodjOkosanSetupPage.module.css';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6; // docs/gazdalkodj-okosan-0a-specifikacio.md §2.1

const DIFFICULTY_OPTIONS = [
  { value: 'EASY', label: 'Könnyű' },
  { value: 'MEDIUM', label: 'Közepes' },
  { value: 'HARD', label: 'Nehéz' },
];

function defaultNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Játékos ${i + 1}`);
}

/** One shared difficulty applies to every AI-marked player in this game — mirrors the online lobby's room-wide (not per-slot) AI difficulty choice, see docs/gazdalkodj-okosan-0d-ai-specifikacio.md §5. */
function buildAiSlots(names: string[], aiFlags: boolean[], difficulty: GazdalkodjOkosanAiDifficulty): GazdalkodjOkosanHotSeatAiSlots {
  const slots: GazdalkodjOkosanHotSeatAiSlots = {};
  names.forEach((_, index) => {
    if (aiFlags[index]) slots[`player-${index + 1}`] = difficulty;
  });
  return slots;
}

/**
 * Játékosnevek (és, játékosonként, hogy AI-vezérelt-e) gyűjtése, mielőtt a
 * motor elindul — a Dáma/Hotel mintáját követve, egyszerű helyi state-tel
 * (hot-seat, nincs hálózat). Az AI ellenfél ugyanazt a döntéshozó logikát
 * használja, mint az online mód (shared/games/gazdalkodjOkosan/ai), a
 * useGazdalkodjOkosanHotSeatAi hookon keresztül — lásd
 * docs/gazdalkodj-okosan-0d-ai-specifikacio.md §5.
 */
export function GazdalkodjOkosanSetupPage() {
  const [names, setNames] = useState<string[]>(defaultNames(MIN_PLAYERS));
  const [aiFlags, setAiFlags] = useState<boolean[]>(() => Array(MIN_PLAYERS).fill(false));
  const [difficulty, setDifficulty] = useState<GazdalkodjOkosanAiDifficulty>('MEDIUM');
  const [started, setStarted] = useState(false);

  function startFresh(): void {
    setStarted(false);
  }

  if (started) {
    return (
      <GazdalkodjOkosanGamePage
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
            <label className={styles.aiToggle}>
              <input className={formControls.checkbox} type="checkbox" checked={aiFlags[index]} onChange={() => toggleAi(index)} />
              AI
            </label>
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
        {anyAi && (
          <div className={styles.difficultyRow}>
            <span>AI nehézsége:</span>
            <Select value={difficulty} onChange={(next) => setDifficulty(next as GazdalkodjOkosanAiDifficulty)} options={DIFFICULTY_OPTIONS} />
          </div>
        )}
        <Button className={styles.primaryButton} onClick={() => setStarted(true)} disabled={!canStart}>
          Játék indítása
        </Button>
      </div>
    </div>
  );
}

export default GazdalkodjOkosanSetupPage;
