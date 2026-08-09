import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Quaternion, Vector3 } from 'three';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { cloneWithTint } from '../../../renderers/models/materialTint';
import { useGLTFScene } from '../../../renderers/models/useGLTFScene';
import { LoopTrackBoard3D, type LoopTrackSpace, type LoopTrackToken } from '../../../renderers/loop-track-3d/LoopTrackBoard3D';
import { Button } from '../../../ui-kit/Button';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { Modal } from '../../../ui-kit/Modal';
import { useReportFeedbackContext } from '../../../ui-kit/useFeedbackContext';
import { useGameTheme } from '../../../shell/useGameTheme';
import type { GazdalkodjOkosanAction } from '@shared/games/gazdalkodjOkosan/engine/actions';
import { FURNITURE_CATALOG, ALL_FURNITURE_ITEMS } from '@shared/games/gazdalkodjOkosan/engine/furnitureCatalog';
import { createInitialState } from '@shared/games/gazdalkodjOkosan/engine/initialState';
import { reducer } from '@shared/games/gazdalkodjOkosan/engine/reducer';
import { getValidActions, getWinner } from '@shared/games/gazdalkodjOkosan/engine/selectors';
import { canCancelPayment, totalWealth } from '@shared/games/gazdalkodjOkosan/engine/rules';
import type { GazdalkodjOkosanState, LogEntry, OwnershipStatus, Player, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import { CHANCE_CARDS } from '@shared/games/gazdalkodjOkosan/engine/chanceCards';
import { GazdalkodjOkosanBoardBackground } from './gazdalkodjOkosanBoardLayout';
import {
  GAZDALKODJ_PAWN_SCALE,
  GAZDALKODJ_SPACE_POSITIONS_BY_SLOT,
  GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT,
} from './gazdalkodjOkosanBoardLayout.generated';
import {
  GAZDALKODJ_CAR_IMAGE,
  GAZDALKODJ_HOUSE_FURNITURE_IMAGE,
  GAZDALKODJ_PAWN_OBJECT_NAME,
  GAZDALKODJ_PAWN_URL,
  GAZDALKODJ_PLAYER_COLORS,
  gazdalkodjHouseImageUrl,
} from './gazdalkodjOkosanAssets';
import { OwnershipPanel } from './OwnershipPanel';
import { BankAccountPanel } from './BankAccountPanel';
import { CashReadout } from './CashReadout';
import { describePaymentReason, FURNITURE_LABELS, INSURANCE_LABELS } from './formatLogEntry';
import { GazdalkodjOkosanGameLogPanel } from './GazdalkodjOkosanGameLogPanel';
import { GazdalkodjOkosanDiceHUD } from './GazdalkodjOkosanDiceHUD';
import modalTheme from './gazdalkodjOkosanModalTheme.module.css';
import styles from './GazdalkodjOkosanGamePage.module.css';

function ownershipLabel(status: OwnershipStatus): string {
  if (status.kind === 'NONE') return 'Nincs';
  if (status.kind === 'OWNED_CASH') return 'Kifizetve';
  return `Hitelre — hátralék: ${status.plan.remainingBalance.toLocaleString('hu-HU')} EUR`;
}

function toVector3([x, y, z]: readonly [number, number, number]): Vector3 {
  return new Vector3(x, y, z);
}

function toQuaternion([x, y, z, w]: readonly [number, number, number, number]): Quaternion {
  return new Quaternion(x, y, z, w);
}

/** Board-level anchors for the 42 spaces themselves — slot 0's lane, since every space's own position (as opposed to a token standing on it) only needs one representative point. */
const BOARD_SPACE_POSITIONS = GAZDALKODJ_SPACE_POSITIONS_BY_SLOT[0].map(toVector3);
const BOARD_SPACE_ROTATIONS = GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT[0].map(toQuaternion);

/** Per-player-slot lanes (see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md §5) — computed once, not per-render, since the underlying generated data never changes. */
const TOKEN_POSITIONS_BY_SLOT = GAZDALKODJ_SPACE_POSITIONS_BY_SLOT.map((spaces) => spaces.map(toVector3));
const TOKEN_ROTATIONS_BY_SLOT = GAZDALKODJ_SPACE_ROTATIONS_BY_SLOT.map((spaces) => spaces.map(toQuaternion));

function GazdalkodjOkosanPlaceholderToken({ color }: { color: string }) {
  return (
    <mesh>
      <coneGeometry args={[0.12, 0.3, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * The one real pawn shape (all 6 raw "figure-N-00" meshes were confirmed
 * geometrically identical — see docs/gazdalkodj-okosan-0c-vizual-specifikacio.md
 * §5), tinted per player. Position/rotation are zeroed on the clone —
 * LoopTrackBoard3D's AnimatedToken already supplies the ABSOLUTE placement
 * via this token's own `positions`/`rotations` lane (see
 * buildGazdalkodjOkosanTokens below), exactly mirroring Hotel's
 * HotelCarToken; re-applying the node's own baked translation here would
 * double up with that. Scale IS kept (the node's own baked 0.02, made
 * explicit rather than relying on cloneWithTint to have preserved it).
 */
function GazdalkodjOkosanPawnToken({ color }: { color: string }) {
  const scene = useGLTFScene(GAZDALKODJ_PAWN_URL);
  const tinted = useMemo(() => {
    const source = scene?.getObjectByName(GAZDALKODJ_PAWN_OBJECT_NAME);
    if (!source) return null;
    const clone = cloneWithTint(source, color);
    clone.position.set(0, 0, 0);
    clone.quaternion.identity();
    clone.scale.setScalar(GAZDALKODJ_PAWN_SCALE);
    return clone;
  }, [scene, color]);

  if (!tinted) return <GazdalkodjOkosanPlaceholderToken color={color} />;
  // dispose={null}: `tinted` shares geometry/texture with the cached
  // useGLTFScene scene graph — see materialTint.ts's own doc comment on why
  // auto-dispose-on-unmount would break every other consumer.
  return <primitive object={tinted} dispose={null} />;
}

interface GazdalkodjOkosanTokenData {
  color: string;
}

/** The most recent MOVED entry FOR this player, if any — used to decide whether their token's next hop should be an instant jump (Szerencsekártya-driven) or the usual dice-driven step-by-step walk. */
function lastMoveSourceFor(log: LogEntry[], playerId: PlayerId): 'DICE' | 'CHANCE_CARD' | null {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const entry = log[i];
    if (entry.type === 'MOVED' && entry.playerId === playerId) return entry.source;
  }
  return null;
}

/** One token per non-bankrupt player, each carrying its own fixed per-slot position/rotation lane — never LoopTrackBoard3D's procedural tokenSpreadRadius (see §5 of the spec doc / feedback_loop_track_baked_positions in project memory). `instantTransition` skips the hop-by-hop walk for Szerencsekártya-driven jumps (docs/gazdalkodj-okosan-0c-vizual-specifikacio.md UX-kiegészítés §3) — dice-driven moves keep the normal animated walk. */
function buildGazdalkodjOkosanTokens(players: Player[], log: LogEntry[]): LoopTrackToken<GazdalkodjOkosanTokenData>[] {
  return players
    .map((player, slot) => ({ player, slot }))
    .filter(({ player }) => !player.bankrupt)
    .map(({ player, slot }) => ({
      id: player.id,
      spaceIndex: player.position,
      token: { color: GAZDALKODJ_PLAYER_COLORS[slot % GAZDALKODJ_PLAYER_COLORS.length] },
      positions: TOKEN_POSITIONS_BY_SLOT[slot % TOKEN_POSITIONS_BY_SLOT.length],
      rotations: TOKEN_ROTATIONS_BY_SLOT[slot % TOKEN_ROTATIONS_BY_SLOT.length],
      instantTransition: lastMoveSourceFor(log, player.id) === 'CHANCE_CARD',
    }));
}

/** The board texture already shows every space's real text/graphics — no separate per-space geometry needed (mirrors Hotel's own no-op renderHotelSpace). */
function renderGazdalkodjOkosanSpace(): null {
  return null;
}

function GazdalkodjOkosanBoard({ state }: { state: GazdalkodjOkosanState }) {
  const spaces: LoopTrackSpace<null>[] = useMemo(() => state.board.map((space) => ({ id: String(space.index), data: null })), [state.board]);
  const tokens = useMemo(() => buildGazdalkodjOkosanTokens(state.players, state.log), [state.players, state.log]);

  return (
    <LoopTrackBoard3D
      spaces={spaces}
      renderSpace={renderGazdalkodjOkosanSpace}
      tokens={tokens}
      renderToken={(data) => <GazdalkodjOkosanPawnToken color={data.color} />}
      positions={BOARD_SPACE_POSITIONS}
      rotations={BOARD_SPACE_ROTATIONS}
      // The library's default camera framing assumes a board roughly
      // 12x12 units (computeLoopPositions' own default); our real board is
      // only 5x3.6 (see GAZDALKODJ_BOARD_WIDTH/DEPTH) — sceneScale only
      // moves the camera/OrbitControls limits, never the (absolute, real)
      // position data itself, so this brings the camera in close enough to
      // actually fill the frame instead of leaving the board a tiny speck
      // in the middle of the canvas (confirmed live, tuned by eye).
      sceneScale={0.45}
      tokenHeightOffset={0.02}
      background={<GazdalkodjOkosanBoardBackground />}
    />
  );
}

/** Current (soron lévő) player's apartment/car/furniture — top-left overlay, mirrors Hotel's always-visible OwnedLotsPanel. */
function CurrentPlayerOwnershipPanel({ player }: { player: Player }) {
  const hasAnything = player.apartment.kind !== 'NONE' || player.car.kind !== 'NONE';
  return (
    <div className={styles.ownedPanel}>
      <h3>Sajátjaid</h3>
      {hasAnything ? (
        <OwnershipPanel apartment={player.apartment} car={player.car} furniture={player.furniture} />
      ) : (
        <p className={styles.ownedEmpty}>Még nincs lakásod vagy autód.</p>
      )}
    </div>
  );
}

type Dispatch = (action: GazdalkodjOkosanAction) => void;
type ValidActions = ReturnType<typeof getValidActions>;

function PurchaseThumb({ imageName }: { imageName: string }) {
  return <img src={gazdalkodjHouseImageUrl(imageName)} alt="" className={styles.buttonThumb} />;
}

function PurchaseButtons({ valid, dispatch }: { valid: ValidActions; dispatch: Dispatch }) {
  return (
    <>
      {valid.canBuyApartment.cash && <Button onClick={() => dispatch({ type: 'BUY_APARTMENT', financed: false })}>Lakás vásárlása (készpénz)</Button>}
      {valid.canBuyApartment.financed && <Button onClick={() => dispatch({ type: 'BUY_APARTMENT', financed: true })}>Lakás vásárlása (hitelre)</Button>}
      {valid.canBuyCar.cash && (
        <Button onClick={() => dispatch({ type: 'BUY_CAR', financed: false })}>
          <PurchaseThumb imageName={GAZDALKODJ_CAR_IMAGE} />
          Autó vásárlása (készpénz)
        </Button>
      )}
      {valid.canBuyCar.financed && (
        <Button onClick={() => dispatch({ type: 'BUY_CAR', financed: true })}>
          <PurchaseThumb imageName={GAZDALKODJ_CAR_IMAGE} />
          Autó vásárlása (hitelre)
        </Button>
      )}
      {valid.buyableFurniture.map((item) => (
        <Button key={item} onClick={() => dispatch({ type: 'BUY_FURNITURE', item })}>
          <PurchaseThumb imageName={GAZDALKODJ_HOUSE_FURNITURE_IMAGE[item]} />
          {FURNITURE_LABELS[item]} vásárlása ({FURNITURE_CATALOG[item].price.toLocaleString('hu-HU')} EUR)
        </Button>
      ))}
      {valid.buyableInsurancePolicies.map((policy) => (
        <Button key={policy} onClick={() => dispatch({ type: 'BUY_INSURANCE', policy })}>
          {INSURANCE_LABELS[policy]} megkötése
        </Button>
      ))}
      {valid.canBuyBkvPass && <Button onClick={() => dispatch({ type: 'BUY_BKV_PASS' })}>BKV-bérlet vásárlása</Button>}
      {valid.canDrawChanceCard && <Button onClick={() => dispatch({ type: 'DRAW_CHANCE_CARD' })}>Szerencsekártya húzása</Button>}
    </>
  );
}

/**
 * Ha van esedékes extra dobás (pl. Club Tihany kártya), a "Kör vége" gomb
 * ténylegesen NEM zárja le a kört — a reducer (finishTurn) ilyenkor a soron
 * lévő játékosnál marad és AWAITING_ROLL-ra vált. Emiatt ehelyett közvetlenül
 * "Dobás" néven, egy kattintással END_TURN + ROLL_MOVE_DICE-ot is elindítunk
 * — a játékosnak nem kell egy köztes, félrevezető "Kör vége" gombra
 * kattintania ahhoz, hogy újra dobhasson. A LocalGameTransport.dispatch
 * szinkron (azonnal frissíti a state-et mielőtt visszatér), így a második
 * dispatch már a friss (AWAITING_ROLL) state-en fut — lásd LocalGameTransport.ts.
 */
function EndTurnOrExtraRollButton({ dispatch, extraRollsPending }: { dispatch: Dispatch; extraRollsPending: number }) {
  if (extraRollsPending > 0) {
    return (
      <Button
        onClick={() => {
          dispatch({ type: 'END_TURN' });
          dispatch({ type: 'ROLL_MOVE_DICE', value: Math.floor(Math.random() * 6) + 1 });
        }}
      >
        Dobás (extra kör)
      </Button>
    );
  }
  return (
    <Button variant="secondary" onClick={() => dispatch({ type: 'END_TURN' })}>
      Kör vége
    </Button>
  );
}

function BankAndTurnButtons({ valid, dispatch, extraRollsPending }: { valid: ValidActions; dispatch: Dispatch; extraRollsPending: number }) {
  const [depositAmount, setDepositAmount] = useState(1000);
  const [withdrawAmount, setWithdrawAmount] = useState(1000);
  return (
    <>
      {valid.canOpenBankAccount && <Button onClick={() => dispatch({ type: 'OPEN_BANK_ACCOUNT' })}>Folyószámla nyitása</Button>}
      {valid.canDeposit && (
        <div className={styles.moneyRow}>
          <input type="number" min={1} value={depositAmount} onChange={(e) => setDepositAmount(Number(e.target.value))} />
          <Button onClick={() => dispatch({ type: 'DEPOSIT_TO_ACCOUNT', amount: depositAmount })}>Befizetés</Button>
        </div>
      )}
      {valid.canWithdraw && (
        <div className={styles.moneyRow}>
          <input type="number" min={1} value={withdrawAmount} onChange={(e) => setWithdrawAmount(Number(e.target.value))} />
          <Button onClick={() => dispatch({ type: 'WITHDRAW_FROM_ACCOUNT', amount: withdrawAmount })}>Kivétel</Button>
        </div>
      )}
      {valid.canEndTurn && <EndTurnOrExtraRollButton dispatch={dispatch} extraRollsPending={extraRollsPending} />}
    </>
  );
}

function InstallmentButtons({ state, dispatch }: { state: GazdalkodjOkosanState; dispatch: Dispatch }) {
  return (
    <div className={styles.actionGroup}>
      <p>Kötelező törlesztés esedékes!</p>
      {state.pendingMandatoryInstallments.includes('car') && (
        <Button onClick={() => dispatch({ type: 'PAY_CAR_INSTALLMENT' })}>Autóhitel törlesztése</Button>
      )}
      {state.pendingMandatoryInstallments.includes('apartment') && (
        <Button onClick={() => dispatch({ type: 'PAY_APARTMENT_INSTALLMENT' })}>Lakáshitel törlesztése</Button>
      )}
    </div>
  );
}

function ActionPanel({ state, dispatch }: { state: GazdalkodjOkosanState; dispatch: Dispatch }) {
  const player = state.players[state.currentPlayerIndex];

  if (state.turnPhase === 'AWAITING_ROLL') {
    return (
      <Button onClick={() => dispatch({ type: 'ROLL_MOVE_DICE', value: Math.floor(Math.random() * 6) + 1 })}>
        Dobás {player.skipNextRoll ? '(kimarad)' : ''}
      </Button>
    );
  }

  if (state.turnPhase === 'AWAITING_MANDATORY_INSTALLMENT') {
    return <InstallmentButtons state={state} dispatch={dispatch} />;
  }

  const valid = getValidActions(state);
  return (
    <div className={styles.actionGroup}>
      <PurchaseButtons valid={valid} dispatch={dispatch} />
      <BankAndTurnButtons valid={valid} dispatch={dispatch} extraRollsPending={player.extraRollsPending} />
    </div>
  );
}

/** Top-right floating action panel (wheel-free — this game has far fewer action types than Hotel) — open by default, since rolling is needed every single turn, unlike the log. */
function FloatingActionPanel({ state, dispatch }: { state: GazdalkodjOkosanState; dispatch: Dispatch }) {
  const [open, setOpen] = useState(true);
  const player = state.players[state.currentPlayerIndex];

  if (!open) {
    return (
      <button className={styles.collapsedActionButton} onClick={() => setOpen(true)}>
        Akciók
      </button>
    );
  }

  return (
    <div className={styles.actionPanelFloating}>
      <div className={styles.actionPanelHeader}>
        <span>{player.name} köre</span>
        <button onClick={() => setOpen(false)} aria-label="Összecsukás">
          ×
        </button>
      </div>
      <div className={styles.actionPanelBody}>
        <GazdalkodjOkosanDiceHUD state={state} />
        <ActionPanel state={state} dispatch={dispatch} />
      </div>
    </div>
  );
}

/** Bottom-center "whose turn / how much cash" pill — mirrors Hotel's StatusChip (minus the AI-thinking text, no AI opponent in this game yet). Shows cash AND (if open) the folyószámla balance side by side — the user explicitly asked for both, not just the total. */
function StatusChip({ state }: { state: GazdalkodjOkosanState }) {
  const player = state.players[state.currentPlayerIndex];
  const colorIndex = state.currentPlayerIndex % GAZDALKODJ_PLAYER_COLORS.length;
  return (
    <div className={styles.statusChip}>
      <span className={styles.colorSwatch} style={{ backgroundColor: GAZDALKODJ_PLAYER_COLORS[colorIndex] }} />
      <span className={styles.statusName}>{player.name} köre</span>
      <CashReadout amount={player.cash} playerId={player.id} log={state.log} />
      {player.bankAccount && <span className={styles.bankBalance}>Folyószámla: {player.bankAccount.balance.toLocaleString('hu-HU')} EUR</span>}
    </div>
  );
}

/** Bottom-right always-visible player list (name/color/cash only) — click any row to open PlayerInfoModal with full detail. Mirrors Hotel's PlayerRoster. */
function PlayerRoster({ state, onInspect }: { state: GazdalkodjOkosanState; onInspect: (playerId: PlayerId) => void }) {
  return (
    <div className={styles.roster}>
      {state.players.map((player, index) => (
        <button
          key={player.id}
          className={[styles.rosterRow, player.bankrupt && styles.rosterRowBankrupt].filter(Boolean).join(' ')}
          onClick={() => onInspect(player.id)}
          disabled={player.bankrupt}
        >
          <span className={styles.colorSwatch} style={{ backgroundColor: GAZDALKODJ_PLAYER_COLORS[index % GAZDALKODJ_PLAYER_COLORS.length] }} />
          <span className={styles.rosterName}>{player.name}</span>
          <span className={styles.rosterCash}>{player.bankrupt ? 'csődben' : totalWealth(player).toLocaleString('hu-HU')}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Full detail for any player, opened from PlayerRoster. Rendered as a JSX
 * SIBLING of `.roster` (never nested inside it) — that panel has
 * backdrop-filter, which per the CSS spec becomes a containing block for
 * `position: fixed` descendants, so a Modal nested inside it would get
 * squeezed into the panel's own bounds instead of centered over the whole
 * page (the exact pitfall documented in ui-kit/Modal.tsx and
 * docs/hotel-0c-specifikacio.md §5.4).
 */
function PlayerInfoModal({
  state,
  playerId,
  onClose,
}: {
  state: GazdalkodjOkosanState;
  playerId: PlayerId | null;
  onClose: () => void;
}) {
  const playerIndex = playerId ? state.players.findIndex((p) => p.id === playerId) : -1;
  const player = playerIndex >= 0 ? state.players[playerIndex] : undefined;
  const furnitureCount = player ? ALL_FURNITURE_ITEMS.filter((item) => player.furniture[item]).length : 0;

  return (
    <Modal open={player !== undefined} onClose={onClose} className={modalTheme.gazdalkodjModal}>
      {player && (
        <div className={styles.playerInfoModal}>
          <h2>
            <span className={styles.colorSwatch} style={{ backgroundColor: GAZDALKODJ_PLAYER_COLORS[playerIndex % GAZDALKODJ_PLAYER_COLORS.length] }} />
            {player.name}
            {player.bankrupt ? ' (csődbe ment)' : ''}
          </h2>
          <p>
            Készpénz: <CashReadout amount={player.cash} playerId={player.id} log={state.log} />
          </p>
          <h3>Folyószámla</h3>
          <BankAccountPanel account={player.bankAccount} />
          <p>BKV-bérlet: {player.hasBkvPass ? 'van' : 'nincs'}</p>
          <p>Lakás: {ownershipLabel(player.apartment)}</p>
          <p>Autó: {ownershipLabel(player.car)}</p>
          <p>Bútor: {furnitureCount}/6</p>
          <p>
            Biztosítás:{' '}
            {(['life', 'home', 'car'] as const)
              .filter((policy) => player.insurance[policy])
              .map((policy) => ({ life: 'élet', home: 'lakás', car: 'autó' })[policy])
              .join(', ') || 'nincs'}
          </p>
          <h3>Ingóságok</h3>
          <div className={styles.ownedPanel}>
            <OwnershipPanel apartment={player.apartment} car={player.car} furniture={player.furniture} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * The just-drawn Szerencsekártya's text, with a mandatory "OK" — the card's
 * effect has ALREADY been applied (reducer-side, `AWAITING_CHANCE_CARD_ACK`
 * only gates what comes NEXT), so `onClose` and the OK button do the exact
 * same thing: dispatch `ACK_CHANCE_CARD`. No separate "dismiss without
 * confirming" path makes sense here — there's nothing left to lose by
 * closing early. Open info: shown to every player, but only the current
 * player's dispatch actually moves the game forward (server-side
 * `isActionAllowed` already enforces this in online mode).
 */
function ChanceCardModal({ state, dispatch }: { state: GazdalkodjOkosanState; dispatch: Dispatch }) {
  const open = state.turnPhase === 'AWAITING_CHANCE_CARD_ACK';
  const lastDrawn = [...state.log].reverse().find((entry): entry is Extract<LogEntry, { type: 'CHANCE_CARD_DRAWN' }> => entry.type === 'CHANCE_CARD_DRAWN');
  const card = lastDrawn ? CHANCE_CARDS.find((c) => c.id === lastDrawn.cardId) : undefined;
  const ack = () => dispatch({ type: 'ACK_CHANCE_CARD' });

  return (
    <Modal open={open} onClose={ack} className={modalTheme.gazdalkodjModal}>
      <div className={styles.chanceCardModal}>
        <h2>Szerencsekártya</h2>
        <p>{card?.text}</p>
        <Button onClick={ack}>OK</Button>
      </div>
    </Modal>
  );
}

/**
 * Fizetési forrás (készpénz/folyószámla/megosztva) választása — bármilyen
 * fizetésnél megjelenik (kötelező mezőfizetés/törlesztés/Szerencsekártya-
 * büntetés ÉS önkéntes vásárlás is), `turnPhase === 'AWAITING_PAYMENT'`
 * esetén. A két összeg-mező auto-balanszírozott (egyet állítva a másik
 * automatikusan a maradékra ugrik), hogy a kettő összege mindig pontosan a
 * `pendingPayment.amount`-ot adja ki. A `ChanceCardModal`-tól ELTÉRŐEN nem
 * nyílt infó — csak a soron lévő játékos látja (`isMine`), mert itt tényleges
 * számszerű döntés kell, nem csak egy ártalmatlan "OK".
 *
 * A modál BEZÁRHATÓ (× vagy háttérre kattintás) anélkül, hogy ez lemondaná a
 * fizetést — kötelező fizetésnél nincs "mégse" lehetőség, de a játékos
 * megnézheti a táblát, mielőtt dönt. Bezáráskor egy kis "Fizetés" gomb marad
 * kint, ami újranyitja a modált. A motor (rules.ts canWithdrawFromAccount)
 * emellett külön biztosítja, hogy a modál bezárt állapotában se lehessen
 * semmilyen más action-t végrehajtani — a `pendingPayment` a state-ben marad,
 * a `turnPhase` nem változik, a fizetés `dismissed`-je pusztán kliensoldali,
 * megjelenítési állapot.
 */
// eslint-disable-next-line complexity -- egy modál-komponens szokásos elágazásai (nincs pending/nem az enyém/érvényesség-számítás/bezárt), bontása csak áttekinthetetlenebbé tenné
function PaymentModal({ state, dispatch, isMine }: { state: GazdalkodjOkosanState; dispatch: Dispatch; isMine: boolean }) {
  const pending = state.pendingPayment;
  const player = state.players[state.currentPlayerIndex];
  const bankBalance = player.bankAccount?.balance ?? 0;
  const [cashAmount, setCashAmount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setCashAmount(Math.min(pending.amount, player.cash));
    setDismissed(false);
    // Csak akkor kell újra-inicializálni, ha egy ÚJ fizetés jelent meg (más összeg/ok) — a player.cash változása közben (pl. gépelés) nem szabad felülírnia a felhasználó bevitelét.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.amount, pending?.reason.kind]);

  if (!pending || !isMine || state.turnPhase !== 'AWAITING_PAYMENT') return null;

  if (dismissed) {
    return (
      <button className={styles.collapsedPaymentButton} onClick={() => setDismissed(false)}>
        Fizetés ({pending.amount.toLocaleString('hu-HU')} EUR)
      </button>
    );
  }

  const maxCash = Math.min(pending.amount, player.cash);
  const maxBank = Math.min(pending.amount, bankBalance);
  const bankAmount = pending.amount - cashAmount;
  const valid = cashAmount >= 0 && bankAmount >= 0 && cashAmount <= player.cash && bankAmount <= bankBalance;

  const settle = () => dispatch({ type: 'SETTLE_PAYMENT', cashAmount, bankAmount });
  const cancel = () => dispatch({ type: 'CANCEL_PAYMENT' });

  return (
    <Modal open className={modalTheme.gazdalkodjModal} onClose={() => setDismissed(true)}>
      <div className={styles.paymentModal}>
        <h2>{describePaymentReason(pending.reason)}</h2>
        <p>Fizetendő: {pending.amount.toLocaleString('hu-HU')} EUR</p>
        <label className={styles.paymentRow}>
          Készpénzből
          <input
            type="number"
            min={0}
            max={maxCash}
            value={cashAmount}
            onChange={(e) => setCashAmount(Math.max(0, Math.min(maxCash, Number(e.target.value))))}
          />
        </label>
        <label className={styles.paymentRow}>
          Folyószámláról
          <input
            type="number"
            min={0}
            max={maxBank}
            value={bankAmount}
            onChange={(e) => setCashAmount(pending.amount - Math.max(0, Math.min(maxBank, Number(e.target.value))))}
          />
        </label>
        <div className={styles.paymentActions}>
          {canCancelPayment(state) && (
            <Button variant="secondary" onClick={cancel}>
              Mégse
            </Button>
          )}
          <Button onClick={settle} disabled={!valid}>
            Fizetés
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Full-page takeover on game end — mirrors Hotel's HotelWinnerScreen. */
function GazdalkodjOkosanWinnerScreen({
  themeClass,
  winner,
  showNewGameButton,
  onRequestNewGame,
  onNavigateHome,
}: {
  themeClass: string | undefined;
  winner: Player;
  showNewGameButton: boolean;
  onRequestNewGame?: () => void;
  onNavigateHome: () => void;
}) {
  return (
    <div className={[styles.page, styles.winnerScreen, themeClass].filter(Boolean).join(' ')}>
      <div className={styles.winnerBanner}>
        <h1>Vége a játéknak!</h1>
        <p>Győztes: {winner.name}</p>
        <div className={styles.winnerActions}>
          {showNewGameButton && <Button onClick={onRequestNewGame}>Új játék</Button>}
          <Button variant="secondary" onClick={onNavigateHome}>
            Főmenü
          </Button>
        </div>
      </div>
    </div>
  );
}

export interface GazdalkodjOkosanGamePageProps {
  transport?: GameTransport<GazdalkodjOkosanState, GazdalkodjOkosanAction>;
  /** Online mode only — which player slot the local viewer controls; the ActionPanel only shows when it's their turn (nyílt infó, csak a köröd aktív, a Ramses-0b mintája). */
  myPlayer?: PlayerId;
  playerNames?: string[];
  onRequestNewGame?: () => void;
}

export function GazdalkodjOkosanGamePage({ transport: providedTransport, myPlayer, playerNames, onRequestNewGame }: GazdalkodjOkosanGamePageProps = {}) {
  const isLocalMode = providedTransport === undefined;
  const localTransport = useMemo(
    () => new LocalGameTransport<GazdalkodjOkosanState, GazdalkodjOkosanAction>(reducer, createInitialState(playerNames ?? ['Játékos 1', 'Játékos 2'])),
    // Deliberately mount-once — playerNames only ever seeds the initial state
    // (Hotel/Dáma mintája), re-keying on it would restart the reducer's state
    // if the prop reference ever changed after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const loggedLocalTransport = useLocalGameLogger(localTransport, 'gazdalkodjOkosan');
  const transport = providedTransport ?? loggedLocalTransport;
  const [state, dispatch] = useGameTransport(transport);
  useReportFeedbackContext('gazdalkodj-okosan', state);
  const navigate = useNavigate();

  const [inspectedPlayerId, setInspectedPlayerId] = useState<PlayerId | null>(null);
  const winner = getWinner(state);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const themeClass = useGameTheme('gazdalkodj-okosan');

  if (winner) {
    return (
      <GazdalkodjOkosanWinnerScreen
        themeClass={themeClass}
        winner={winner}
        showNewGameButton={isLocalMode && onRequestNewGame !== undefined}
        onRequestNewGame={onRequestNewGame}
        onNavigateHome={() => navigate('/')}
      />
    );
  }

  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <div className={styles.canvasWrapper}>
        <GazdalkodjOkosanBoard state={state} />
        <CurrentPlayerOwnershipPanel player={currentPlayer} />
        {(!myPlayer || myPlayer === currentPlayer.id) && <FloatingActionPanel state={state} dispatch={dispatch} />}
        <StatusChip state={state} />
        <GazdalkodjOkosanGameLogPanel state={state} />
        <PlayerRoster state={state} onInspect={setInspectedPlayerId} />
        <PlayerInfoModal state={state} playerId={inspectedPlayerId} onClose={() => setInspectedPlayerId(null)} />
        <ChanceCardModal state={state} dispatch={dispatch} />
        <PaymentModal state={state} dispatch={dispatch} isMine={!myPlayer || myPlayer === currentPlayer.id} />
        {isLocalMode && <LocalGameControls gameId="gazdalkodj-okosan" onRequestNewGame={onRequestNewGame} resumable={false} />}
      </div>
    </div>
  );
}

export default GazdalkodjOkosanGamePage;
