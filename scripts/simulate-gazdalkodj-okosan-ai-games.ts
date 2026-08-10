// Batch runner for src/shared/games/gazdalkodjOkosan/ai/simulate.ts — plays
// out several AI-only Gazdálkodj okosan matchups (varied player counts /
// difficulty lineups, each repeated a few times for signal over dice
// variance) and prints a summary per game plus an aggregate win-rate table,
// so the heuristic's weights (ai/heuristic.ts §3.3) can be tuned from real
// outcomes instead of guesswork. Run with:
//   npx tsx scripts/simulate-gazdalkodj-okosan-ai-games.ts
// See docs/gazdalkodj-okosan-0d-ai-specifikacio.md §6. No lobby UI, no
// GameRoom/Colyseus, no database — a standalone module (Hotel/Dáma/Ramses
// precedent), and (for the same reason) no artificial "AI gondolkodik"
// delay: that pacing only exists on the GameRoom path, see simulate.ts's own
// note.
import type { GazdalkodjOkosanAiDifficulty } from '@shared/games/gazdalkodjOkosan/ai';
import type { PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import { simulateGazdalkodjOkosanGame, type SimulationPlayerConfig, type SimulationResult } from '@shared/games/gazdalkodjOkosan/ai/simulate';

interface Matchup {
  label: string;
  players: SimulationPlayerConfig[];
  /** How many times to repeat this exact matchup — dice variance means a single game says very little. Default 1. */
  repeats?: number;
}

const MATCHUPS: Matchup[] = [
  {
    label: '2 fő — Könnyű vs Nehéz',
    players: [
      { name: 'Easy', difficulty: 'EASY' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
    repeats: 3,
  },
  {
    label: '2 fő — Közepes vs Nehéz',
    players: [
      { name: 'Medium', difficulty: 'MEDIUM' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
    repeats: 3,
  },
  {
    label: '2 fő — Könnyű vs Könnyű (kontroll: azonos szint, kb. 50/50 esély várt)',
    players: [
      { name: 'Easy-A', difficulty: 'EASY' },
      { name: 'Easy-B', difficulty: 'EASY' },
    ],
    repeats: 3,
  },
  {
    label: '3 fő — Könnyű / Közepes / Nehéz vegyesen',
    players: [
      { name: 'Easy', difficulty: 'EASY' },
      { name: 'Medium', difficulty: 'MEDIUM' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
  },
  {
    label: '4 fő — 2x Könnyű vs 2x Nehéz',
    players: [
      { name: 'Easy-A', difficulty: 'EASY' },
      { name: 'Easy-B', difficulty: 'EASY' },
      { name: 'Hard-A', difficulty: 'HARD' },
      { name: 'Hard-B', difficulty: 'HARD' },
    ],
  },
];

/**
 * Unlike Hotel (endlessly-accumulating portfolio game, real bankruptcy-based
 * winners are rare within a practical step budget), Gazdálkodj okosan's win
 * condition (apartment+car+all furniture+car insurance+2000 wealth) is
 * plausibly reachable for a well-played AI well within MAX_STEPS_PER_GAME —
 * so a real winnerId is expected to show up often here. Still falls back to
 * "highest totalWealth among survivors" as a leader metric for any run that
 * doesn't naturally conclude (unlucky dice, all-EASY matchups, etc.).
 */
function leaderPlayerId(result: SimulationResult): PlayerId | null {
  if (result.winnerId) return result.winnerId;
  const survivors = result.players.filter((p) => !p.bankrupt);
  if (survivors.length === 0) return null;
  return survivors.reduce((best, p) => (p.finalTotalWealth > best.finalTotalWealth ? p : best)).id;
}

function formatResult(matchup: Matchup, result: SimulationResult): string {
  const lines: string[] = [];
  lines.push(`\n=== ${matchup.label} ===`);
  lines.push(`lépések: ${result.steps}${result.reachedStepCap ? ' (elérte a lépéskorlátot)' : ''}`);
  const leaderId = leaderPlayerId(result);
  for (const player of result.players) {
    const marker = player.id === result.winnerId ? '🏆' : player.id === leaderId ? '📈' : '  ';
    lines.push(
      `  ${marker} ${player.name.padEnd(8)} [${player.difficulty.padEnd(6)}] ` +
        `összvagyon: ${player.finalTotalWealth.toString().padStart(7)}${player.bankrupt ? '  (csődbe ment)' : ''}`,
    );
  }
  return lines.join('\n');
}

const MAX_STEPS_PER_GAME = 800;

interface DifficultyTally {
  gamesPlayed: number;
  leads: number;
  actualWins: number;
  bankruptcies: number;
}

function emptyTally(): DifficultyTally {
  return { gamesPlayed: 0, leads: 0, actualWins: 0, bankruptcies: 0 };
}

function recordResult(tallies: Map<GazdalkodjOkosanAiDifficulty, DifficultyTally>, result: SimulationResult): void {
  const leaderId = leaderPlayerId(result);
  if (!leaderId) return; // everyone bankrupt somehow — shouldn't happen, but nothing meaningful to tally
  for (const player of result.players) {
    const tally = tallies.get(player.difficulty) ?? emptyTally();
    tally.gamesPlayed += 1;
    if (player.id === leaderId) tally.leads += 1;
    if (player.id === result.winnerId) tally.actualWins += 1;
    if (player.bankrupt) tally.bankruptcies += 1;
    tallies.set(player.difficulty, tally);
  }
}

function printTallyTable(tallies: Map<GazdalkodjOkosanAiDifficulty, DifficultyTally>): void {
  console.log(`\n=== Összesített eredmény nehézségi szint szerint (vezetés a(z) ${MAX_STEPS_PER_GAME}. lépésnél, valódi győzelem esetén az számít) ===`);
  for (const [difficulty, tally] of tallies) {
    const leadRate = tally.gamesPlayed > 0 ? ((tally.leads / tally.gamesPlayed) * 100).toFixed(0) : '—';
    console.log(
      `  ${difficulty.padEnd(6)} — részvétel: ${tally.gamesPlayed}, vezetés/győzelem: ${tally.leads} (${leadRate}%), ebből valódi győzelem: ${tally.actualWins}, csőd: ${tally.bankruptcies}`,
    );
  }
}

function main(): void {
  const startedAt = Date.now();
  const tallies = new Map<GazdalkodjOkosanAiDifficulty, DifficultyTally>();

  for (const matchup of MATCHUPS) {
    const repeats = matchup.repeats ?? 1;
    for (let run = 1; run <= repeats; run += 1) {
      const matchupStartedAt = Date.now();
      const result = simulateGazdalkodjOkosanGame(matchup.players, MAX_STEPS_PER_GAME);
      const label = repeats > 1 ? `${matchup.label} (${run}/${repeats})` : matchup.label;
      console.log(formatResult({ ...matchup, label }, result));
      console.log(`  (${((Date.now() - matchupStartedAt) / 1000).toFixed(1)}s)`);
      recordResult(tallies, result);
    }
  }

  printTallyTable(tallies);
  console.log(`\nÖsszesen: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main();
