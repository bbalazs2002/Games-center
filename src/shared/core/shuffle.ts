/** Fisher–Yates shuffle — extracted from Ramses' engine (2026-08-04) once Gwent needed the exact same code, per the project's promote-on-second-use convention. */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
