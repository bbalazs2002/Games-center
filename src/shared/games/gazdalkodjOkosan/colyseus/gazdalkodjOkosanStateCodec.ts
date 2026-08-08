import { ArraySchema } from '@colyseus/schema';
import { replaceStringArray } from '../../../core/colyseusSyncHelpers';
import { BOARD_SPACES } from '../engine/boardConfig';
import { CHANCE_CARDS } from '../engine/chanceCards';
import { ALL_FURNITURE_ITEMS } from '../engine/furnitureCatalog';
import type { ChanceCard, FurnitureItemId, GazdalkodjOkosanState, LogEntry, OwnershipStatus, Player, TurnPhase } from '../engine/state';
import { GazdalkodjOkosanPlayerSchema, GazdalkodjOkosanStateSchema } from './GazdalkodjOkosanStateSchema';

const FURNITURE_SCHEMA_KEY: Record<FurnitureItemId, keyof GazdalkodjOkosanPlayerSchema> = {
  konyhabutor: 'furnitureKonyhabutor',
  mosogep: 'furnitureMosogep',
  hutoszekreny: 'furnitureHutoszekreny',
  mosogatogep: 'furnitureMosogatogep',
  tuzhely: 'furnitureTuzhely',
  szobabutor: 'furnitureSzobabutor',
};

function syncOwnership(
  schema: GazdalkodjOkosanPlayerSchema,
  prefix: 'apartment' | 'car',
  status: OwnershipStatus,
): void {
  const statusKey = `${prefix}Status` as const;
  const pricePaidKey = `${prefix}PricePaid` as const;
  const totalPriceKey = `${prefix}TotalPrice` as const;
  const remainingBalanceKey = `${prefix}RemainingBalance` as const;
  const perTurnPaymentKey = `${prefix}PerTurnPayment` as const;

  schema[statusKey] = status.kind;
  schema[pricePaidKey] = status.kind === 'OWNED_CASH' ? status.pricePaid : undefined;
  schema[totalPriceKey] = status.kind === 'FINANCED' ? status.plan.totalPrice : undefined;
  schema[remainingBalanceKey] = status.kind === 'FINANCED' ? status.plan.remainingBalance : undefined;
  schema[perTurnPaymentKey] = status.kind === 'FINANCED' ? status.plan.perTurnPayment : undefined;
}

function decodeOwnership(schema: GazdalkodjOkosanPlayerSchema, prefix: 'apartment' | 'car'): OwnershipStatus {
  const status = schema[`${prefix}Status` as const];
  if (status === 'OWNED_CASH') return { kind: 'OWNED_CASH', pricePaid: schema[`${prefix}PricePaid` as const] ?? 0 };
  if (status === 'FINANCED') {
    return {
      kind: 'FINANCED',
      plan: {
        totalPrice: schema[`${prefix}TotalPrice` as const] ?? 0,
        remainingBalance: schema[`${prefix}RemainingBalance` as const] ?? 0,
        perTurnPayment: schema[`${prefix}PerTurnPayment` as const] ?? 0,
      },
    };
  }
  return { kind: 'NONE' };
}

/** Includes `name` on every sync, unlike the id-like fields — a player's name genuinely changes once (placeholder -> real) via GameRoom.onPlayerAdmitted, well after schema creation (see the Hotel-0b §9.1 lesson this deliberately avoids repeating). */
function syncPlayerFields(schema: GazdalkodjOkosanPlayerSchema, player: Player): void {
  schema.name = player.name;
  schema.cash = player.cash;
  schema.bankAccountBalance = player.bankAccount?.balance ?? undefined;
  schema.hasBkvPass = player.hasBkvPass;
  schema.position = player.position;
  syncOwnership(schema, 'apartment', player.apartment);
  syncOwnership(schema, 'car', player.car);
  for (const item of ALL_FURNITURE_ITEMS) {
    schema[FURNITURE_SCHEMA_KEY[item]] = player.furniture[item] as never;
  }
  schema.insuranceLife = player.insurance.life;
  schema.insuranceHome = player.insurance.home;
  schema.insuranceCar = player.insurance.car;
  schema.inHospital = player.inHospital;
  schema.hospitalRollAttempts = player.hospitalRollAttempts;
  schema.skipNextRoll = player.skipNextRoll;
  schema.extraRollsPending = player.extraRollsPending;
  schema.bankrupt = player.bankrupt;
}

function syncPlayers(schema: GazdalkodjOkosanStateSchema, players: Player[]): void {
  if (!schema.players) {
    schema.players = new ArraySchema(
      ...players.map((player) => {
        const playerSchema = new GazdalkodjOkosanPlayerSchema();
        playerSchema.id = player.id;
        syncPlayerFields(playerSchema, player);
        return playerSchema;
      }),
    );
    return;
  }
  players.forEach((player, i) => syncPlayerFields(schema.players[i], player));
}

/** Push-only — never cleared, so only newly-added entries are ever sent over the wire (the Hotel-0b fix for the unbounded-log-resend problem). */
function syncLog(schema: GazdalkodjOkosanStateSchema, log: LogEntry[]): void {
  if (!schema.log) schema.log = new ArraySchema<string>();
  while (schema.log.length < log.length) {
    schema.log.push(JSON.stringify(log[schema.log.length]));
  }
}

/**
 * Writes `state` into `schema`, in place. Server-side only (called from
 * GazdalkodjOkosanRoom.syncState()) — see docs/gazdalkodj-okosan-0b-multiplayer-specifikacio.md §3-4.
 */
export function applyGazdalkodjOkosanStateToSchema(schema: GazdalkodjOkosanStateSchema, state: GazdalkodjOkosanState): void {
  syncPlayers(schema, state.players);
  schema.currentPlayerIndex = state.currentPlayerIndex;
  schema.turnPhase = state.turnPhase;
  if (!schema.pendingMandatoryInstallments) schema.pendingMandatoryInstallments = new ArraySchema<string>();
  replaceStringArray(schema.pendingMandatoryInstallments, state.pendingMandatoryInstallments);
  schema.lastDiceRoll = state.lastDiceRoll ?? undefined;
  schema.status = state.status;
  schema.winnerId = state.winnerId ?? undefined;
  syncLog(schema, state.log);
  if (!schema.chanceDeckOrder) schema.chanceDeckOrder = new ArraySchema<string>();
  replaceStringArray(
    schema.chanceDeckOrder,
    state.chanceDeck.map((card) => card.id),
  );
}

function staticChanceCard(id: string): ChanceCard {
  const card = CHANCE_CARDS.find((candidate) => candidate.id === id);
  if (!card) throw new Error(`Unknown chance card: ${id}`);
  return card;
}

function decodePlayer(schema: GazdalkodjOkosanPlayerSchema): Player {
  return {
    id: schema.id,
    name: schema.name,
    cash: schema.cash,
    bankAccount: schema.bankAccountBalance === undefined ? null : { balance: schema.bankAccountBalance },
    hasBkvPass: schema.hasBkvPass,
    position: schema.position,
    apartment: decodeOwnership(schema, 'apartment'),
    car: decodeOwnership(schema, 'car'),
    furniture: Object.fromEntries(
      ALL_FURNITURE_ITEMS.map((item) => [item, Boolean(schema[FURNITURE_SCHEMA_KEY[item]])]),
    ) as Record<FurnitureItemId, boolean>,
    insurance: { life: schema.insuranceLife, home: schema.insuranceHome, car: schema.insuranceCar },
    inHospital: schema.inHospital,
    hospitalRollAttempts: schema.hospitalRollAttempts,
    skipNextRoll: schema.skipNextRoll,
    extraRollsPending: schema.extraRollsPending,
    bankrupt: schema.bankrupt,
  };
}

/**
 * Rebuilds a plain GazdalkodjOkosanState from the wire schema, client-side —
 * the inverse of applyGazdalkodjOkosanStateToSchema, re-merging the synced
 * mutable fields with the static board/chance-card data both sides already
 * share via boardConfig.ts/chanceCards.ts. Used as the `decode` function
 * ColyseusGameTransport calls on every state change.
 */
export function decodeGazdalkodjOkosanStateSchema(schema: GazdalkodjOkosanStateSchema): GazdalkodjOkosanState {
  return {
    board: BOARD_SPACES,
    chanceDeck: [...schema.chanceDeckOrder].map(staticChanceCard),
    players: [...schema.players].map(decodePlayer),
    currentPlayerIndex: schema.currentPlayerIndex,
    turnPhase: schema.turnPhase as TurnPhase,
    pendingMandatoryInstallments: [...schema.pendingMandatoryInstallments] as ('car' | 'apartment')[],
    lastDiceRoll: schema.lastDiceRoll ?? null,
    status: schema.status as GazdalkodjOkosanState['status'],
    winnerId: schema.winnerId ?? null,
    log: schema.log.map((entry) => JSON.parse(entry) as LogEntry),
  };
}
