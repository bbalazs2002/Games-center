// Batch runner for src/shared/games/ramses/ai/simulate.ts — plays out several
// AI-only Ramses matchups (varied player counts / difficulty lineups, each
// repeated a few times for signal over shuffle/forgetting variance) and
// prints a summary per game plus an aggregate win-rate table, so the
// strategy's forget-chance weights (memory.ts's FORGET_CHANCE) can be tuned
// from real outcomes instead of guesswork. Run with:
//   npx tsx scripts/simulate-ramses-ai-games.ts
// See docs/ramses-0c-ai-specifikacio.md §3.3.1/§7. No lobby UI, no
// GameRoom/Colyseus, no database — standalone, and (for the same reason) no
// artificial "AI gondolkodik" delay: that pacing only exists on the
// GameRoom/hot-seat-hook path, see simulate.ts's own note.
import type { RamsesAiDifficulty } from '@shared/games/ramses/ai';
import { simulateRamsesGame, type SimulationPlayerConfig, type SimulationResult } from '@shared/games/ramses/ai/simulate';

interface Matchup {
  label: string;
  players: SimulationPlayerConfig[];
  /** How many times to repeat this exact matchup — shuffle/forgetting variance means a single game says very little. Default 1. */
  repeats?: number;
}

const MATCHUPS: Matchup[] = [
  {
    label: '2 fő — Könnyű vs Nehéz',
    players: [
      { name: 'Easy', difficulty: 'EASY' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
    repeats: 5,
  },
  {
    label: '2 fő — Közepes vs Nehéz',
    players: [
      { name: 'Medium', difficulty: 'MEDIUM' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
    repeats: 5,
  },
  {
    label: '2 fő — Könnyű vs Közepes',
    players: [
      { name: 'Easy', difficulty: 'EASY' },
      { name: 'Medium', difficulty: 'MEDIUM' },
    ],
    repeats: 5,
  },
  {
    label: '2 fő — Nehéz vs Nehéz (kontroll: azonos szint, kb. 50/50 esély várt)',
    players: [
      { name: 'Hard-A', difficulty: 'HARD' },
      { name: 'Hard-B', difficulty: 'HARD' },
    ],
    repeats: 5,
  },
  {
    label: '3 fő — Könnyű / Közepes / Nehéz vegyesen',
    players: [
      { name: 'Easy', difficulty: 'EASY' },
      { name: 'Medium', difficulty: 'MEDIUM' },
      { name: 'Hard', difficulty: 'HARD' },
    ],
    repeats: 5,
  },
  {
    label: '4 fő — 2x Könnyű vs 2x Nehéz',
    players: [
      { name: 'Easy-A', difficulty: 'EASY' },
      { name: 'Easy-B', difficulty: 'EASY' },
      { name: 'Hard-A', difficulty: 'HARD' },
      { name: 'Hard-B', difficulty: 'HARD' },
    ],
    repeats: 3,
  },
];

function formatResult(matchup: Matchup, result: SimulationResult): string {
  const lines: string[] = [];
  lines.push(`\n=== ${matchup.label} ===`);
  lines.push(`lépések: ${result.steps}${result.reachedStepCap ? ' (elérte a lépéskorlátot!)' : ''}`);
  const sorted = [...result.players].sort((a, b) => b.score - a.score);
  for (const player of sorted) {
    const marker = player.isWinner ? '🏆' : '  ';
    lines.push(
      `  ${marker} ${player.name.padEnd(8)} [${player.difficulty.padEnd(6)}] ` +
        `pont: ${player.score.toString().padStart(3)}  lapok: ${player.cardsWon.toString().padStart(2)}`,
    );
  }
  if (result.winnerIds.length > 1) lines.push('  (holtverseny)');
  return lines.join('\n');
}

interface DifficultyTally {
  gamesPlayed: number;
  wins: number; // includes ties — every co-winner counts
  totalScore: number;
  totalCards: number;
  /** Games where this player found ZERO treasures — the "is this difficulty actually useless" signal. */
  shutouts: number;
}

function emptyTally(): DifficultyTally {
  return { gamesPlayed: 0, wins: 0, totalScore: 0, totalCards: 0, shutouts: 0 };
}

function recordResult(tallies: Map<RamsesAiDifficulty, DifficultyTally>, result: SimulationResult): void {
  for (const player of result.players) {
    const tally = tallies.get(player.difficulty) ?? emptyTally();
    tally.gamesPlayed += 1;
    if (player.isWinner) tally.wins += 1;
    if (player.cardsWon === 0) tally.shutouts += 1;
    tally.totalScore += player.score;
    tally.totalCards += player.cardsWon;
    tallies.set(player.difficulty, tally);
  }
}

function printTallyTable(tallies: Map<RamsesAiDifficulty, DifficultyTally>): void {
  console.log('\n=== Összesített eredmény nehézségi szint szerint ===');
  for (const [difficulty, tally] of tallies) {
    const winRate = tally.gamesPlayed > 0 ? ((tally.wins / tally.gamesPlayed) * 100).toFixed(0) : '—';
    const avgScore = tally.gamesPlayed > 0 ? (tally.totalScore / tally.gamesPlayed).toFixed(1) : '—';
    const avgCards = tally.gamesPlayed > 0 ? (tally.totalCards / tally.gamesPlayed).toFixed(1) : '—';
    const shutoutRate = tally.gamesPlayed > 0 ? ((tally.shutouts / tally.gamesPlayed) * 100).toFixed(0) : '—';
    console.log(
      `  ${difficulty.padEnd(6)} — részvétel: ${tally.gamesPlayed}, győzelem: ${tally.wins} (${winRate}%), átlag pontszám: ${avgScore}, átlag lapszám: ${avgCards}, ` +
        `0 lapos parti: ${tally.shutouts} (${shutoutRate}%)`,
    );
  }
}

function main(): void {
  const startedAt = Date.now();
  const tallies = new Map<RamsesAiDifficulty, DifficultyTally>();
  let totalSteps = 0;
  let capReached = 0;

  for (const matchup of MATCHUPS) {
    const repeats = matchup.repeats ?? 1;
    for (let run = 1; run <= repeats; run += 1) {
      const matchupStartedAt = Date.now();
      const result = simulateRamsesGame(matchup.players);
      const label = repeats > 1 ? `${matchup.label} (${run}/${repeats})` : matchup.label;
      console.log(formatResult({ ...matchup, label }, result));
      console.log(`  (${((Date.now() - matchupStartedAt) / 1000).toFixed(1)}s)`);
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
