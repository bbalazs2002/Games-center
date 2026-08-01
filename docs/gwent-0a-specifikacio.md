# Gwent-0a — Specifikáció: helyi vertikum (motor + kártya-renderer + hot-seat)

**Státusz:** Gwent-0a.1 (deck-építés) IMPLEMENTÁLVA (2026-07-31, playtest-javítási kör + kártyaszöveg-kutatás 2026-08-01) — kártya-adatbázis/asset pipeline (5. szakasz), a `CardGrid` (újrahasználható ui-kit komponens) alapú frakció→vezér→deck-építő UI, `deckRules.ts` (pakli-validáció), localStorage-perzisztencia, `gamesRegistry` regisztráció, 33 vitest teszt + élő böngészős smoke teszt mind kész. Gwent-0a.2 (a tényleges parti-motor) MÉG NEM kezdődött el. Lásd 9. szakasz (9.6: 2026-08-01-i javítási kör, 9.7: kártyaszöveg-kutatás).
**Utolsó frissítés:** 2026-08-01
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (G — Egyedi komplex kártyajáték klaszter, Gwent egyetlen tagja — "A) klaszter kártyamotorjára épül, de bonyolultabb szabályrendszer (sorok, frakciók, képességek)"), `temp/gwent-card-data.json` (a kártya-adatbázis kutatás eredménye, lásd 5. szakasz)

> **Pontosítás a hatókörről (2026-07-30):** a felhasználó kifejezetten a **Witcher 3: Wild Hunt alapjátékában** (a két történeti DLC-vel, Hearts of Stone-nal és Blood and Wine-nal együtt) ténylegesen játszható Gwent-mini játékot kérte — NEM az önálló CD Projekt Red "Gwent" kártyajátékot (aminek gyökeresen más, sokszor patchelt szabályai vannak), és NEM a Skellige frakciót tartalmazó későbbi verziót. Ez a döntés a felhasználó saját, fizikai kártyakészletéből (`assets/Gwent/cards/`, gitignore-olt) származó szabálykönyv-képek elolvasása UTÁN, egy tévesztés tisztázásaként született — a mappában eredetileg egy "Bleeding" variánsos, Skellige-t is tartalmazó kártyakészlet volt, amit a felhasználó időközben egy tisztább, 5 frakciós (a 4 alap + Skellige) készletre cserélt. **A Skellige-t a felhasználó kérésére egyelőre kihagyjuk** (nincs hozzá egységes kártya-gyűjtemény), de a frakció-rendszert úgy tervezzük, hogy egy 5. frakció később, kódmódosítás nélkül (vagy minimális bővítéssel) hozzáadható legyen — lásd 3.2/9. szakasz.

## 1. Cél és hatókör

**A felhasználó kérésére (2026-07-30) Gwent-0a KÉT alfázisra bomlik** (a Hotel-0c.1/0c.2 mintájára — ugyanaz a dokumentum, két egymásra épülő, önállóan lezárható munkakör):

**Gwent-0a.1 — deck-építés (ELSŐ implementációs kör, EZ a következő lépés):**
- Frakció-választás + vezér-választás (4.5. szakasz) UI-ja.
- Deck-építő: a választott frakció (+ Neutral) kártyáinak böngészése, egy szabályos (a hivatalos létszám-/példányszám-korlátoknak megfelelő) pakli összeállítása.
- A kártya-adatbázis (`temp/gwent-card-data.json` kutatás eredményéből előállított, végleges `cardDefs.ts`, a Ramses `treasureConfigs.ts` mintájára) és a hozzá tartozó `leaderDefs.ts` (4.5. szakasz).
- Asset pipeline: a felhasználó nyers kártyaképeinek (`assets/Gwent/cards/`, gitignore-olt) feldolgozása webre optimalizált, verziózott formába (`public/assets/gwent/`), duplikátum-szűréssel (lásd 5.2).
- **Ebben a körben MÉG NEM kell a tényleges parti-motor** (3-kör/harci sorok/kártya-képességek) — csak a deck összeáll, és valahol (helyi állapot/localStorage) elmentődik, amit a 0a.2 majd felhasznál.

**Gwent-0a.2 — a tényleges parti-motor (MÁSODIK kör, a 0a.1 lezárása UTÁN):**
- A motor (state, action-ok, reducer) — a teljes alapjáték szabályai (3 harci sor, időjárás-kártyák, speciális kártyák, mulligan, 3 kör/2 győzelem rendszer, vezér-képességek).
- 2D kártya-renderer (ÚJ renderer-típus — ez az első nem rács-alapú, nem 3D játék a platformon; indoklás: 6. szakasz).
- 2 fős hot-seat körvezérlés, a 0a.1-ben megépített deckekkel.

**Nincs hatókörben (későbbi fázis, a Hotel/Ramses mintáját követve):**
- **Gwent-0b — multiplayer** (a meglévő `GameRoom`/Colyseus infrastruktúra újrahasználatával, Ramses-0b mintáján).
- **Gwent-0c — AI ellenfél**.
- **Skellige frakció** — a fenti pontosítás szerint, bővíthető tervezéssel előkészítve, de nem implementálva.

## 2. Szabályok összefoglalása

**Forrás:** a felhasználó saját, fizikai kártyakészletéhez tartozó szabálykönyv-képek (`assets/Gwent/cards/Rules/*.png`), NEM emlékezetből/általános tudásból — ez a szabály minden korábbi játék bevezetésekor is érvényesült (lásd `feedback_boardgame_workflow` memória: Hotel/Ramses esetén is tévesnek bizonyult az "ismert névből" feltételezett szabály).

- **Cél:** 2 játékos, aki 3 körből 2-t megnyer, nyer. Mindkét játékos 2 élettel indul, minden elvesztett kör 1 életbe kerül; 0 életnél a másik játékos nyer. **A döntetlen kör IS elvesztett körnek számít mindkét oldalra (megerősítve, 2026-07-30)** — tehát alapesetben egy döntetlen kör után MINDKÉT játékos veszít 1 életet, kivéve ha az egyik oldal Nilfgaard bónusszal rendelkezik (akkor ő automatikusan megnyeri, a másik veszít).
- **Frakciók:** minden játékos választ egy frakciót (Northern Realms, Nilfgaardian Empire, Monsters, Scoia'tael), ami saját bónusszal és saját kártyákkal jár:
  | Frakció | Bónusz |
  |---|---|
  | Northern Realms | Minden megnyert kör után +1 lapot húz a saját paklijából. |
  | Nilfgaardian Empire | Egy döntetlenre végződő kört automatikusan megnyer. |
  | Monsters | Minden kör után 1 véletlenszerű egységkártyája a táblán marad (nem kerül a dobott lapok közé). |
  | Scoia'tael | Minden kör elején ez a játékos dönti el, ki kezd. |
- **Kezdő kéz:** mindkét játékos húz 10 lapot a saját paklijából, majd legfeljebb 2 lapot lecserélhet (mulligan) újakra.
- **Harci sorok:** az egységkártyák három sor egyikébe kerülnek: Close Combat (Melee), Ranged Combat, Siege Combat. A sorok együttes ereje dönt — a magasabb ÖSSZ erejű játékos nyeri a kört.
- **Kör menete:** a játékosok felváltva vagy lejátszanak egy lapot, vagy passzolnak (a passzolás véglegesnek — a kör hátralévő részére a játékos többé nem lép). A kör akkor ér véget, ha mindkét játékos passzolt.
- **Kártya-képességek** (a `Rules/*.png` "Card Abilities" oldala szerint, minden frakcióra egységesen):
  - **Hero:** semmilyen speciális kártya/képesség nem hat rá (időjárás, Scorch, Horn stb. mind kihagyja).
  - **Spy:** az ELLENFÉL oldalára kerül lejátszáskor (az ELLENFÉL össz-erejéhez számít!), a lejátszó játékos ennek fejében 2 lapot húz a saját paklijából.
  - **Tight Bond:** minden, ugyanabban a sorban lévő, AZONOS NEVŰ kártya ereje megduplázódik (mindegyiké, egymástól függetlenül).
  - **Muster:** lejátszáskor a pakliból (és kézből) azonnal lejátszódik minden azonos nevű kártya is. A dobottak közül nem. Még pontosítsuk az azonos nevű csoportokat a tervezés során.
  - **Morale Boost:** +1 erő minden MÁSIK (nem saját maga) egységnek ugyanabban a sorban.
  - **Medic:** lejátszáskor a saját dobott lapjai közül egyet választva azonnal lejátszhat (Hero és nem-egység speciális kártya nem választható).
  - **Agile:** Close Combat VAGY Ranged Combat sorba is kijátszható, a játékos választása szerint; lejátszás után nem mozgatható át.
  - **Horn (Commander's Horn, speciális kártya):** megduplázza az adott sor MINDEN egységének erejét; soronként legfeljebb 1 aktív Horn-hatás.
- **Időjárás-kártyák** (Biting Frost / Impenetrable Fog / Torrential Rain, speciális kártyák): a megfelelő sor (Close/Ranged/Siege) MINDKÉT játékos minden egységét 1 erőre állítja, amíg egy Clear Weather le nem törli az összes aktív időjárás-hatást. Hero-kártyákra nincs hatással. A bónuszokra sincs hatással, csak az egységek alap erejét állítja 1-re, tehát például egy Horn kártya ugyanúgy megduplázza a kártya erejét (Pl.: Van egy 5 erősségű kártya. Leraknak a sorára egy időjárás lapot, az ereje 1-re csökken. Leraknak a sorára egy Horn lapot is, az ereje megduplázódik, tehát összesen 2 lesz.)
- **Decoy** (speciális kártya): becserélhető egy saját, már lejátszott kártyára — az visszakerül a kézbe (tipikusan egy Spy/Muster újra-triggereléséhez, vagy egy értékes kártya megvédéséhez a kör vége előtt).
- **Scorch** (speciális kártya, lejátszás után eldobódik): elpusztítja a TELJES TÁBLA (mindkét játékos, mind a 3 sor) legerősebb kártyáját/kártyáit — döntetlen esetén mindegyik meghal.
- **RowScorch** (ÚJ, a kutatás során felfedezett kártya-egyedi képesség, lásd 4.3 — nem a fenti hivatalos "Card Abilities" listából, hanem konkrét kártyák saját szövege): néhány kártya (Schirrú, Toad, Villentretenmerth) egy MEGADOTT sorra korlátozott, önindukált Scorch-ot hordoz — csak akkor sül el, ha az ELLENFÉL adott sorának össz-ereje eléri a 10-et, és csak azt az egy sort érinti.
- **Pakli-építés szabálya (2026-07-30, WEB-forrásból, mert a felhasználó fizikai szabálykönyv-képei ezt NEM tartalmazzák — a Witcher 3-ban nincs beépített deck-építő UI, ez a digitalizáció saját kiegészítése):** a felhasználó kifejezetten kérte az utánanézést, mert emlékezete szerint van minimum lapszám és a Hero kártyákra külön szabály vonatkozik. Két egymástól független forrás (a keresési összefoglaló és a hisevilness.com részletes útmutató, lásd lent) egybehangzóan megerősíti: **egy paklinak legalább 22 NEM-Hero egységkártyát kell tartalmaznia** — a Hero-képességű kártyák (`abilities` tartalmazza a `'Hero'`-t) NEM számítanak bele ebbe a 22-be, külön kategóriaként kezelendők. Felső korlát nincs dokumentálva (a valódi játékban a teljes gyűjteményed a "paklid", nincs mesterséges max); a speciális kártyák (időjárás/Decoy/Horn/Scorch) száma szabadon választható, csak az egyes `CardDef.copies` korlát érvényes rájuk (lásd 3.1/5.1). Pontosan 1 vezér (leader) választandó a 4.5-ben leírtak szerint. Forrás: [hisevilness.com — Witcher 3: a comprehensive guide to Gwent](https://www.hisevilness.com/articles/gaming/witcher-3-a-comprehensive-guide-to-gwent.html) ("you need a minimum of 22 cards in each deck").

## 3. Adatmodell terve

### 3.1 Kártya-definíció és -példány

```typescript
export type Faction = 'NorthernRealms' | 'Nilfgaard' | 'Monsters' | 'Scoiatael';
// Neutral kártyák (bármely frakcióval játszhatók) faction: 'Neutral'-lel jelölve.

export type Row = 'Melee' | 'Ranged' | 'Siege';

export type CardKind = 'Unit' | 'Weather' | 'Decoy' | 'Horn' | 'Scorch';

export type UnitAbility = 'Hero' | 'Spy' | 'TightBond' | 'Muster' | 'MoraleBoost' | 'Medic' | 'Agile';

/**
 * A kutatás során talált, a hivatalos "Card Abilities" listán KÍVÜLI, kártya-egyedi
 * mechanikák — lásd 4.3. Nem a `UnitAbility` unió tagja, mert nem egy általános,
 * sok kártyán ismétlődő szabály, hanem néhány konkrét kártya saját szövege.
 */
export interface RowScorchEffect {
  targetRow: Row; // melyik ellenfél-sort érinti (Schirrú: Siege, Toad: Ranged, Villentretenmerth: Melee)
  threshold: number; // az ellenfél adott sorának el kell érnie ezt az össz-erőt (mindháromnál 10)
}

/** Statikus kártya-katalógus bejegyzés — a treasureConfigs.ts (Ramses) mintájára, nem játékállapot. */
export interface CardDef {
  id: string; // stabil, kötőjeles azonosító, pl. "northern-realms-ballista"
  name: string;
  faction: Faction | 'Neutral';
  kind: CardKind;
  row: Row | null; // null a nem-egység kártyáknál ÉS az Agile egységeknél (nincs fix soruk — lásd `abilities: ['Agile']`, a tényleges sor a lejátszáskori játékos-választás, CardInstance-en tárolva, nem CardDef-en)
  basePower: number | null; // null a nem-egység kártyáknál
  abilities: UnitAbility[];
  rowScorch: RowScorchEffect | null; // csak Schirrú/Toad/Villentretenmerth-nél nem null
  weatherRow: Row | 'AllRows' | null; // csak Weather kind-nál: melyik sort fagyasztja/ködösíti/áztatja (Clear Weather: 'AllRows' töröl mindent)
  copies: number; // hivatalos szabály szerinti példányszám a deckben (NEM a fizikai kártyakép-fájlok száma, lásd 5.1)
  imagePaths: string[]; // 1-N elemű (pontosítva 2026-07-31, lásd 5.2: MD5-vizsgálat sok szokásos egységkártyánál is több egyedi művészeti variánst talált, nem csak a korábban gyanított pár kártyánál) — több elem esetén a kliens az egyiket választja megjelenítéskor (lásd 5.2)
}
```

### 3.2 Játékállapot

```typescript
export interface CardInstance {
  instanceId: string; // egy adott parti egy konkrét fizikai lapja — a defId ÖNMAGÁBAN nem elég, mert egy CardDef-ből több copies is a pakliban van
  defId: string; // -> CardDef.id
  chosenRow: Row | null; // csak Agile kártyáknál értelmes (a lejátszáskori sor-választás) — minden más egységnél a CardDef.row-ból származtatva, itt nem duplikálva
}

export interface BoardRowState {
  cards: CardInstance[];
  hornActive: boolean; // egy Horn-kártya le lett-e játszva ebbe a sorba ebben a körben
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  faction: Faction;
  deck: CardInstance[]; // lefordítva, húzási sorrendben (a szerver oldalon van csak valódi sorrend, kliens csak darabszámot lát — Ramses-0b mintája)
  hand: CardInstance[];
  discard: CardInstance[];
  board: Record<Row, BoardRowState>;
  lives: number; // 2-vel indul
  roundsWon: number;
  passed: boolean; // ebben a körben már passzolt-e
  mulligansLeft: number; // 2-vel indul, a kezdő kéz felépítésekor
}

export type GwentPhase = 'MULLIGAN' | 'ROUND_IN_PROGRESS' | 'ROUND_RESOLVED' | 'FINISHED';

export interface GwentState {
  players: [PlayerState, PlayerState];
  currentPlayerIndex: number;
  round: number; // 1, 2 vagy 3
  activeWeatherRows: Row[]; // 0-3 elem, melyik sor(ok) állnak épp időjárás-hatás alatt
  phase: GwentPhase;
  winnerIds: PlayerId[]; // csak FINISHED állapotban értelmes
  log: GwentLogEntry[];
}
```

**Erő-számítás** (`computeCardPower`, tiszta függvény, nem tárolt state) — **a sorrend megerősítve (2026-07-30):** `basePower` → ha a sor időjárás alatt áll ÉS a kártya nem Hero → **az alap erő (baseStrength) 1-re módosul, minden további bónusz erre az 1-re épül** → Tight Bond (azonos nevű/defId-jű, ugyanabban a sorban lévő kártyák duplázása) → Morale Boost (+1 minden más egységnek a sorban) → Horn (a sor duplázása, ha aktív). Példa: egy 5 erejű kártya időjárás alatt 1-re esik, majd egy Horn megduplázza → 2. Ez a sorrend (Weather → TightBond → MoraleBoost → Horn) VÉGLEGES, nem nyitott kérdés többé.

### 3.3 Rejtett állapot és játékos-specifikus nézetek (megerősítve 2026-07-30)

A `GwentState`/`PlayerState` a fenti 3.2-es definíció szerint a **teljes, leplezetlen igazságot** tárolja (mindkét kéz, mindkét pakli sorrendje) — ez a szerver-oldali motor (reducer) belső állapota, SOSEM kerül ebben a formában a hálózaton át egyik kliensre sem. Ez a Ramses-mintát (`toPublicRamsesState`, lásd `docs/ramses-0c-ai-specifikacio.md` §3.2 és `RamsesRoom.ts`) viszi tovább, de egy lényeges ponton túl is lép rajta:

- **Ramses-nél** a rejtett infó (le nem fordított kincsek) egyetlen, MINDENKI számára azonos módon maszkolt nézetként létezik (`toPublicRamsesState`) — a cél a fair play (az AI se lásson többet egy embernél), nem játékos-specifikus eltérés.
- **Gwent-nél** ez nem elég: a két játékos kezében LÉNYEGESEN MÁS információ van, és mindkettő számára TITKOS a másiké — tehát nem egy közös maszkolt nézet kell, hanem **kliensenként eltérő nézet** (A játékos látja a saját kezét + B kézméretét számként; B fordítva).

**Ami rejtett marad (szerver kényszeríti ki, sosem a kliens):**
- **Saját kéz:** csak a tulajdonos látja a konkrét lapokat; az ellenfél csak a lapszámot (`hand.length`) kapja.
- **Pakli sorrendje/tartalma:** MINDKÉT paklié rejtve marad MINDKÉT kliens elől (a húzás véletlenszerű) — a kliens csak a paklik hosszát látja, a Ramses-0b-nél már bevált "csak darabszám" konvenció szerint (lásd 3.2, `deck` mező kommentje).
- **Vezér (`leaderId`) és a `discard`:** ezek a valódi Gwent szabálya szerint mindvégig NYILVÁNOSAK (a vezért a parti elején mindkét fél felfedi; a temető szabadon megnézhető) — tehát ezek NEM esnek maszkolás alá, teljes egészében szinkronizálódnak mindkét kliensre.

**A kényszerítés helye:** kizárólag a szerver-oldali szinkron-réteg felelőssége, sosem a kliens UI-é (a kliens elvileg akár a nyers WebSocket-üzeneteket is kiolvashatná, ha a szerver elküldené — a titkosság ILLÚZIÓJA a UI-ban nem elég). Mivel a projekt már `@colyseus/schema@^3.0.0` + `colyseus@^0.16.0`-t használ, ez a verzió natívan támogatja a kliensenkénti `StateView`-t (`@view()` dekorátor + `client.view.add(instance)`) — ez lesz a Gwent motor számára a kézenfekvő mechanizmus, ahelyett hogy (mint eddig minden játéknál, Ramsest is beleértve) EGYETLEN, minden kliensnek azonos `this.state` szinkronizálódna. Ez azt jelenti, hogy a `GameRoom` bázisosztály jelenlegi `syncState(): void` szerződése (ami egyetlen megosztott Colyseus-schema-t ír) a `GwentRoom`-nál valószínűleg bővítésre szorul egy kliensenkénti nézet-hozzárendelési ponttal — ennek pontos kialakítása a Gwent-0b (multiplayer) implementációjának a feladata, ott dől el ténylegesen.

**Hatókör-pontosítás:** ez a szakasz a Gwent-0b (multiplayer, jelenleg NEM ütemezett, lásd 1. szakasz) tényleges kényszerítési mechanizmusát írja le előre, hogy a 3.2-es adatmodell ne kelljen utólag átalakítani. A Gwent-0a.2 hot-seat módban (egy közös eszközön, váltott ülés) a szerver-oldali kényszerítés értelmezhetetlen — ott legfeljebb UI-szintű konvenció (pl. "fordítsd el a képernyőt" jellegű, Ramses/Dáma hot-seat mintájára) jöhet szóba, ha a felhasználó ezt igényli; ez nem biztonsági garancia, csak játékélmény-kérdés, és nem képezi ennek a szakasznak a tárgyát.

### 3.4 Bővíthetőség egy jövőbeli 5. (Skellige) frakcióhoz

A `Faction` unió típus bővítése (`| 'Skellige'`) + a hozzá tartozó `CardDef` bejegyzések felvétele a katalógusba az egyetlen érintett pont — a reducer/rules logika sehol nem tételez fel "pontosan 4 frakció"-t (a frakció-bónusz egy `FACTION_BONUS: Record<Faction, ...>` lookup, nem egy 4-ágú switch). A Skellige-specifikus mechanikák (Skellige Storm időjárás — egyszerre Ranged ÉS Siege sort érinti; Mardroeme berserker-átalakítás; sírkert-visszatöltés kör-bónusz) új `weatherRow`/`RowScorch`-hoz hasonló, kártya-egyedi kiegészítést igényelnének majd, de ez már Gwent-0a hatókörén kívül eső, jövőbeli munka.

## 4. Kártya-képességek feloldási modellje

### 4.1 Általános képességek (a `UnitAbility` unió)

Ezek mind meglévő, jól ismert, sok kártyán ismétlődő szabályok (2. szakasz) — a reducer egy közös, kártya-független feloldó függvényt alkalmaz mindegyikre lejátszáskor (Spy/Muster/Medic azonnali hatások) vagy erő-számításkor (Hero/TightBond/MoraleBoost, lásd 3.2 vége).

### 4.2 Csoportos Muster kivételek

**Megerősítve (2026-07-30): a Crone* (Brewess/Weavess/Whispess) és a Vampire* (Bruxa/Ekimmara/Fleder/Garkain/Katakan) csoportok valóban egy-egy Muster-csoportot alkotnak**, annak ellenére, hogy a csoporton belül minden kártya neve különböző:
- **Vámpírok:** Vampire Bruxa/Ekimmara/Fleder/Garkain/Katakan — 5 KÜLÖNBÖZŐ nevű kártya, egymást is Musterelik.
- **Vasánya-boszorkányok (Crones):** Crone Brewess/Weavess/Whispess — 3 különböző nevű kártya, ugyanígy.
- **Gaunter O'Dimm / Gaunter O'Dimm: Darkness** — szintén két különböző nevű, de egymást is Musterelő kártya.

**Terv, pontosítva a felhasználó kérésére (2026-07-30): a Muster-feloldás KIZÁRÓLAG a `mustersWithIds` listára hagyatkozik, névösszehasonlítás SEHOL nem történik** — még a "normál", egy-CardDef-en-belüli eset sem név alapján dől el, hanem a `defId` egyezésén (egy adott `CardDef`-ből több `copies` példány mind ugyanazt a `defId`-t hordozza, ez már önmagában lefedi a "normál" Muster esetet). A `CardDef` egy `mustersWithIds: string[]` mezőt kap (alapértelmezetten üres tömb) a SAJÁT `defId`-n TÚLI, additív Muster-partnerek `id`-jaival (pl. minden Crone-kártya `mustersWithIds`-ában a másik két Crone `id`-ja szerepel). A reducer Muster-feloldása így egységesen: "keresd meg a pakliban/kézben minden olyan lapot, aminek `defId`-je szerepel a `[thisCard.defId, ...thisCard.mustersWithIds]` halmazban" — nincs külön ág a normál vs. csoportos esetre.

### 4.3 RowScorch (kártya-egyedi, ÚJ képesség-típus)

Három kártyának (Schirrú, Toad, Villentretenmerth) van egy, a hivatalos "Card Abilities" listán kívüli, saját szövegében leírt hatása: lejátszáskor, ha az ELLENFÉL egy MEGADOTT sorának össz-ereje eléri a 10-et, elpusztítja az ellenfél abban a sorban lévő legerősebb kártyáját/kártyáit (döntetlen esetén mindegyiket) — pontosan úgy, mint a sima Scorch, csak egyetlen sorra korlátozva és önindukáltan (nem külön lejátszott kártyaként).

**Terv:** a `CardDef.rowScorch: RowScorchEffect | null` mező (lásd 3.1) — lejátszáskor, ha a kártyának van `rowScorch`-a, a reducer azonnal kiértékeli a feltételt és alkalmazza a hatást, ugyanazzal a "legerősebb a célsorban" logikával, amit a sima Scorch kártya-kind is használ (közös segédfüggvény, nem duplikált logika).

**Kép/asset igény ehhez:** nincs — megerősítve (2026-07-30): egyelőre elég a szöveges leírás (tooltip/szabálykönyv-modál), a vizuális jelzés (ha egyáltalán kell) egy későbbi UI-kör témája.

### 4.4 Egyedi, nem kategorizálható mechanikák

Két kártyának saját, egyetlen másik kártyára sem jellemző mechanikája van — ezeket NEM próbáljuk általánosítani, egyszerű, kártya-ID alapú különleges esetként kezeljük a reducerben (2 `if`, nem egy új absztrakció, a projekt "ne generalizálj korán" elve szerint):
- **Dandelion:** **pontosítva (2026-07-30): TARTÓS, nem egyszeri hatás** — amíg a Dandelion kártya a sorban van, a sorban lévő MINDEN MÁS kártya ereje duplázva marad (nem csak a lejátszás pillanatában jelenlévők, hanem a Dandelion után a sorba kerülő ÚJ kártyák is). Emiatt a modellezése NEM egy egyszeri `computeCardPower`-hívás, hanem egy `BoardRowState`-hez hasonló, tartós sor-flag (`dandelionActive: boolean`, a `hornActive` mintájára) — a `computeCardPower` ezt is figyelembe veszi, ugyanúgy, mint a Horn-ot. Ha a Dandelion Decoy-jal visszakerül a kézbe, vagy Scorch/RowScorch elpusztítja, a flag törlődik.
- **Cow → Bovine Defense Force:** ha a Cow bármilyen módon lekerül a tábláról (Scorch, Decoy-on-kívüli eltávolítás), automatikusan megjelenik helyette a Bovine Defense Force (8 erejű Melee egység).

### 4.5 Vezérkártyák (Leaders) — ÚJ, a szabály-tisztázás során felszínre került mechanika

**Felfedezve 2026-07-30, a felhasználó Foltest: Son of Medell kártyaszövegére adott válasza kapcsán ("Destroy the strongest unit(s) in the Ranged row of your opponent"):** a kutatási adatbázis (`temp/gwent-card-data.json`) már eredetileg is helyesen `row: "Special", power: null`-lal jelölte mind a 20, több-névváltozatos kártyát (5 Foltest, 5 Emhyr var Emreis, 5 Francesca Findabair, 5 Eredin) — ezek ugyanis a valódi játékban NEM a húzópakli részei, hanem **VEZÉRKÁRTYÁK (Leaders)**: a parti előtt, egyszer, a 4 (majd 5) saját frakció-változat közül választott, a 22 lapos pakli mellett/felett álló, saját egyedi (és a frakció-bónusztól ELTÉRŐ) képességgel bíró kártya. Ez a 0a-terv korábbi verziójában tévesen nem volt külön kezelve — a lenti terv pótolja.

**A 20 vezér-képesség rendkívül heterogén** (van köztük egyszeri, a parti elején/aktiválással elsülő hatás — pl. "húzz azonnal lejátszható időjárás-kártyát", "nézz meg 3 véletlen lapot az ellenfél kezéből" —, és van köztük tartós, a teljes partira érvényes passzív módosító — pl. "a Siege sorod ereje duplázva, hacsak nincs már ott Horn"). **Nem próbálunk egy közös, univerzális "vezér-képesség" sémát ráerőltetni mind a 20-ra** — ehelyett minden vezérnek egy saját, egyedi `abilityId`-ja lesz, amit a reducer egy explicit lookup-táblával (nem egy nagy switch, hanem `Record<string, LeaderAbilityHandler>`) old fel, ugyanazzal a "ne általánosíts korán" elvvel, mint a 4.4-es egyedi eseteknél.

```typescript
/** Vezérkártya — KÜLÖN katalógus a CardDef-től, mert nincs benne a húzópakliban, nincs `copies` mezője (mindig pontosan 1, választható). */
export interface LeaderDef {
  id: string;
  name: string;
  faction: Faction;
  abilityId: string; // -> a reducer saját, kézzel írt LEADER_ABILITIES lookup-tábláját indexeli
  abilityDescription: string; // játékos-barát, magyar leírás a UI-hoz
  imagePaths: string[];
}
```

`PlayerState` egy `leaderId: string` (a parti elején választott vezér) és `leaderAbilityUsed: boolean` mezőt kap (az egyszeri-aktiválású képességekhez — a passzív, egész-partis képességek `computeCardPower`-be/kör-lezárásba épülnek, ugyanúgy, mint egy frakció-bónusz). A 20 tényleges `LEADER_ABILITIES` bejegyzés elkészítése a `temp/gwent-card-data.json` már meglévő `notes` mezőiből egy egyszerű adat-átalakítási feladat (a kutatás már megtalálta mind a 20 szöveget), NEM új kutatást igényel.

## 5. Kártya-adatbázis és asset pipeline

### 5.1 A kutatás eredménye

`temp/gwent-card-data.json` — 5 párhuzamos kutató-ügynök eredménye, ~230 fizikai kártyakép-fájlt 154 egyedi kártya-bejegyzésre képezve le (erő, sor, frakció, képességek, hivatalos példányszám), a Witcher-wiki (elsődlegesen fextralife) forrásokból, a repóban lévő `assets/Gwent/cards/cards.csv`-vel (frakció/beszerzési hely, de erő/képesség NÉLKÜL) keresztellenőrizve. **A felhasználó jóváhagyása után (2026-07-30) a `copies` mező a HIVATALOS szabálykönyv/wiki szerinti példányszámot tükrözi, nem a fizikai kártyakép-fájlok számát** — lásd a fájl saját `unmatchedOrUncertain` bejegyzését minden érintett kártyánál (Blue Stripes Commando, Poor Fucking Infantry, Siege Tower, Commander's Horn, és 10 db Neutral hős-kártya).

**Ez a JSON egy közbenső kutatási termék, NEM a végleges motor-adatforrás** — a következő implementációs kör feladata belőle előállítani a végleges `src/shared/games/gwent/engine/cardDefs.ts`-t (a Ramses `treasureConfigs.ts` mintájára), ami már a fenti `CardDef` interfészt tölti ki, beleértve a 4.2/4.3 szakasz kézzel hozzáadott kiegészítéseit (`mustersWithIds`, `rowScorch`), amik a kutatási JSON-ban még csak szöveges `notes`-ként szerepelnek.

### 5.2 Kép-duplikátumok kiszűrése — IMPLEMENTÁLVA (2026-07-31)

A felhasználó kérése (2026-07-30): a `public/` mappába NE kerüljön duplikált kép. `scripts/build-gwent-assets.mjs` (a Hotel/Ramses `scripts/resize-*.mjs` mintáját követve, `npm run assets:build-gwent`) elkészült és lefutott — MD5 byte-egyezés alapján dedupel, majd `sharp`-pal tömörít (max. 1024px, JPEG q82, a Ramses-mintát követve) `public/assets/gwent/cards/` és `public/assets/gwent/leaders/` alá.

**Fontos, a korábbi tervhez képesti pontosítás:** a tényleges MD5-ellenőrzés (nem csak a korábban gyanított 10 Neutral hős-kártyánál, hanem MINDEGYIK, több fizikai fájllal rendelkező kártyánál lefuttatva) kimutatta, hogy a `CardDef.imagePaths` **NEM csak 1 vagy 2 elemű, hanem 1–5 elemű** — a Neutral időjárás-/speciális-kártyák (Biting Frost, Clear Weather, Commander's Horn, Decoy, Impenetrable Fog, Scorch, Torrential Rain, Gaunter O'Dimm: Darkness) valóban byte-azonos duplikátumok (1 elem marad), DE a legtöbb szokásos egységkártyánál (pl. Ballista, Blue Stripes Commando, Impera Brigade Guard, Mahakaman Defender) a számozott fizikai példányok ténylegesen KÜLÖNBÖZŐ grafikát hordoznak (vizuálisan is megerősítve, lásd Ballista 1 vs. 2), a copies-hoz hasonlóan akár 4-5 egyedi variánssal is. A 3.1-es `CardDef.imagePaths` mező típusa és a lenti terv emiatt "1 vagy 2" helyett "1-N, a ténylegesen egyedi variánsok száma szerint" — ez nem szabály-, csak asset-adat-pontosítás, a felhasználó már korábban jóváhagyott elve (*"ha a kép eltér, tartsunk meg minél több fajtát"*) változatlanul érvényes, csak szélesebb körben, mint először gondoltuk.

**A megvalósult pipeline:**
1. `temp/gwent-card-data.json` minden bejegyzéséhez a szkript a saját `filename` mezője + a `notes` szövegében talált összes fájlnév-szerű token (`"Also covers: ..."` és hasonló megfogalmazások) alapján megkeresi a hozzá tartozó fizikai fájl(oka)t `assets/Gwent/cards/{Monsters,Neutral Units,Neutrals,Nilfgaardian Empire,Northern Realms,Scoia'tael}/` alatt (a Skellige mappák szándékosan KIMARADNAK a keresésből).
2. MD5-dedup: csak az egyedi byte-tartalmú fájlok maradnak, stabil sorrendben (a számozás sorrendjében).
3. Minden egyedi fájl `sharp`-pal tömörítve `public/assets/gwent/{cards,leaders}/{id}-{n}.jpg` néven kerül ki — a kliens egy adott `CardInstance` megjelenítésekor determinisztikusan (pl. az `instanceId` hash-e alapján) választ a variánsok közül, ha 1-nél több van.
4. A `CardDef.id`/`LeaderDef.id` séma (`{frakció-szlug}-{név-szlug}`, pl. `northern-realms-ballista`, `scoiatael-schirru`) és a Muster-csoportok (`mustersWithIds`), a `rowScorch` (4.3) és a `weatherRow` (Biting Frost→Melee, Impenetrable Fog→Ranged, Torrential Rain→Siege, Clear Weather→AllRows) mind a szkriptben, egyetlen helyen dőlnek el.
5. A szkript a végén legenerálja `src/shared/games/gwent/engine/cardDefs.ts`-t (134 `CardDef`) és `leaderDefs.ts`-t (20 `LeaderDef`) — **generált fájlok, kézzel nem szerkesztendők**, a kutatási JSON vagy a szkript módosítása után újrafuttatandók (`npm run assets:build-gwent`). A típusok (`Faction`/`Row`/`CardKind`/`UnitAbility`/`RowScorchEffect`/`CardDef`/`LeaderDef`) a kézzel írt `src/shared/games/gwent/engine/types.ts`-ben élnek.

Ellenőrzött végeredmény: 134 `CardDef` (Σcopies = 192) + 20 `LeaderDef`, 206 kép, `tsc --noEmit` tiszta.

## 6. UI/renderer terv

**Ez az első Gwent-jellegű (G klaszter) játék a platformon — nem illik sem a 3D "loop-track"/spatial (Hotel/Ramses), sem a 2D koordináta-rács (B-klaszter Sakk/Dáma/Malom) mintába.** Egy kártyajáték UI-ja alapvetően más: kéz (legyező-elrendezés lent), 3 saját + 3 ellenfél sor középen, dobott lapok/pakli-számláló a szélen. Ez egy ÚJ, harmadik renderer-család lesz — 2D, HTML/CSS-alapú (nem Three.js/R3F, mert itt nincs 3D térbeli interakció, csak lapok mozgatása/elrendezése, amit CSS-transform/flexbox jóval egyszerűbben és jobb teljesítménnyel old meg, mint egy felesleges 3D-s réteg).

Részletes UI-terv (kártya-kattintás → sor-választás Agile-nál, mulligan-képernyő, kör-vége összegzés, Decoy/Medic célválasztás) a KÖVETKEZŐ tervezési körben, miután ez a dokumentum jóváhagyásra került — jelenleg csak a renderer-CSALÁD döntése (2D/CSS, nem 3D) van ebben a körben rögzítve.

**Animáció-készenlét (2026-07-30-i kérés):** a látványos animációk (lapkijátszás, Scorch-pusztítás, Muster-lánc, kör-lezárás) NEM Gwent-0a.2 hatóköre, de a motor-tervnek már most fel kell rá készülnie, hogy később ne kelljen visszamenőleg átalakítani — a Hotel motorjában már bevált, **napló-vezérelt animáció-rendszer** mintáját követjük (lásd `docs/hotel-animacio-specifikacio.md`): a reducer minden állapotváltozást egy strukturált, sorrendtartó `log`-bejegyzésként is rögzít (nem csak a végállapotot), így egy jövőbeli renderer ebből a naplóból tudja majd lejátszani a köztes lépéseket animálva, anélkül hogy a motor maga bármit tudna a megjelenítésről.

## 7. Diagram

Lásd [diagrams/gwent-0a-engine-class-diagram.puml](./diagrams/gwent-0a-engine-class-diagram.puml) (a 3. szakasz adatmodellje) és [diagrams/gwent-0a-turn-flow.puml](./diagrams/gwent-0a-turn-flow.puml) (egy kör lefolyása: lapkijátszás/passzolás váltakozása, kör-lezárás, parti-vége feltétel).

## 8. Nyitott kérdések

**A felhasználó 2026-07-30-i átnézése az alábbi pontok mindegyikét lezárta** — a válaszok a spec megfelelő szakaszaiba (3.2, 3.3, 4.2, 4.3, 4.4, 4.5) is beépültek, itt csak a döntés rövid összefoglalója marad. Jelenleg nincs nyitott kérdés — a spec implementációra kész.

- [x] **Deck-építés vs. rögzített frakció-deck** — Gwent-0a KÉT alfázisra bomlik: **0a.1 = deck-építés** (ez a következő implementációs kör), **0a.2 = a tényleges parti-motor** rá épülve. Lásd 1. szakasz.
- [x] **Erő-számítás pontos sorrendje** — megerősítve: `baseStrength` → időjárás (1-re állítja) → Tight Bond → Morale Boost → Horn, ebben a sorrendben, a korábbi (immár 1-es) értékre építve minden további lépés. Lásd 3.2.
- [x] **Crone/Vámpír csoportos Muster** — megerősítve: mindkét csoport valóban egy-egy Muster-csoport. Lásd 4.2 (a feloldás emellett KIZÁRÓLAG `mustersWithIds`-ra épül, névösszehasonlítás nélkül — szintén a felhasználó kérésére pontosítva).
- [x] **RowScorch vizuális jelzés** — egyelőre elég a szöveges leírás, a UI-kérdés egy későbbi körre marad. Lásd 4.3.
- [x] **Olgierd von Everec ereje/képessége** — megerősítve: 6 erő, Agile + MoraleBoost (nem a másik, feltehetően a különálló CDPR-játékból szivárgott verzió).
- [x] **Dandelion tartóssága** (új pontosítás, nem volt eredeti nyitott kérdés) — a hatás TARTÓS, amíg Dandelion a sorban van, nem egyszeri. Lásd 4.4.
- [x] **Foltest: Son of Medell vezér-képessége, és a vezérkártyák modellje általában** — a felhasználó megadta a pontos szöveget ("Destroy the strongest unit(s) in the Ranged row of your opponent"), ezzel ez a konkrét bizonytalanság lezárva. Ez rávilágított egy nagyobb, korábban át nem gondolt hiányra is: a VEZÉRKÁRTYÁK (Foltest/Emhyr/Francesca/Eredin 5-5 névváltozata, 20 db) nem a húzópakli részei, hanem parti előtt választott, saját képességű kártyák. Az erre válaszul felvett 4.5. szakasz (`LeaderDef`, `abilityId`-alapú, kézzel írt lookup-tábla) modelljét a felhasználó **megerősítette (2026-07-30)** — a `leaderDefs.ts` a 0a.1 (deck-építés) körben, a jóváhagyott modell szerint készül.
- [x] **Rejtett állapot (kéz/pakli) szerver-oldali kényszerítése** (új, 2026-07-30-i kérés) — a felhasználó kérte, hogy a tervben szerepeljen: a játékállapotnak, Ramses mintájára, vannak titkos részei, DE Gwent-nél ez játékosonként eltérő (saját kéz vs. ellenfél keze), és ezt mindig a szerver-oldali motornak kell kikényszerítenie, sosem a kliens UI-nak. Lásd új **3.3. szakasz** — a konkrét mechanizmus (Colyseus `StateView`, kliensenkénti nézet) a Gwent-0b (multiplayer) körben valósul meg, de az adatmodellbe már most, előre be van tervezve, hogy ne kelljen később átalakítani.

## 9. Gwent-0a.1 megvalósítási kör (2026-07-31)

**Kérés:** "Kérlek, kezdd el a megvalósítást. Használj minimalista dizájnt, a végső kinézet nem a mostani terv része. Használj újra minél több kódot a már meglévő kódbázisból, és az új egységeket is készítsd fel, hogy újrahasználhatóak legyenek." A lenti munka kizárólag Gwent-0a.1 (deck-építés) hatókörét fedi — a parti-motor (0a.2) még nem indult el.

### 9.1 Kártya-adatbázis és asset pipeline

`scripts/build-gwent-assets.mjs` (`npm run assets:build-gwent`) — a végleges terv és eredmény az 5.2. szakaszban dokumentálva. Menet közben talált és javított 2 valódi hiba:
- **Adatbug:** Olgierd von Everec a kutatási JSON-ban `row: 'Melee'`-t kapott az Agile képesség MELLETT (a szabály szerint egy Agile egységnek SOSEM lehet fix sora) — a generátor `classifyRow` függvénye mostantól `abilities`-alapon (nem a `row` mezőn) dönt erről, ezt egy vitest teszt (`cardDefs.test.ts`) is lefedi, hogy ne térhessen vissza észrevétlenül.
- **Kép-variáns alábecslés:** az 5.2-ben már dokumentált módon a valódi MD5-vizsgálat kiderítette, hogy nem csak a korábban gyanított pár kártyánál, hanem sok szokásos egységkártyánál is (pl. Impera Brigade Guard: 4, Mahakaman Defender: 5) valódi, eltérő art-variáns tartozik egy névhez — a `CardDef.imagePaths` emiatt 1–5 elemű lett a korábban feltételezett 1–2 helyett.

Végeredmény: 134 `CardDef` (Σcopies = 192) + 20 `LeaderDef`, 206 kép a `public/assets/gwent/{cards,leaders}/` alatt, `tsc --noEmit` tiszta.

### 9.2 Pakli-építés szabálya — web-kutatás

A fizikai szabálykönyv-képek (`assets/Gwent/cards/Rules/*.png`) NEM tartalmaznak pakli-építési korlátot (a Witcher 3 beépített Gwentje nem ismer deck-építő UI-t — a felhasználó ezúttal kifejezetten kérte az internetes utánanézést, ha a saját emlékezete bizonytalan). Két független forrás (WebSearch-összegzés + hisevilness.com részletes leírás) egybehangzóan megerősítette: **legalább 22 NEM-Hero egységkártya** szükséges egy szabályos paklihoz, felső korlát nélkül — lásd a 2. szakasz "Pakli-építés szabálya" bekezdését a forrás-hivatkozással. Ez került `MIN_NON_HERO_UNIT_CARDS`-ként a kódba (`src/shared/games/gwent/engine/deckRules.ts`).

### 9.3 Architektúra — újrahasznosítás és új, újrahasználható egységek

**Meglévő kódból újrafelhasznált minták** (a felhasználó kifejezett kérésére):
- `CardDef`/`LeaderDef` katalógus-minta — szó szerint a Ramses `treasureConfigs.ts` mintáját követi (`getCardDef`/`getLeaderDef`, dobás ismeretlen `id`-ra).
- `scripts/build-gwent-assets.mjs` — a Hotel/Ramses `scripts/resize-*.mjs` pipeline-jainak mintája (`sharp`, `MAX_DIMENSION`/`JPEG_QUALITY`, `public/assets/<game>/` cél).
- `gwentDeckPersistence.ts` — szó szerint a Hotel `hotelLocalGamePersistence.ts` idiómája (prefixelt kulcs, try/catch-be csomagolt `localStorage`).
- UI: `MenuNav`, `Button`, `useGameTheme` — változtatás nélkül, a Ramses/Hotel/Dáma `<Game>SetupPage.tsx` felépítését követve (lépésenkénti helyi state, majd a következő képernyő renderelése route-váltás nélkül).
- `GameModeSelectPage` egy apró, VISSZAMENŐLEG minden játékra érvényes javítást kapott: a "Multiplayer" gomb csak akkor jelenik meg, ha a játék `GameDescriptor.online`-t deklarál — enélkül Gwent (aminek egyelőre nincs szerver-oldali szobája) egy holt végű Lobby-ra navigált volna.

**Új, szándékosan újrahasználhatóra tervezett egységek** (nem Gwent-specifikus típusozással):
- **`src/client/ui-kit/CardGrid.tsx`** — game-agnosztikus, generikus (`<T>`) reszponzív kép-csempe rács, kattintható kiválasztással, opcionális "badge" sarok-tartalommal (pl. egy darabszám-léptető). Bármely jövőbeli "válassz egyet/többet egy statikus, képes katalógusból" képernyőhöz újrafelhasználható (frakció-/vezér-/kártya-választó ma, jövőbeli kártyajátékok holnap) — NEM Gwent `CardDef`-re típusozott.
- **`src/shared/games/gwent/engine/deckRules.ts`** — tiszta, state-mentes validációs függvény (`validateDeckDraft`), ami a deck-építő UI ÉS (változtatás nélkül) a jövőbeli szerver-oldali szoba (Gwent-0b) közös felhasználására készült — ugyanaz az elv, mint a `(state, action) → newState` reducer-nél: a szabály nem tudja, honnan hívják.

### 9.4 Ellenőrzés

`tsc --noEmit` (0 hiba), `eslint .` (0 hiba, a projektben már megszokott szintű komplexitás-warningok — pl. `GwentSetupPage` 14 a 10-es limit fölött, összemérhető a meglévő `RamsesGamePage` 18-as értékével), teljes `vitest run` (292/292 zöld, ebből 26 új Gwent teszt — lásd `docs/tests/gwent-tesztek.md`), élő Playwright smoke teszt (`npm run dev`): frakció→vezér→22 nem-Hero egységkártyás Monsters pakli összeállítása, validációs üzenetek élő frissülése, "Pakli mentése" gomb csak érvényes paklinál aktív, localStorage-perzisztencia oldal-újratöltés után — konzolban 0 hiba/figyelmeztetés.

**Hátralévő (Gwent-0a.2, külön kör):** a tényleges parti-motor (state/reducer/action-ok), a 2D kártya-renderer, hot-seat körvezérlés — lásd 1. szakasz.

### 9.5 Felhasználói észrevételek — jegyzet (2026-07-31)

- **Frakció- és vezérváltás bármikor a deck-építés közben.** IMPLEMENTÁLVA, lásd 9.6.
- **Hangok/zene a játékokhoz** — alacsony prioritású, játék-független kérés, MÉG NEM IMPLEMENTÁLVA, lásd `Projekt-conception.md` legfelső "Hátralévő" listája. Gwent-re nézve ez leginkább a 2D kártya-renderer (0a.2, 6. szakasz) elkészültekor válik relevánssá (lapkijátszás/kör-lezárás hangeffektek).

### 9.6 Playtest-javítási kör (2026-08-01)

**Kérés:** a felhasználó a deck-építő oldal élő kipróbálása után 10 pontban sorolt fel hibát/hiányt, plusz kérte a 9.5-ös jegyzetek átnézését is (a válasz szerint a frakció/vezér-váltást ebben a körben implementálni kellett, a hangok maradnak jegyzetnek).

**Adatjavítások** (`temp/gwent-card-data.json` + `scripts/build-gwent-assets.mjs`, majd `npm run assets:build-gwent` újrafuttatás):
- **Ice Giant ereje 5 → 6** (a felhasználó a fizikai kártya alapján javította).
- **Villentretenmerth: NEM Hero** — a kutatási JSON tévesen `abilities: ['Hero']`-t tartalmazott; a felhasználó a fizikai kártya alapján megerősítette, hogy nem az (a `rowScorch` self-triggered képessége változatlanul megmaradt, az különálló mechanika).
- **Új `CardDef.specialText: string | null` mező** (`types.ts` §3.1) — a kártya-egyedi, nem `abilities`/`rowScorch`-ba illő mechanikák (Dandelion beépített Kürt-szerű sor-duplázása, Cow → Bovine Defense Force csere) magyar, játékos-barát leírására, amikhez korábban nem volt hova tenni ezt az infót a UI-ban. A generátorban `SPECIAL_TEXT_BY_NAME` (kártyanév szerinti lookup, a `ROW_SCORCH_BY_NAME` mintájára).

**UI-javítások** (mind a `DeckStep`/`CardCountGrid`/`CardGrid` réteget érinti):
- **Toad/Villentretenmerth/Schirrú "Sor felperzselés" korábban nem jelent meg sehol** — a `rowScorch` adat már a korábbi körben is helyesen szerepelt a `CardDef`-eken, csak a kártya-csempe (`CardCountGrid`) subtitle-je sosem olvasta ki. Új `cardDisplay.ts` (`cardMechanicTag`/`cardMechanicLine`) mindkét mechanikát (rowScorch ÉS a most bevezetett `specialText`) egységesen felolvassa és megjeleníti egy "Sor felperzselés" / "Egyedi képesség" jelzésként a csempén.
- **Dandelion beépített Kürt-hatása ugyanígy hiányzott** — most a fenti `specialText` mezőn keresztül "Egyedi képesség" jelzést kap, a nagyító-modálban a teljes leírással.
- **Példányszám-limit (`copies`) megjelenítése** — a mennyiség-badge korábban csak `count > 0` esetén jelent meg, és csak az aktuális darabszámot mutatta; most mindig látszik, `aktuális / copies` formában (pl. "0 / 3"), így a maximum már kiválasztás előtt is egyértelmű.
- **Sor kiírása a kártya alá** — `cardDisplay.ts` `cardRowLine` egy "Sor: <Közelharc/Távolsági/Ostrom>" sort ad a csempe subtitle-jéhez minden fix sorú (nem Agile, nem speciális) kártyánál.
- **Kártya-nagyító** — `CardGrid` egy második, bal-felső sarok-slot-ot kapott (`renderCorner`, a meglévő jobb-felső `renderBadge` mellé, game-agnosztikus marad). `CardCountGrid` ide egy 🔍 gombot tesz, ami egy új, ugyancsak game-specifikus `CardDetailModal`-t nyit meg (a meglévő `ui-kit/Modal`-ra építve): teljes méretű kép, név, erő, sor, típus, képességek, és a mechanika-magyarázat (rowScorch/specialText) egy helyen.
- **Rendezés** (erő/név/sor) — `cardDisplay.ts` `sortCards`/`CardSortKey`, tisztán megjelenítési sorrend (nem játékszabály), egy `<select>`-tel vezérelve a `DeckStep`-ben; erő szerint csökkenő, sor szerint Közelharc→Távolsági→Ostrom→(sortalan), mindkettő névvel mint másodlagos kulccsal.
- **Frakció/vezér-váltás bármikor** (9.5. pont) — a `GwentSetupPage` állapota mostantól frakciónkénti (`cardCountsByFaction`/`leaderIdByFaction: Partial<Record<Faction, ...>>`), nem egyetlen lapos `cardCounts`/`leaderId`. A `DeckStep` fejlécében két `<select>` (Frakció, Vezér) mindig látható és bármikor átváltható — frakcióváltáskor, ha az adott frakcióhoz még nincs vezér kiválasztva, a lista első vezére lesz az alapértelmezett (a `LeaderStep` kártya-rács csak az ELSŐ, kezdeti választáshoz kell továbbra is). Egyik frakció adatai sem vesznek el váltáskor.

**Ellenőrzés:** `tsc --noEmit` (0 hiba), `eslint .` (0 hiba, csak a projektben megszokott komplexitás-warningok — `GwentSetupPage` 16, összemérhető a `RamsesGamePage` 18-cal), teljes `vitest run` (297/297 zöld, 2 új `cardDefs.test.ts` regressziós teszt: Ice Giant ereje, `specialText` pontosan Cow+Dandelion-on), élő Playwright ellenőrzés (Monsters/Scoia'tael frakciókon): a "Sor felperzselés"/"Egyedi képesség" jelzések, a `count/copies` badge, a nagyító-modál tartalma, az erő szerinti rendezés (15/15/10/10/10/8 csökkenő sorrend), és a frakcióváltás utáni adatmegőrzés (Ice Giant kiválasztása túlélte a Monsters→Scoia'tael→Monsters váltást) mind a várt módon működtek.

### 9.7 Kártyaszöveg-kutatás (2026-08-01)

**Kérés:** a nagyító-modál élő kipróbálása után a felhasználó megkérdezte, hogy a kártyák tényleges (fizikai kártyán/játékban megjelenő) szövege szerepel-e a kutatási adatbázisban — a válasz: nem, a `temp/gwent-card-data.json` csak strukturált adatot (erő/sor/képességek) és a kutató-ügynökök saját angol kommentárját (`notes`) tartalmazta, nem az eredeti kártyaszöveg szó szerinti idézetét. A felhasználó kérte ennek pótlását, kifejezetten az **eredeti angol szöveget**, minden kártyára és vezérre (nem csak a képességgel rendelkezőkre).

**Módszer** — az eredeti 5-ügynökös, frakciónkénti kutatási minta megismétlése (5.1. szakasz), most szöveg-kinyerésre: 5 párhuzamos ügynök (Northern Realms, Nilfgaard, Monsters, Scoia'tael, Neutral), mindegyik a saját frakciója pontos kártya-/vezérnév-listájával (a már meglévő `CardDef`/`LeaderDef` katalógusból kinyerve, nem az ügynökre bízva a névlista összeállítását). Minden ügynök a `thewitcher3.wiki.fextralife.com` egyedi kártyaoldalait (`.../KÁRTYA+NÉV+(Gwent+Card)`) kérte le elsődleges forrásként, Game8.co/GamerGuides.com/gosunoob.com/witcher.fandom.com másodlagos forrásként ott, ahol a Fextralife oldal nem létezett — a "sosem találj ki semmit emlékezetből" projekt-elv szerint minden szöveg forrás-URL-lel együtt lett rögzítve, és ahol egy kártyához valóban nem volt fellelhető szöveg (csak a "Bovine Defense Force"-nál fordult elő), az `notFound`-ba került ahelyett, hogy az ügynök kitalált volna valamit.

**Eredmény:** mind a 134 kártya + 20 vezér (154/154) kapott `cardText`-et — a "Bovine Defense Force" hiányzó szövegét a felhasználó pótolta a saját fizikai kártyája alapján ("Grrrrrr!").

**Mellékes megerősítés:** a Neutral-ügynök a Villentretenmerth wiki-oldalán egy explicit "Hero Card Status: No" mezőt talált, ami független forrásból is alátámasztja a felhasználó 9.6-ban tett korrekcióját (Villentretenmerth NEM Hero).

**Adatmodell:** új `CardDef.cardText: string | null` és `LeaderDef.cardText: string | null` mező (`types.ts`) — a fizikai/játékbeli kártyán ténylegesen szereplő angol szöveg (képesség-leírás és/vagy hangulat-idézet, amelyik ténylegesen szerepel rajta), kizárólag megjelenítési célra (a nagyító-modálban, `blockquote`, `lang="en"`), **az engine-logika soha nem olvassa** — a szabályok forrása változatlanul az `abilities`/`rowScorch`/`specialText` marad. A `temp/gwent-card-data.json` minden bejegyzése megkapta a `cardText` mezőt, a `scripts/build-gwent-assets.mjs` pedig változtatás nélkül átemeli a generált `CardDef`/`LeaderDef`-ekbe.

**Ellenőrzés:** `tsc --noEmit` (0 hiba), `eslint .` (0 hiba), teljes `vitest run` (300/300 zöld, 3 új teszt: minden `CardDef`/`LeaderDef` `cardText`-je nem null, Villentretenmerth Hero-regresszió), élő Playwright ellenőrzés (Dandelion nagyító-modálja a helyes, teljes eredeti szöveget mutatta).
