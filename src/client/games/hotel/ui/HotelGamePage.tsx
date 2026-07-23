import { useMemo, type ReactNode } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import {
  LoopTrackBoard3D,
  type InwardDirection,
  type LoopTrackSpace,
  type LoopTrackToken,
} from '../../../renderers/loop-track-3d/LoopTrackBoard3D';
import type { HotelAction } from '../../../../shared/games/hotel/engine/actions';
import { createInitialState } from '../../../../shared/games/hotel/engine/initialState';
import { reducer } from '../../../../shared/games/hotel/engine/reducer';
import { getOwnedLots, getWinner } from '../../../../shared/games/hotel/engine/selectors';
import {
  PARKING_POSITION,
  type BuildingPermitResult,
  type HotelLot,
  type HotelState,
  type PlayerId,
  type SpaceType,
} from '../../../../shared/games/hotel/engine/state';
import { GameLogPanel } from './GameLogPanel';
import { PlayerActionWheel } from './PlayerActionWheel';
import styles from './HotelGamePage.module.css';

const PLAYER_COLORS = ['#e53e3e', '#3182ce', '#38a169', '#d69e2e'];
const PLAYER_COLOR_NAMES = ['piros', 'kék', 'zöld', 'sárga'];

// Geometric placeholders only — see docs/hotel-0a-specifikacio.md §5, real
// assets/textures come in Hotel-0c. Space color is by TYPE only, not by
// which specific hotel it's near (a space can touch 2 different hotels, so
// there's no single "this space's building height" to show here).
const SPACE_COLORS: Record<SpaceType, string> = {
  START: '#a0aec0',
  PURCHASE: '#68d391',
  CONSTRUCTION: '#f6ad55',
  FREE_STAIRCASE: '#63b3ed',
  FREE_BUILDING: '#b794f4',
};

/**
 * Which side of the (placeholder) loop each hotel's buildings sit on — per
 * the user's board reading: Royal, Fujiyama and L'Etoile are enclosed by the
 * track ("inside"), the other five just border it on one side ("outside").
 * Client-only rendering fact, not game state — see docs/hotel-0a-specifikacio.md §9.2.
 */
const HOTEL_SIDE: Record<string, 'inside' | 'outside'> = {
  royal: 'inside',
  fujiyama: 'inside',
  letoile: 'inside',
  waikiki: 'outside',
  boomerang: 'outside',
  tajmahal: 'outside',
  safari: 'outside',
  president: 'outside',
};

interface HotelSpaceData {
  type: SpaceType;
  hasStaircase: boolean;
  /**
   * A space can be adjacent to up to 2 different hotels (adjacentLotIds),
   * possibly on OPPOSITE sides of the loop (e.g. fujiyama+boomerang) — so
   * inside/outside building counts are tracked separately, each the max
   * among that side's adjacent lots (same "no single unambiguous mapping,
   * exact fidelity is Hotel-0c's job" reasoning as the space-type coloring).
   */
  insideBuildings: number;
  outsideBuildings: number;
}

interface HotelTokenData {
  color: string;
}

/** One stack of small boxes, offset from the space's center along `direction` — buildings sit BESIDE the space, not on top of it. */
function renderBuildingStack(count: number, direction: InwardDirection, keyPrefix: string): ReactNode {
  const [dx, dz] = direction;
  return Array.from({ length: count }, (_, buildingIndex) => (
    <mesh key={`${keyPrefix}-${buildingIndex}`} position={[dx * 0.75, 0.3 + 0.25 * (buildingIndex + 1), dz * 0.75]}>
      <boxGeometry args={[0.4, 0.4, 0.4]} />
      <meshStandardMaterial color="#744210" />
    </mesh>
  ));
}

function renderHotelSpace(data: HotelSpaceData, inward: InwardDirection): ReactNode {
  const outward: InwardDirection = [-inward[0], -inward[1]];
  return (
    <>
      <mesh position={[0, 0.15, 0]}>
        <boxGeometry args={[0.9, 0.3, 0.9]} />
        <meshStandardMaterial color={SPACE_COLORS[data.type]} />
      </mesh>
      {data.hasStaircase && (
        <mesh position={[0.3, 0.5, 0.3]}>
          <cylinderGeometry args={[0.08, 0.08, 0.4, 8]} />
          <meshStandardMaterial color="#8b5e3c" />
        </mesh>
      )}
      {renderBuildingStack(data.insideBuildings, inward, 'in')}
      {renderBuildingStack(data.outsideBuildings, outward, 'out')}
    </>
  );
}

const PERMIT_ROLL_LABELS: Record<BuildingPermitResult, string> = {
  GREEN: 'zöld — építhetsz',
  FREE: 'H — ingyen építhetsz',
  DOUBLE: '2 — dupla áron kell építened',
  RED: 'piros — nem építhetsz ebben a körben',
};

/** Each die's last value stays visible on its own until the next roll of THAT die (or the turn ends) — see docs/hotel-0a-specifikacio.md. */
function DiceRollsStatus({ state }: { state: HotelState }) {
  if (state.lastMoveRoll === null && state.lastNightsRoll === null && state.lastBuildingPermitRoll === null) {
    return null;
  }
  return (
    <p className={styles.diceRolls}>
      {state.lastMoveRoll !== null && <span>Kockadobás: {state.lastMoveRoll}</span>}
      {state.lastNightsRoll !== null && <span>Éjszakák: {state.lastNightsRoll}</span>}
      {state.lastBuildingPermitRoll !== null && (
        <span>Építési engedély: {PERMIT_ROLL_LABELS[state.lastBuildingPermitRoll]}</span>
      )}
    </p>
  );
}

function describeLot(state: HotelState, lot: HotelLot): string {
  const parts = [`${lot.buildingsBuilt}/${lot.buildingPrices.length} épület`];
  if (lot.hasGarden) parts.push('kert');
  if (state.board.some((space) => space.staircaseForLotId === lot.id)) parts.push('lépcső');
  return parts.join(', ');
}

/** The current player's own lots, so they can plan construction/staircase moves without hunting the board. */
function OwnedLotsPanel({ state }: { state: HotelState }) {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const lots = getOwnedLots(state, currentPlayer.id);
  if (lots.length === 0) return null;
  return (
    <div className={styles.ownedLots}>
      <h3>{currentPlayer.name} telkei</h3>
      <ul>
        {lots.map((lot) => (
          <li key={lot.id}>
            <span>{lot.name}</span>
            <span>{describeLot(state, lot)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderPlayerToken(data: HotelTokenData): ReactNode {
  return (
    <mesh>
      <coneGeometry args={[0.25, 0.6, 12]} />
      <meshStandardMaterial color={data.color} />
    </mesh>
  );
}

export interface HotelGamePageProps {
  /** Hot-seat only — ignored (a throwaway LocalGameTransport is still built but never used) once `transport` is provided. */
  playerNames?: string[];
  /** If omitted, a local LocalGameTransport is created for hot-seat mode — see docs/fazis-0b-multiplayer-specifikacio.md §6.2 and docs/hotel-0b-multiplayer-specifikacio.md. */
  transport?: GameTransport<HotelState, HotelAction>;
  /** Online mode only: which player slot the local client controls — gates PlayerActionWheel's interactivity. */
  myPlayer?: PlayerId;
}

/**
 * Hotel-0a local (hot-seat) vertical, generalized for Hotel-0b online play —
 * mirrors DamaGamePage's role: wires the shared reducer to a transport (local
 * or networked) and renders it, here via LoopTrackBoard3D + PlayerActionWheel
 * instead of GridBoard2D. See docs/hotel-0a-specifikacio.md, docs/hotel-0b-multiplayer-specifikacio.md.
 */
export function HotelGamePage({ playerNames, transport: providedTransport, myPlayer }: HotelGamePageProps) {
  const localTransport = useMemo(
    () => new LocalGameTransport<HotelState, HotelAction>(reducer, createInitialState(playerNames ?? [])),
    [playerNames],
  );
  const transport = providedTransport ?? localTransport;
  const [state, dispatch] = useGameTransport(transport);

  const spaces: LoopTrackSpace<HotelSpaceData>[] = useMemo(
    () =>
      state.board.map((space) => {
        let insideBuildings = 0;
        let outsideBuildings = 0;
        for (const lotId of space.adjacentLotIds) {
          const lot = state.lots.find((candidate) => candidate.id === lotId);
          if (!lot) continue;
          if (HOTEL_SIDE[lotId] === 'inside') insideBuildings = Math.max(insideBuildings, lot.buildingsBuilt);
          else outsideBuildings = Math.max(outsideBuildings, lot.buildingsBuilt);
        }
        return {
          id: space.id,
          data: { type: space.type, hasStaircase: space.staircaseForLotId !== null, insideBuildings, outsideBuildings },
        };
      }),
    [state.board, state.lots],
  );

  const tokens: LoopTrackToken<HotelTokenData>[] = state.players
    .map((player, index) => ({ player, color: PLAYER_COLORS[index % PLAYER_COLORS.length] }))
    // A bankrupt/forfeited player is out of the game — their token comes off the board entirely.
    .filter(({ player }) => !player.bankrupt)
    .map(({ player, color }) => ({
      // Before a player's first move they're at PARKING_POSITION (not a real
      // board index, see the "parkoló" note on Player.position) — approximate
      // it visually at Start (index 0) rather than crashing LoopTrackBoard3D's
      // position lookup. Pure display choice, doesn't touch real game state.
      spaceIndex: player.position === PARKING_POSITION ? 0 : player.position,
      token: { color },
    }));

  const winner = getWinner(state);
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (winner) {
    return (
      <div className={styles.page}>
        <h1>Vége a játéknak!</h1>
        <p>Győztes: {winner.name}</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.canvasWrapper}>
        <LoopTrackBoard3D
          spaces={spaces}
          renderSpace={renderHotelSpace}
          tokens={tokens}
          renderToken={renderPlayerToken}
        />
        <OwnedLotsPanel state={state} />
        <GameLogPanel state={state} />
        <PlayerActionWheel state={state} dispatch={dispatch} interactive={!myPlayer || myPlayer === currentPlayer.id} />
      </div>
      {myPlayer && <p className={styles.status}>Te vagy: {state.players.find((p) => p.id === myPlayer)?.name}</p>}
      <p className={styles.status}>
        <span>Soron van: {currentPlayer.name}</span>
        <span
          className={styles.colorSwatch}
          style={{ backgroundColor: PLAYER_COLORS[state.currentPlayerIndex % PLAYER_COLORS.length] }}
        />
        <span>
          ({PLAYER_COLOR_NAMES[state.currentPlayerIndex % PLAYER_COLOR_NAMES.length]} bábu) — készpénz:{' '}
          {currentPlayer.cash}
        </span>
      </p>
      <DiceRollsStatus state={state} />
    </div>
  );
}

export default HotelGamePage;
