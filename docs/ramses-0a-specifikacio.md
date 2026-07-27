# Ramses-0a — Specifikáció: helyi vertikum (alapjáték motor + 3D renderer + N-fős hot-seat)

**Státusz:** Tervezés — implementáció még NEM kezdődött el, ez a dokumentum a jóváhagyásra vár
**Utolsó frissítés:** 2026-07-26
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (E klaszter — Hanabi, Ramses), [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) (a követett minta: framework-agnosztikus reducer, core/games szeparáció, fokozatos fázisokra bontás)

> **Fontos korrekció:** a projekt korábbi játéklistájában "Ramses II" szerepelt — ez tévesnek bizonyult. A valódi játék a Ravensburger **"Ramses"** (1997/2006/2017, szerző: Gunter Baars), egy teljesen más játék: nem egy csempe-lerakós stratégiai játék, hanem egy **memóriajáték csúszó piramisokkal**. A hivatalos szabálykönyv forrása: [ravensburger.org PDF](https://www.ravensburger.org/spielanleitungen/ecm/Spielanleitungen/Ramses.pdf) (angol fordítás, ebből dolgoztam). A `Projekt-conception.md`-ben a névhiba javítva ("Ramses II" → "Ramses").

## 1. Cél és hatókör

**Kérés:** a Hotel-0d lezárása után, amíg a felhasználó a Hotel valódi 3D modelljein dolgozik, egy új játék tervezése kezdődik. A Ramses az **E — Rejtett információs** klaszter második tagja (Hanabi mellett) — ez lesz az első olyan játék a platformon, ahol a rejtett állapot (a tábla 48 mezőjének tartalma) fokozatosan, MINDEN játékos számára EGYFORMÁN tárul fel játék közben (nem aszimmetrikus, mint Hanabinél a saját kéz).

**Ramses-0a** a Hotel-0a mintáját követi: **tisztán helyi (hot-seat), multiplayer/AI nélkül**, de a végleges motorral. A cél a **lehető legegyszerűbb, teljes vertikum**: a felhasználó explicit kérése szerint most a hangsúly az alapjáték elkészülésén van, a bizonytalan részletű elemek (speciális akció-kártyák) nyitott kérdésként, külön fázisra maradnak.

**Hatókörben van:**
- Ramses motor (state, action-ok, reducer) — 48 mezős rács tábla, fix "kincs-réteg" alul, mozgó piramis-réteg felül, "15-ös kirakó" csúsztatási mechanika, célkártya-húzás, pontszámítás, végjáték
- N-fős (2–5) hot-seat körvezérlés
- 3D tábla-renderer, valódi kattintható 3D-elemekkel (lásd 5. szakasz)

**Nincs hatókörben (külön, jövőbeli fázis):**
- **A 4 speciális akció-kártya** (Homokvihar, Skorpió, Szuperképesség, Párbaj) — a pontos szabályuk (különösen a Szuperképesség) nyitott kérdés marad, playteszteléssel/a fizikai példány újra-átnézésével tisztázandó. A húzópakli-felépítés (3 db 10-lapos kupac, amiből a 2-3. kupacban jelennek meg a szimbólumok) emiatt Ramses-0a-ban EGYETLEN, összekevert 30 lapos pakli, kupac-szétválasztás nélkül.
- **Haladó ("profi kincsvadász") verzió** — 21 zseton (szkarabeusz, múmia-átok, felfedező), amik az arany piramisok ALÁ kerülnek (a piramishoz kötve mozognak, nem a mezőhöz)
- **1 fős szóló verzió**
- Multiplayer/online mód (Ramses-0b, ha lesz)
- AI ellenfél (Ramses-0c/0d, ha lesz)

## 2. A valódi szabályok

### 2.1 Komponensek (a fizikai játékból, csak az alapjátékhoz szükségesek)

- **47 piramis** (16 arany, 16 piros, 15 kék) — az alapjátékban a szín NEM számít szabályilag, csak vizuális változatosság (a haladó verzióban lenne jelentősége, azt nem visszük át).
- **30 célkártya** — mindegyiken egy kincs-azonosító + pontérték (1–4).
- **1 játéktábla, 48 lyukkal** — alatta egy fix "kincs-réteg" (12 kivágás, mindegyiken 1 kincs-kép + 3 üres kép, azaz a 48 pozícióból pontosan 12 mutat kincset, 36 üres).

### 2.2 Kezdő-felállás

- A 48 pozíció mindegyikéhez FIX tartalom tartozik a játék elejétől a végéig (12 pozíción egy-egy különböző kincs, 36-on semmi) — ez a réteg a piramisok alatt van, és **soha nem változik** a parti során.
- **Kincs-elhelyezés generálási szabálya (a felhasználó pontosítása 2026-07-27, nem szerepelt az eredeti szabálykönyv-kivonatban):** a 6×8 rácsot a bal felső saroktól kezdve 2×2-es alrácsokra osztjuk (3×4 = 12 alrács, pontosan annyi, ahány kincs van). Minden alrácsba PONTOSAN 1 kincs kerül, véletlenszerű pozícióban a 4 mező közül (a másik 3 üres); az is véletlenszerű, melyik kincs melyik alrácsba kerül. Ez fizikailag megfelel annak, hogy a valódi kincs-réteg 12 db 2×2-es kivágásból áll össze (2.1 szakasz), és garantálja, hogy a kincsek egyenletesen szóródjanak a táblán — egy tisztán globális keverés (mind a 48 mezőt egyben összekeverve) ezt nem biztosítaná, akár egy sarokba is zsúfolódhatna több kincs. Implementáció: `initialState.ts`'s `createBoard()`.
- 47 pozícióra piramis kerül, PONTOSAN 1 marad üresen — a szabály szerint az induló üres mező NEM mutathat kincset (ez csak a kezdő-felállítást korlátozza, a parti közben bármelyik felfedett mező lehet kincs vagy üres).
- A 30 célkártya megkeverve, húzópakli.

### 2.3 Körvezérlés

> **Szabály-módosítás a felhasználó döntése alapján (a hivatalos szabálykönyvhöz képest eltérő házi szabály):** az eredeti szabálykönyv szerint egy sikeres találat után a kör automatikusan a KÖVETKEZŐ játékosra száll (ő húz új lapot). **Ehelyett itt az van érvényben, hogy egy játékos MINDADDIG játszik (ő húz új lapot, ő keresi a következő kincset is), amíg ROSSZ kincset nem fed fel** — csak ekkor száll a kör a következő játékosra. Ez a klasszikus "Memória" játékok szokásos "amíg találsz, tovább játszol" logikájának felel meg. Lásd 6. szakasz.

Óramutató járása szerint haladva:

1. Az aktív játékos felfordítja a húzópakli tetején lévő lapot (ha még nincs "aktuális cél") — ez mutatja, melyik kincset keresi, és mennyi pontot ér.
2. **Kivétel/"szerencsés" eset:** ha az új lap kincse ÉPPEN megegyezik azzal, ami már fel van fedve (az aktuálisan üres mezőn, amit az előző csúsztatás hagyott ott), a játékos AZONNAL megkapja a lapot, lépés nélkül — **majd (a fenti szabály-módosítás szerint) Ő MAGA húz egy újabb lapot**, és folytatja a keresést (vissza az 1. ponthoz).
3. Egyébként a játékos az üres mezővel SZOMSZÉDOS piramisok közül pontosan egyet az üres helyre csúsztat — ez FELFEDI a piramis EREDETI helyét (klasszikus "15-ös kirakó" logika: a mozgó darab helye lesz üres, nem a célhely).
4. A felfedett mező alapján három eset:
   - **Üres:** a játékos folytathatja, ismét csúsztathat egy, az ÚJ üres hellyel szomszédos piramist — tetszőleges hosszúságú láncban, amíg kincset nem talál.
   - **Rossz kincs:** a kör VÉGET ér, a lap NEM kerül el (marad felfedve, célként), a KÖVETKEZŐ játékos ugyanazt a kincset keresi tovább.
   - **Jó kincs:** a játékos elveszi a lapot (lefordítva maga elé teszi — ez a "megnyert" kártyáinak kupaca), **majd Ő MAGA húz egy újabb lapot** (2. pont szerint) — a kör NEM ér véget, ugyanaz a játékos folytatja.
5. A játék véget ér, amint valaki elviszi az UTOLSÓ célkártyát a pakliból.

**Fontos:** a "kör vége" NEM külön játékos-döntés (nincs "Kör vége" akció, mint Hotelnél) — kizárólag a felfedés kimenetele dönti el automatikusan (KIZÁRÓLAG egy rossz kincs felfedése zárja le az aktív játékos körét). Ez a motort jelentősen egyszerűbbé teszi, mint a Hotelt: gyakorlatilag **egyetlen action-típus** kell (`SLIDE_PYRAMID`), a lapfelfordítás/kör-váltás a reducer belső, automatikus lépése, nem külön akció.

### 2.4 Végjáték és pontszámítás

- Minden játékos összeadja a megnyert kártyáinak pontértékét (1–4/lap).
- Legtöbb pont nyer.
- Pontegyenlőség esetén: legtöbb megnyert LAP (darabszám) dönt.
- Ha ez is egyenlő: az érintettek MIND nyernek (holtverseny, nem véletlen döntés).

## 3. Adatmodell: state és action-ok (terv)

`src/shared/games/ramses/engine/` — ugyanaz a felépítés, mint Dámánál/Hotelnél (`state.ts`, `actions.ts`, `reducer.ts`, `rules.ts`, `selectors.ts`, `initialState.ts`).

```typescript
// state.ts
export type PlayerId = string;

/** Egy tábla-mező — a `treasureId` a FIX "kincs-réteg", sosem változik a parti alatt; a `hasPyramid` az, ami mozog. */
export interface RamsesCell {
  id: string; // pl. "r3c5" — 6x8-as rács, megerősítve (4. szakasz)
  row: number;
  col: number;
  /** null = ezen a pozíción nincs kincs (36/48 pozíció ilyen) — fix a teljes parti alatt. */
  treasureId: string | null;
  hasPyramid: boolean;
}

export interface SearchCard {
  id: string;
  treasureId: string;
  points: number; // 1-4
}

export interface Player {
  id: PlayerId;
  name: string;
  wonCards: SearchCard[];
}

export type RamsesStatus = 'IN_PROGRESS' | 'FINISHED';

export interface RamsesState {
  board: RamsesCell[]; // 48 elem, fix rács-pozíciókkal
  emptyCellId: string; // gyors keresés helyett explicit tárolt "melyik mező üres most"
  drawPile: SearchCard[]; // maradék, lefordítva
  activeCard: SearchCard | null; // az éppen keresett cél
  players: Player[];
  currentPlayerIndex: number;
  status: RamsesStatus;
  /** Csak FINISHED állapotban — pontegyenlőség esetén TÖBB győztes is lehet (2.4 szakasz). */
  winnerIds: PlayerId[];
}
```

```typescript
// actions.ts — szándékosan egyetlen akció-típus, lásd 2.3 "Fontos" megjegyzés
export type RamsesAction =
  | { type: 'SLIDE_PYRAMID'; fromCellId: string }; // fromCellId-nek szomszédosnak kell lennie emptyCellId-vel, és hasPyramid===true
```

**A `reducer.ts` felelőssége `SLIDE_PYRAMID`-nál** (a 2.3 szakasz szabály-módosítása szerint — jó találat NEM váltja a soron lévő játékost, csak a rossz):
1. Validálja: `fromCellId` szomszédos-e `emptyCellId`-vel, és van-e ott piramis (`rules.ts`, ugyanaz a minta, mint Dáma/Hotel `can*` predikátumai).
2. Áthelyezi a piramist (`fromCellId.hasPyramid = false`, `emptyCellId.hasPyramid = true`), majd `emptyCellId = fromCellId` (a régi hely lesz az új üres).
3. Megnézi az ÚJ üres mező `treasureId`-ját:
   - `null` → nincs egyéb állapotváltozás, a kör folytatódik (ugyanaz a játékos, ugyanaz az `activeCard`).
   - `=== activeCard.treasureId` → a lap átkerül a játékos `wonCards`-ába, `activeCard = null`, **`currentPlayerIndex` VÁLTOZATLAN marad** (ugyanő folytatja), majd (lásd alább) automatikusan húz egy új lapot.
   - egyéb kincs → `currentPlayerIndex` a következőre lép, `activeCard` VÁLTOZATLAN marad (a következő játékos ugyanazt a célt keresi).
4. **Automatikus lap-húzás** (akárhányszor `activeCard` üresre vált, akár kezdéskor, akár egy találat után — MINDIG a soron lévő, `currentPlayerIndex`-es játékos húz, ő maga, sosem a következő): a reducer lehúzza a pakli tetejét `activeCard`-nak; ha ennek `treasureId`-ja ÉPPEN megegyezik az `emptyCellId` aktuális `treasureId`-jával (2.3/2. pont "szerencsés eset"), azonnal átkerül a soron lévő játékos `wonCards`-ába (a `currentPlayerIndex` ekkor sem változik), és a folyamat rekurzívan megismétlődik (ugyanő húz tovább) — ez elvben egy hosszú láncot indíthat el, ha valaki egymás után többször is "szerencsés".
5. Ha a `drawPile` kiürül az utolsó lap elvétele után, `status = 'FINISHED'`, kiszámolja a `winnerIds`-t (2.4 szakasz szabálya szerint).

## 4. Tábla-topológia — MEGERŐSÍTVE

**A tábla 6×8-as téglalap rács** — megerősítve a felhasználó által (6. szakasz). A szomszédosság-feltevés (4 irányú: fel/le/jobb/bal, NEM átlós) egyelőre változatlan, ésszerű alapértelmezés marad, amíg ellenkezője ki nem derül.

A `board`/szomszédosság-számítás a `rules.ts`-ben **konfigurációból, nem hardcode-olva** épül fel (ugyanaz az elv, mint Hotel `adjacentLotIds`-je) — ha a szomszédosság mégsem tisztán 4 irányú lenne, az egy konfigurációs változás, NEM motor-átírás.

## 5. Renderelő: 3D, VALÓDI kattintható 3D-elemekkel — MEGERŐSÍTVE

A felhasználó döntése alapján a Ramses **3D renderelőt** kap (nem a korábban javasolt 2D-t) — **azzal a kikötéssel, hogy a 3D-ben megjelenített játéktér elemei (a piramisok) ténylegesen kattinthatók legyenek.**

**Ez egy ÚJ mintát vezet be a projektbe, tudatosan eltérve a Hotel renderelő-architektúrájától:** a Hotel `LoopTrackBoard3D`-je (`docs/hotel-0a-specifikacio.md` §5) szándékosan **NEM** 3D-raycasting-alapú — csak megjelenít, a tényleges interakció egy különálló, képernyő-térbeli (screen-space) HTML overlay-en (`PlayerActionWheel`) fut, a `<Canvas>` fölött. Ramsesnél ez a minta NEM elég: itt maga a tábla EGYETLEN interakciós felülete (nincs külön menü/tárcsa — a "melyik piramist csúsztatod" kérdésre magán a 3D-s táblán kell rákattintani).

**Terv:** egy új, game-agnosztikus `GridBoard3D` renderelő (`src/client/renderers/grid-3d/`), ami — a `LoopTrackBoard3D`/`GridBoard2D` mintájához hasonlóan tisztán prezentációs, semmit nem tud Ramses szabályairól — de a `renderCell`-nek visszaadott React Three Fiber mesh-ek valódi `onClick`/`onPointerDown` eseménykezelőket kapnak (az R3F natívan támogatja ezt, nincs kézzel írt raycasting-kód). A komponens egy `onCellClick(cellId: string)` callback-et ad vissza a szülőnek, ami ebből építi fel a `SLIDE_PYRAMID` action-t (validáció — hogy tényleg szomszédos-e az üres mezővel — a `rules.ts`-ben, nem a renderelőben, ugyanúgy, ahogy eddig is).

**Miért lehet ez később más játékoknak is hasznos:** ha egy jövőbeli játék (pl. egy kirakós/puzzle jellegű) szintén rács-alapú, direkt kattintható 3D mezőket igényel, ez a `GridBoard3D` újrafelhasználható lesz — ugyanaz a "közös renderelő komponens, játék-specifikus adat" elv, mint a `LoopTrackBoard3D`/`GridBoard2D`-nél.

### 5.1 Kincsek és célkártyák — placeholder generálás + későbbi képbetöltés

A 12 kincs és a 30 célkártya pontos tartalma (6. szakasz) egyelőre nyitott — a felhasználó kérése szerint **Ramses-0a placeholder kincsekkel/kártyákkal induljon**, de a rendszer legyen felkészítve arra, hogy később VALÓDI képek (a felhasználó saját feladata, ugyanaz a minta, mint a Hotel-0c/0c.2 assetek) egyszerűen becsatlakoztathatók legyenek, kód-módosítás nélkül:

- **Placeholder kincsek:** 12 darab, egyszerű geometriai/szimbólum-alapú (pl. eltérő szín + egyszerű alakzat vagy Unicode-ikon kombináció), egy config-tömbben (`treasureConfigs.ts`, a Hotel `hotelConfigs.ts` mintájára) — `id`, `label`, és egy `imagePath` mező, ami placeholder-ként egy generált/beépített ikonra mutat.
- **Placeholder célkártyák:** a 30 kártya `treasureId`+`points` párokból generálva (egyenletes eloszlás a 12 kincs között, pontértékek 1–4 között kiegyensúlyozva) — ez is egy explicit config-lista, NEM procedurális generátor a `reducer.ts`-ben, hogy később könnyen felülírható legyen a valódi lap-lista pontos ismeretében.
- **Képbetöltés később:** mind a kincs-, mind a kártya-renderelő komponens egy `imagePath`-ot vár (ugyanaz a minta, mint a Hotel `property-cards`/`banknotes` mappái) — ha a felhasználó elkészíti a valódi fotókat/szkennelt képeket, azok csak a megfelelő `public/assets/ramses/...` mappákba kerülnek, a config-fájlok `imagePath` mezői frissülnek, és a renderelő kód NEM változik (ugyanaz az elv, mint Hotel-0c-nél a geometriai placeholderek lecserélése).

## 6. Nyitott kérdések összefoglalva

- [x] **Tábla rács-alakja és szomszédosság** (4. szakasz) — **MEGERŐSÍTVE: 6×8-as rács.** A szomszédosság-irány (4 irányú feltevés) egyelőre változatlan.
- [x] **A 30 célkártya pontos tartalma** — **LEZÁRVA placeholderrel:** a pontos fizikai lap-lista egyelőre nem szükséges, Ramses-0a generált placeholder kincsekkel/kártyákkal indul, később a valódi tartalom (és a felhasználó által készített képek) egyszerűen becsatlakoztathatók lesznek kód-módosítás nélkül (lásd 5.1 szakasz).
- [x] **2D vs 3D renderer** — **MEGERŐSÍTVE: 3D, valódi kattintható 3D-elemekkel** (nem képernyő-térbeli overlay, mint Hotelnél) — lásd 5. szakasz, új `GridBoard3D` komponens tervezve.
- [x] **Szabály-módosítás elfogadva:** egy sikeres találat UTÁN a soron lévő játékos maga húz új lapot és folytatja a körét — a kör csakis egy ROSSZ kincs felfedésekor száll a következő játékosra (a hivatalos szabálykönyvtől eltérő, szándékos házi szabály). Lásd 2.3 szakasz, beépítve az adatmodellbe és a reducer-leírásba is.
- **LEZÁRVA (a felhasználó döntése alapján):** a 4 speciális akció-kártya, a haladó (zsetonos) verzió és az 1 fős szóló verzió Ramses-0a-ban NINCS hatókörben — külön, jövőbeli fázis(ok) témája, amint a pontos szabályaik tisztázódnak.

**Minden nyitott pont lezárva — a terv implementálásra kész**, amennyiben a lenti diagramok és az adatmodell rendben van számodra.

## 7. Diagram

Lásd: [diagrams/ramses-0a-engine-class-diagram.puml](./diagrams/ramses-0a-engine-class-diagram.puml) (adatmodell) és [diagrams/ramses-0a-turn-flow.puml](./diagrams/ramses-0a-turn-flow.puml) (egy `SLIDE_PYRAMID` akció három lehetséges kimenetele).
