# Ramses-0a — Specifikáció: helyi vertikum (alapjáték motor + 3D renderer + N-fős hot-seat)

**Státusz:** Az eredeti 0a alapjáték (ebben a dokumentumban lent leírt terv szerint) KÉSZ, implementálva és élesben ellenőrizve — sőt, azóta a 0b (multiplayer) és 0c (AI) is elkészült (lásd `ramses-0b-specifikacio.md`, `ramses-0c-ai-specifikacio.md`). **A 8. szakasz (2026-07-29) egy UTÓLAGOS kiegészítést tervez** — a felhasználó pontosította a speciális kártyák szabályát, és elkészültek a valódi (fényképezett) assetek — ez a kiegészítés MÉG NEM implementálva, ez a dokumentum-frissítés csak a tervet igazítja hozzá.
**Utolsó frissítés:** 2026-07-29
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (E klaszter — Hanabi, Ramses), [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) (a követett minta: framework-agnosztikus reducer, core/games szeparáció, fokozatos fázisokra bontás), [hotel-0c-specifikacio.md](./hotel-0c-specifikacio.md) (a valódi-asset-pipeline mintája, amit a 8. szakasz követ)

> **Fontos korrekció:** a projekt korábbi játéklistájában "Ramses II" szerepelt — ez tévesnek bizonyult. A valódi játék a Ravensburger **"Ramses"** (1997/2006/2017, szerző: Gunter Baars), egy teljesen más játék: nem egy csempe-lerakós stratégiai játék, hanem egy **memóriajáték csúszó piramisokkal**. A hivatalos szabálykönyv forrása: [ravensburger.org PDF](https://www.ravensburger.org/spielanleitungen/ecm/Spielanleitungen/Ramses.pdf) (angol fordítás, ebből dolgoztam). A `Projekt-conception.md`-ben a névhiba javítva ("Ramses II" → "Ramses").

## 1. Cél és hatókör

**Kérés:** a Hotel-0d lezárása után, amíg a felhasználó a Hotel valódi 3D modelljein dolgozik, egy új játék tervezése kezdődik. A Ramses az **E — Rejtett információs** klaszter második tagja (Hanabi mellett) — ez lesz az első olyan játék a platformon, ahol a rejtett állapot (a tábla 48 mezőjének tartalma) fokozatosan, MINDEN játékos számára EGYFORMÁN tárul fel játék közben (nem aszimmetrikus, mint Hanabinél a saját kéz).

**Ramses-0a** a Hotel-0a mintáját követi: **tisztán helyi (hot-seat), multiplayer/AI nélkül**, de a végleges motorral. A cél a **lehető legegyszerűbb, teljes vertikum**: a felhasználó explicit kérése szerint most a hangsúly az alapjáték elkészülésén van, a bizonytalan részletű elemek (speciális akció-kártyák) nyitott kérdésként, külön fázisra maradnak.

**Hatókörben van:**
- Ramses motor (state, action-ok, reducer) — 48 mezős rács tábla, fix "kincs-réteg" alul, mozgó piramis-réteg felül, "15-ös kirakó" csúsztatási mechanika, célkártya-húzás, pontszámítás, végjáték
- N-fős (2–5) hot-seat körvezérlés
- 3D tábla-renderer, valódi kattintható 3D-elemekkel (lásd 5. szakasz)

**Eredetileg (2026-07-26) nem volt hatókörben, de a 8. szakasz (2026-07-29) szerint MOST MÁR igen, egy jövőbeli implementációs körben:**
- **A 6 valódi speciális kártya** (Homokvihar, Ajándék, Kockázat, Fata Morgana, Sivatagi póker, Záró kártya) — a korábbi, 2026-07-26-i verzióban itt szereplő 4 név (Homokvihar, Skorpió, Szuperképesség, Párbaj) TÉVES volt, egy előzetes, nem-megerősített találgatás — a felhasználó 2026-07-29-én pontosította a valódi szabályt és a valódi kártya-neveket (lásd 2.5 és 8. szakasz). A húzópakli-felépítés emiatt is változik: a korábban (a speciális kártyák hiánya miatt) EGYETLEN, 30 lapos összekevert paklira egyszerűsített modell helyett a valódi, 3 db KÜLÖN (egymás után kijátszott) pakli tervezett — lásd 2.1/8. szakasz.

**Továbbra sem hatókörben (külön, jövőbeli fázis):**
- **Haladó ("profi kincsvadász") verzió** — 21 zseton (szkarabeusz, múmia-átok, felfedező), amik az arany piramisok ALÁ kerülnek (a piramishoz kötve mozognak, nem a mezőhöz)
- **1 fős szóló verzió**

**Már elkészült, ellenőrizve (a fenti Státusz-sor szerint):**
- Multiplayer/online mód — **Ramses-0b, KÉSZ**
- AI ellenfél — **Ramses-0c, KÉSZ**

## 2. A valódi szabályok

### 2.1 Komponensek (a fizikai játékból, csak az alapjátékhoz szükségesek)

- **47 piramis** (16 arany, 16 piros, 15 kék) — az alapjátékban a szín NEM számít szabályilag, csak vizuális változatosság (a haladó verzióban lenne jelentősége, azt nem visszük át).
- **48 lap, 3 KÜLÖN pakliban** — a lapok hátoldalán 1, 2 vagy 3 szám szerepel, ez mutatja, melyik pakliba tartoznak; a lapokat a 3 pakli SAJÁT KÖRÉN belül keverjük meg, majd a paklikat EGYMÁS UTÁN, sosem összekeverve húzzuk (előbb az 1-es teljesen elfogy, csak utána jön a 2-es, majd a 3-as) — **pontos összetétel a valódi assetek alapján megerősítve, lásd 8.1 szakasz**:
  - **1-es pakli: 20 lap**, mind egyszerű kincs-kártya (nincs speciális), pontértékük 1 vagy 2.
  - **2-es pakli: 19 lap** — 8 kincs-kártya (mind 3 pontot ér) + 11 speciális kártya (5 típus, eltérő példányszámmal — lásd 2.5).
  - **3-as pakli: 9 lap** — 8 kincs-kártya (mind 4 pontot ér) + 1 speciális kártya (Záró kártya).
  - Egy sima kincs-kártyán egy kincs-azonosító + pontérték (1–4) szerepel.
- **1 játéktábla, 48 lyukkal** — alatta egy fix "kincs-réteg" (12 kivágás, mindegyiken 1 kincs-kép + 3 üres kép, azaz a 48 pozícióból pontosan 12 mutat kincset, 36 üres). **A 12 kincs valódi neve/képe megerősítve** (lásd 8.1): madár (bird), gyertyatartó (candlestick), számítógép (computer), kutya (dog), kacsa (duck), szemüveg (glasses), víziló (hippopotamus), múmia (mummy), protézis (prosthesis), szfinx (sphinx), babakocsi (stroller), trombita (trumpet).

### 2.2 Kezdő-felállás

- A 48 pozíció mindegyikéhez FIX tartalom tartozik a játék elejétől a végéig (12 pozíción egy-egy különböző kincs, 36-on semmi) — ez a réteg a piramisok alatt van, és **soha nem változik** a parti során.
- **Kincs-elhelyezés generálási szabálya (a felhasználó pontosítása 2026-07-27, nem szerepelt az eredeti szabálykönyv-kivonatban):** a 6×8 rácsot a bal felső saroktól kezdve 2×2-es alrácsokra osztjuk (3×4 = 12 alrács, pontosan annyi, ahány kincs van). Minden alrácsba PONTOSAN 1 kincs kerül, véletlenszerű pozícióban a 4 mező közül (a másik 3 üres); az is véletlenszerű, melyik kincs melyik alrácsba kerül. Ez fizikailag megfelel annak, hogy a valódi kincs-réteg 12 db 2×2-es kivágásból áll össze (2.1 szakasz), és garantálja, hogy a kincsek egyenletesen szóródjanak a táblán — egy tisztán globális keverés (mind a 48 mezőt egyben összekeverve) ezt nem biztosítaná, akár egy sarokba is zsúfolódhatna több kincs. Implementáció: `initialState.ts`'s `createBoard()`.
- 47 pozícióra piramis kerül, PONTOSAN 1 marad üresen — a szabály szerint az induló üres mező NEM mutathat kincset (ez csak a kezdő-felállítást korlátozza, a parti közben bármelyik felfedett mező lehet kincs vagy üres).
- **A 3 pakli mindegyike ÖNMAGÁBAN megkeverve**, majd egymás mögé fűzve, MINDIG 1→2→3 sorrendben húzva (lásd 2.1/8.1) — ez felváltja a korábbi, speciális kártyák nélküli tervezési kör egyetlen-összekevert-30-lapos egyszerűsítését.

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

### 2.5 Speciális kártyák

**Megerősítve a valódi assetek alapján (`assets/Ramses/png/cards/2/`, `.../3/`, lásd 8.1) — a fájlnevekbe kódolt példányszám szerint:**

**A 2-es pakliban (11 lap, 5 típus):**
- **Homokvihar** (`sandstorm`, ×2): A kincsek rétegét 180 fokkal el kell fordítani.
- **Ajándék** (`gift`, ×2): Lépj az egyik kincshez! Valódi lépéssor, csúsztatásokkal. Ha nem sikerül, akkor a következő játékos jön ugyan ezzel a kártyával. Mindenki, akinek van ilyen kártyája, adjon egyet.
- **Kockázat** (`risk`, ×2): Nevezz meg 2 kincset, amik épp nem látszanak a pályán! Lépj először az egyikhez, majd a másikhoz. Valódi lépésekkel, csúsztatásokkal. Ha sikerül, húzhatsz a bal oldali szomszédodtól egy lapot úgy, hogy csak a hátlapjukat látod. (Ha neki nincs lapja, akkor a játék húzás nélkül folytatódik.) Ha nem sikerül, akkor te ajándékozod meg a tőled balra ülőt egy kártyával. Ezt a lepot te választod ki. (Ha nincs lapod, akkor a játék folytatódik ajándékozás nélkül.)
- **Fata Morgana** (`fataMorgana`, ×3): Húzol egyet a jobb oldali szomszédod kártyái közül. (Ha nincs lapja, akkor a speciális kártya helyett újat kell húzni, és folytatni a játékot.) Ha sikerül hiba nélkül megtalálnod, akkor megtarthatod. Valódi lépésekkel, csúsztatásokkal. Ha nem, akkor te adsz a jobb oldali szomszédodnak egy lapot.
- **Sivatagi póker** (`poker`, ×2): Egy általad meghatározott kincset kell egy általad meghatározott játékosnak (rajtad kívül) megkeresnie.Valódi lépésekkel, csúsztatásokkal. Ha sikerül, akkor húzhat egyet a lapjaid közül. Ha nem, akkor te húzol tőle. (Ha nincs kártyája annak, akitől húzni kéne, a játék húzás nélkül folytatódik.)

**A 3-as pakliban (1 lap):**
- **Záró kártya** (`finish`, ×1): A játék azonnal véget ér.

**Nyitott kérdések, mielőtt ezek implementálhatók lennének** (lásd 8.2 is) — a fenti szöveg a felhasználó saját megfogalmazása, de több kártyánál a PONTOS eljárás (mi számít "lépésnek", mi történik hiba esetén, kinek a köre folytatódik utána) nincs egyértelműen rögzítve:
1. **Ajándék** — a "Lépj az egyik kincshez" egy VALÓDI, a normál kereséshez hasonló csúsztatás-lánc-e (ami akár rossz kincs felfedésével sikertelenné is válhat?), vagy csak egy MEGNEVEZÉS (a program eldönti, elérhető-e)? Ha valakinek TÖBB ilyen kincsű lapja is van, melyiket adja? - Normál keresés. A legkisebb pontértékű kártyát adja.
2. **Kockázat** — a "Lépj hozzá" ugyanígy valódi csúsztatás-lánc-e? A "bal oldali szomszéd" az ülésrend (`currentPlayerIndex - 1`) szerint értendő? - Valódi lépések. Igen currentPlayerIndex - 1 megfelelő.
3. **Fata Morgana** — a legbizonytalanabb: "Ha sikerül hiba nélkül megtalálnod" — MIT kell megtalálni, és milyen eljárással? A kártya szövege nem részletezi a keresési feladatot. Playteszteléssel vagy a fizikai szabálykönyv-betét újraolvasásával tisztázandó, mielőtt implementálható. - Azt a kincset kell megtalálni, amit a jobb oldali szomszédodtól húztál. Valódi lépésekkel.
4. **Sivatagi póker** — a megnevezett CÉLJÁTÉKOS keres — az ő köre lesz-e átmenetileg (currentPlayerIndex rá vált), vagy a soron lévő játékos irányítja helyette? - Átmenetileg a választott játékos köre lesz, de utána vissza kell állítani, hogy a kör folytatódjon.
5. **Homokvihar** — a 180°-os forgatás a MÁR FELFEDETT (jelenleg látható, felfedett) mezőkre is vonatkozik, vagy csak a piramisok alatt még rejtett kincs-hozzárendelésekre? Javasolt modell: lásd 8.2.
6. **Automatikus húzás speciális kártya után** — ha a húzott lap speciális (nem kincs), a soron lévő játékos `activeCard` nélkül marad; a jelenlegi "szerencsés eset" minta szerint feltehetően a speciális hatás lezárása UTÁN ugyanő automatikusan húz tovább, amíg kincs-kártya nem jön ki — ezt érdemes megerősíteni. - Minden speciális kártya mellékhatása legyen, hogy annak a játékosnak a körét, aki húzta lezárja.
7. **Elnevezési apróság**: a 3-as pakli `candlebar-b3-f4.png` fájlneve valószínűleg elírás — a kép ugyanazt a kincset ábrázolja, mint az 1-es/2-es pakli `candlestick-*` fájljai (megerősítve, közvetlenül megnézve a képeket) — a tervben `candlestick` `treasureId`-ra képezve, de érdemes a fájlt átnevezni/megerősíteni. - Megnéztem a fájlt, helyesen van elnevezve. Az előlapján 4-es szerepel, a 2-es és 1-es paklikban más-más szám szerepel az előlapján.

## 3. Adatmodell: state és action-ok

**Ez a szakasz az EREDETI (speciális kártyák nélküli) alapjáték modellje — ez pontosan így lett implementálva, és élesben ellenőrizve.** A speciális kártyák bevezetéséhez szükséges kiegészítést lásd a 8. szakaszban (terv, még nem implementálva).

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

### 5.1 Kincsek és célkártyák — ELAVULT, lásd 8.1

**Ez a rész az EREDETI, placeholder-alapú tervet írta le** (a kincsek/kártyák akkor még ismeretlen tartalommal, geometriai/szín-placeholderrel indultak — pontosan így lett implementálva, `treasureConfigs.ts` + `initialState.ts`'s `createDeck()`). **Azóta elkészültek a valódi, fényképezett assetek** (`assets/Ramses/png/`) — a real-asset bekötés tervét lásd a 8.1 szakaszban.

## 6. Nyitott kérdések összefoglalva (az EREDETI, 2026-07-26-i kör lezárása)

- [x] **Tábla rács-alakja és szomszédosság** (4. szakasz) — **MEGERŐSÍTVE: 6×8-as rács.** A szomszédosság-irány (4 irányú feltevés) egyelőre változatlan.
- [x] **A célkártyák pontos tartalma** — **LEZÁRVA placeholderrel ekkor, AZÓTA a 8. szakasz szerint a valódi tartalom is megerősítve** (lásd 8.1) — még nem implementálva.
- [x] **2D vs 3D renderer** — **MEGERŐSÍTVE: 3D, valódi kattintható 3D-elemekkel** (nem képernyő-térbeli overlay, mint Hotelnél) — lásd 5. szakasz, `GridBoard3D` komponens implementálva.
- [x] **Szabály-módosítás elfogadva:** egy sikeres találat UTÁN a soron lévő játékos maga húz új lapot és folytatja a körét — a kör csakis egy ROSSZ kincs felfedésekor száll a következő játékosra (a hivatalos szabálykönyvtől eltérő, szándékos házi szabály). Lásd 2.3 szakasz, beépítve az adatmodellbe és a reducer-leírásba is.
- [x] **LEZÁRVA ekkor (a felhasználó döntése alapján), AZÓTA RÉSZBEN ÚJRANYITVA a 8. szakasz szerint:** a speciális akció-kártyák Ramses-0a-ban NEM voltak hatókörben — ez a döntés a 8. szakaszban módosult (lásd ott a friss nyitott kérdéseket, 8.2). A haladó (zsetonos) verzió és az 1 fős szóló verzió továbbra is külön, jövőbeli fázis témája, változatlanul.

**Az EREDETI kör minden nyitott pontja lezárva volt, implementálva és élesben ellenőrizve — a FRISS nyitott kérdéseket lásd a 8. szakaszban.**

## 7. Diagram (az eredeti alapjáték)

Lásd: [diagrams/ramses-0a-engine-class-diagram.puml](./diagrams/ramses-0a-engine-class-diagram.puml) (adatmodell) és [diagrams/ramses-0a-turn-flow.puml](./diagrams/ramses-0a-turn-flow.puml) (egy `SLIDE_PYRAMID` akció három lehetséges kimenetele). **Mindkettő az EREDETI, speciális kártyák nélküli modellt írja le.** A 8. szakasz kiegészítéséhez lásd [diagrams/ramses-0a-special-cards-draft.puml](./diagrams/ramses-0a-special-cards-draft.puml) — ez CSAK a már nyitott kérdés nélkül eldönthető részt (a `DrawnCard` felosztás, `treasureLayerRotated`) modellezi; a bizonytalan kártyák (Ajándék/Kockázat/Fata Morgana/Sivatagi póker) lépésenkénti folyamatának saját turn-flow diagramja csak a 8.2-es nyitott kérdések tisztázása után készülhet el.

## 8. Kiegészítés (2026-07-29): speciális kártyák valós szabályai + valódi assetek — TERV, MÉG NEM IMPLEMENTÁLVA

A felhasználó két dolgot adott át ehhez a körhöz: (1) pontosította a speciális kártyák szabályát közvetlenül ebben a dokumentumban (2.5 szakasz), és (2) elkészítette a valódi, fényképezett assetek első verzióját (`assets/Ramses/png/`, gitignore-olt, ~223MB nyersen — a webes kiszolgáláshoz túl nagy, tömörítés szükséges, ugyanaz a helyzet, mint Hotel-0c-nél volt). Ez a szakasz a valódi képek átnézése + a 2.5-ös szabály alapján igazítja a tervet — **kód még NEM változott, ez tisztán dokumentáció.**

### 8.1 Valódi assetek — leltár és tervezett pipeline

**Forrás:** `assets/Ramses/png/` (gitignore-olt, `assets/**` mintával — ugyanaz a szabály, mint Hotelnél):
```
assets/Ramses/png/
├─ board/
│  ├─ frame.png        (10.9MB — a piramisok ALÁ kerülő díszes keret-overlay, a kincs-réteg fölé)
│  ├─ empty.png        (a "nincs kincs" háttérkép — a kincs-réteg üres celláihoz)
│  └─ {bird,candlestick,computer,dog,duck,glasses,hippopotamus,mummy,
│      prosthesis,sphinx,stroller,trumpet}.png   (a 12 kincs saját képe, ~30-60KB/db)
├─ cards/
│  ├─ back/{1,2,3}.png                            (a 3 pakli hátoldala)
│  ├─ 1/  (20 fájl, ~1.4-1.7MB/db — kincs-kártya előlapok, ld. lent)
│  ├─ 2/  (13 fájl — 8 kincs-kártya + 5 speciális-fájl, egy fájl akár több példányt is jelent)
│  ├─ 3/  (9 fájl — 8 kincs-kártya + 1 speciális-fájl)
│  └─ cards.xcf                                    (GIMP forrásfájl, nem kell a pipeline-ba)
```

**Elnevezési konvenció (megerősítve, a felhasználó leírása szerint, a fájlokkal keresztellenőrizve):**
- Sima kincs-kártya: `[kincs neve]-b[hátoldal száma]-f[pontérték].png` — a `f` szám a KÁRTYA ELŐLAPJÁN nyomtatott PONTÉRTÉK (vizuálisan ellenőrizve: `bird-b1-f1.png` "1"-es számot mutat, `bird-b1-f2.png` "2"-est), NEM egy változat-sorszám.
- Speciális kártya: `special-[kártya neve]-b[hátoldal száma]-[Nx].png` — az `Nx` az adott típusból a pakliban lévő PÉLDÁNYSZÁM (pl. `special-fataMorgana-b2-3x.png` = 3 db azonos Fata Morgana lap).
- Minden nem-speciális kártya pontosan egyszer szerepel (nincs `Nx` a nevükben, mert mindig 1x).
- **Egy apró elnevezési következetlenség**, érdemes megerősíteni/javítani: a 3-as pakli `candlebar-b3-f4.png` fájlja vizuálisan UGYANAZT a kincset ábrázolja, mint a `candlestick-*` fájlok máshol (közvetlenül megnézve mindkettőt) — feltehetően elgépelés, a tervben `candlestick` `treasureId`-ra képezve.

**Pontos deck-összetétel kincsenként/pontértékenként** (a fájllistából levezetve, lásd 2.1):

| Kincs | Pakli 1 | Pakli 2 (3 pont) | Pakli 3 (4 pont) |
|---|---|---|---|
| bird | 1, 2 | — | — |
| candlestick | 1, 2 | 3 | 4 (fájlnév: `candlebar`) |
| computer | 1, 2 | 3 | 4 |
| dog | 1, 2 | — | 4 |
| duck | 1 | 3 | — |
| glasses | 1 | 3 | — |
| hippopotamus | 1, 2 | — | 4 |
| mummy | 1, 2 | 3 | 4 |
| prosthesis | 1 | 3 | 4 |
| sphinx | 1 | 3 | — |
| stroller | 1, 2 | — | 4 |
| trumpet | 1, 2 | 3 | 4 |

(Összesen 36 kincs-kártya + 11 speciális a 2-es pakliban + 1 speciális a 3-asban = 48 lap — lásd 2.1.)

**Tervezett pipeline, a Hotel-0c mintáját követve** (`docs/hotel-0c-specifikacio.md` §3), de EGYSZERŰBB — nincs HEIC-forrás, a nyers fájlok már PNG-k:
```
assets/Ramses/png/**                    (gitignore-olt, nyers — 223MB)
        │  ÚJ szkript: scripts/resize-ramses-images.mjs (npm run assets:resize-ramses-images)
        │  a Hotel resize-hotel-images.mjs mintája (sharp, max 1024px, JPEG/PNG a
        │  gardens-mintához hasonlóan átlátszó rétegeknél, ha kell)
        ▼
public/assets/ramses/**                 (verziózott, tényleg kiszolgálva)
```

**Renderelő-oldali változás terve** (`RamsesGamePage.tsx`'s `renderCell`, jelenleg §5-ben leírt geometriai placeholder):
- A **piramisok geometriája VÁLTOZATLAN marad** (egyszerű színes kúp) — a valódi fizikai piramisok is sima, mintázat nélküli műanyag darabok, nincs hozzájuk saját kép az assetek között, tehát nincs is mit lecserélni.
- A **kincs-réteg** (jelenleg egy sima színes `planeGeometry`) valódi textúrát kap: a cella `treasureId`-ja alapján a megfelelő `board/{treasureId}.png`, vagy `board/empty.png` ha üres.
- **Új, globális overlay-réteg**: `board/frame.png`, a kincs-réteg FÖLÖTT és a piramisok ALATT (a felhasználó megerősítése szerint) — egy, az egész táblát lefedő síkként, a `GridBoard3D`-n kívül vagy egy új `background`-szerű propon keresztül (ugyanaz a minta, mint Hotel `LoopTrackBoard3D`'s `background` propja).
- A **kártya-UI** (jelenleg `activeCard`/`wonCards` egy színes körrel + szöveggel jelenik meg a HUD-on) valódi kártyaképet kap: `cards/{pakli}/{treasureId}-b{pakli}-f{pontérték}.png` az előlaphoz, `cards/back/{pakli}.png` a húzópakli hátulnézetéhez.
- `treasureConfigs.ts` a placeholder Egyiptom-témájú, kitalált nevek (szkarabeusz, ankh, Hórusz szeme, ...) helyett a valódi 12 kincs nevét/id-ját kapja (lásd 2.1), `imagePath` mezővel kiegészítve.

### 8.2 Adatmodell-kiegészítés a speciális kártyákhoz — JAVASOLT VÁZLAT, nyitott kérdésekkel

Diagram: [diagrams/ramses-0a-special-cards-draft.puml](./diagrams/ramses-0a-special-cards-draft.puml).

**Ami már MOST, ambiguity nélkül eldönthető és tervezhető:**

```typescript
// state.ts — kiegészítés terve
export interface TreasureCard {
  kind: 'treasure';
  id: string;
  treasureId: string;
  points: number; // 1-4
}

export type SpecialCardType = 'SANDSTORM' | 'GIFT' | 'RISK' | 'FATA_MORGANA' | 'POKER' | 'FINISH';

export interface SpecialCard {
  kind: 'special';
  id: string;
  specialType: SpecialCardType;
}

export type DrawnCard = TreasureCard | SpecialCard;

export interface RamsesState {
  // ... a meglévő mezők (3. szakasz) ...
  drawPile: DrawnCard[];       // korábban SearchCard[] — most a 2-3. pakliban special is lehet
  activeCard: TreasureCard | null; // csak kincskártya lehet aktív keresési cél, változatlan
  /**
   * Homokvihar hatása — a felhasználó megfogalmazása szerint a kincs-réteget
   * kell 180°-kal elforgatni. Mivel a 6×8 rács 180°-os elforgatásra nézve
   * szimmetrikus (r,c -> 5-r,7-c pontosan egy másik valódi cellára képez),
   * ez modellezhető egyetlen boolean flag-gel ahelyett, hogy az összes
   * RamsesCell.treasureId-t ténylegesen újraírnánk: a "hatékony" treasureId
   * a flag alapján vagy a cella saját, vagy a 180°-kal átellenes cella
   * EREDETI treasureId-je. Ez pontosan megfelel annak, mintha a fizikai
   * kincs-réteget elforgatnánk a piramis-réteg/keret alatt. NYITOTT: a már
   * felfedett (piramis nélküli) mezőkre is vonatkozik-e — lásd lent.
   */
  treasureLayerRotated: boolean;
}
```

**Ami MÉG NYITOTT — ezek nélkül a fenti váz nem véglegesíthető implementálásra** (lásd 2.5 "Nyitott kérdések" is, ugyanazok, itt technikai szemszögből):
- Kell-e egy Hotel-stílusú `turnPhase`/`pendingSpecialEffect` állapot-gép (pl. `AWAITING_GIFT_CHOICE`, `AWAITING_RISK_NAMING`, `AWAITING_RISK_SLIDE_1`, `AWAITING_POKER_NAMING`, ...), és pontosan hány lépésből áll egyik-másik kártya feldolgozása? Ez csak azután dönthető el, hogy a 2.5-ös nyitott kérdések (különösen az Ajándék/Kockázat "valódi lépés vagy csak megnevezés" kérdése) tisztázódtak.
- Milyen ÚJ `RamsesAction` típusok kellenek (pl. `CHOOSE_GIFT_TREASURE`, `NAME_RISK_TREASURES`, `NAME_POKER_TARGET`) — a pontos mezőik a fenti nyitott kérdésektől függenek.
- A Fata Morgana mechanikája annyira bizonytalan (2.5/3. nyitott kérdés), hogy egyelőre NEM javaslok konkrét adatmodellt hozzá — playteszteléssel/szabálykönyv-tisztázással kell kezdeni.

**Javasolt következő lépés:** a 2.5/8.2 nyitott kérdéseinek megválaszolása (playteszt vagy a fizikai szabálykönyv-betét újraolvasása) — utána egy külön, immár implementálásra kész kiegészítő kör tervezhető (saját diagramokkal), ugyanabban a mintában, mint ez a dokumentum eredetileg épült.

A 2.5 nyitott kérdéseire válaszoltam. A válaszok alapján a 8.2 is le fog tisztulni. Ha mégis marad nyitott kérdés, azt egy következő körben megválaszolom.