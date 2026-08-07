// Batch runner for src/server/games/hotel/ai/simulate.ts — plays out several
// AI-only Hotel matchups (varied player counts / difficulty lineups, each
// repeated a few times for signal over dice variance) and prints a summary
// per game plus an aggregate win-rate table, so the heuristic's weights
// (rules.ts/heuristic.ts §4.3) can be tuned from real outcomes instead of
// guesswork. Run with:
//   npx tsx scripts/simulate-hotel-ai-games.ts
// See docs/hotel-0d-ai-specifikacio.md §7-8. No lobby UI, no GameRoom/
// Colyseus, no database — a standalone module per your instruction, and (for
// the same reason) no artificial "AI gondolkodik" delay: that pacing only
// exists on the GameRoom path, see simulate.ts's own note.
import type { HotelAiDifficulty } from '@shared/games/hotel/ai';
import type { PlayerId } from '@shared/games/hotel/engine/state';
import { simulateHotelGame, type SimulationPlayerConfig, type SimulationResult } from '@shared/games/hotel/ai/simulate';

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
 * Games between reasonably-matched AI almost never reach an actual
 * bankruptcy within a practical step budget (see docs/hotel-0d-ai-
 * specifikacio.md §8 — this may just be normal for a well-played Hotel
 * game, not a bug). So instead of requiring a real winnerId, this picks the
 * highest-net-worth surviving player as the "leader" at whatever point the
 * simulation stopped — a real bankruptcy-based winnerId still wins outright
 * when one exists.
 */
function leaderPlayerId(result: SimulationResult): PlayerId | null {
  if (result.winnerId) return result.winnerId;
  const survivors = result.players.filter((p) => !p.bankrupt);
  if (survivors.length === 0) return null;
  return survivors.reduce((best, p) => (p.finalNetWorth > best.finalNetWorth ? p : best)).id;
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
        `készpénz: ${player.finalCash.toString().padStart(7)}  nettó vagyon: ${player.finalNetWorth.toString().padStart(7)}` +
        `${player.bankrupt ? '  (csődbe ment)' : ''}`,
    );
  }
  return lines.join('\n');
}

// Since the comparison metric is now "who's ahead at a fixed step count"
// rather than "who actually goes bankrupt" (see leaderPlayerId), a much
// shorter, consistent cutoff works fine and keeps a full batch fast —
// there's no need to wait for a natural conclusion that mostly doesn't
// happen anyway within a practical budget.
const MAX_STEPS_PER_GAME = 400;

interface DifficultyTally {
  gamesPlayed: number;
  leads: number;
  actualWins: number;
  bankruptcies: number;
}

function emptyTally(): DifficultyTally {
  return { gamesPlayed: 0, leads: 0, actualWins: 0, bankruptcies: 0 };
}

function recordResult(tallies: Map<HotelAiDifficulty, DifficultyTally>, result: SimulationResult): void {
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

function printTallyTable(tallies: Map<HotelAiDifficulty, DifficultyTally>): void {
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
  const tallies = new Map<HotelAiDifficulty, DifficultyTally>();

  for (const matchup of MATCHUPS) {
    const repeats = matchup.repeats ?? 1;
    for (let run = 1; run <= repeats; run += 1) {
      const matchupStartedAt = Date.now();
      const result = simulateHotelGame(matchup.players, MAX_STEPS_PER_GAME);
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
