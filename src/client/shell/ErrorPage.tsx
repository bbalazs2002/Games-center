import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Button } from '../ui-kit/Button';
import styles from './ErrorPage.module.css';

export interface ErrorPageProps {
  title: string;
  message: string;
}

/**
 * The one, unified "something went wrong" surface for the whole app — before
 * this, an unmatched URL or a thrown render/loader error fell through to
 * React Router's own plain default screen, and an unknown local `gameId`
 * showed a bare, unstyled `<p>` (GameLoader.tsx) — real playtest report
 * (2026-08-03). Deliberately its own neutral identity (not any single game's
 * theme, same reasoning as HomePage/LoginPage) since a router-level error can
 * happen outside any game context at all.
 */
export function ErrorPage({ title, message }: ErrorPageProps) {
  const navigate = useNavigate();
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>{title}</h1>
        <p>{message}</p>
        <div className={styles.actions}>
          <Button onClick={() => navigate('/')}>Főoldal</Button>
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Vissza
          </Button>
        </div>
      </div>
    </div>
  );
}

/** React Router `errorElement` — reads the thrown/route error and picks a fitting Hungarian title+message. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <ErrorPage title="404 — Nincs ilyen oldal" message="A keresett cím nem található. Lehet, hogy elgépelted, vagy a hivatkozás elavult." />;
  }
  return (
    <ErrorPage
      title="Hoppá, valami elromlott"
      message="Váratlan hiba történt. Próbáld újratölteni az oldalt, vagy térj vissza a főoldalra — ha a hiba ismétlődik, kérlek jelezd a hibabejelentőn keresztül."
    />
  );
}
