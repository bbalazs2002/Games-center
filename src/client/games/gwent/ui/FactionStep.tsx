import { CardGrid } from '../../../ui-kit/CardGrid';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import { FACTION_OPTIONS } from './factionDisplay';

function representativeImage(faction: Faction): string | undefined {
  // A faction has no image of its own — its first leader's art stands in for it.
  return LEADER_DEFS.find((l) => l.faction === faction)?.imagePaths[0];
}

export interface FactionStepProps {
  selectedFaction: Faction | null;
  onSelect: (faction: Faction) => void;
}

export function FactionStep({ selectedFaction, onSelect }: FactionStepProps) {
  return (
    <>
      <p>Válassz frakciót:</p>
      <CardGrid
        items={FACTION_OPTIONS}
        getKey={(f) => f.id}
        getImageUrl={(f) => representativeImage(f.id)}
        getLabel={(f) => f.label}
        getSubtitle={(f) => f.bonus}
        isSelected={(f) => f.id === selectedFaction}
        onSelect={(f) => onSelect(f.id)}
      />
    </>
  );
}
