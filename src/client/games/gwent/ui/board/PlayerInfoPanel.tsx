import type { PlayerState } from '../../../../../shared/games/gwent/engine/state';
import { factionLabel } from '../factionDisplay';
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
 * Gwent-0d §3, korrekció (2026-08-05) — a referencia-képeken ez a blokk a
 * BAL oszlopban ül, a vezér-kártya MELLETT/FÖLÖTT (nem egy vízszintes fejléc
 * a sorok fölött) — keskeny, függőleges kártyaként. `PlayerBoardZone.tsx`
 * mostantól a `.boardZoneLeaderColumn`-ba rendereli, a `LeaderAbilityPanel`
 * mellé.
 */
export function PlayerInfoPanel({ player, isSelf, total, leading, isActiveTurn }: PlayerInfoPanelProps) {
  return (
    <div
      className={[styles.panel, isSelf ? styles.ownerSelf : styles.ownerOpponent, isActiveTurn && styles.activeTurn]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.avatar}>
        <PersonIcon />
      </div>
      <span className={styles.name}>{player.name}</span>
      <span className={styles.faction}>
        <FactionIcon faction={player.faction} /> {factionLabel(player.faction)}
      </span>
      <LifeTokens lives={player.lives} />
      <div className={styles.stats}>
        <span className={styles.statLine}>
          <HandCardsIcon /> {player.hand.length}
        </span>
        <span className={[styles.scoreBadge, leading && styles.scoreLeading].filter(Boolean).join(' ')}>
          {leading && <LaurelWreathIcon />}
          <span className={styles.scoreNumber}>{total}</span>
        </span>
      </div>
    </div>
  );
}
