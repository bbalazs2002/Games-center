// Gwent-0a.1 asset pipeline (docs/gwent-0a-specifikacio.md §5) — a single, rerunnable
// pass that goes straight from the raw research artifacts to committed source:
//   1. reads temp/gwent-card-data.json (154 researched card entries + notes),
//   2. matches each entry to its physical card-image file(s) under assets/Gwent/cards/,
//   3. deduplicates those files by MD5 (many "numbered copy" files are byte-identical;
//      MD5 comparison (2026-07-30) found several regular unit cards are NOT identical —
//      genuinely different art per physical copy, same as the 10 Neutral hero cards
//      already known — kept per the user's standing rule: never drop a real variant),
//   4. resizes/compresses the survivors into public/assets/gwent/ (sharp, Ramses/Hotel
//      resize-*.mjs convention),
//   5. writes src/shared/games/gwent/engine/cardDefs.ts + leaderDefs.ts.
//
// Rerun after temp/gwent-card-data.json or assets/Gwent/cards/ changes — do not
// hand-edit the generated .ts files, edit this script (or the source JSON) instead.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

const RESEARCH_JSON = join(repoRoot, 'temp', 'gwent-card-data.json');
const ASSET_ROOT = join(repoRoot, 'assets', 'Gwent', 'cards');
// Skellige is explicitly out of scope for now (see 0a-spec header) — its folders/files
// are never walked, so nothing from them can leak into the generated catalogs.
const ASSET_FOLDERS = ['Monsters', 'Neutral Units', 'Neutrals', 'Nilfgaardian Empire', 'Northern Realms', "Scoia'tael"];
const PUBLIC_CARDS_DIR = join(repoRoot, 'public', 'assets', 'gwent', 'cards');
const PUBLIC_LEADERS_DIR = join(repoRoot, 'public', 'assets', 'gwent', 'leaders');
// Card-back art (Gwent-0c, docs/gwent-0c-vizualis-animacio-specifikacio.md §3) — a
// dedicated folder the user's own scan set already has, separate from the per-faction
// front-image folders above and therefore never walked by buildFileIndex(). Skellige
// excluded, same standing decision as ASSET_FOLDERS. Keys are the exact source filenames;
// values are the output slug (mirrors FACTION_SLUG, plus 'default' for the generic back).
const CARD_BACK_DIR = join(ASSET_ROOT, 'Back');
const CARD_BACK_SLUG_BY_FILENAME = {
  'Back.png': 'default',
  'Neutral back.jpg': 'neutral',
  'Monsters back.jpg': 'monsters',
  'Nilfgaardian Empire back.jpg': 'nilfgaard',
  'Northern Realms back.jpg': 'northern-realms',
  "Scoia'tael back.jpg": 'scoiatael',
};
const ENGINE_DIR = join(repoRoot, 'src', 'shared', 'games', 'gwent', 'engine');

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 82;

// UI chrome (row icons, board texture, coin-flip faces — see Gwent-0a.2 spec) — a flat
// copy-and-compress pass, distinct from the card/leader pipeline above: these are small,
// often-transparent PNGs (icon glyphs, coin faces), so they stay PNG (no JPEG flatten,
// which would fill transparency with a background color and ruin the overlay use case).
const ASSET_ICONS_DIR = join(repoRoot, 'assets', 'Gwent', 'icons');
const PUBLIC_ICONS_DIR = join(repoRoot, 'public', 'assets', 'gwent', 'icons');
const ICON_MAX_DIMENSION = 512;

const FACTION_JSON_TO_ENUM = {
  'Northern Realms': 'NorthernRealms',
  'Nilfgaardian Empire': 'Nilfgaard',
  Monsters: 'Monsters',
  "Scoia'tael": 'Scoiatael',
  Neutral: 'Neutral',
};

const FACTION_SLUG = {
  NorthernRealms: 'northern-realms',
  Nilfgaard: 'nilfgaard',
  Monsters: 'monsters',
  Scoiatael: 'scoiatael',
  Neutral: 'neutral',
};

// Weather cards' `row` in the research JSON is just 'Weather' — the affected
// row lives only in each card's own name/notes text (confirmed by rulebook, §2).
const WEATHER_ROW_BY_NAME = {
  'Biting Frost': 'Melee',
  'Impenetrable Fog': 'Ranged',
  'Torrential Rain': 'Siege',
  'Clear Weather': 'AllRows',
};

// RowScorch (0a-spec §4.3) — a kártya-egyedi mechanika, nincs a kutatási JSON abilities
// mezőjében (nem illik az UnitAbility unióba), ezért itt, név szerint adjuk hozzá.
const ROW_SCORCH_BY_NAME = {
  Schirrú: { targetRow: 'Siege', threshold: 10 },
  Toad: { targetRow: 'Ranged', threshold: 10 },
  Villentretenmerth: { targetRow: 'Melee', threshold: 10 },
};

// Kártya-egyedi mechanikák (0a-spec §4.4), amikhez nincs strukturált mező — a
// kutatási JSON `notes`-ja tartalmazza a forrás-szöveget, ez itt a magyar,
// játékos-barát megfogalmazás (a UI-nak, lásd CardDef.specialText).
const SPECIAL_TEXT_BY_NAME = {
  Dandelion:
    "Amíg a táblán van, a saját sorában lévő MINDEN MÁS kártya ereje duplázva marad (Kürt-szerű, tartós hatás — nem duplázza önmagát, soronként legfeljebb 1 ilyen hatás, egy valódi Kürt kártyával együtt is érvényesül).",
  Cow: 'Ha bármilyen módon lekerül a tábláról (pl. Scorch), automatikusan megjelenik helyette a Bovine Defense Force (8 erejű Melee egység).',
};

// Csoportos Muster kivételek (0a-spec §4.2, felhasználó által megerősítve) — a
// reducer futásidőben KIZÁRÓLAG ezt az adatot olvassa (mustersWithIds), nem nevet
// hasonlít; a névlista itt csak ennek a statikus adatnak az egyszeri felépítéséhez kell.
const MUSTER_GROUPS_BY_NAME = [
  ['Crone Brewess', 'Crone Weavess', 'Crone Whispess'],
  ['Vampire Bruxa', 'Vampire Ekimmara', 'Vampire Fleder', 'Vampire Garkain', 'Vampire Katakan'],
  ["Gaunter O'Dimm", "Gaunter O'Dimm: Darkness"],
];

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents, e.g. Schirrú -> Schirru
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normFilename(name) {
  return name
    .toLowerCase()
    .replace(/\.[a-z]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

// Filename-shaped tokens anywhere in a card's `notes` text — covers every
// "Also covers: X 2.png, X 3.png" phrasing variant without depending on exact wording.
const FILENAME_TOKEN_RE = /\b[A-Za-z0-9][A-Za-z0-9' -]*\.(?:png|jpg)\b/g;

function buildFileIndex() {
  const index = new Map(); // normalized filename -> absolute path
  for (const folder of ASSET_FOLDERS) {
    const dir = join(ASSET_ROOT, folder);
    for (const entry of readdirSync(dir)) {
      index.set(normFilename(entry), join(dir, entry));
    }
  }
  return index;
}

/** Every physical file this card entry references, deduplicated to unique art (by MD5), in stable order. */
function resolveUniqueImageFiles(card, fileIndex) {
  const candidateNames = new Set([card.filename, ...(card.notes.match(FILENAME_TOKEN_RE) ?? [])]);
  const files = [];
  for (const name of candidateNames) {
    const path = fileIndex.get(normFilename(name));
    if (path) files.push(path);
  }
  const seenHashes = new Set();
  const unique = [];
  for (const file of files) {
    const hash = md5File(file);
    if (seenHashes.has(hash)) continue;
    seenHashes.add(hash);
    unique.push(file);
  }
  return unique;
}

async function processImage(sourcePath, outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  await sharp(sourcePath)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // card scans are opaque — same reasoning as resize-ramses-images.mjs
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outputPath);
}

async function processCardBacks() {
  for (const [filename, slug] of Object.entries(CARD_BACK_SLUG_BY_FILENAME)) {
    await processImage(join(CARD_BACK_DIR, filename), join(PUBLIC_CARDS_DIR, 'backs', `${slug}.jpg`));
  }
  return Object.keys(CARD_BACK_SLUG_BY_FILENAME).length;
}

async function processIcons() {
  const files = readdirSync(ASSET_ICONS_DIR).filter((name) => name.toLowerCase().endsWith('.png'));
  for (const file of files) {
    const outputPath = join(PUBLIC_ICONS_DIR, file);
    mkdirSync(dirname(outputPath), { recursive: true });
    await sharp(join(ASSET_ICONS_DIR, file))
      .resize(ICON_MAX_DIMENSION, ICON_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toFile(outputPath);
  }
  return files.length;
}

function classifyRow(card) {
  if (card.row === 'Special') return card.name === 'Scorch' ? { kind: 'Scorch', row: null } : null; // null = leader, handled separately
  if (card.row === 'Weather') return { kind: 'Weather', row: null };
  if (card.row === 'Horn') return { kind: 'Horn', row: null };
  if (card.row === 'Decoy') return { kind: 'Decoy', row: null };
  // Agile units never have a fixed row (chosen at play time, see 0a-spec §3.1) — the
  // research JSON marks this two inconsistent ways (row: 'Agile', OR a fixed Melee/
  // Ranged/Siege row alongside 'Agile' in `abilities`, e.g. Olgierd von Everec).
  // `abilities` is the source of truth here, not `row`.
  if (card.row === 'Agile' || card.abilities.includes('Agile')) return { kind: 'Unit', row: null };
  if (card.row === 'Melee' || card.row === 'Ranged' || card.row === 'Siege') return { kind: 'Unit', row: card.row };
  throw new Error(`Unknown row "${card.row}" on card "${card.name}"`);
}

function tsString(value) {
  return JSON.stringify(value);
}

function formatCardDef(def) {
  return `  {
    id: ${tsString(def.id)},
    name: ${tsString(def.name)},
    faction: ${tsString(def.faction)},
    kind: ${tsString(def.kind)},
    row: ${def.row === null ? 'null' : tsString(def.row)},
    basePower: ${def.basePower === null ? 'null' : def.basePower},
    abilities: [${def.abilities.map(tsString).join(', ')}],
    mustersWithIds: [${def.mustersWithIds.map(tsString).join(', ')}],
    rowScorch: ${def.rowScorch ? `{ targetRow: ${tsString(def.rowScorch.targetRow)}, threshold: ${def.rowScorch.threshold} }` : 'null'},
    weatherRow: ${def.weatherRow === null ? 'null' : tsString(def.weatherRow)},
    specialText: ${def.specialText === null ? 'null' : tsString(def.specialText)},
    cardText: ${def.cardText === null ? 'null' : tsString(def.cardText)},
    copies: ${def.copies},
    imagePaths: [${def.imagePaths.map(tsString).join(', ')}],
  },`;
}

function formatLeaderDef(def) {
  return `  {
    id: ${tsString(def.id)},
    name: ${tsString(def.name)},
    faction: ${tsString(def.faction)},
    abilityId: ${tsString(def.abilityId)},
    abilityDescription: ${tsString(def.abilityDescription)},
    cardText: ${def.cardText === null ? 'null' : tsString(def.cardText)},
    imagePaths: [${def.imagePaths.map(tsString).join(', ')}],
  },`;
}

const LEADER_ABILITY_DESCRIPTIONS_HU = {
  'Foltest, King of Temeria': 'Válassz egy Áthatolhatatlan köd kártyát a paklidból, és játszd le azonnal.',
  'Foltest, Lord Commander of the North': 'Töröl minden aktív időjárás-hatást, mindkét oldalon.',
  'Foltest, Son of Medell':
    "Elpusztítja az ellenfél legerősebb távolsági (Ranged) egységét/egységeit, ha az adott sor össz-ereje eléri a 10-et, és lapfelhasználás nélkül Kürt-hatást aktivál a saját távolsági sorodon.",
  'Foltest, The Siegemaster': 'Megduplázza minden ostrom (Siege) egységed erejét, hacsak nincs már Kürt-hatás azon a soron.',
  'Foltest, The Steel-Forged':
    'Elpusztítja az ellenfél legerősebb ostrom (Siege) egységét/egységeit, ha az adott sor össz-ereje eléri a 10-et.',
  'Emhyr var Emreis: His Imperial Majesty': 'Válassz egy Felhőszakadás kártyát a paklidból, és játszd le azonnal.',
  'Emhyr var Emreis: Emperor of Nilfgaard': 'Megnézhetsz 3 véletlenszerű lapot az ellenfél kezéből.',
  'Emhyr var Emreis: Invader of the North':
    'Minden, egységet a táblára visszahozó képesség egy véletlenszerűen kiválasztott egységet hoz vissza — mindkét játékosra érvényes.',
  'Emhyr var Emreis: The Relentless': 'Húzz egy lapot az ellenfél dobott lapjai közül.',
  'Emhyr var Emreis: The White Flame': 'Semlegesíti az ellenfél vezér-képességét.',
  'Eredin Breacc Glas The Treacherous':
    'Megduplázza minden táblán lévő Kém (Spy) kártya erejét — mindkét játékos kémjeire vonatkozik.',
  'Eredin Bringer of Death': 'Dobj el 2 lapot a kezedből, majd húzz 1, általad választott lapot a paklidból.',
  'Eredin Commander of the Red Riders': 'Válassz egy tetszőleges időjárás-kártyát a paklidból, és játszd le azonnal.',
  'Eredin Destroyer of Worlds': 'Végy vissza egy lapot a dobott lapjaid közül a kezedbe.',
  'Eredin King of the Wild Hunt':
    'Megduplázza minden közelharci (Melee) egységed erejét, hacsak nincs már Kürt-hatás azon a soron.',
  'Francesca Findabair: Daisy of the Valley': 'A parti elején húzz egy plusz lapot.',
  'Francesca Findabair: Hope of the Aen Seidhe':
    'Minden Fürge (Agile) egységedet automatikusan abba az érvényes sorba helyezi, ahol a legtöbbet ér.',
  'Francesca Findabair: Pureblood Elf': 'Válassz egy Csípős fagy kártyát a paklidból, és játszd le azonnal.',
  'Francesca Findabair: Queen of Dol Blathanna':
    'Elpusztítja az ellenfél legerősebb közelharci (Melee) egységét/egységeit, ha az adott sor össz-ereje eléri a 10-et.',
  'Francesca Findabair: The Beautiful':
    'Megduplázza minden távolsági (Ranged) egységed erejét, hacsak nincs már Kürt-hatás azon a soron.',
};

async function main() {
  const research = JSON.parse(readFileSync(RESEARCH_JSON, 'utf-8'));
  const fileIndex = buildFileIndex();

  const cardDefs = [];
  const leaderDefs = [];
  const seenIds = new Set();

  for (const card of research.cards) {
    const classification = classifyRow(card);
    const faction = FACTION_JSON_TO_ENUM[card.faction];
    if (!faction) throw new Error(`Unknown faction "${card.faction}" on card "${card.name}"`);
    const id = `${FACTION_SLUG[faction]}-${slugify(card.name)}`;
    if (seenIds.has(id)) throw new Error(`Duplicate id "${id}" (card "${card.name}")`);
    seenIds.add(id);

    const uniqueFiles = resolveUniqueImageFiles(card, fileIndex);
    if (uniqueFiles.length === 0) throw new Error(`No source image found for card "${card.name}" (${card.filename})`);

    if (classification === null) {
      // Leader card (row: 'Special', not Scorch) — separate catalog, see 0a-spec §4.5.
      const abilityDescription = LEADER_ABILITY_DESCRIPTIONS_HU[card.name];
      if (!abilityDescription) throw new Error(`Missing Hungarian ability description for leader "${card.name}"`);
      const imagePaths = uniqueFiles.map((_, i) => `/assets/gwent/leaders/${id}-${i + 1}.jpg`);
      leaderDefs.push({ id, name: card.name, faction, abilityId: id, abilityDescription, cardText: card.cardText ?? null, imagePaths });
      for (const [i, file] of uniqueFiles.entries()) {
        await processImage(file, join(PUBLIC_LEADERS_DIR, `${id}-${i + 1}.jpg`));
      }
      continue;
    }

    const imagePaths = uniqueFiles.map((_, i) => `/assets/gwent/cards/${id}-${i + 1}.jpg`);
    for (const [i, file] of uniqueFiles.entries()) {
      await processImage(file, join(PUBLIC_CARDS_DIR, `${id}-${i + 1}.jpg`));
    }

    cardDefs.push({
      id,
      name: card.name,
      faction: faction === 'Neutral' ? 'Neutral' : faction,
      kind: classification.kind,
      row: classification.row,
      basePower: card.power,
      abilities: card.abilities,
      mustersWithIds: [],
      rowScorch: ROW_SCORCH_BY_NAME[card.name] ?? null,
      weatherRow: classification.kind === 'Weather' ? WEATHER_ROW_BY_NAME[card.name] : null,
      specialText: SPECIAL_TEXT_BY_NAME[card.name] ?? null,
      cardText: card.cardText ?? null,
      copies: card.copies,
      imagePaths,
    });
  }

  // Resolve Muster groups by name -> id, now that every id is known.
  const idByName = new Map(research.cards.map((c) => [c.name, `${FACTION_SLUG[FACTION_JSON_TO_ENUM[c.faction]]}-${slugify(c.name)}`]));
  for (const group of MUSTER_GROUPS_BY_NAME) {
    const groupIds = group.map((name) => {
      const id = idByName.get(name);
      if (!id) throw new Error(`Muster group member "${name}" not found among researched cards`);
      return id;
    });
    for (const def of cardDefs) {
      if (!groupIds.includes(def.id)) continue;
      def.mustersWithIds = groupIds.filter((otherId) => otherId !== def.id);
    }
  }

  if (leaderDefs.length !== 20) throw new Error(`Expected exactly 20 leaders, found ${leaderDefs.length}`);
  if (cardDefs.length !== research.cards.length - 20) {
    throw new Error(`Card count mismatch: ${cardDefs.length} CardDefs from ${research.cards.length} research entries`);
  }

  cardDefs.sort((a, b) => a.id.localeCompare(b.id));
  leaderDefs.sort((a, b) => a.id.localeCompare(b.id));

  const cardDefsSource = `// GENERATED FILE — do not hand-edit. Produced by \`node scripts/build-gwent-assets.mjs\`
// from temp/gwent-card-data.json + assets/Gwent/cards/ — see docs/gwent-0a-specifikacio.md §5.
// To fix a card's data, edit the research JSON (or this script's override tables) and rerun.
import type { CardDef } from './types';

export const CARD_DEFS: CardDef[] = [
${cardDefs.map(formatCardDef).join('\n')}
];

export function getCardDef(id: string): CardDef {
  const def = CARD_DEFS.find((c) => c.id === id);
  if (!def) throw new Error(\`Unknown Gwent card: \${id}\`);
  return def;
}
`;

  const leaderDefsSource = `// GENERATED FILE — do not hand-edit. Produced by \`node scripts/build-gwent-assets.mjs\`
// from temp/gwent-card-data.json + assets/Gwent/cards/ — see docs/gwent-0a-specifikacio.md §4.5.
import type { LeaderDef } from './types';

export const LEADER_DEFS: LeaderDef[] = [
${leaderDefs.map(formatLeaderDef).join('\n')}
];

export function getLeaderDef(id: string): LeaderDef {
  const def = LEADER_DEFS.find((l) => l.id === id);
  if (!def) throw new Error(\`Unknown Gwent leader: \${id}\`);
  return def;
}
`;

  mkdirSync(ENGINE_DIR, { recursive: true });
  writeFileSync(join(ENGINE_DIR, 'cardDefs.ts'), cardDefsSource);
  writeFileSync(join(ENGINE_DIR, 'leaderDefs.ts'), leaderDefsSource);

  const iconCount = await processIcons();
  const backCount = await processCardBacks();

  const totalImages = cardDefs.reduce((n, c) => n + c.imagePaths.length, 0) + leaderDefs.reduce((n, l) => n + l.imagePaths.length, 0);
  console.log(
    `Done: ${cardDefs.length} CardDefs + ${leaderDefs.length} LeaderDefs, ${totalImages} images + ${iconCount} icons + ${backCount} card backs written to public/assets/gwent/.`,
  );
}

await main();
