# Hotel-0d — Specifikáció: AI ellenfél

**Státusz:** Tervezés — a meglévő infrastruktúra felmérve, nyitott döntési pontok a 6. szakaszban
**Utolsó frissítés:** 2026-07-26
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [fazis-0c-dama-ai-specifikacio.md](./fazis-0c-dama-ai-specifikacio.md) (a minta, amit itt kiterjesztünk), [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md)

## 1. Cél és hatókör

**Kérés:** Hotel online szobában is legyen választható AI ellenfél, ugyanúgy, ahogy Dámánál (Fázis 0c) már megvan. A Dáma-körben tudatosan úgy épült meg a mechanizmus (`GameRoom` core osztályban, nem `DamaRoom`-ban), hogy minden jövőbeli játék — így Hotel is — változtatás nélkül örökölje. Ez a terv azt vizsgálja meg, **mi az, ami TÉNYLEG hiányzik**, és mi az, ami már készen áll.

**Hatókörben van:**
- A meglévő, game-agnosztikus AI-infrastruktúra ( `GameRoom.aiSlots`/`computeAiMove`/`maybeTriggerAiMove`) két, Hotel által feltárt hiányosságának általánosítása (lásd 3. szakasz)
- `HotelRoom.computeAiMove` tényleges implementációja + egy Hotel-specifikus, egyszerű döntés-stratégia
- Szerver-oldali kocka-/engedély-dobás generálás az AI lépéseihez (a kliens `Math.random()`-jának szerver-oldali megfelelője)
- Szoba-létrehozási UI: Hotelnél N-fős AI-választás (nem bináris Ember/AI, mint Dámánál)

**Nincs hatókörben:**
- Erősebb/stratégiai AI (értékelő függvény, keresés) — ugyanúgy, mint Dámánál, ez egy jövőbeli, külön téma
- "AI gondolkodik…" mesterséges késleltetés — a Dáma-döntés (nem kell) érvényben marad, hacsak nem jelzed másképp
- Hot-seat módú AI Hotelhez — más koncepció (Fázis 0a §6-tal rokon), nem ez a kör

## 2. Mi van már készen — a Dáma-kör generikus AI-infrastruktúrája

A `src/server/core/GameRoom.ts` (jelenlegi, Hotel-0b utáni állapot) **már tartalmazza** a teljes szoba-szintű AI-gépezetet, game-agnosztikusan:

- `aiSlots: Set<TPlayerSlot>`, `aiOpponentRequested: boolean`, `registerAiOpponent()` — AI-felhasználó regisztrálása (`ensureAiUser`, `aiUsers.ts`, game-agnosztikus) és szoba-szlot kiosztása.
- `maybeTriggerAiMove()` — minden emberi akció (és minden AI-lépés) UTÁN lefut, kiszámol egy AI-lépést, és **pontosan ugyanazon a validációs csövön** engedi át (`isActionAllowed` → reducer → `syncState`), mint egy emberi akciót. Nincs kiváltságos state-hozzáférés.
- `protected abstract computeAiMove(state: TState): TAction | null;` — ezt implementálja jelenleg `DamaRoom` (`pickRandomMove`), Hotelnél pedig **jelenleg mindig `null`-t ad vissza** (`HotelRoom.ts`, "Hotel-0d's job — no AI opponent in Hotel-0b at all").
- `LobbyPage.tsx`/`gamesRegistry.ts` — a `GameOnlineOptions.supportsAiOpponent` mező kifejezetten **Dáma-only-ként van kommentezve, "Hotel-0d adds this for Hotel"** felirattal — ezt már a Hotel-0b kör előre látta.

**Tehát a "nehéz" rész (szoba-szintű huzalozás, adatbázis, virtuális kliens elv) készen van.** Ami hiányzik, az kizárólag Hotel-specifikus: a döntéshozó stratégia, és két, Hotel N-fős/kilépés-nélküli-akció jellege miatt szükséges általánosítás a core-ban.

## 3. Két valós hiányosság, amit Hotel feltár a meglévő mechanizmusban

### 3.1 `opponentType: 'HUMAN' | 'AI'` bináris — Hotel 2-4 fős, több AI is lehet

A jelenlegi `GameRoomCreateOptions.opponentType` egy bináris kapcsoló, és a `registerAiOpponent()` hívása **legfeljebb egyszer** fut le (`if (this.aiOpponentRequested && this.aiSlots.size === 0)`) — ez Dámánál helyes (mindig pontosan 1 emberi + legfeljebb 1 AI), de Hotelnél (2-4 fő) a létrehozó szeretné megmondani, **hány** AI-ellenfél töltse ki a maradék helyeket (pl. 4 fős szoba: 1 ember + 3 AI, vagy 2 ember + 2 AI, stb.).

**Javaslat:** `opponentType` lecserélése egy általánosabb `aiOpponentCount?: number` mezőre (0 = nincs AI). Dáma ugyanezt a mezőt használná, csak nála az UI 0/1 közötti bináris választóként jelenik meg (nem kell neki N-fős stepper). A `registerAiOpponent()` hívása egyszeri hurokká alakul: a létrehozó csatlakozása UTÁN azonnal feltölti a kért számú AI-slotot, a maradékot (ha van) valódi játékosoknak hagyva — ugyanaz az időzítés, mint Dámánál, csak ismételve.

### 3.2 `computeAiMove(state)` nem tudja, MELYIK szlot AI — az árverés ezt Hotelnél kikényszeríti

Dámánál `computeAiMove(state)` egyetlen "mit lépne a soron lévő játékos" akciót ad vissza, és a `maybeTriggerAiMove` utólag ellenőrzi, hogy a soron lévő szlot véletlenül AI-e. Ez működik, mert Dámánál **mindig csak a soron lévő játékos** cselekedhet.

**Hotelnél ez nem igaz** — az árverés (`PLACE_BID`/`PASS_BID`) kifejezetten a `isActionAllowed`-be épített kivétel: bármelyik, **nem árverező** játékos licitálhat/passzolhat, függetlenül attól, hogy épp kinek van "köre". Egy AI-nak tehát **akkor is** kell tudnia cselekedni, ha épp NEM ő a `currentPlayer` — de a jelenlegi `computeAiMove(state)` szignatúra nem kapja meg, MELYIK szlotok AI-k, így nem tudja eldönteni, melyik licitálót "alakítsa".

**Javaslat:** `computeAiMove` szignatúrája bővüljön a megkérdezett szlottal: `computeAiMove(state: TState, slot: TPlayerSlot): TAction | null` — "mit lépne EZ a konkrét szlot, ha rá kerülne a sor/ha neki kell reagálnia most." A `maybeTriggerAiMove` minden AI-szlotot sorra kérdez (nem egyet, globálisan), amíg egyik sem tud/akar lépni. Dáma implementációja a `slot` paramétert egyszerűen figyelmen kívül hagyhatja (ugyanaz a minta, mint az `isActionAllowed` kiterjesztésénél — a megosztott szerződés bővül, a régi felhasználó nem kényszerül különleges esetre). **Ez a `GameRoom` core osztályt módosítja**, tehát Dáma is örökli, változtatás nélkül helyesen viselkedve.

## 4. Hotel AI-stratégia terve

### 4.1 Alapelv — ugyanaz, mint Dámánál: csak a `getValidActions`/`can*` predikátumokból választ

A stratégia **sosem** léphet ki a `getValidActions(state)` (és a bővebb, sor-specifikus predikátumok, pl. árverésnél `remainingBidderIds`) által megengedett halmazból — ugyanaz a garancia, mint Dámánál ("nem tud illegális lépést adni, mert csak `getValidMoves` eredményéből választ").

### 4.2 Egy valós viselkedési kockázat, amit a kód átvizsgálásakor találtam — nem "tisztán véletlenszerű" a javaslatom

Dámánál minden elérhető akció (MOVE) érdemi, előrevivő lépés — egy egyenletesen véletlenszerű választás soha nem "önsértő". **Hotelnél ez NEM igaz**: `canForfeit(state)` szinte MINDIG igaz (`turnPhase !== 'AUCTION_IN_PROGRESS'`) — egy naiv, minden elérhető akció közül egyenletesen véletlenszerűen választó AI **rendszeresen fel is adná a játékot**, ami egy teljesen használhatatlan "ellenfelet" eredményezne. Hasonlóan, `canEndTurn` is gyakran igaz `RESOLVING_SPACE`-ben, miközben még lenne mit tenni (telket venni, építeni) — egy egyenletes véletlen ezt is túl gyakran választaná.

**Javaslat (nyitott döntés, lásd 6. szakasz):** a `FORFEIT` NE kerüljön be a "véletlenszerűen választható" akciók közé v1-ben (az AI sosem ad fel önként) — ez nem "okosítja" az AI-t stratégiailag, csak elkerüli az önsértő, working-as-intended-de-értelmetlen viselkedést. A `END_TURN` pedig csak akkor kerüljön kiválasztásra, ha **nincs más elérhető, előrevivő akció** — nem egy egyenrangú véletlen opció a többi mellett.

### 4.3 Kétlépcsős véletlen választás — ugyanaz a minta, mint Dámánál

1. Összegyűjtjük a jelenleg elérhető **akció-kategóriákat** (`getValidActions` mezői alapján: dobás, telek-vásárlás, építkezés, lépcső-vásárlás/elhelyezés, árverés-indítás, feladás [4.2 szerint kizárva], kör vége [csak utolsó lehetőségként]).
2. Egyenletesen véletlenszerűen választunk egyet **az érdemi kategóriák közül** (ha van ilyen; ha nincs, jön a `END_TURN`).
3. A kategórián belül egy második véletlen választással eldöntjük a konkrétumot (melyik telek, melyik terv, stb.) — pl. építkezésnél a `constructionOptions` egyikét véletlenszerűen, majd — mivel a valódi felhasználói felület is így teszi — a "dobás nélküli" vs. "engedélyt kér" közül is választani kell, ha mindkettő elérhető (`canBuildWithoutPermit`).
4. Árverés/licit: minden AI-szlotot egyenként kérdezünk (3.2 szerint) — ha a szlot a `remainingBidderIds`-ben van, egyenletes véletlennel dönt licit/passz között (megfizethető licitek közül).

### 4.4 Kocka-/engedély-érték generálása szerver-oldalon

A `ROLL_MOVE_DICE`/`ROLL_NIGHTS`/`ROLL_BUILDING_PERMIT` akciók egy `value`-t hordoznak, amit eddig mindig a KLIENS generált (`Math.random()`-alapú `rollD6`/`rollPermitDie`, `hotelMenuLevels.tsx`). Az AI "virtuális kliensként" ugyanezt teszi, csak a szerveren — egy új, kicsi, Hotel-specifikus segédmodul (`src/server/games/hotel/ai/`) ugyanazokkal a súlyokkal (`PERMIT_DIE_FACES` mintája) generálja az értékeket, a motor pedig (helyesen) nem tudja/nem is kell tudnia, hogy egy emberi vagy egy AI-kliens generálta-e.

## 5. Diagram

Lásd: [diagrams/hotel-0d-ai-sequence.puml](./diagrams/hotel-0d-ai-sequence.puml) — egy tipikus kör, amiben egy AI lép, majd egy másik AI árverésen licitál.

## 6. Nyitott döntési pontok

- [ ] **`computeAiMove` szignatúra-bővítés** (3.2): `computeAiMove(state, slot)` — egyetért, hogy ez helyes/szükséges általánosítás a `GameRoom` core-ban (Dáma-implementáció változatlan viselkedéssel, csak figyelmen kívül hagyja az új paramétert)?
- [ ] **`opponentType` → `aiOpponentCount`** (3.1): egyetért ezzel az átnevezéssel/általánosítással (Dáma is átáll rá, UI-ban bináris marad neki)?
- [ ] **FORFEIT kizárva, END_TURN csak utolsó lehetőségként** (4.2): egyetért ezzel a "nem tisztán véletlenszerű, hanem önsértéstől mentes" alapelvvel, vagy legyen az AI TÉNYLEG mindenben egyenletesen véletlenszerű (Dáma-szerűen), a feladást/kör-végét is beleértve?
- [ ] **Hány AI-t engedjünk egy Hotel szobában, és mikor töltődnek fel a szlotok?** Javaslat: a létrehozó a szoba-létrehozáskor (a jelenlegi játékosszám-választó mellett) egy számot ad meg (0 és `playerCount-1` között), és ez a szám AZONNAL, a létrehozó csatlakozása után feltöltődik AI-val — a maradék hely(ek) nyitva maradnak valódi játékosoknak (ugyanaz az időzítés, mint Dámánál).
- [ ] **"AI gondolkodik…" késleltetés** — Dáma-döntés (nincs) örökölve marad, vagy legyen most valamennyi Hotelnél (pl. mert egy Hotel-kör több lépésből áll, és egy azonnali "AI lezavarja az egész körét egy villanás alatt" élmény furcsa lehet)?
