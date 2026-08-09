import { CHANCE_CARDS } from '@shared/games/gazdalkodjOkosan/engine/chanceCards';
import type { FurnitureItemId, GazdalkodjOkosanState, LogEntry, PlayerId } from '@shared/games/gazdalkodjOkosan/engine/state';

export const FURNITURE_LABELS: Record<FurnitureItemId, string> = {
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

/** Card text is looked up here so a drawn card's actual effect shows directly in the log line — no separate "last drawn card" panel needed (there's no card artwork to show anyway, just this text). */
function chanceCardText(cardId: string): string {
  return CHANCE_CARDS.find((c) => c.id === cardId)?.text ?? '';
}

// eslint-disable-next-line complexity -- egyetlen nagy leképezés, minden ág egysoros, bontása csak áttekinthetetlenebbé tenné
export function formatLogEntry(entry: LogEntry, state: GazdalkodjOkosanState): string {
  const name = (id: PlayerId) => playerName(state, id);
  switch (entry.type) {
    case 'DICE_ROLLED':
      return `${name(entry.playerId)} dobott: ${entry.value}`;
    case 'MOVED':
      return `${name(entry.playerId)} a(z) ${entry.toIndex}. mezőre lépett${entry.startBonus > 0 ? ` (+${entry.startBonus.toLocaleString('hu-HU')} EUR a Starton)` : ''}`;
    case 'SPACE_PAYMENT':
      return `${name(entry.playerId)} fizetett ${entry.amount.toLocaleString('hu-HU')} EUR-t`;
    case 'CHANCE_CARD_DRAWN':
      return `${name(entry.playerId)} Szerencsekártyát húzott: „${chanceCardText(entry.cardId)}”`;
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
