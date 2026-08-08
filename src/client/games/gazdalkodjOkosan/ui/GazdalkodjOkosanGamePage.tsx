import { useMemo, useState } from 'react';
import type { GameTransport } from '../../../core/transport/GameTransport';
import { LocalGameTransport } from '../../../core/transport/LocalGameTransport';
import { useGameTransport } from '../../../core/transport/useGameTransport';
import { useLocalGameLogger } from '../../../core/transport/useLocalGameLogger';
import { Button } from '../../../ui-kit/Button';
import { LocalGameControls } from '../../../ui-kit/LocalGameControls';
import { useReportFeedbackContext } from '../../../ui-kit/useFeedbackContext';
import type { GazdalkodjOkosanAction } from '@shared/games/gazdalkodjOkosan/engine/actions';
import { CHANCE_CARDS } from '@shared/games/gazdalkodjOkosan/engine/chanceCards';
import { FURNITURE_CATALOG, ALL_FURNITURE_ITEMS } from '@shared/games/gazdalkodjOkosan/engine/furnitureCatalog';
import { createInitialState } from '@shared/games/gazdalkodjOkosan/engine/initialState';
import { reducer } from '@shared/games/gazdalkodjOkosan/engine/reducer';
import { getValidActions, getWinner } from '@shared/games/gazdalkodjOkosan/engine/selectors';
import type { FurnitureItemId, GazdalkodjOkosanState, LogEntry, OwnershipStatus, Player, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';
import { displayNameForSpaceLabel } from './spaceDisplayNames';
import styles from './GazdalkodjOkosanGamePage.module.css';

const FURNITURE_LABELS: Record<FurnitureItemId, string> = {
  konyhabutor: 'Konyhabútor',
  mosogep: 'Mosógép',
  hutoszekreny: 'Hűtő',
  mosogatogep: 'Mosogatógép',
  tuzhely: 'Tűzhely',
  szobabutor: 'Szobabútor',
};

function playerName(state: GazdalkodjOkosanState, playerId: PlayerId): string {
  return state.players.find((p) => p.id === playerId)?.name ?? playerId;
}

function ownershipLabel(status: OwnershipStatus): string {
  if (status.kind === 'NONE') return 'Nincs';
  if (status.kind === 'OWNED_CASH') return 'Kifizetve';
  return `Hitelre — hátralék: ${status.plan.remainingBalance.toLocaleString('hu-HU')} EUR`;
}

// eslint-disable-next-line complexity -- egyetlen nagy leképezés, minden ág egysoros, bontása csak áttekinthetetlenebbé tenné
function formatLogEntry(entry: LogEntry, state: GazdalkodjOkosanState): string {
  const name = (id: PlayerId) => playerName(state, id);
  switch (entry.type) {
    case 'DICE_ROLLED':
      return `${name(entry.playerId)} dobott: ${entry.value}`;
    case 'MOVED':
      return `${name(entry.playerId)} a(z) ${entry.toIndex}. mezőre lépett${entry.startBonus > 0 ? ` (+${entry.startBonus.toLocaleString('hu-HU')} EUR a Starton)` : ''}`;
    case 'SPACE_PAYMENT':
      return `${name(entry.playerId)} fizetett ${entry.amount.toLocaleString('hu-HU')} EUR-t`;
    case 'CHANCE_CARD_DRAWN':
      return `${name(entry.playerId)} Szerencsekártyát húzott`;
    case 'CHANCE_CARD_SKIPPED_NO_PASS':
      return `${name(entry.playerId)} nem húzhatott kártyát (nincs BKV-bérlete)`;
    case 'BKV_PASS_PURCHASED':
      return `${name(entry.playerId)} megvette a BKV-bérletet`;
    case 'BKV_REWARD_SKIPPED_NO_PASS':
      return `${name(entry.playerId)} nem kapta meg a jutalmat (nincs BKV-bérlete)`;
    case 'EXTRA_ROLL_GRANTED':
      return `${name(entry.playerId)} ${entry.count} extra dobást kapott`;
    case 'BANK_ACCOUNT_OPENED':
      return `${name(entry.playerId)} folyószámlát nyitott`;
    case 'MONEY_TRANSFERRED':
      return `${name(entry.playerId)} ${entry.direction === 'DEPOSIT' ? 'befizetett' : 'kivett'} ${entry.amount.toLocaleString('hu-HU')} EUR-t`;
    case 'INTEREST_PAID':
      return `${name(entry.playerId)} ${entry.amount.toLocaleString('hu-HU')} EUR kamatot kapott`;
    case 'INSURANCE_BOUGHT':
      return `${name(entry.playerId)} biztosítást kötött (${entry.policy})`;
    case 'APARTMENT_PURCHASED':
      return `${name(entry.playerId)} lakást vásárolt${entry.financed ? ' (hitelre)' : ''}`;
    case 'CAR_PURCHASED':
      return `${name(entry.playerId)} autót vásárolt${entry.financed ? ' (hitelre)' : ''}`;
    case 'INSTALLMENT_PAID':
      return `${name(entry.playerId)} törlesztett ${entry.amount.toLocaleString('hu-HU')} EUR-t${entry.paidOff ? ' — a hitel lezárult' : ''}`;
    case 'FURNITURE_PURCHASED':
      return `${name(entry.playerId)} megvette: ${FURNITURE_LABELS[entry.item]}`;
    case 'FURNITURE_GAINED_FROM_CARD':
      return `${name(entry.playerId)} ${entry.cashInstead ? 'készpénzt kapott' : `megkapta: ${FURNITURE_LABELS[entry.item]}`} egy kártyáról`;
    case 'FIRE_EVENT':
      return `${name(entry.playerId)}: tűzeset — ${entry.insured ? `${entry.payout.toLocaleString('hu-HU')} EUR kártérítés` : 'nincs biztosítás, elvesztette a berendezését'}`;
    case 'CAR_THEFT':
      return `${name(entry.playerId)}: autólopás — ${entry.insured ? `${entry.payout.toLocaleString('hu-HU')} EUR kártérítés` : 'nincs biztosítás'}`;
    case 'HOSPITAL_ENTERED':
      return `${name(entry.playerId)} kórházba került`;
    case 'HOSPITAL_ROLL_FAILED':
      return `${name(entry.playerId)} nem tudott kilépni a kórházból (dobott: ${entry.value})`;
    case 'HOSPITAL_EXITED':
      return `${name(entry.playerId)} kilépett a kórházból`;
    case 'SKIPPED_TURN':
      return `${name(entry.playerId)} kimaradt a dobásból`;
    case 'BANKRUPT':
      return `${name(entry.playerId)} csődbe ment`;
    case 'GAME_WON':
      return `${name(entry.playerId)} megnyerte a játékot!`;
    default:
      return '';
  }
}

function BoardGrid({ state }: { state: GazdalkodjOkosanState }) {
  return (
    <div className={styles.board}>
      {state.board.map((space) => {
        const here = state.players.filter((p) => p.position === space.index && !p.bankrupt);
        return (
          <div key={space.index} className={[styles.space, styles[`type-${space.type}`]].join(' ')}>
            <span className={styles.spaceIndex}>{space.index}</span>
            <span className={styles.spaceLabel}>{displayNameForSpaceLabel(space.label)}</span>
            {space.amount ? <span className={styles.spaceAmount}>{space.amount.toLocaleString('hu-HU')} EUR</span> : null}
            {here.length > 0 && (
              <div className={styles.tokens}>
                {here.map((p) => (
                  <span key={p.id} className={styles.token} title={p.name}>
                    {state.players.indexOf(p) + 1}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlayerCard({ player, isCurrent }: { player: Player; isCurrent: boolean }) {
  const furnitureCount = ALL_FURNITURE_ITEMS.filter((item) => player.furniture[item]).length;
  return (
    <div className={[styles.playerCard, isCurrent ? styles.current : '', player.bankrupt ? styles.bankrupt : ''].join(' ')}>
      <h3>
        {player.name}
        {player.bankrupt ? ' (csődbe ment)' : ''}
      </h3>
      <p>Készpénz: {player.cash.toLocaleString('hu-HU')} EUR</p>
      <p>Folyószámla: {player.bankAccount ? `${player.bankAccount.balance.toLocaleString('hu-HU')} EUR` : 'nincs nyitva'}</p>
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
    </div>
  );
}

type Dispatch = (action: GazdalkodjOkosanAction) => void;
type ValidActions = ReturnType<typeof getValidActions>;

function PurchaseButtons({ valid, dispatch }: { valid: ValidActions; dispatch: Dispatch }) {
  return (
    <>
      {valid.canBuyApartment.cash && <Button onClick={() => dispatch({ type: 'BUY_APARTMENT', financed: false })}>Lakás vásárlása (készpénz)</Button>}
      {valid.canBuyApartment.financed && <Button onClick={() => dispatch({ type: 'BUY_APARTMENT', financed: true })}>Lakás vásárlása (hitelre)</Button>}
      {valid.canBuyCar.cash && <Button onClick={() => dispatch({ type: 'BUY_CAR', financed: false })}>Autó vásárlása (készpénz)</Button>}
      {valid.canBuyCar.financed && <Button onClick={() => dispatch({ type: 'BUY_CAR', financed: true })}>Autó vásárlása (hitelre)</Button>}
      {valid.buyableFurniture.map((item) => (
        <Button key={item} onClick={() => dispatch({ type: 'BUY_FURNITURE', item })}>
          {FURNITURE_LABELS[item]} vásárlása ({FURNITURE_CATALOG[item].price.toLocaleString('hu-HU')} EUR)
        </Button>
      ))}
      {valid.buyableInsurancePolicies.map((policy) => (
        <Button key={policy} onClick={() => dispatch({ type: 'BUY_INSURANCE', policy })}>
          Biztosítás kötése ({policy})
        </Button>
      ))}
      {valid.canBuyBkvPass && <Button onClick={() => dispatch({ type: 'BUY_BKV_PASS' })}>BKV-bérlet vásárlása</Button>}
      {valid.canDrawChanceCard && <Button onClick={() => dispatch({ type: 'DRAW_CHANCE_CARD' })}>Szerencsekártya húzása</Button>}
    </>
  );
}

function BankAndTurnButtons({ valid, dispatch }: { valid: ValidActions; dispatch: Dispatch }) {
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
      {valid.canEndTurn && (
        <Button variant="secondary" onClick={() => dispatch({ type: 'END_TURN' })}>
          Kör vége
        </Button>
      )}
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
      <BankAndTurnButtons valid={valid} dispatch={dispatch} />
    </div>
  );
}

function LastChanceCard({ state }: { state: GazdalkodjOkosanState }) {
  const lastDrawn = [...state.log].reverse().find((entry): entry is Extract<LogEntry, { type: 'CHANCE_CARD_DRAWN' }> => entry.type === 'CHANCE_CARD_DRAWN');
  if (!lastDrawn) return null;
  const card = CHANCE_CARDS.find((c) => c.id === lastDrawn.cardId);
  if (!card) return null;
  return (
    <div className={styles.chanceCard}>
      <h4>Legutóbb húzott Szerencsekártya</h4>
      <p>{card.text}</p>
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

  const winner = getWinner(state);
  const currentPlayer = state.players[state.currentPlayerIndex];

  return (
    <div className={styles.page}>
      {isLocalMode && <LocalGameControls gameId="gazdalkodj-okosan" onRequestNewGame={onRequestNewGame} resumable={false} />}
      <h1>Gazdálkodj okosan!</h1>
      {winner ? (
        <p className={styles.winnerBanner}>Győztes: {winner.name}!</p>
      ) : (
        <p className={styles.turnReadout}>Soron van: {currentPlayer.name}</p>
      )}
      <div className={styles.layout}>
        <BoardGrid state={state} />
        <div className={styles.sidebar}>
          <div className={styles.players}>
            {state.players.map((p, index) => (
              <PlayerCard key={p.id} player={p} isCurrent={index === state.currentPlayerIndex && !winner} />
            ))}
          </div>
          {!winner && (!myPlayer || myPlayer === currentPlayer.id) && <ActionPanel state={state} dispatch={dispatch} />}
          <LastChanceCard state={state} />
          <div className={styles.log}>
            <h4>Napló</h4>
            {[...state.log]
              .slice(-15)
              .reverse()
              .map((entry, index) => (
                <p key={state.log.length - index}>{formatLogEntry(entry, state)}</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default GazdalkodjOkosanGamePage;
