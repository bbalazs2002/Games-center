import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  className?: string;
}

/** The `--shell-*` tokens the trigger/panel read (see Select.module.css) — copied onto the portaled panel explicitly, see readShellVars below. */
const SHELL_VAR_NAMES = ['--shell-surface', '--shell-ink', '--shell-accent', '--shell-line'] as const;

/**
 * The portaled panel lives OUTSIDE this component's own themed ancestors in
 * the DOM (same reasoning as ui-kit/Modal.tsx's own portal) — so it can
 * never simply INHERIT the page's `--shell-*` custom properties the way the
 * trigger button (still in its original spot) does. Reading their resolved
 * values off the trigger and re-declaring them inline on the panel's own
 * root keeps the panel themed correctly regardless of where in the DOM it
 * ends up rendering.
 */
function readShellVars(el: HTMLElement): Record<string, string> {
  const computed = getComputedStyle(el);
  const vars: Record<string, string> = {};
  for (const name of SHELL_VAR_NAMES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) vars[name] = value;
  }
  return vars;
}

/**
 * A fully custom-styled dropdown, replacing the native `<select>` — real
 * playtest report (2026-07-30): "A select lenyíló része még mindig az
 * alapértelmezett stílussal jelenik meg." The CLOSED box could already be
 * restyled (ui-kit/FormControls.module.css's old `.select`), but a native
 * `<select>`'s OPEN popup is OS-rendered and unreachable by CSS in any
 * broadly-supported way — the only real fix is not using a native `<select>`
 * at all. Panel is portaled + `position: fixed` (see Select.module.css) so
 * it's never clipped by a scrolling ancestor (e.g. a Modal's own `.body`).
 */
export function Select({ value, onChange, options, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPanelStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      ...readShellVars(triggerRef.current),
    });
  }, [open]);

  // Closing on any scroll/resize (rather than re-measuring) keeps the panel
  // from ever drifting out of sync with its trigger — simple and safe, and
  // these menus are short-lived enough that re-opening costs nothing.
  useEffect(() => {
    if (!open) return;
    function close(): void {
      setOpen(false);
    }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function selectOption(optionValue: string): void {
    onChange(optionValue);
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected?.label ?? ''}</span>
        <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open &&
        panelStyle &&
        createPortal(
          <ul
            ref={panelRef}
            role="listbox"
            className={styles.panel}
            style={panelStyle}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
          >
            {options.map((option) => (
              <li key={option.value} role="option" aria-selected={option.value === value}>
                <button
                  type="button"
                  className={[styles.option, option.value === value && styles.optionSelected].filter(Boolean).join(' ')}
                  onClick={() => selectOption(option.value)}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
