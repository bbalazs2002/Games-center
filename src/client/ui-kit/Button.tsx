import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', className, ...rest }: ButtonProps) {
  const variantClass = variant === 'primary' ? styles.primary : styles.secondary;
  return <button className={[styles.button, variantClass, className].filter(Boolean).join(' ')} {...rest} />;
}
