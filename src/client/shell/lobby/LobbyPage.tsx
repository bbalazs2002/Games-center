import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Room, RoomAvailable } from 'colyseus.js';
import { generateRoomPassword } from '../../../shared/core/generateRoomPassword';
import type { RoomMetadata } from '../../../shared/core/RoomMetadata';
import { colyseusClient } from '../../core/transport/colyseusClient';
import { NEW_ROOM_PARAM } from '../../core/transport/onlineRoomConstants';
import { Button } from '../../ui-kit/Button';
import { Modal } from '../../ui-kit/Modal';
import { useAuth } from '../auth/AuthContext';
import { GAMES_REGISTRY } from '../gamesRegistry';
import styles from './LobbyPage.module.css';

type OpponentType = 'HUMAN' | 'AI';
type PasswordMode = 'none' | 'generate' | 'custom';

function playerCountOptions([min, max]: [number, number]): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function OpponentTypeFieldset({
  opponentType,
  onChange,
}: {
  opponentType: OpponentType;
  onChange: (type: OpponentType) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>Ellenfél</legend>
      <label>
        <input type="radio" checked={opponentType === 'HUMAN'} onChange={() => onChange('HUMAN')} />
        Ember
      </label>
      <label>
        <input type="radio" checked={opponentType === 'AI'} onChange={() => onChange('AI')} />
        AI
      </label>
    </fieldset>
  );
}

function PlayerCountFieldset({
  range,
  playerCount,
  onChange,
}: {
  range: [number, number];
  playerCount: number;
  onChange: (count: number) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>Játékosok száma</legend>
      <label>
        <select value={playerCount} onChange={(event) => onChange(Number(event.target.value))}>
          {playerCountOptions(range).map((count) => (
            <option key={count} value={count}>
              {count} fő
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

function PasswordModeFieldset({
  passwordMode,
  generatedPassword,
  customPassword,
  onModeChange,
  onCustomPasswordChange,
}: {
  passwordMode: PasswordMode;
  generatedPassword: string;
  customPassword: string;
  onModeChange: (mode: PasswordMode) => void;
  onCustomPasswordChange: (value: string) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>Jelszó</legend>
      <label>
        <input type="radio" checked={passwordMode === 'none'} onChange={() => onModeChange('none')} />
        Nincs (publikus szoba)
      </label>
      <label>
        <input type="radio" checked={passwordMode === 'generate'} onChange={() => onModeChange('generate')} />
        Generálja a rendszer{passwordMode === 'generate' && `: ${generatedPassword}`}
      </label>
      <label>
        <input type="radio" checked={passwordMode === 'custom'} onChange={() => onModeChange('custom')} />
        Megadom:{' '}
        <input
          type="text"
          value={customPassword}
          disabled={passwordMode !== 'custom'}
          onChange={(event) => onCustomPasswordChange(event.target.value)}
        />
      </label>
    </fieldset>
  );
}

export function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Record<string, RoomAvailable<RoomMetadata>>>({});
  const [error, setError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [opponentType, setOpponentType] = useState<OpponentType>('HUMAN');
  const [playerCount, setPlayerCount] = useState(2);
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('none');
  const [customPassword, setCustomPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  const [joinTarget, setJoinTarget] = useState<RoomAvailable<RoomMetadata> | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  const game = GAMES_REGISTRY.find((entry) => entry.id === gameId);

  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;
    let joinedRoom: Room | undefined;

    colyseusClient
      .joinOrCreate('lobby', { filter: { name: gameId } })
      .then((room) => {
        joinedRoom = room;
        // Always register onMessage handlers before checking the cancelled flag —
        // otherwise the initial 'rooms' message the server sends right on join
        // can arrive before we're listening (React StrictMode dev-mode double-runs
        // this effect), producing an "onMessage() not registered" warning.
        room.onMessage('rooms', (initial: RoomAvailable<RoomMetadata>[]) => {
          setRooms(Object.fromEntries(initial.map((entry) => [entry.roomId, entry])));
        });
        room.onMessage('+', ([roomId, data]: [string, RoomAvailable<RoomMetadata>]) => {
          setRooms((prev) => ({ ...prev, [roomId]: data }));
        });
        room.onMessage('-', (roomId: string) => {
          setRooms((prev) => {
            const next = { ...prev };
            delete next[roomId];
            return next;
          });
        });

        if (cancelled) void room.leave();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nem sikerült csatlakozni a lobbyhoz.');
      });

    return () => {
      cancelled = true;
      void joinedRoom?.leave();
    };
  }, [gameId]);

  function openCreateModal(): void {
    setOpponentType('HUMAN');
    setPlayerCount(game?.online?.playerCountRange?.[0] ?? 2);
    setPasswordMode('none');
    setCustomPassword('');
    setGeneratedPassword(generateRoomPassword());
    setCreateModalOpen(true);
  }

  function handlePasswordModeChange(mode: PasswordMode): void {
    setPasswordMode(mode);
    if (mode === 'generate') setGeneratedPassword(generateRoomPassword());
  }

  function handleConfirmCreate(): void {
    const params = new URLSearchParams();
    if (game?.online?.supportsAiOpponent) params.set('opponent', opponentType.toLowerCase());
    if (game?.online?.playerCountRange) params.set('playerCount', String(playerCount));
    if (passwordMode === 'generate') {
      params.set('password', generatedPassword);
    } else if (passwordMode === 'custom' && customPassword.trim()) {
      params.set('password', customPassword.trim());
    }
    setCreateModalOpen(false);
    navigate(`/games/${gameId}/online/${NEW_ROOM_PARAM}?${params}`);
  }

  function handleRoomClick(room: RoomAvailable<RoomMetadata>): void {
    if (room.metadata?.hasPassword) {
      setJoinPassword('');
      setJoinTarget(room);
      return;
    }
    navigate(`/games/${gameId}/online/${room.roomId}`);
  }

  function handleConfirmJoinWithPassword(): void {
    if (!joinTarget) return;
    const params = new URLSearchParams({ password: joinPassword });
    setJoinTarget(null);
    navigate(`/games/${gameId}/online/${joinTarget.roomId}?${params}`);
  }

  function handleSendJoinRequest(): void {
    if (!joinTarget) return;
    const roomId = joinTarget.roomId;
    setJoinTarget(null);
    navigate(`/games/${gameId}/online/${roomId}?requestOnly=1`);
  }

  function handleLogout(): void {
    logout();
    navigate('/login');
  }

  if (!game) {
    return <p>Ismeretlen játék: {gameId}</p>;
  }

  const roomList = Object.values(rooms);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>{game.label} — Lobby</h1>
        <Button variant="secondary" onClick={handleLogout}>
          Kijelentkezés
        </Button>
      </div>
      <p>Bejelentkezve mint: {auth?.user.displayName}</p>

      <Button onClick={openCreateModal}>Új szoba</Button>

      {error && <p className={styles.error}>{error}</p>}

      <h2>Nyitott szobák</h2>
      {roomList.length === 0 ? (
        <p>Nincs nyitott szoba — hozz létre egyet!</p>
      ) : (
        <ul className={styles.roomList}>
          {roomList.map((room) => (
            <li key={room.roomId} className={styles.roomItem}>
              <span>
                {room.metadata?.hasPassword && <span title="Jelszóval védett">🔒 </span>}
                Szoba {room.roomId} ({room.clients}/{room.maxClients})
              </span>
              <Button
                variant="secondary"
                onClick={() => handleRoomClick(room)}
                disabled={room.clients >= room.maxClients}
              >
                Csatlakozás
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)}>
        <h2>Új szoba</h2>

        {game.online?.supportsAiOpponent && (
          <OpponentTypeFieldset opponentType={opponentType} onChange={setOpponentType} />
        )}

        {game.online?.playerCountRange && (
          <PlayerCountFieldset
            range={game.online.playerCountRange}
            playerCount={playerCount}
            onChange={setPlayerCount}
          />
        )}

        <PasswordModeFieldset
          passwordMode={passwordMode}
          generatedPassword={generatedPassword}
          customPassword={customPassword}
          onModeChange={handlePasswordModeChange}
          onCustomPasswordChange={setCustomPassword}
        />

        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
            Mégse
          </Button>
          <Button onClick={handleConfirmCreate}>Létrehozás</Button>
        </div>
      </Modal>

      <Modal open={joinTarget !== null} onClose={() => setJoinTarget(null)}>
        <h2>🔒 Szoba {joinTarget?.roomId}</h2>
        <p>Ez a szoba jelszóval védett. Add meg a jelszót, vagy küldj csatlakozási kérelmet.</p>
        <label>
          Jelszó:{' '}
          <input
            type="text"
            value={joinPassword}
            onChange={(event) => setJoinPassword(event.target.value)}
          />
        </label>
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={handleSendJoinRequest}>
            Kérés küldése
          </Button>
          <Button onClick={handleConfirmJoinWithPassword} disabled={!joinPassword}>
            Csatlakozás jelszóval
          </Button>
        </div>
      </Modal>
    </div>
  );
}
