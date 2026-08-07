import type { PlayerState } from '@shared/games/gwent/engine/state';
import { factionLabel } from '@shared/games/gwent/engine/factionDisplay';
import { HandCardsIcon, LaurelWreathIcon, PersonIcon } from './boardIcons';
import { FactionIcon } from './factionIcons';
import { LifeTokens } from './LifeTokens';
import styles from './PlayerInfoPanel.module.css';

export interface PlayerInfoPanelProps {
  player: PlayerState;
  /** Gold ring/accent for the bottom (own) zone, silver for the top (opponent) zone — a fixed per-zone choice, NOT tied to whose turn it currently is (Gwent-0d §3). */
  isSelf: boolean;
  total: number;
  /** True when `total` is strictly higher than the OTHER side's — wraps the score in a laurel, matching the reference client. */
  leading: boolean;
  /** True for whichever player's TURN it currently is (`getCurrentPlayer`) — independent of `isSelf`. Gets a gold glow above/below the band. */
  isActiveTurn: boolean;
}

/**
 * Gwent-0d §3, 2. korrekció (2026-08-05, felhasználó által küldött közeli
 * referencia-kép alapján) — a korábbi, keskeny FÜGGŐLEGES kártya helyett egy
 * SZÉLES, VÍZSZINTES sáv: profilkép (+ ráhelyezett kis frakció-embléma
 * jelvény) balra, név/frakció középen, kéz-lapszám + élet-kristályok +
 * pontszám-jelvény jobbra — pontosan a referencia elrendezése. "Passzolt"
 * felirat jelenik meg, ha a játékos már passzolt ebben a körben.
 */
export function PlayerInfoPanel({ player, isSelf, total, leading, isActiveTurn }: PlayerInfoPanelProps) {
  return (
    <div
      className={[styles.panel, isSelf ? styles.ownerSelf : styles.ownerOpponent, isActiveTurn && styles.activeTurn]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.avatarWrap}>
        <div className={styles.avatar}>
          <PersonIcon />
        </div>
        <div className={styles.crestBadge}>
          <FactionIcon faction={player.faction} />
        </div>
      </div>

      <div className={styles.identity}>
        <span className={styles.name}>{player.name}</span>
        <span className={styles.faction}>{factionLabel(player.faction)}</span>
      </div>

      <div className={styles.stats}>
        <span className={styles.statLine}>
          <HandCardsIcon /> {player.hand.length}
        </span>
        <LifeTokens lives={player.lives} />
        <span className={[styles.scoreBadge, leading && styles.scoreLeading].filter(Boolean).join(' ')}>
          {leading && <LaurelWreathIcon />}
          <span className={styles.scoreNumber}>{total}</span>
        </span>
      </div>

      {player.passed && <span className={styles.passedLabel}>Passzolt</span>}
    </div>
  );
}
