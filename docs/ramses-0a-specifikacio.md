# Ramses-0a — Specifikáció: helyi vertikum (alapjáték motor + 2D renderer + N-fős hot-seat)

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
- Egyszerű 2D tábla-renderer (rács, kattintható piramisok)

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
- 47 pozícióra piramis kerül, PONTOSAN 1 marad üresen — a szabály szerint az induló üres mező NEM mutathat kincset (ez csak a kezdő-felállítást korlátozza, a parti közben bármelyik felfedett mező lehet kincs vagy üres).
- A 30 célkártya megkeverve, húzópakli.

### 2.3 Körvezérlés

Óramutató járása szerint haladva:

1. Az aktív játékos felfordítja a húzópakli tetején lévő lapot (ha még nincs "aktuális cél") — ez mutatja, melyik kincset keresi, és mennyi pontot ér.
2. **Kivétel/"szerencsés" eset:** ha az új lap kincse ÉPPEN megegyezik azzal, ami már fel van fedve (az aktuálisan üres mezőn, amit az előző játékos húzása hagyott ott), a játékos AZONNAL megkapja a lapot, lépés nélkül, és a kör a következő játékosra száll.
3. Egyébként a játékos az üres mezővel SZOMSZÉDOS piramisok közül pontosan egyet az üres helyre csúsztat — ez FELFEDI a piramis EREDETI helyét (klasszikus "15-ös kirakó" logika: a mozgó darab helye lesz üres, nem a célhely).
4. A felfedett mező alapján három eset:
   - **Üres:** a játékos folytathatja, ismét csúsztathat egy, az ÚJ üres hellyel szomszédos piramist — tetszőleges hosszúságú láncban, amíg kincset nem talál.
   - **Rossz kincs:** a kör azonnal véget ér, a lap NEM kerül el (marad felfedve, célként), a következő játékos ugyanazt a kincset keresi tovább.
   - **Jó kincs:** a játékos elveszi a lapot (lefordítva maga elé teszi — ez a "megnyert" kártyáinak kupaca), a kör véget ér, a következő játékos új lapot húz (2. pont szerint).
5. A játék véget ér, amint valaki elviszi az UTOLSÓ célkártyát a pakliból.

**Fontos:** a "kör vége" NEM külön játékos-döntés (nincs "Kör vége" akció, mint Hotelnél) — kizárólag a felfedés kimenetele dönti el automatikusan. Ez a motort jelentősen egyszerűbbé teszi, mint a Hotelt: gyakorlatilag **egyetlen action-típus** kell (`SLIDE_PYRAMID`), a lapfelfordítás/kör-váltás a reducer belső, automatikus lépése, nem külön akció.

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
  id: string; // pl. "r3c5" — a pontos rács-alak még nyitott kérdés, lásd 5. szakasz
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

**A `reducer.ts` felelőssége `SLIDE_PYRAMID`-nál:**
1. Validálja: `fromCellId` szomszédos-e `emptyCellId`-vel, és van-e ott piramis (`rules.ts`, ugyanaz a minta, mint Dáma/Hotel `can*` predikátumai).
2. Áthelyezi a piramist (`fromCellId.hasPyramid = false`, `emptyCellId.hasPyramid = true`), majd `emptyCellId = fromCellId` (a régi hely lesz az új üres).
3. Megnézi az ÚJ üres mező `treasureId`-ját:
   - `null` → nincs egyéb állapotváltozás, a kör folytatódik (ugyanaz a játékos, ugyanaz az `activeCard`).
   - `=== activeCard.treasureId` → a lap átkerül a játékos `wonCards`-ába, `activeCard = null`, `currentPlayerIndex` a következőre lép, majd (lásd alább) automatikusan húz egy új lapot.
   - egyéb kincs → `currentPlayerIndex` a következőre lép, `activeCard` VÁLTOZATLAN marad.
4. **Automatikus lap-húzás** (akárhányszor `activeCard` üresre vált, akár kezdéskor, akár győzelem után): a reducer lehúzza a pakli tetejét `activeCard`-nak; ha ennek `treasureId`-ja ÉPPEN megegyezik az `emptyCellId` aktuális `treasureId`-jával (2.3/2. pont "szerencsés eset"), azonnal átkerül a soron lévő játékos `wonCards`-ába, és a folyamat rekurzívan megismétlődik (következő játékos, új lap) — ez elvben egy rövid láncot indíthat el, ha többször egymás után "szerencséje van" valakinek.
5. Ha a `drawPile` kiürül az utolsó lap elvétele után, `status = 'FINISHED'`, kiszámolja a `winnerIds`-t (2.4 szakasz szabálya szerint).

## 4. Tábla-topológia — NYITOTT KÉRDÉS

A 48 lyuk pontos rács-alakját (hányszor hány, és hogy a szomszédosság 4 vagy esetleg 8 irányú-e) **nem tudom biztosan** a szabálykönyv szövegéből — ehhez a fizikai tábla lefotózása/megszámolása kell. **Erre vársz vissza** (a beszélgetés korábbi pontján jelezted, hogy megnézed).

Addig is a `board`/szomszédosság-számítás a `rules.ts`-ben **konfigurációból, nem hardcode-olva** épül fel (ugyanaz az elv, mint Hotel `adjacentLotIds`-je) — ha kiderül, hogy a rács alakja szabálytalan (pl. nem tökéletes téglalap, mint ahogy a fotón látszó dobozbetét sugallja), az egy konfigurációs változás, NEM motor-átírás.

**Ideiglenes feltevés, amíg nem érkezik pontosítás:** 6×8-as téglalap rács, 4 irányú (fel/le/jobb/bal, NEM átlós) szomszédosság.

## 5. Renderelő-választás: 2D (javaslat)

A `Projekt-conception.md` 3D/2D döntése (2026-07-22) a Hotelt/Gazdálkodj okosant/Monopolyt/Catant sorolta 3D-be ("térbeli tábla-élmény hozzáadott értéket ad"), a "kirakós jellegű" játékokat pedig 2D/SVG-be. A Ramses lényegében egy **rács-alapú kirakó** (a piramisok 3D alakja csak díszítés, a játékmenet szempontjából egy sima rács-mező felel meg neki) — ezért **2D/SVG vagy Canvas renderert javaslok**, a Sakk/Malom-féle `GridBoard2D` mintáját követve (`src/client/renderers/grid-2d/`), NEM a Hotel `LoopTrackBoard3D`-jét. Ha egyetértesz, ez lesz a terv; ha inkább 3D-t szeretnél (pl. mert a piramisok fizikai "billentése" szép animáció-lehetőség lenne), szólj.

## 6. Nyitott kérdések összefoglalva

- [ ] **Tábla rács-alakja és szomszédosság** (4. szakasz) — a fizikai tábla lefotózása/megszámolása után pontosítandó.
- [ ] **A 30 célkártya pontos tartalma** (melyik kincs, milyen pontértékkel, hányszor szerepel) — a szabálykönyv csak annyit közöl, hogy 1–4 pont közötti értékek vannak, a pontos lap-eloszlást a fizikai kártyapakli alapján érdemes rögzíteni (vagy egy ésszerű, egyenletes placeholder-eloszlással indulunk, és pontosítjuk, ha meglesz a pontos lista).
- [ ] **2D vs 3D renderer** (5. szakasz) — 2D a javaslatom, megerősítésre vár.
- **LEZÁRVA (a felhasználó döntése alapján):** a 4 speciális akció-kártya, a haladó (zsetonos) verzió és az 1 fős szóló verzió Ramses-0a-ban NINCS hatókörben — külön, jövőbeli fázis(ok) témája, amint a pontos szabályaik tisztázódnak.

## 7. Diagram

Lásd: [diagrams/ramses-0a-engine-class-diagram.puml](./diagrams/ramses-0a-engine-class-diagram.puml) (adatmodell) és [diagrams/ramses-0a-turn-flow.puml](./diagrams/ramses-0a-turn-flow.puml) (egy `SLIDE_PYRAMID` akció három lehetséges kimenetele).
