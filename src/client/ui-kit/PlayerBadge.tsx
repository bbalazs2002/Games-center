import styles from './PlayerBadge.module.css';

export interface PlayerBadgeProps {
  name: string;
  active?: boolean;
}

export function PlayerBadge({ name, active = false }: PlayerBadgeProps) {
  return (
    <span className={[styles.badge, active ? styles.active : ''].filter(Boolean).join(' ')}>
      {name}
    </span>
  );
}
