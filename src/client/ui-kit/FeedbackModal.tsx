import { useState } from 'react';
import { DEFAULT_SERVER_URL } from '../core/serverUrl';
import { useAuth } from '../shell/auth/AuthContext';
import { useGameTheme } from '../shell/useGameTheme';
import { Button } from './Button';
import { useFeedbackGameContext } from './FeedbackContext';
import { Modal } from './Modal';
import styles from './FeedbackModal.module.css';
import themedModal from './themedModalContent.module.css';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL;

type FeedbackType = 'BUG' | 'SUGGESTION';

async function submitFeedback(type: FeedbackType, message: string, token: string | undefined, context: { gameId: string; state: unknown } | null): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  await fetch(`${API_BASE_URL}/api/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type,
      message,
      gameType: context?.gameId ?? null,
      context: context?.state ?? null,
    }),
  });
}

export interface FeedbackModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Type + free-text form, auto-attaching whatever `FeedbackContext` currently
 * holds (a running game's own state, if any) — see docs/shell-ux-specifikacio.md
 * §4.2/§4.4. Auth is OPTIONAL: hot-seat play has no guaranteed JWT (`/games/:gameId/local`
 * isn't behind RequireAuth), so this must work logged out too.
 */
export function FeedbackModal({ open, onClose }: FeedbackModalProps) {
  const { auth } = useAuth();
  const gameContext = useFeedbackGameContext();
  // Themed to match whichever game is running mid-play; a neutral default
  // (FeedbackModal.module.css's own fallback colors) when opened from the menu.
  const themeClass = useGameTheme(gameContext?.gameId);
  const [type, setType] = useState<FeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  function handleClose(): void {
    setMessage('');
    setType('BUG');
    setStatus('idle');
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      await submitFeedback(type, message.trim(), auth?.token, gameContext);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      className={[styles.feedbackModal, themedModal.themed, themeClass].filter(Boolean).join(' ')}
    >
      <h2>Hiba bejelentése / javaslat</h2>
      {status === 'sent' ? (
        <p>Köszönjük, elküldve!</p>
      ) : (
        <>
          <fieldset className={styles.typeFieldset}>
            <label>
              <input type="radio" checked={type === 'BUG'} onChange={() => setType('BUG')} />
              Hiba
            </label>
            <label>
              <input type="radio" checked={type === 'SUGGESTION'} onChange={() => setType('SUGGESTION')} />
              Javaslat
            </label>
          </fieldset>
          <textarea
            className={styles.textarea}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mit tapasztaltál, vagy mit javasolnál?"
            rows={5}
          />
          {gameContext && <p className={styles.contextNotice}>A jelenlegi játékállapot csatolva lesz.</p>}
          {status === 'error' && <p className={styles.errorNotice}>Nem sikerült elküldeni — próbáld újra.</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={handleClose}>
              Mégse
            </Button>
            <Button onClick={handleSubmit} disabled={!message.trim() || status === 'sending'}>
              Küldés
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
