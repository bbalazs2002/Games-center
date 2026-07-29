import type { ReactNode } from 'react';
import styles from './GridBoard2D.module.css';

export interface GridPosition {
  row: number;
  col: number;
}

export interface GridBoard2DProps<TPiece> {
  rows: number;
  cols: number;
  getPieceAt: (position: GridPosition) => TPiece | null;
  renderPiece: (piece: TPiece) => ReactNode;
  highlightedSquares?: GridPosition[];
  onSquareClick?: (position: GridPosition) => void;
  /** Rank/file labels (a-h / 1-8 style) around the board — off by default since not every future grid game (e.g. Connect 4) uses this coordinate convention. See docs/b-klaszter-ui-specifikacio.md §4. */
  showCoordinates?: boolean;
}

const SQUARE_SIZE = 64;

function isSamePosition(a: GridPosition, b: GridPosition): boolean {
  return a.row === b.row && a.col === b.col;
}

function fileLabel(col: number): string {
  return String.fromCharCode(97 + col);
}

/**
 * Purely presentational SVG board renderer, shared across every grid-based game
 * (cluster B: Sakk, Malom, Dáma). Knows nothing about pieces, rules, or turn order —
 * it only renders what it's given and reports clicks.
 */
export function GridBoard2D<TPiece>({
  rows,
  cols,
  getPieceAt,
  renderPiece,
  highlightedSquares = [],
  onSquareClick,
  showCoordinates = false,
}: GridBoard2DProps<TPiece>) {
  const squares = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({ row, col })),
  ).flat();

  const board = (
    <svg
      className={styles.board}
      viewBox={`0 0 ${cols * SQUARE_SIZE} ${rows * SQUARE_SIZE}`}
      role="grid"
    >
      {squares.map((position) => {
        const isDark = (position.row + position.col) % 2 === 1;
        const isHighlighted = highlightedSquares.some((square) => isSamePosition(square, position));
        const piece = getPieceAt(position);

        return (
          <g
            key={`${position.row}-${position.col}`}
            role="gridcell"
            className={styles.square}
            onClick={() => onSquareClick?.(position)}
          >
            <rect
              x={position.col * SQUARE_SIZE}
              y={position.row * SQUARE_SIZE}
              width={SQUARE_SIZE}
              height={SQUARE_SIZE}
              className={isDark ? styles.darkSquare : styles.lightSquare}
            />
            {isHighlighted && (
              <rect
                x={position.col * SQUARE_SIZE}
                y={position.row * SQUARE_SIZE}
                width={SQUARE_SIZE}
                height={SQUARE_SIZE}
                className={styles.highlight}
              />
            )}
            {piece && (
              <foreignObject
                x={position.col * SQUARE_SIZE}
                y={position.row * SQUARE_SIZE}
                width={SQUARE_SIZE}
                height={SQUARE_SIZE}
              >
                {renderPiece(piece)}
              </foreignObject>
            )}
          </g>
        );
      })}
    </svg>
  );

  if (!showCoordinates) {
    return <div className={styles.frame}>{board}</div>;
  }

  return (
    <div className={styles.frameWithCoordinates}>
      <div className={styles.rankLabels}>
        {Array.from({ length: rows }, (_, row) => (
          <span key={row}>{rows - row}</span>
        ))}
      </div>
      <div className={styles.frame}>{board}</div>
      <div className={styles.fileLabels}>
        {Array.from({ length: cols }, (_, col) => (
          <span key={col}>{fileLabel(col)}</span>
        ))}
      </div>
    </div>
  );
}
