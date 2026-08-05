import { assetUrl } from '../../../core/assetUrl';
import { CardGrid } from '../../../ui-kit/CardGrid';
import type { Faction, LeaderDef } from '../../../../shared/games/gwent/engine/types';
import { factionLabel } from './factionDisplay';
import styles from './GwentSetupPage.module.css';

export interface LeaderStepProps {
  faction: Faction;
  leaders: LeaderDef[];
  selectedLeaderId: string | null;
  onSelect: (leaderId: string) => void;
}

/** Gwent-0c.4 §A: no longer a wizard "step" — rendered alongside FactionStep/DeckStep on one page, so there's no "back" to offer anymore. */
export function LeaderStep({ faction, leaders, selectedLeaderId, onSelect }: LeaderStepProps) {
  return (
    <>
      <p>Válassz vezért ({factionLabel(faction)}):</p>
      <CardGrid
        items={leaders}
        getKey={(l) => l.id}
        getImageUrl={(l) => assetUrl(l.imagePaths[0])}
        getLabel={(l) => l.name}
        getSubtitle={(l) => l.abilityDescription}
        isSelected={(l) => l.id === selectedLeaderId}
        onSelect={(l) => onSelect(l.id)}
        className={styles.compactGrid}
      />
    </>
  );
}
