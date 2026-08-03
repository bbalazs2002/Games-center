import { assetUrl } from '../../../../core/assetUrl';
import { STARTING_LIVES } from '../../../../../shared/games/gwent/engine/initialState';
import styles from './LifeTokens.module.css';

const CRYSTAL_ICON_PATH = assetUrl('/assets/gwent/icons/token-crystal.png');

export interface LifeTokensProps {
  lives: number;
}

/** `token-crystal.png` × STARTING_LIVES, a lost life shown greyed/faded rather than removed — so the player always sees "how many did I start with", not just "how many are left". */
export function LifeTokens({ lives }: LifeTokensProps) {
  return (
    <span className={styles.tokens} title={`${lives} élet`}>
      {Array.from({ length: STARTING_LIVES }, (_, i) => (
        <img
          key={i}
          className={[styles.crystal, i >= lives && styles.crystalLost].filter(Boolean).join(' ')}
          src={CRYSTAL_ICON_PATH}
          alt={i < lives ? 'Élet' : 'Elvesztett élet'}
        />
      ))}
    </span>
  );
}
