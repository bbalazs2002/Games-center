import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '../../../../../shared/games/gwent/engine/specialCardIds';
import type { CardInstance, PlayerId } from '../../../../../shared/games/gwent/engine/state';
import { TrackedCardTile } from './cardFlight';
import styles from './matchBoard.module.css';

export interface HandAreaProps {
  hand: CardInstance[];
  ownerId: PlayerId;
  playableInstanceIds: Set<string>;
  selectedInstanceId: string | null;
  onSelectCard: (instanceId: string) => void;
}

/** A face-up fan of the acting player's hand — purely presentational, MatchBoard owns the play-flow state machine (row/target/medic follow-ups). */
export function HandArea({ hand, ownerId, playableInstanceIds, selectedInstanceId, onSelectCard }: HandAreaProps) {
  return (
    <div className={styles.handArea}>
      {hand.map((instance) => {
        const basePower = instance.defId === HIDDEN_CARD_DEF_ID ? null : getCardDef(instance.defId).basePower;
        return (
          <TrackedCardTile
            key={instance.instanceId}
            instance={instance}
            ownerId={ownerId}
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
