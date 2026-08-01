import { Button } from '../../../ui-kit/Button';
import { CardGrid } from '../../../ui-kit/CardGrid';
import type { Faction, LeaderDef } from '../../../../shared/games/gwent/engine/types';
import { factionLabel } from './factionDisplay';
import styles from './GwentSetupPage.module.css';

export interface LeaderStepProps {
  faction: Faction;
  leaders: LeaderDef[];
  selectedLeaderId: string | null;
  onBack: () => void;
  onSelect: (leaderId: string) => void;
}

export function LeaderStep({ faction, leaders, selectedLeaderId, onBack, onSelect }: LeaderStepProps) {
  return (
    <>
      <div className={styles.stepHeader}>
        <Button variant="secondary" onClick={onBack}>
          ← Frakció
        </Button>
        <p>Válassz vezért ({factionLabel(faction)}):</p>
      </div>
      <CardGrid
        items={leaders}
        getKey={(l) => l.id}
        getImageUrl={(l) => l.imagePaths[0]}
        getLabel={(l) => l.name}
        getSubtitle={(l) => l.abilityDescription}
        isSelected={(l) => l.id === selectedLeaderId}
        onSelect={(l) => onSelect(l.id)}
      />
    </>
  );
}
