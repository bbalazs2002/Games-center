/**
 * Rövid, megjelenítésre szánt mező-elnevezések — kizárólag prezentációs
 * adat, a motor `boardConfig.ts`-e csak a mechanikai hatáshoz szükséges
 * `label` szlöget ismeri (docs/gazdalkodj-okosan-0a-specifikacio.md §3). A
 * teljes, eredeti reklámszöveg forrása `assets/GazdalkodjOkosan/jatekszabaly.txt`
 * — az a mappa nincs a `public/`-ban kiszolgálva, ezért ide egy rövidített
 * névsor került, amíg a 0c (vizuál) fázis a végleges mező-grafikákat/-szövegeket
 * be nem hozza.
 */
export const SPACE_DISPLAY_NAMES: Record<string, string> = {
  start: 'Start',
  parwan: 'Parwan Szőnyeg',
  'bkv-berlet': 'BKV bérlet',
  'zila-kavehaz': 'Zila Kávéház',
  'citroen-c4': 'Citroën C4',
  mulato: 'Mulató',
  sportolj: 'Sportolj!',
  'otp-bank': 'OTP Bank',
  'allianz-hungaria': 'Allianz Hungária',
  'hanak-konyhabutor': 'Hanák Konyhabútor',
  'allat-es-novenykert': 'Állat- és Növénykert',
  korhaz: 'Kórház',
  deichmann: 'Deichmann',
  'bkv-jutalom': 'BKV jutalom',
  mozi: 'Mozi',
  alexandra: 'Alexandra Könyváruház',
  'otp-lakashitel-19': 'OTP Lakáshitel',
  gsm: 'GSM mobiltelefon',
  'club-tihany': 'Club Tihany',
  'nemzeti-galeria': 'Nemzeti Galéria',
  'visegradi-hajokirandulas': 'Visegrádi hajókirándulás',
  'kakas-etterem': 'Kakas Étterem',
  margitsziget: 'Margitsziget',
  tesco: 'Tesco',
  halaszbastya: 'Halászbástya',
  'vista-utazasi-iroda': 'Vista Utazási Iroda',
  pick: 'Pick',
  electrolux: 'Electrolux',
  'sky-europe': 'Sky Europe',
  mezesmacko: 'Mézesmackó',
  'mammut-mozi': 'Mammut Mozi',
  'szobabutor-uzlet': 'Szobabútor üzlet',
  'otp-lakashitel-39': 'OTP Lakáshitel',
  invitel: 'Invitel',
  italbolt: 'Italbolt',
};

const CHANCE_LABEL_PREFIX = 'szerencsekerek-';

export function displayNameForSpaceLabel(label: string): string {
  if (label.startsWith(CHANCE_LABEL_PREFIX)) return 'Szerencsekerék';
  return SPACE_DISPLAY_NAMES[label] ?? label;
}
