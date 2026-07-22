import { GridBoard2D } from '../../../renderers/grid-2d/GridBoard2D';
import type { Piece } from '../engine/state';
import styles from './DamaGamePage.module.css';

const EMPTY_BOARD_SIZE = 8;

/**
 * Fázis 0a placeholder: demonstrates that the shared GridBoard2D renderer and the
 * shell/routing wiring work end to end. The Dáma engine (reducer/rules/selectors)
 * is not implemented yet — see docs/fazis-0a-dama-specifikacio.md.
 */
export function DamaGamePage() {
  return (
    <div className={styles.page}>
      <h1>Dáma</h1>
      <p className={styles.notice}>Játéklogika hamarosan (Fázis 1) — ez egy üres tábla-előnézet.</p>
      <GridBoard2D<Piece>
        rows={EMPTY_BOARD_SIZE}
        cols={EMPTY_BOARD_SIZE}
        getPieceAt={() => null}
        renderPiece={() => null}
      />
    </div>
  );
}

export default DamaGamePage;
