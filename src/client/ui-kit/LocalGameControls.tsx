import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameTheme } from '../shell/useGameTheme';
import { Button } from './Button';
import { Modal } from './Modal';
import styles from './LocalGameControls.module.css';
import themedModal from './themedModalContent.module.css';

export interface LocalGameControlsProps {
  /** Used both to theme the confirmation modals and to build the "exit" destination (`/games/{gameId}`). */
  gameId: string;
  /** Omitted → no "Új játék" button at all (nothing to reset to). Whatever cleanup a specific game needs (e.g. Hotel clearing its localStorage save) is the CALLER's responsibility — this component only handles the confirm-then-call UI. */
  onRequestNewGame?: () => void;
  /** Whether leaving preserves the game for a later resume (Hotel, via localStorage) or just abandons it (Dáma/Ramses today, no persistence) — changes the exit-confirm wording so it never overpromises. */
  resumable: boolean;
}

/**
 * "Kilépés a játékból" + (optionally) "Új játék", top-center — the shared,
 * game-agnostic version of what was originally a Hotel-only component (see
 * project memory). Extracted so Dáma/Ramses can offer the same escape
 * hatches, a real playtest request (2026-07-29): "A dámában és a
 * Ramses-ben is legyen új játék és kilépés gomb a Hotel mintájára."
 */
export function LocalGameControls({ gameId, onRequestNewGame, resumable }: LocalGameControlsProps) {
  const navigate = useNavigate();
  const themeClass = useGameTheme(gameId);
  const modalClassName = [themedModal.themed, themeClass].filter(Boolean).join(' ');
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [newGameConfirmOpen, setNewGameConfirmOpen] = useState(false);

  return (
    <>
      {/* Top-center — kept clear across every game's own floating HUD by
          convention (see docs/shell-ux-specifikacio.md §4.1's corner survey). */}
      <div className={styles.topCenterControls}>
        <button className={styles.topCenterButton} onClick={() => setExitConfirmOpen(true)}>
          Kilépés a játékból
        </button>
        {onRequestNewGame && (
          <button className={styles.topCenterButton} onClick={() => setNewGameConfirmOpen(true)}>
            Új játék
          </button>
        )}
      </div>

      <Modal open={exitConfirmOpen} onClose={() => setExitConfirmOpen(false)} className={modalClassName}>
        <h2>Kilépsz a játékból?</h2>
        <p>
          {resumable
            ? 'A játék állása megmarad — legközelebb ugyanide léphetsz vissza a "Lokális játék" gombbal.'
            : 'A jelenlegi játék elvész, nem vonható vissza.'}
        </p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => setExitConfirmOpen(false)}>
            Mégse
          </Button>
          <Button onClick={() => navigate(`/games/${gameId}`)}>Igen, kilépek</Button>
        </div>
      </Modal>

      {onRequestNewGame && (
        <Modal open={newGameConfirmOpen} onClose={() => setNewGameConfirmOpen(false)} className={modalClassName}>
          <h2>Új játékot kezdesz?</h2>
          <p>A jelenlegi játék elvész, nem vonható vissza.</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setNewGameConfirmOpen(false)}>
              Mégse
            </Button>
            <Button
              onClick={() => {
                setNewGameConfirmOpen(false);
                onRequestNewGame();
              }}
            >
              Igen, új játék
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
