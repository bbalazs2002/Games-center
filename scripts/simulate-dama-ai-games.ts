// Batch runner for src/shared/games/dama/ai/simulate.ts — plays out several
// AI-only Dáma matchups (all three difficulty combinations, each repeated a
// few times for signal over search/random variance) and prints a summary per
// game plus an aggregate win-rate table, so the search depths/time budget
// (search.ts) and the heuristic weights (heuristic.ts) can be tuned from real
// outcomes instead of guesswork. Run with:
//   npx tsx scripts/simulate-dama-ai-games.ts
// See docs/dama-0d-ai-specifikacio.md §13 (Dáma-0d.2). No lobby UI, no
// GameRoom/Colyseus, no database — standalone, and (for the same reason) no
// artificial "AI gondolkodik" delay, see simulate.ts's own note.
import type { DamaAiDifficulty } from '../src/shared/games/dama/ai';
import { simulateDamaGame, type SimulationConfig, type SimulationResult } from '../src/shared/games/dama/ai/simulate';

interface Matchup {
  label: string;
  config: SimulationConfig;
  /** How many times to repeat this exact matchup — repeats are lower than Ramses'/Hotel's 5, since HARD here does a real (up to ~200ms/move) search, unlike those games' effectively-instant AI. */
  repeats?: number;
}

const MATCHUPS: Matchup[] = [
  {
    label: 'Könnyű vs Könnyű (kontroll: mennyire kockázatos a végtelen lépéskorlát-elérés két vaktában játszó fél között?)',
    config: { LIGHT: 'EASY', DARK: 'EASY' },
    repeats: 3,
  },
  {
    label: 'Könnyű vs Közepes',
    config: { LIGHT: 'EASY', DARK: 'MEDIUM' },
    repeats: 3,
  },
  {
    label: 'Könnyű vs Nehéz',
    config: { LIGHT: 'EASY', DARK: 'HARD' },
    repeats: 3,
  },
  {
    label: 'Közepes vs Közepes (kontroll: azonos szint, kb. 50/50 esély várt)',
    config: { LIGHT: 'MEDIUM', DARK: 'MEDIUM' },
    repeats: 3,
  },
  {
    label: 'Közepes vs Nehéz',
    config: { LIGHT: 'MEDIUM', DARK: 'HARD' },
    repeats: 3,
  },
  {
    label: 'Nehéz vs Nehéz (kontroll: azonos szint, kb. 50/50 esély várt)',
    config: { LIGHT: 'HARD', DARK: 'HARD' },
    repeats: 3,
  },
];

function formatResult(matchup: Matchup, result: SimulationResult, elapsedMs: number): string {
  const lines: string[] = [];
  lines.push(`\n=== ${matchup.label} ===`);
  const outcome = result.winner
    ? `${result.winner} (${result.config[result.winner]}) nyert`
    : result.reachedStepCap
      ? 'lépéskorlát elérve, nincs győztes'
      : 'döntetlen';
  lines.push(`  VILÁGOS [${result.config.LIGHT}] vs SÖTÉT [${result.config.DARK}] — ${outcome}`);
  lines.push(
    `  lépések: ${result.steps}${result.reachedStepCap ? ' (elérte a lépéskorlátot!)' : ''}, ` +
      `bábuk a végén — Világos: ${result.finalPieceCount.LIGHT}, Sötét: ${result.finalPieceCount.DARK}, ` +
      `(${(elapsedMs / 1000).toFixed(1)}s)`,
  );
  return lines.join('\n');
}

interface DifficultyTally {
  gamesPlayed: number;
  wins: number;
  reachedStepCap: number;
  totalSteps: number;
}

function emptyTally(): DifficultyTally {
  return { gamesPlayed: 0, wins: 0, reachedStepCap: 0, totalSteps: 0 };
}

function recordResult(tallies: Map<DamaAiDifficulty, DifficultyTally>, result: SimulationResult): void {
  for (const player of ['LIGHT', 'DARK'] as const) {
    const difficulty = result.config[player];
    const tally = tallies.get(difficulty) ?? emptyTally();
    tally.gamesPlayed += 1;
    if (result.winner === player) tally.wins += 1;
    if (result.reachedStepCap) tally.reachedStepCap += 1;
    tally.totalSteps += result.steps;
    tallies.set(difficulty, tally);
  }
}

function printTallyTable(tallies: Map<DamaAiDifficulty, DifficultyTally>): void {
  console.log('\n=== Összesített eredmény nehézségi szint szerint ===');
  for (const [difficulty, tally] of tallies) {
    const winRate = tally.gamesPlayed > 0 ? ((tally.wins / tally.gamesPlayed) * 100).toFixed(0) : '—';
    const avgSteps = tally.gamesPlayed > 0 ? (tally.totalSteps / tally.gamesPlayed).toFixed(0) : '—';
    console.log(
      `  ${difficulty.padEnd(6)} — részvétel: ${tally.gamesPlayed}, győzelem: ${tally.wins} (${winRate}%), ` +
        `lépéskorlátot elérő parti (mindkét oldalról számolva): ${tally.reachedStepCap}, átlag lépésszám: ${avgSteps}`,
    );
  }
}

// Lower than simulateDamaGame's own 4000-step default, purely for this
// batch tool's own practical runtime — a still-unresolved bare-king endgame
// (see docs/dama-0d-ai-specifikacio.md §13.1) costs real, non-trivial
// wall-clock time per step at HARD's search budget, and rarely tells us
// anything new past this point that it hadn't already shown by ~120 steps in
// every decisive game observed so far.
const BATCH_MAX_STEPS = 1500;

function main(): void {
  const startedAt = Date.now();
  const tallies = new Map<DamaAiDifficulty, DifficultyTally>();
  let totalSteps = 0;
  let capReached = 0;

  for (const matchup of MATCHUPS) {
    const repeats = matchup.repeats ?? 1;
    for (let run = 1; run <= repeats; run += 1) {
      const matchupStartedAt = Date.now();
      const result = simulateDamaGame(matchup.config, BATCH_MAX_STEPS);
      const label = repeats > 1 ? `${matchup.label} (${run}/${repeats})` : matchup.label;
      console.log(formatResult({ ...matchup, label }, result, Date.now() - matchupStartedAt));
      recordResult(tallies, result);
      totalSteps += result.steps;
      if (result.reachedStepCap) capReached += 1;
    }
  }

  printTallyTable(tallies);
  console.log(`\nÖsszlépésszám: ${totalSteps}, lépéskorlátot elérő játékok: ${capReached}`);
  console.log(`Összesen: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main();
