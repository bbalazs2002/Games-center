import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../ui-kit/Button';
import { useAuth } from './AuthContext';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(code.trim(), displayName.trim());
      // Send the player back to whichever page RequireAuth redirected them from
      // (e.g. a specific game's lobby), falling back to the home page.
      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Games Center</h1>
      <label className={styles.field}>
        Meghívó-kód
        <input value={code} onChange={(event) => setCode(event.target.value)} required />
      </label>
      <label className={styles.field}>
        Megjelenítendő név
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Belépés…' : 'Belépés'}
      </Button>
    </form>
  );
}
