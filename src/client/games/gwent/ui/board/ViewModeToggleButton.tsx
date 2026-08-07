import { Button } from '../../../../ui-kit/Button';
import { EyeIcon } from './boardIcons';

export interface ViewModeToggleButtonProps {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * Icon-only "Nézegető mód" toggle, shared by DeckStep.tsx and MatchBoard.tsx
 * (felhasználói kérés, 2026-08-07: only the eye icon, no label text — the
 * active state is a style change, not a text change). `variant` (primary vs
 * secondary — Button.module.css) IS that style change; `title`/`aria-label`
 * carry the text for anyone who needs it (tooltip, screen reader).
 */
export function ViewModeToggleButton({ active, disabled, onClick }: ViewModeToggleButtonProps) {
  const label = active ? 'Nézegető mód (aktív)' : 'Nézegető mód';
  return (
    <Button variant={active ? 'primary' : 'secondary'} disabled={disabled} onClick={onClick} title={label} aria-label={label} aria-pressed={active}>
      <EyeIcon />
    </Button>
  );
}
