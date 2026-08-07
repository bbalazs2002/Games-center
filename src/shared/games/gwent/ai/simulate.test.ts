import { describe, expect, it } from 'vitest';
import { simulateGwentGame } from './simulate';

describe('simulateGwentGame', () => {
  it('runs a full AI-only match to completion, across several random faction/leader/difficulty combinations', () => {
    for (const [difficultyA, difficultyB] of [
      ['HARD', 'EASY'],
      ['MEDIUM', 'MEDIUM'],
      ['EASY', 'HARD'],
    ] as const) {
      const result = simulateGwentGame([
        { name: 'A', difficulty: difficultyA },
        { name: 'B', difficulty: difficultyB },
      ]);
      expect(result.reachedStepCap).toBe(false);
      expect(result.winnerIds.length).toBeLessThanOrEqual(1); // 0 (a rare true tie) or 1, never both
      expect(result.players).toHaveLength(2);
      for (const player of result.players) {
        expect(player.livesLeft).toBeGreaterThanOrEqual(0);
        expect(player.roundsWon).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
