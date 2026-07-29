import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Room, RoomAvailable } from 'colyseus.js';
import { generateRoomPassword } from '../../../shared/core/generateRoomPassword';
import type { RoomMetadata } from '../../../shared/core/RoomMetadata';
import { colyseusClient } from '../../core/transport/colyseusClient';
import { NEW_ROOM_PARAM } from '../../core/transport/onlineRoomConstants';
import { Button } from '../../ui-kit/Button';
import { MenuNav } from '../../ui-kit/MenuNav';
import { Modal } from '../../ui-kit/Modal';
import themedModal from '../../ui-kit/themedModalContent.module.css';
import { useAuth } from '../auth/AuthContext';
import { GAMES_REGISTRY, type GameDescriptor } from '../gamesRegistry';
import { useGameTheme } from '../useGameTheme';
import styles from './LobbyPage.module.css';

type OpponentType = 'HUMAN' | 'AI';
type PasswordMode = 'none' | 'generate' | 'custom';
type AiDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

function playerCountOptions([min, max]: [number, number]): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

/** Shared by the binary Ember/AI picker (Dáma) and the N-AI-count picker (Hotel/Ramses) below — avoids duplicating the same 3-option markup twice. */
function AiDifficultySelect({ value, onChange }: { value: AiDifficulty; onChange: (difficulty: AiDifficulty) => void }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as AiDifficulty)}>
      <option value="EASY">Könnyű</option>
      <option value="MEDIUM">Közepes</option>
      <option value="HARD">Nehéz</option>
    </select>
  );
}

/** Dáma's binary Ember/AI choice — the difficulty picker below only ever mattered for Hotel/Ramses's AiOpponentCountFieldset until now (see docs/dama-0d-ai-specifikacio.md §10). */
function OpponentTypeFieldset({
  opponentType,
  onChange,
  aiDifficulty,
  onAiDifficultyChange,
}: {
  opponentType: OpponentType;
  onChange: (type: OpponentType) => void;
  aiDifficulty: AiDifficulty;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
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
      {opponentType === 'AI' && (
        <label>
          {' '}
          Nehézség:{' '}
          <AiDifficultySelect value={aiDifficulty} onChange={onAiDifficultyChange} />
        </label>
      )}
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

/** Hotel's AI picker — replaces Dáma's binary Ember/AI choice with "how many of the remaining slots" + a shared difficulty for all of them (see docs/hotel-0d-ai-specifikacio.md §3.1, §6). */
function AiOpponentCountFieldset({
  maxAiCount,
  aiCount,
  onAiCountChange,
  aiDifficulty,
  onAiDifficultyChange,
}: {
  maxAiCount: number;
  aiCount: number;
  onAiCountChange: (count: number) => void;
  aiDifficulty: AiDifficulty;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>AI ellenfelek</legend>
      <label>
        <select value={aiCount} onChange={(event) => onAiCountChange(Number(event.target.value))}>
          {Array.from({ length: maxAiCount + 1 }, (_, i) => i).map((count) => (
            <option key={count} value={count}>
              {count === 0 ? 'Nincs AI' : `${count} AI`}
            </option>
          ))}
        </select>
      </label>
      {aiCount > 0 && (
        <label>
          {' '}
          Nehézség:{' '}
          <AiDifficultySelect value={aiDifficulty} onChange={onAiDifficultyChange} />
        </label>
      )}
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

interface CreateRoomValues {
  opponentType: OpponentType;
  playerCount: number;
  aiCount: number;
  aiDifficulty: AiDifficulty;
  passwordMode: PasswordMode;
  generatedPassword: string;
  customPassword: string;
}

function applyAiOpponentCountParams(params: URLSearchParams, values: CreateRoomValues): void {
  const { aiCount, aiDifficulty } = values;
  params.set('aiCount', String(aiCount));
  if (aiCount > 0) params.set('aiDifficulty', aiDifficulty);
}

function applyBinaryAiOpponentParams(params: URLSearchParams, values: CreateRoomValues): void {
  params.set('opponent', values.opponentType.toLowerCase());
  if (values.opponentType === 'AI') params.set('aiDifficulty', values.aiDifficulty);
}

function applyOpponentParams(params: URLSearchParams, game: GameDescriptor | undefined, values: CreateRoomValues): void {
  if (game?.online?.supportsAiOpponent) applyBinaryAiOpponentParams(params, values);
  if (game?.online?.playerCountRange) params.set('playerCount', String(values.playerCount));
  if (game?.online?.supportsAiOpponentCount) applyAiOpponentCountParams(params, values);
}

function applyPasswordParams(params: URLSearchParams, values: CreateRoomValues): void {
  const { passwordMode, generatedPassword, customPassword } = values;
  if (passwordMode === 'generate') {
    params.set('password', generatedPassword);
  } else if (passwordMode === 'custom' && customPassword.trim()) {
    params.set('password', customPassword.trim());
  }
}

/** Pure param-building split out of handleConfirmCreate purely to stay under the project's ESLint complexity limit — same reasoning as the reducer's dispatch-table splits elsewhere in this codebase. */
function buildCreateRoomParams(game: GameDescriptor | undefined, values: CreateRoomValues): URLSearchParams {
  const params = new URLSearchParams();
  applyOpponentParams(params, game, values);
  applyPasswordParams(params, values);
  return params;
}

/** The "Új szoba" modal's contents, split out of LobbyPage purely to stay under the project's ESLint complexity limit (each optional fieldset's conditional render counted toward LobbyPage's own complexity otherwise). */
function CreateRoomModal({
  open,
  onClose,
  themeClass,
  game,
  opponentType,
  onOpponentTypeChange,
  playerCount,
  onPlayerCountChange,
  aiCount,
  onAiCountChange,
  aiDifficulty,
  onAiDifficultyChange,
  passwordMode,
  generatedPassword,
  customPassword,
  onPasswordModeChange,
  onCustomPasswordChange,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  themeClass: string | undefined;
  game: GameDescriptor;
  opponentType: OpponentType;
  onOpponentTypeChange: (type: OpponentType) => void;
  playerCount: number;
  onPlayerCountChange: (count: number) => void;
  aiCount: number;
  onAiCountChange: (count: number) => void;
  aiDifficulty: AiDifficulty;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
  passwordMode: PasswordMode;
  generatedPassword: string;
  customPassword: string;
  onPasswordModeChange: (mode: PasswordMode) => void;
  onCustomPasswordChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} className={[themedModal.themed, themeClass].filter(Boolean).join(' ')}>
      <h2>Új szoba</h2>

      {game.online?.supportsAiOpponent && (
        <OpponentTypeFieldset
          opponentType={opponentType}
          onChange={onOpponentTypeChange}
          aiDifficulty={aiDifficulty}
          onAiDifficultyChange={onAiDifficultyChange}
        />
      )}

      {game.online?.playerCountRange && (
        <PlayerCountFieldset range={game.online.playerCountRange} playerCount={playerCount} onChange={onPlayerCountChange} />
      )}

      {game.online?.supportsAiOpponentCount && (
        <AiOpponentCountFieldset
          maxAiCount={playerCount - 1}
          aiCount={aiCount}
          onAiCountChange={onAiCountChange}
          aiDifficulty={aiDifficulty}
          onAiDifficultyChange={onAiDifficultyChange}
        />
      )}

      <PasswordModeFieldset
        passwordMode={passwordMode}
        generatedPassword={generatedPassword}
        customPassword={customPassword}
        onModeChange={onPasswordModeChange}
        onCustomPasswordChange={onCustomPasswordChange}
      />

      <div className={styles.modalActions}>
        <Button variant="secondary" onClick={onClose}>
          Mégse
        </Button>
        <Button onClick={onConfirm}>Létrehozás</Button>
      </div>
    </Modal>
  );
}

export function LobbyPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const themeClass = useGameTheme(gameId);
  const [rooms, setRooms] = useState<Record<string, RoomAvailable<RoomMetadata>>>({});
  const [error, setError] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [opponentType, setOpponentType] = useState<OpponentType>('HUMAN');
  const [playerCount, setPlayerCount] = useState(2);
  const [aiCount, setAiCount] = useState(0);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('MEDIUM');
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
    setAiCount(0);
    setAiDifficulty('MEDIUM');
    setPasswordMode('none');
    setCustomPassword('');
    setGeneratedPassword(generateRoomPassword());
    setCreateModalOpen(true);
  }

  /** Clamps aiCount down if a smaller playerCount no longer leaves room for it — always leaves at least one real player. */
  function handlePlayerCountChange(count: number): void {
    setPlayerCount(count);
    setAiCount((prev) => Math.min(prev, count - 1));
  }

  function handlePasswordModeChange(mode: PasswordMode): void {
    setPasswordMode(mode);
    if (mode === 'generate') setGeneratedPassword(generateRoomPassword());
  }

  function handleConfirmCreate(): void {
    const params = buildCreateRoomParams(game, {
      opponentType,
      playerCount,
      aiCount,
      aiDifficulty,
      passwordMode,
      generatedPassword,
      customPassword,
    });
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
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <MenuNav backTo={`/games/${gameId}`} />
      <div className={styles.content}>
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
      </div>

      <CreateRoomModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        themeClass={themeClass}
        game={game}
        opponentType={opponentType}
        onOpponentTypeChange={setOpponentType}
        playerCount={playerCount}
        onPlayerCountChange={handlePlayerCountChange}
        aiCount={aiCount}
        onAiCountChange={setAiCount}
        aiDifficulty={aiDifficulty}
        onAiDifficultyChange={setAiDifficulty}
        passwordMode={passwordMode}
        generatedPassword={generatedPassword}
        customPassword={customPassword}
        onPasswordModeChange={handlePasswordModeChange}
        onCustomPasswordChange={setCustomPassword}
        onConfirm={handleConfirmCreate}
      />

      <Modal
        open={joinTarget !== null}
        onClose={() => setJoinTarget(null)}
        className={[themedModal.themed, themeClass].filter(Boolean).join(' ')}
      >
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
