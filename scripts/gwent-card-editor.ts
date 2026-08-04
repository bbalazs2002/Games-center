// Standalone LOCAL-ONLY review/edit tool for the Gwent card catalog — the
// felhasználó asked for "egy felület, ahol látok minden kártyát és a hozzájuk
// tartozó adatokat, és ki tudom pótolni, vagy javítani". Same pattern as
// scripts/simulate-hotel-ai-games.ts: a plain tsx script, not part of the
// client bundle or src/server's own Express app, never deployed.
//
// Run with:
//   npx tsx scripts/gwent-card-editor.ts
// then open the printed http://127.0.0.1:PORT URL. Binds 127.0.0.1 by
// default — no auth on the save endpoint, so this only stays safe as long as
// nothing but the local machine can reach it. To also reach it from another
// device on the same LAN (phone/tablet/second PC), pass --host:
//   npx tsx scripts/gwent-card-editor.ts --host 0.0.0.0
// (or `npm run gwent:card-editor:lan`) — prints every LAN address it's now
// reachable on. Only do this on a network you trust: anyone who can reach
// that address can rewrite this repo's source files, no login required.
//
// Scope: every CardDef/LeaderDef field is shown for review. Two are EDITABLE:
// the Hungarian flavor-text translation (cardTextTranslations.ts's
// CARD_TEXT_HU/LEADER_TEXT_HU) and the English `cardText` itself (some cards
// have no flavor quote at all in the source research, e.g. Schirrú — see
// cardTextTranslations.ts's own doc comment). An English-text save writes
// BOTH temp/gwent-card-data.json (the real source of truth the official
// `npm run assets:build-gwent` pipeline reads) and a freshly regenerated
// cardDefs.ts/leaderDefs.ts (via formatCardDef/formatLeaderDef, duplicated
// from build-gwent-assets.mjs below — kept byte-for-byte compatible with
// that script's own output so a later full rebuild never conflicts). Every
// OTHER field (power/row/abilities/rowScorch/copies/imagePaths) stays
// read-only — fix those in temp/gwent-card-data.json directly and rerun
// `npm run assets:build-gwent` instead.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { CARD_DEFS } from '../src/shared/games/gwent/engine/cardDefs';
import { CARD_TEXT_HU, LEADER_TEXT_HU } from '../src/shared/games/gwent/engine/cardTextTranslations';
import { LEADER_DEFS } from '../src/shared/games/gwent/engine/leaderDefs';
import type { CardDef, Faction, LeaderDef } from '../src/shared/games/gwent/engine/types';
import { ABILITY_LABELS_HU, CARD_KIND_LABELS_HU, cardMechanicLine, cardMechanicTag, rowLabel } from '../src/client/games/gwent/ui/cardDisplay';
import { factionLabel } from '../src/client/games/gwent/ui/factionDisplay';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_DIR = join(repoRoot, 'src/shared/games/gwent/engine');
const TRANSLATIONS_FILE = join(ENGINE_DIR, 'cardTextTranslations.ts');
const CARD_DEFS_FILE = join(ENGINE_DIR, 'cardDefs.ts');
const LEADER_DEFS_FILE = join(ENGINE_DIR, 'leaderDefs.ts');
const RESEARCH_JSON_FILE = join(repoRoot, 'temp/gwent-card-data.json');
const PUBLIC_DIR = join(repoRoot, 'public');
const PORT = 4600;

/** `--host 0.0.0.0` / `--host=0.0.0.0` / `--lan` (shorthand for the same) — see the file header's doc comment. Defaults to loopback-only. */
function resolveHost(): string {
  const args = process.argv.slice(2);
  if (args.includes('--lan')) return '0.0.0.0';
  const eqArg = args.find((a) => a.startsWith('--host='));
  if (eqArg) return eqArg.slice('--host='.length);
  const flagIndex = args.indexOf('--host');
  if (flagIndex !== -1 && args[flagIndex + 1]) return args[flagIndex + 1];
  return '127.0.0.1';
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }
  return addresses;
}

function runPrettier(file: string): void {
  try {
    execFileSync('npx', ['prettier', '--write', file], { cwd: repoRoot, stdio: 'ignore', shell: true });
  } catch (error) {
    console.warn(`Prettier reformat failed for ${file} (fájl mentve, csak nem lett újraformázva):`, error);
  }
}

// --- English cardText persistence: temp/gwent-card-data.json + cardDefs.ts/leaderDefs.ts ---
// id derivation and serialization duplicated from scripts/build-gwent-assets.mjs — MUST stay
// in sync with that script's own slugify/FACTION_SLUG/FACTION_JSON_TO_ENUM/formatCardDef/
// formatLeaderDef if those ever change there.
const FACTION_JSON_TO_ENUM: Record<string, Faction | 'Neutral'> = {
  'Northern Realms': 'NorthernRealms',
  'Nilfgaardian Empire': 'Nilfgaard',
  Monsters: 'Monsters',
  "Scoia'tael": 'Scoiatael',
  Neutral: 'Neutral',
};
const FACTION_SLUG: Record<Faction | 'Neutral', string> = {
  NorthernRealms: 'northern-realms',
  Nilfgaard: 'nilfgaard',
  Monsters: 'monsters',
  Scoiatael: 'scoiatael',
  Neutral: 'neutral',
};

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface ResearchCard {
  name: string;
  faction: string;
  cardText?: string;
  [key: string]: unknown;
}
interface ResearchData {
  cards: ResearchCard[];
  [key: string]: unknown;
}

const researchData: ResearchData = JSON.parse(readFileSync(RESEARCH_JSON_FILE, 'utf8'));
const researchById = new Map<string, ResearchCard>();
for (const card of researchData.cards) {
  const faction = FACTION_JSON_TO_ENUM[card.faction];
  if (!faction) continue;
  researchById.set(`${FACTION_SLUG[faction]}-${slugify(card.name)}`, card);
}

function tsString(value: string): string {
  return JSON.stringify(value);
}

function formatCardDef(def: CardDef): string {
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

function formatLeaderDef(def: LeaderDef): string {
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

function writeCardDefsFile(): void {
  const source = `// GENERATED FILE — do not hand-edit. Produced by \`node scripts/build-gwent-assets.mjs\`
// from temp/gwent-card-data.json + assets/Gwent/cards/ — see docs/gwent-0a-specifikacio.md §5.
// To fix a card's data, edit the research JSON (or this script's override tables) and rerun.
import type { CardDef } from './types';

export const CARD_DEFS: CardDef[] = [
${CARD_DEFS.map(formatCardDef).join('\n')}
];

export function getCardDef(id: string): CardDef {
  const def = CARD_DEFS.find((c) => c.id === id);
  if (!def) throw new Error(\`Unknown Gwent card: \${id}\`);
  return def;
}
`;
  // No prettier pass here, deliberately — build-gwent-assets.mjs doesn't run one
  // either (see its own `main()`), so the committed file is raw generator output
  // (double-quoted strings, unwrapped long array lines); matching that exactly
  // keeps a save's diff to just the one changed field, not a whole-file reformat.
  writeFileSync(CARD_DEFS_FILE, source, 'utf8');
}

function writeLeaderDefsFile(): void {
  const source = `// GENERATED FILE — do not hand-edit. Produced by \`node scripts/build-gwent-assets.mjs\`
// from temp/gwent-card-data.json + assets/Gwent/cards/ — see docs/gwent-0a-specifikacio.md §4.5.
import type { LeaderDef } from './types';

export const LEADER_DEFS: LeaderDef[] = [
${LEADER_DEFS.map(formatLeaderDef).join('\n')}
];

export function getLeaderDef(id: string): LeaderDef {
  const def = LEADER_DEFS.find((l) => l.id === id);
  if (!def) throw new Error(\`Unknown Gwent leader: \${id}\`);
  return def;
}
`;
  // Same reasoning as writeCardDefsFile — no prettier pass, matches build-gwent-assets.mjs.
  writeFileSync(LEADER_DEFS_FILE, source, 'utf8');
}

/** Best-effort — a card renamed/removed from the research JSON since the last rebuild just won't get the JSON-side update, the generated file still gets fixed. */
function updateResearchJsonCardText(id: string, newText: string | null): void {
  const entry = researchById.get(id);
  if (!entry) return;
  if (newText === null) delete entry.cardText;
  else entry.cardText = newText;
  writeFileSync(RESEARCH_JSON_FILE, `${JSON.stringify(researchData, null, 2)}\n`, 'utf8');
}

function persistEnglishText(kind: 'card' | 'leader', id: string, rawText: string): void {
  const newText = rawText.trim() ? rawText.trim() : null;
  if (kind === 'card') {
    const def = CARD_DEFS.find((c) => c.id === id);
    if (!def) throw new Error(`Unknown card id: ${id}`);
    def.cardText = newText;
    updateResearchJsonCardText(id, newText);
    writeCardDefsFile();
  } else {
    const def = LEADER_DEFS.find((l) => l.id === id);
    if (!def) throw new Error(`Unknown leader id: ${id}`);
    def.cardText = newText;
    updateResearchJsonCardText(id, newText);
    writeLeaderDefsFile();
  }
}

// Same heuristic used to originally split flavor-quote from rules-text during
// the Gwent-0c.2 translation pass — a card whose English `cardText` matches
// this has a real flavor quote that COULD have a Hungarian translation; one
// that doesn't (e.g. Schirrú — see cardTextTranslations.ts's own doc comment)
// legitimately has nothing to translate.
const FLAVOR_QUOTE_RE = /Flavor text:\s*"(.+)"\s*$/i;

function flavorQuoteHint(cardText: string | null): string | null {
  if (!cardText) return null;
  const match = cardText.match(FLAVOR_QUOTE_RE);
  return match ? match[1] : null;
}

// Mutable in-memory copies — every save updates these (so a page reload
// without restarting the process reflects the change) AND rewrites the file
// on disk (see persistTranslations below).
const cardHu = new Map(Object.entries(CARD_TEXT_HU));
const leaderHu = new Map(Object.entries(LEADER_TEXT_HU));

const TRANSLATIONS_HEADER = `/**
 * Hand-written Hungarian translations of the FLAVOR-TEXT-ONLY portion of each
 * card's/leader's \`cardText\` (Gwent-0c.2 §F, 6. pont: "az eredeti angol
 * szöveg csak a flavor text legyen és az legyen magyarra fordítva"). NOT a
 * generated file (unlike cardDefs.ts/leaderDefs.ts) — same hand-maintained
 * pattern as specialCardIds.ts/cardBackPaths.ts.
 *
 * A card/leader missing from these maps has no separate flavor quote in its
 * \`cardText\` (its whole \`cardText\` is a rules/ability description, already
 * covered in Hungarian by CardDetailModal's own facts list + the
 * ability-explanation panel — see cardDisplay.ts's ABILITY_DESCRIPTIONS_HU)
 * — CardDetailModal/LeaderDetailModal simply omit the flavor-text block for
 * those. Keys are \`CardDef.id\`/\`LeaderDef.id\`.
 *
 * Regenerated in full by scripts/gwent-card-editor.ts on every save (also
 * still safe to hand-edit directly) — never partially patched.
 */
`;

function serializeMap(varName: string, order: { id: string }[], map: Map<string, string>): string {
  const lines: string[] = [];
  for (const item of order) {
    const value = map.get(item.id)?.trim();
    if (value) lines.push(`  ${JSON.stringify(item.id)}: ${JSON.stringify(value)},`);
  }
  return `export const ${varName}: Record<string, string> = {\n${lines.join('\n')}\n};\n`;
}

function persistTranslations(): void {
  const content = `${TRANSLATIONS_HEADER}\n${serializeMap('CARD_TEXT_HU', CARD_DEFS, cardHu)}\n${serializeMap('LEADER_TEXT_HU', LEADER_DEFS, leaderHu)}`;
  writeFileSync(TRANSLATIONS_FILE, content, 'utf8');
  runPrettier(TRANSLATIONS_FILE);
}

function displayFactionLabel(faction: CardDef['faction']): string {
  return faction === 'Neutral' ? 'Semleges' : factionLabel(faction);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Status = 'ok' | 'missing' | 'none';

function statusOf(huText: string, hasQuote: boolean): Status {
  if (huText.trim()) return 'ok';
  return hasQuote ? 'missing' : 'none';
}

interface Filters {
  q: string;
  faction: string;
  onlyMissing: boolean;
}

function matchesFilters(name: string, faction: string, status: Status, filters: Filters): boolean {
  if (filters.q && !name.toLowerCase().includes(filters.q)) return false;
  if (filters.faction && faction !== filters.faction) return false;
  if (filters.onlyMissing && status !== 'missing') return false;
  return true;
}

function cardRow(def: CardDef): string {
  const hu = cardHu.get(def.id) ?? '';
  const quote = flavorQuoteHint(def.cardText);
  const status = statusOf(hu, quote !== null);
  const abilities = def.abilities.map((a) => ABILITY_LABELS_HU[a]).join(', ');
  const mechTag = cardMechanicTag(def);
  const mechLine = cardMechanicLine(def);
  const thumbs = def.imagePaths.map((p) => `<img src="${escapeHtml(p)}" loading="lazy" class="thumb" alt="${escapeHtml(def.name)}">`).join('');
  const facts = [CARD_KIND_LABELS_HU[def.kind], def.row ? rowLabel(def.row) : null, def.basePower !== null ? `${def.basePower} erő` : null, `${def.copies}× a pakliban`]
    .filter(Boolean)
    .join(' · ');
  return `
  <tr id="row-card-${def.id}" class="row status-${status}" data-name="${escapeHtml(def.name.toLowerCase())}" data-faction="${def.faction}" data-has-quote="${quote !== null ? '1' : '0'}">
    <td class="thumbs">${thumbs}</td>
    <td>
      <div class="name">${escapeHtml(def.name)}</div>
      <div class="cardid">${def.id}</div>
      <div class="facts">${facts}</div>
    </td>
    <td>${escapeHtml(displayFactionLabel(def.faction))}</td>
    <td>${abilities || '—'}${mechTag ? `<div class="tag">${escapeHtml(mechTag)}</div><div class="mechline">${escapeHtml(mechLine ?? '')}</div>` : ''}</td>
    <td>
      <form class="save-form" id="form-card-${def.id}" method="post" action="/save">
        <input type="hidden" name="kind" value="card">
        <input type="hidden" name="id" value="${def.id}">
        <label class="field-label">Angol forrásszöveg<textarea class="entext-input" name="enText" rows="3" placeholder="A fizikai lapon szereplő szöveg">${def.cardText ? escapeHtml(def.cardText) : ''}</textarea></label>
        <label class="field-label">Magyar flavor szöveg<textarea name="huText" rows="3" placeholder="${quote ? `Fordítsd le: “${escapeHtml(quote)}”` : 'Ha van külön flavor szöveg'}">${escapeHtml(hu)}</textarea></label>
        <div class="rowActions"><button type="submit">Mentés</button><span class="saved-indicator" hidden>Mentve ✓</span></div>
      </form>
    </td>
  </tr>`;
}

function leaderRow(def: LeaderDef): string {
  const hu = leaderHu.get(def.id) ?? '';
  const quote = flavorQuoteHint(def.cardText);
  const status = statusOf(hu, quote !== null);
  const thumbs = def.imagePaths.map((p) => `<img src="${escapeHtml(p)}" loading="lazy" class="thumb" alt="${escapeHtml(def.name)}">`).join('');
  return `
  <tr id="row-leader-${def.id}" class="row status-${status}" data-name="${escapeHtml(def.name.toLowerCase())}" data-faction="${def.faction}" data-has-quote="${quote !== null ? '1' : '0'}">
    <td class="thumbs">${thumbs}</td>
    <td>
      <div class="name">${escapeHtml(def.name)}</div>
      <div class="cardid">${def.id}</div>
      <div class="facts">Vezér</div>
    </td>
    <td>${escapeHtml(factionLabel(def.faction))}</td>
    <td><div class="mechline">${escapeHtml(def.abilityDescription)}</div></td>
    <td>
      <form class="save-form" id="form-leader-${def.id}" method="post" action="/save">
        <input type="hidden" name="kind" value="leader">
        <input type="hidden" name="id" value="${def.id}">
        <label class="field-label">Angol forrásszöveg<textarea class="entext-input" name="enText" rows="3" placeholder="A fizikai lapon szereplő szöveg">${def.cardText ? escapeHtml(def.cardText) : ''}</textarea></label>
        <label class="field-label">Magyar flavor szöveg<textarea name="huText" rows="3" placeholder="${quote ? `Fordítsd le: “${escapeHtml(quote)}”` : 'Ha van külön flavor szöveg'}">${escapeHtml(hu)}</textarea></label>
        <div class="rowActions"><button type="submit">Mentés</button><span class="saved-indicator" hidden>Mentve ✓</span></div>
      </form>
    </td>
  </tr>`;
}

const FACTIONS = ['NorthernRealms', 'Nilfgaard', 'Monsters', 'Scoiatael', 'Neutral'] as const;

function computeMissingCount(): number {
  const cardMissing = CARD_DEFS.filter((def) => statusOf(cardHu.get(def.id) ?? '', flavorQuoteHint(def.cardText) !== null) === 'missing').length;
  const leaderMissing = LEADER_DEFS.filter((def) => statusOf(leaderHu.get(def.id) ?? '', flavorQuoteHint(def.cardText) !== null) === 'missing').length;
  return cardMissing + leaderMissing;
}

function renderPage(filters: Filters): string {
  const cardStatuses = CARD_DEFS.map((def) => statusOf(cardHu.get(def.id) ?? '', flavorQuoteHint(def.cardText) !== null));
  const leaderStatuses = LEADER_DEFS.map((def) => statusOf(leaderHu.get(def.id) ?? '', flavorQuoteHint(def.cardText) !== null));
  const missingCount = computeMissingCount();

  const cardRows = CARD_DEFS.filter((def, i) => matchesFilters(def.name, def.faction, cardStatuses[i], filters))
    .map(cardRow)
    .join('');
  const leaderRows = LEADER_DEFS.filter((def, i) => matchesFilters(def.name, def.faction, leaderStatuses[i], filters))
    .map(leaderRow)
    .join('');

  const factionOptions = FACTIONS.map(
    (f) => `<option value="${f}" ${filters.faction === f ? 'selected' : ''}>${escapeHtml(displayFactionLabel(f))}</option>`,
  ).join('');

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<title>Gwent kártya-szerkesztő</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="topbar">
  <h1>Gwent kártya-szerkesztő</h1>
  <p class="subtitle">${CARD_DEFS.length} kártya + ${LEADER_DEFS.length} vezér · <strong id="missingCount" class="${missingCount > 0 ? 'warn' : ''}">${missingCount} hiányzó fordítás</strong> — az angol forrásszöveg és a magyar flavor szöveg szerkeszthető itt (mindkettő mentése azonnal a valódi fájlokba írja: temp/gwent-card-data.json + cardDefs.ts/leaderDefs.ts/cardTextTranslations.ts). Minden más mező (erő, sor, képességek, kép) csak megtekinthető.</p>
  <form class="filters" method="get" action="/">
    <input type="search" name="q" placeholder="Keresés név szerint…" value="${escapeHtml(filters.q)}">
    <select name="faction"><option value="">Minden frakció</option>${factionOptions}</select>
    <label><input type="checkbox" name="missing" value="1" ${filters.onlyMissing ? 'checked' : ''}> csak a hiányzók</label>
    <button type="submit">Szűrés</button>
  </form>
</header>
<main>
<table>
  <thead><tr><th>Kép</th><th>Név</th><th>Frakció</th><th>Képességek / mechanika</th><th>Angol forrásszöveg / Magyar flavor szöveg</th></tr></thead>
  <tbody>
    ${cardRows}
    ${leaderRows}
  </tbody>
</table>
${cardRows === '' && leaderRows === '' ? '<p class="empty">Nincs a szűrésnek megfelelő kártya.</p>' : ''}
</main>
<div id="editModal" class="edit-modal">
  <div class="edit-modal-content">
    <button type="button" id="editModalClose" class="edit-modal-close" aria-label="Bezárás">✕</button>
    <div class="edit-modal-nav">
      <button type="button" id="editModalPrev" class="nav-btn">‹ Előző</button>
      <span id="editModalTitle" class="edit-modal-title"></span>
      <button type="button" id="editModalNext" class="nav-btn">Következő ›</button>
    </div>
    <div class="edit-modal-body">
      <img id="editModalImg" class="edit-modal-img" src="" alt="">
      <div id="editModalFormSlot" class="edit-modal-form-slot"></div>
    </div>
  </div>
</div>
<script>
// Thumbnail click -> the full-size card image next to ITS OWN row's save
// form (moved into the modal via appendChild, not cloned — so typing/saving
// there is the exact same form the table row uses, no state to keep in
// sync). Closing without saving moves the form back to its original table
// cell. The point is being able to read the physical card's own printed
// text while transcribing it into the English/Hungarian boxes. Prev/Next
// walk the CURRENTLY VISIBLE rows (tbody's DOM order already reflects the
// active search/faction/missing filters — no separate list to keep in sync).
const editModal = document.getElementById('editModal');
const editModalImg = document.getElementById('editModalImg');
const editModalFormSlot = document.getElementById('editModalFormSlot');
const editModalTitle = document.getElementById('editModalTitle');
const editModalPrev = document.getElementById('editModalPrev');
const editModalNext = document.getElementById('editModalNext');
const editableRows = Array.from(document.querySelectorAll('tbody tr'));
let movedForm = null;
let movedFormHome = null;
let currentRow = null;

function closeEditModal() {
  if (movedForm && movedFormHome) movedFormHome.appendChild(movedForm);
  movedForm = null;
  movedFormHome = null;
  currentRow = null;
  editModal.classList.remove('open');
  editModalImg.src = '';
}

function openRow(tr, thumbImg) {
  const form = tr.querySelector('.save-form');
  if (movedForm && movedForm !== form && movedFormHome) movedFormHome.appendChild(movedForm);
  const img = thumbImg || tr.querySelector('.thumb');
  movedForm = form;
  movedFormHome = form.parentElement;
  editModalFormSlot.appendChild(form);
  editModalImg.src = img.src;
  editModalImg.alt = img.alt;
  editModalTitle.textContent = tr.querySelector('.name').textContent;
  editModal.classList.add('open');
  currentRow = tr;
  const index = editableRows.indexOf(tr);
  editModalPrev.disabled = index <= 0;
  editModalNext.disabled = index === -1 || index >= editableRows.length - 1;
}

function navigate(delta) {
  const index = editableRows.indexOf(currentRow);
  const target = editableRows[index + delta];
  if (target) openRow(target);
}

document.querySelectorAll('.thumb').forEach((img) => {
  img.addEventListener('click', () => openRow(img.closest('tr'), img));
});
document.getElementById('editModalClose').addEventListener('click', closeEditModal);
editModalPrev.addEventListener('click', () => navigate(-1));
editModalNext.addEventListener('click', () => navigate(1));
editModal.addEventListener('click', (event) => {
  if (event.target === editModal) closeEditModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeEditModal();
});

// No page reload on save — that used to close the edit modal on every save
// (the felhasználó's explicit complaint: "zavaró, hogy mindig újra kell
// nyitni a modált mentés után"). The server's JSON response carries the
// freshly recomputed status instead, so the row's border color and the
// header's missing-count can be patched in place, whether the form is
// currently sitting in its table row or moved into the modal.
const missingCountEl = document.getElementById('missingCount');
document.querySelectorAll('.save-form').forEach((form) => {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const indicator = form.querySelector('.saved-indicator');
    button.disabled = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'fetch' },
        body: new URLSearchParams(new FormData(form)),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const row = document.getElementById('row-' + form.elements.kind.value + '-' + form.elements.id.value);
      if (row) {
        row.dataset.hasQuote = data.hasQuote ? '1' : '0';
        row.classList.remove('status-ok', 'status-missing', 'status-none');
        row.classList.add('status-' + data.status);
      }
      missingCountEl.textContent = data.missingCount + ' hiányzó fordítás';
      missingCountEl.classList.toggle('warn', data.missingCount > 0);
      indicator.hidden = false;
      setTimeout(() => { indicator.hidden = true; }, 1500);
    } catch (error) {
      alert('Mentés sikertelen: ' + error);
    } finally {
      button.disabled = false;
    }
  });
});
</script>
</body>
</html>`;
}

const PAGE_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; background: #1b1712; color: #e9dfc9; }
  .topbar { position: sticky; top: 0; z-index: 2; background: #241d15; border-bottom: 1px solid #4a3b26; padding: 0.9rem 1.2rem; }
  .topbar h1 { margin: 0 0 0.2rem; font-size: 1.3rem; }
  .subtitle { margin: 0 0 0.6rem; font-size: 0.85rem; color: #b9ab8c; }
  .subtitle .warn { color: #e0a94a; }
  .filters { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
  .filters input[type="search"] { padding: 0.35rem 0.6rem; min-width: 16rem; }
  .filters select, .filters input, .filters button { background: #2c2417; color: #e9dfc9; border: 1px solid #4a3b26; border-radius: 4px; padding: 0.35rem 0.6rem; font-size: 0.85rem; }
  .filters label { font-size: 0.85rem; display: flex; align-items: center; gap: 0.3rem; }
  main { padding: 1rem; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: #b9ab8c; padding: 0.4rem 0.6rem; border-bottom: 1px solid #4a3b26; position: sticky; top: 4.6rem; background: #1b1712; }
  tbody tr { border-bottom: 1px solid #33291b; border-left: 3px solid transparent; }
  tr.status-ok { border-left-color: #4e8a4e; }
  tr.status-missing { border-left-color: #c9822f; }
  tr.status-none { border-left-color: #4a3b26; }
  td { padding: 0.5rem 0.6rem; vertical-align: top; font-size: 0.85rem; }
  .thumbs { display: flex; gap: 0.25rem; flex-wrap: wrap; width: 5.5rem; }
  .thumb { width: 2.5rem; height: 3.5rem; object-fit: cover; border-radius: 3px; border: 1px solid #4a3b26; cursor: zoom-in; }
  .thumb:hover { border-color: #e0a94a; }
  .edit-modal { display: none; position: fixed; inset: 0; background: rgba(10, 8, 5, 0.88); z-index: 10; padding: 3rem; }
  .edit-modal.open { display: flex; align-items: center; justify-content: center; }
  .edit-modal-content { position: relative; display: flex; flex-direction: column; gap: 0.9rem; max-width: 95vw; max-height: 88vh; background: #241d15; border: 1px solid #4a3b26; border-radius: 8px; padding: 1.2rem; box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.6); }
  .edit-modal-nav { display: flex; align-items: center; justify-content: center; gap: 1rem; padding-right: 1.8rem; }
  .edit-modal-title { font-weight: 600; font-size: 0.95rem; min-width: 10rem; text-align: center; }
  .nav-btn { background: #2c2417; color: #e9dfc9; border: 1px solid #4a3b26; border-radius: 4px; padding: 0.35rem 0.8rem; cursor: pointer; font-size: 0.85rem; }
  .nav-btn:hover:not(:disabled) { border-color: #e0a94a; }
  .nav-btn:disabled { opacity: 0.35; cursor: default; }
  .edit-modal-body { display: flex; gap: 1.2rem; align-items: flex-start; overflow: auto; }
  .edit-modal-img { max-width: 45vw; max-height: 78vh; object-fit: contain; border-radius: 6px; }
  .edit-modal-form-slot { width: 22rem; max-width: 40vw; }
  .edit-modal-form-slot .save-form { display: flex; flex-direction: column; }
  .edit-modal-form-slot textarea { min-height: 8rem; font-size: 0.95rem; }
  .edit-modal-close { position: absolute; top: 0.5rem; right: 0.5rem; background: #2c2417; color: #e9dfc9; border: 1px solid #4a3b26; border-radius: 4px; width: 1.8rem; height: 1.8rem; cursor: pointer; font-size: 0.9rem; line-height: 1; }
  .edit-modal-close:hover { border-color: #e0a94a; }
  .name { font-weight: 600; }
  .cardid { font-size: 0.7rem; color: #8a7c60; }
  .facts { font-size: 0.75rem; color: #b9ab8c; margin-top: 0.15rem; }
  .tag { display: inline-block; font-size: 0.7rem; font-weight: 600; color: #e0a94a; margin-top: 0.2rem; }
  .mechline { font-size: 0.75rem; color: #b9ab8c; max-width: 18rem; }
  .field-label { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.03em; color: #8a7c60; margin-bottom: 0.35rem; }
  textarea { display: block; width: 100%; min-width: 18rem; background: #2c2417; color: #e9dfc9; border: 1px solid #4a3b26; border-radius: 4px; padding: 0.4rem; font: inherit; resize: vertical; margin-top: 0.2rem; }
  textarea.entext-input { color: #a99b7e; font-style: italic; }
  .rowActions { display: flex; align-items: center; gap: 0.5rem; }
  .rowActions button { background: #4e6a8a; color: white; border: none; border-radius: 4px; padding: 0.3rem 0.8rem; cursor: pointer; font-size: 0.8rem; }
  .rowActions button:disabled { opacity: 0.6; cursor: default; }
  .saved-indicator { color: #7fc07f; font-size: 0.8rem; }
  .empty { color: #8a7c60; padding: 2rem; text-align: center; }
`;

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/assets', express.static(join(PUBLIC_DIR, 'assets')));

app.get('/', (req: Request, res: Response) => {
  const filters: Filters = {
    q: String(req.query.q ?? '').trim().toLowerCase(),
    faction: String(req.query.faction ?? ''),
    onlyMissing: req.query.missing === '1',
  };
  res.type('html').send(renderPage(filters));
});

function saveHuText(kind: 'card' | 'leader', id: string, huText: string | undefined): void {
  const map = kind === 'card' ? cardHu : leaderHu;
  const text = (huText ?? '').trim();
  if (text) map.set(id, text);
  else map.delete(id);
  persistTranslations();
}

/** Fresh status for the JSON (fetch) save response — see its call site's own doc comment. */
function currentSaveStatus(kind: 'card' | 'leader', id: string) {
  const def = kind === 'card' ? CARD_DEFS.find((c) => c.id === id) : LEADER_DEFS.find((l) => l.id === id);
  const hu = (kind === 'card' ? cardHu : leaderHu).get(id) ?? '';
  const hasQuote = flavorQuoteHint(def?.cardText ?? null) !== null;
  return { status: statusOf(hu, hasQuote), hasQuote, missingCount: computeMissingCount() };
}

app.post('/save', (req: Request, res: Response) => {
  const { kind, id, huText, enText } = req.body as { kind?: string; id?: string; huText?: string; enText?: string };
  if ((kind !== 'card' && kind !== 'leader') || typeof id !== 'string' || !id) {
    res.status(400).send('Érvénytelen kérés');
    return;
  }

  try {
    // English text first — its own status feeds the Hungarian "missing" heuristic below.
    if (typeof enText === 'string') persistEnglishText(kind, id, enText);
    saveHuText(kind, id, huText);
  } catch (error) {
    res.status(400).send(String(error));
    return;
  }

  if (req.headers['x-requested-with'] === 'fetch') {
    // JSON, not 204 — the modal stays open across a save (the felhasználó's
    // explicit ask: reloading the whole page used to kick them back to the
    // table and close it), so the client needs fresh status info to patch
    // the row's border color and the header's missing-count in place.
    res.json(currentSaveStatus(kind, id));
    return;
  }
  res.redirect(303, req.get('referer') ?? '/');
});

const host = resolveHost();
app.listen(PORT, host, () => {
  console.log(`Gwent kártya-szerkesztő fut: http://127.0.0.1:${PORT}`);
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.log(`Hálózaton (LAN) is elérhető — nincs bejelentkezés, csak megbízható hálózaton használd:`);
    for (const address of lanAddresses()) console.log(`  http://${address}:${PORT}`);
  }
});
