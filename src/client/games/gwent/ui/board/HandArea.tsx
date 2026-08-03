import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import { CardTile } from './CardTile';
import styles from './matchBoard.module.css';

export interface HandAreaProps {
  hand: CardInstance[];
  playableInstanceIds: Set<string>;
  selectedInstanceId: string | null;
  onSelectCard: (instanceId: string) => void;
}

/** A face-up fan of the acting player's hand — purely presentational, MatchBoard owns the play-flow state machine (row/target/medic follow-ups). */
export function HandArea({ hand, playableInstanceIds, selectedInstanceId, onSelectCard }: HandAreaProps) {
  return (
    <div className={styles.handArea}>
      {hand.map((instance) => {
        const basePower = instance.defId === HIDDEN_CARD_DEF_ID ? null : getCardDef(instance.defId).basePower;
        return (
          <CardTile
            key={instance.instanceId}
            instance={instance}
            power={basePower ?? undefined}
            size="medium"
            selected={instance.instanceId === selectedInstanceId}
            disabled={!playableInstanceIds.has(instance.instanceId)}
            onClick={() => onSelectCard(instance.instanceId)}
          />
        );
      })}
    </div>
  );
}
