import type { ReactNode } from 'react';
import styles from './Menu.module.css';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

export interface MenuProps {
  items: MenuItem[];
  footer?: ReactNode;
}

export function Menu({ items, footer }: MenuProps) {
  return (
    <nav className={styles.menu}>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button className={styles.item} onClick={item.onSelect}>
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      {footer}
    </nav>
  );
}
