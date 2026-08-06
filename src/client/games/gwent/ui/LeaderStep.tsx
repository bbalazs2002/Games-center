import { assetUrl } from '../../../core/assetUrl';
import type { Faction, LeaderDef } from '../../../../shared/games/gwent/engine/types';
import { factionLabel } from './factionDisplay';
import styles from './GwentSetupPage.module.css';

export interface LeaderStepProps {
  faction: Faction;
  leaders: LeaderDef[];
  selectedLeaderId: string | null;
  onSelect: (leaderId: string) => void;
}

/**
 * Gwent-0d §4: a régi teljes-méretű CardGrid helyett kompakt, apró csempés
 * sor — a középső oszlopba költözött (GwentDeckBuilder.tsx), a kiválasztott
 * vezér teljes kártyája/leírása/a pakli-statisztika alatta jelenik meg.
 */
export function LeaderStep({ faction, leaders, selectedLeaderId, onSelect }: LeaderStepProps) {
  return (
    <div className={styles.leaderCompact}>
      <p className={styles.leaderCompactLabel}>Vezér ({factionLabel(faction)}):</p>
      <div className={styles.leaderCompactRow}>
        {leaders.map((leader) => (
          <button
            key={leader.id}
            type="button"
            className={[styles.leaderCompactTile, leader.id === selectedLeaderId ? styles.leaderCompactTileSelected : ''].filter(Boolean).join(' ')}
            aria-pressed={leader.id === selectedLeaderId}
            title={leader.name}
            onClick={() => onSelect(leader.id)}
          >
            <img className={styles.leaderCompactImage} src={assetUrl(leader.imagePaths[0])} alt={leader.name} />
          </button>
        ))}
      </div>
    </div>
  );
}
