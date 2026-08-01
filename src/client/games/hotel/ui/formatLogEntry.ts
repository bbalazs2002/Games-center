import { getLot, getPlayer } from '../../../../shared/games/hotel/engine/rules';
import type {
  BuildingPermitResult,
  ConstructionPlanItem,
  HotelState,
  LogEntry,
  SpaceType,
} from '../../../../shared/games/hotel/engine/state';

const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  START: 'Start',
  PURCHASE: 'Vásárlás',
  CONSTRUCTION: 'Építkezés',
  FREE_STAIRCASE: 'Ingyen lépcső',
  FREE_BUILDING: 'Ingyen épület',
};

const PERMIT_RESULT_LABELS: Record<BuildingPermitResult, string> = {
  GREEN: 'zöld',
  FREE: 'H (ingyen)',
  DOUBLE: '2 (dupla ár)',
  RED: 'piros',
};

function playerName(state: HotelState, playerId: string): string {
  return getPlayer(state, playerId).name;
}

function lotName(state: HotelState, lotId: string): string {
  return getLot(state, lotId).name;
}

function describeConstructionPlan(state: HotelState, plan: ConstructionPlanItem[]): string {
  return plan
    .map((item) => {
      const parts: string[] = [];
      if (item.buildingCount > 0) parts.push(`+${item.buildingCount} épület`);
      if (item.buildGarden) parts.push('kert');
      return `${lotName(state, item.lotId)} (${parts.join(', ')})`;
    })
    .join(', ');
}

function formatConstructionPermit(
  entry: Extract<LogEntry, { type: 'CONSTRUCTION_PERMIT_ROLLED' }>,
  state: HotelState,
): string {
  const name = playerName(state, entry.playerId);
  const resultLabel = PERMIT_RESULT_LABELS[entry.result];
  if (entry.result === 'RED') return `${name}: építési engedély — ${resultLabel}, nem építhetett ebben a körben`;
  const planLabel = describeConstructionPlan(state, entry.plan);
  const costLabel = entry.result === 'FREE' ? 'ingyen' : `${entry.totalCost}`;
  return `${name}: építési engedély — ${resultLabel}, épített: ${planLabel} (${costLabel})`;
}

function formatNightsStay(entry: Extract<LogEntry, { type: 'NIGHTS_STAY' }>, state: HotelState): string {
  const name = playerName(state, entry.playerId);
  const lot = lotName(state, entry.lotId);
  if (entry.toPlayerId === null) return `${name}: ${entry.nights} éjszakát töltött a saját szállodájában (${lot})`;
  return `${name}: ${entry.nights} éjszakát töltött itt: ${lot} — bérleti díj ${entry.rentAmount}, ${playerName(state, entry.toPlayerId)}-nek`;
}

function formatFreeStaircase(entry: Extract<LogEntry, { type: 'FREE_STAIRCASE_GRANTED' }>, state: HotelState): string {
  const name = playerName(state, entry.playerId);
  if (entry.lotId) return `${name}: ingyen lépcsőt kapott itt: ${lotName(state, entry.lotId)}`;
  return `${name}: ingyen lépcső helyett ${entry.payoutReceived} készpénzt kapott a banktól`;
}

function formatFreeBuilding(entry: Extract<LogEntry, { type: 'FREE_BUILDING_GRANTED' }>, state: HotelState): string {
  const name = playerName(state, entry.playerId);
  if (entry.lotId) return `${name}: ingyen épített/kertesített itt: ${lotName(state, entry.lotId)}`;
  if (entry.payoutReceived > 0) return `${name}: ingyen épület helyett ${entry.payoutReceived} készpénzt kapott a banktól`;
  return `${name}: ingyen épület mezőre lépett, de nincs telke`;
}

function formatAuctionResolved(entry: Extract<LogEntry, { type: 'AUCTION_RESOLVED' }>, state: HotelState): string {
  const lot = lotName(state, entry.lotId);
  if (entry.winnerId) return `Árverés vége — ${lot}: ${playerName(state, entry.winnerId)} nyerte, ${entry.amount}-ért`;
  return `Árverés vége — ${lot}: a bank vásárolta vissza ${entry.amount}-ért`;
}

function formatMovementEvent(entry: LogEntry, state: HotelState): string | undefined {
  switch (entry.type) {
    case 'MOVED': {
      const space = state.board[entry.toPosition];
      return `${playerName(state, entry.playerId)}: dobott ${entry.roll}-et, ${SPACE_TYPE_LABELS[space.type]} mezőre lépett`;
    }
    case 'BONUS_2000':
      return `${playerName(state, entry.playerId)}: átlépte a bónusz sávot, +2000-t kapott a banktól`;
    case 'STAIRCASE_RIGHT_ACTIVATED':
      return `${playerName(state, entry.playerId)}: átlépte a lépcső-vásárlási jog sávot`;
    default:
      return undefined;
  }
}

function formatPropertyEvent(entry: LogEntry, state: HotelState): string | undefined {
  switch (entry.type) {
    case 'LOT_BOUGHT':
      return `${playerName(state, entry.playerId)}: megvásárolta a(z) ${lotName(state, entry.lotId)} telket ${entry.price}-ért`;
    case 'CONSTRUCTION_PERMIT_ROLLED':
      return formatConstructionPermit(entry, state);
    case 'GARDEN_BUILT_WITHOUT_PERMIT':
      return `${playerName(state, entry.playerId)}: kertet épített dobás nélkül — ${describeConstructionPlan(state, entry.plan)} (${entry.totalCost})`;
    case 'NIGHTS_STAY':
      return formatNightsStay(entry, state);
    case 'FREE_STAIRCASE_GRANTED':
      return formatFreeStaircase(entry, state);
    case 'FREE_BUILDING_GRANTED':
      return formatFreeBuilding(entry, state);
    case 'STAIRCASE_RIGHT_BOUGHT':
      return `${playerName(state, entry.playerId)}: lépcsőjogot vásárolt itt: ${lotName(state, entry.lotId)} (${entry.price})`;
    default:
      return undefined;
  }
}

function formatAuctionEvent(entry: LogEntry, state: HotelState): string | undefined {
  switch (entry.type) {
    case 'AUCTION_STARTED':
      return `${playerName(state, entry.playerId)}: árverésre bocsátotta: ${lotName(state, entry.lotId)} (nyitó: ${entry.openingBid})`;
    case 'BID_PLACED':
      return `${playerName(state, entry.playerId)}: licitált ${entry.amount}-t erre: ${lotName(state, entry.lotId)}`;
    case 'BID_PASSED':
      return `${playerName(state, entry.playerId)}: passzolt (${lotName(state, entry.lotId)})`;
    case 'AUCTION_RESOLVED':
      return formatAuctionResolved(entry, state);
    default:
      return undefined;
  }
}

function formatMetaEvent(entry: LogEntry, state: HotelState): string | undefined {
  switch (entry.type) {
    case 'FORFEITED':
      return entry.reason === 'INSOLVENT'
        ? `${playerName(state, entry.playerId)}: csődbe ment (nem tudta fizetni az adósságát, és nem volt mit elárvereznie)`
        : `${playerName(state, entry.playerId)}: feladta a játékot`;
    case 'GAME_WON':
      return `${playerName(state, entry.playerId)} megnyerte a játékot!`;
    default:
      return undefined;
  }
}

/** Turns one structured LogEntry into a Hungarian sentence for the game-log panel — see docs/hotel-0a-specifikacio.md §9.2. */
export function formatLogEntry(entry: LogEntry, state: HotelState): string {
  return (
    formatMovementEvent(entry, state) ??
    formatPropertyEvent(entry, state) ??
    formatAuctionEvent(entry, state) ??
    formatMetaEvent(entry, state) ??
    ''
  );
}
