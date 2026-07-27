# Hotel-0d — Specifikáció: AI ellenfél

**Státusz:** IMPLEMENTÁLVA — a teljes terv (3, 4.1-4.8, 9. szakaszok) elkészült és le van tesztelve (lásd a 8. szakaszt az implementáció során felmerült részletekért, köztük egy, a keresés által felfedezett, a keresésen kívül is élő reducer-hibáról; a 9. szakaszt a hot-seat AI-ért, ami ugyanazt a döntéshozó logikát használja, mint az online mód). A Hotel-0d.2 (7. szakasz, csak-AI játékok elemzése) külön, jövőbeli fázis.
**Utolsó frissítés:** 2026-07-26
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [fazis-0c-dama-ai-specifikacio.md](./fazis-0c-dama-ai-specifikacio.md) (a minta, amit itt kiterjesztünk), [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md)

## 1. Cél és hatókör

**Kérés:** Hotel online szobában is legyen választható AI ellenfél, ugyanúgy, ahogy Dámánál (Fázis 0c) már megvan — de a Dáma egyszerű, tisztán véletlenszerű AI-jánál érdemben erősebb: **három nehézségi szintű, állapotfa-kereséssel döntő AI**. A Dáma-körben tudatosan úgy épült meg a mechanizmus (`GameRoom` core osztályban, nem `DamaRoom`-ban), hogy minden jövőbeli játék — így Hotel is — változtatás nélkül örökölje. Ez a terv azt vizsgálja meg, **mi az, ami TÉNYLEG hiányzik**, és mi az, ami már készen áll.

**Hatókörben van:**
- A meglévő, game-agnosztikus AI-infrastruktúra ( `GameRoom.aiSlots`/`computeAiMove`/`maybeTriggerAiMove`) két, Hotel által feltárt hiányosságának általánosítása (lásd 3. szakasz)
- `HotelRoom.computeAiMove` tényleges implementációja egy **expectimax-alapú, heurisztikus kiértékelésű keresési stratégiával**, három választható nehézségi szinttel (lásd 4. szakasz)
- **Szerver-oldali kocka-/engedély-dobás generálás MINDEN online dobásnak, nem csak az AI-nak** — jelenlegi csalási rést javít (lásd 4.6), a kliens `Math.random()`-ja csak hot-seat módban marad
- Szoba-létrehozási UI: Hotelnél N-fős AI-választás (nem bináris Ember/AI, mint Dámánál), nehézségi szint kiválasztásával
- "AI gondolkodik…" mesterséges késleltetés lépésenként (eltérés a Dáma-döntéstől, lásd 4.8)
- Ki-/bekapcsolható teljes naplózó rendszer csak-AI játékok utólagos elemzéséhez (lásd 4.8, Hotel-0d.2 — 7. szakasz) — **szándékosan véglegesen rejtve marad a felhasználók elől, sosem lesz hozzá UI-kapcsoló** (lásd 4.8)
- **Hot-seat AI** — ugyanaz a döntéshozó logika (`shared/games/hotel/ai`), amit az online mód is használ, most már hot-seat módban is elérhető, a meglévő kód duplikálása nélkül (lásd 9. szakasz)

**Nincs hatókörben:**
- **Az értékelő függvény pontos súlyainak playtesztelt finomhangolása — ez KIFEJEZETTEN NEM Claude feladata.** A 4.3-ban javasolt tényezők (és a szimulációs kör során módosított értékek, 8.1 szakasz) az induló javaslat; a további finomítás a felhasználó dolga, valódi, emberekkel lejátszott partik alapján.
- Szlotonkénti (nem csak szobánkénti/játékonkénti) AI-nehézség — a felhasználó megerősítette, hogy erre nincs szükség, lezárva (lásd 8. szakasz).
- A Hotel-0d.2-ben (7. szakasz) leírt csak-AI játékok tényleges lejátszása/elemzése — ez egy külön, jövőbeli fázis, csak a hozzá szükséges naplózó rendszert és szimulációs modult építettük meg most.

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

### 4.2 Miért nem elég a minimax, és miért expectimax kell

A klasszikus minimax 2 játékosos, véletlen nélküli, zéróösszegű játékra épül (sakk, dáma). A Hotel **2-4 játékos ÉS kockadobás-vezérelt** — mindkét tulajdonság megköveteli az algoritmus kiterjesztését:

- **Kockadobás → véletlen-csomópont (chance node):** minden `ROLL_MOVE_DICE`/`ROLL_NIGHTS`/`ROLL_BUILDING_PERMIT` pontban a fa nem egyetlen ághoz, hanem a lehetséges dobás-eredmények valószínűség-súlyozott átlagához vezet — ez teszi a keresést *expectimaxxá* a sima minimax helyett.
- **N-játékos → önjáték-feltevés (self-play):** mivel nincs "ellenfél", akinek a vesztesége a mi nyereségünk (nem zéróösszegű, 2-4 résztvevős), az összes játékos — a keresést végző AI éppúgy, mint a szimulált emberi/AI ellenfelek a fában — **ugyanazt a heurisztikus kiértékelő függvényt** követi saját döntéseinél. Ez nem jelenti azt, hogy a valódi ellenfelek ténylegesen így játszanak — csak azt, hogy a keresés idejére ez a legjobb elérhető közelítés arra, "mit tenne egy ésszerű játékos".

**Fa-felépítés egy adott mélységi szinten:** egy saját "lépés" a teljes saját kör(ök)ig tart (dobás → vásárlás/építés-döntések → kör vége), tele döntési csomópontokkal (saját választás) és véletlen-csomópontokkal (kockadobás). A saját kör után **minden más játékos teljes körét is szimulálni kell** (ugyanazzal a heurisztikával döntve helyettük), mielőtt a keresés a következő saját "lépés mélységre" léphetne. Ez a minta pontosan a `GameRoom` core "virtuális kliens" elvét tükrözi vissza a keresésen belülre: a kereső ugyanazt a tiszta `reducer(state, action)` függvényt hívja hipotetikus akciókra, mellékhatás és kiváltságos state-hozzáférés nélkül — a már meglévő tiszta reducer-architektúra pontosan erre alkalmas, külön szimulációs infrastruktúra nélkül.

### 4.3 Értékelő függvény (heurisztika)

Egy adott `HotelState`-re, egy adott játékos szemszögéből, összetett, súlyozott pontszámot számolunk:

- **Készpénz** — a legközvetlenebb, azonnal felhasználható erőforrás.
- **Telekportfólió értéke** — birtokolt telkek (és különösen a monopóliumok, ahol egy játékos egy szín/csoport összes telkét birtokolja) névértéken/piaci értéken számolva.
- **Épületek** — a birtokolt telkeken lévő szintek (jövőbeli bérleti bevétel becslése — minél több szint, annál nagyobb a várható jövőbeli bevétel egy ellenfél odaérkezésekor).
- **Ellenfelek csődkockázata** — minél közelebb van egy ellenfél a fizetésképtelenséghez (alacsony készpénz + kevés eladható vagyon), annál jobb ez nekünk — ez a tényező adja a keresésnek a "versengő" jelleget önjáték mellett is.

A pontos súlyok playteszteléssel finomhangolandók (lásd 1. szakasz, "Nincs hatókörben") — ez a induló, ésszerű összetétel.

### 4.4 Nehézségi szintek — a keresési mélység, mint egyetlen paraméter

Három választható nehézségi szint, kizárólag a **saját lépés szerinti mélységben** különbözik (a fenti 4.2 értelmében: 1 mélységi szint = 1 teljes saját kör előretekintése, közte az összes többi játékos szimulált körével):

| Szint | Mélység (saját körök előre) |
|---|---|
| Könnyű | 1 (gyakorlatilag mohó/greedy — csak az azonnali kör kiértékelése) |
| Közepes | 2 |
| Nehéz | 3 |

### 4.5 Számítási korlát — biztonsági háló a beállított mélység felett

Mivel egy Hotel-kör önmagában is sok döntési elágazást tartalmaz (dobás → telek-döntés → építési kombinációk → kör vége), a fa realisztikusan gyorsan kiszélesedhet — főleg úgy, hogy egyszerre több szoba/AI is futhat a szerveren. A beállított mélység (4.4) ezért **felső korlát, nem garancia**: a keresés egy kemény idő-/csomópont-költségvetéssel fut (pl. lépésenként egy rögzített ezredmp-keret), és ha ezt túllépné, a addig talált legjobb lépéssel tér vissza, akkor is, ha a konfigurált mélységet nem érte el. Ez védi a szervert egy váratlanul széles/lassú keresési esettől, konfigurált nehézségi szinttől függetlenül.

### 4.6 Kocka-/engedély-érték generálása szerver-oldalon — NEM csak az AI-nak, minden online dobásnak

**IMPLEMENTÁLVA** (a tervezéstől függetlenül, mert nem függ az AI-döntéshozataltól): [src/shared/games/hotel/dice.ts](../src/shared/games/hotel/dice.ts) (a szerver-oldali `rollD6`/`rollBuildingPermit`), `GameRoom.resolveServerAction` hook ([src/server/core/GameRoom.ts](../src/server/core/GameRoom.ts)) és annak `HotelRoom` felülírása ([src/server/games/hotel/HotelRoom.ts](../src/server/games/hotel/HotelRoom.ts)).

**Feltárt biztonsági rés (ellenőrizve a kódban):** a `ROLL_MOVE_DICE`/`ROLL_NIGHTS`/`ROLL_BUILDING_PERMIT` akciók egy `value`-t hordoznak, amit ma **mindig a KLIENS generál** (`Math.random()`-alapú `rollD6`/`rollPermitDie`, [hotelMenuLevels.tsx](../src/client/games/hotel/ui/hotelMenuLevels.tsx)), és a szerver ([HotelRoom.ts](../src/server/games/hotel/HotelRoom.ts) `isValidMovementOrPropertyAction`) **kizárólag a típusát ellenőrzi** (`typeof candidate.value === 'number'`, ill. hogy a permit-érték a megengedett arcok egyike) — azt NEM, hogy a szám valóban egy tisztességes dobásból származik-e. Ez ma is, AI nélkül is **valódi csalási lehetőség**: egy módosított online kliens mindig a legjobb `value`-t küldheti be, és a szerver ezt elfogadja.

**Javítás:** a dobás-érték generálásának felelőssége a **hitelesnek számító oldalra** kerül, kétfelé ágazva:
- **Online (Colyseus-szoba) mód** — a szerver az egyetlen hiteles fél, embernek és AI-nak egyaránt. A kliens egy érték NÉLKÜLI "dobás-szándékot" küld (`{ type: 'ROLL_MOVE_DICE' }`, `value` nélkül), a `HotelRoom` generálja a valódi `value`-t (ugyanazokkal a súlyokkal, mint ma a kliens — `PERMIT_DIE_FACES` mintája), és EZT a szerver-generált értéket adja tovább a reducernek. A szerver a kliens által esetlegesen mégis beküldött `value`-t figyelmen kívül hagyja/felülírja — sosem bízik meg benne, még akkor sem, ha az típushelyesen néz ki. Ez egységesen vonatkozik emberi ÉS AI (4.6 korábbi tartalma) dobásokra — nincs külön eset a kettő között, csak egyetlen "a szerver dob" szabály.
- **Hot-seat mód** — a te kérésed szerint marad kliens-oldali generálás (`Math.random()`, változatlanul), mert hot-seat kifejezetten NEM feltételez folyamatos szerver-kapcsolatot (egy eszközön, offline is játszható) — itt nincs is kivel szemben csalni, a "szerver" fogalma nem is értelmezhető erre a módra.

A keresésen belüli chance node-ok (4.2) ugyanezekkel a valószínűségi súlyokkal számolják a várható értéket — nem tényleges `Math.random()` hívással, hanem a lehetséges dobás-eredmények szerinti súlyozott átlaggal.

**Megjegyzés a hatókörről:** ez a javítás technikailag független attól, hogy létezik-e AI ellenfél — már a jelenlegi, csak emberi Hotel-0b/0c online módban is fennáll. Mivel viszont az AI-nak úgyis szerver-oldali dobás-generálásra lesz szüksége (a korábbi terv szerint), praktikus ugyanabban a körben, egységesen megoldani mindkettőt.

### 4.7 "AI gondolkodik…" mesterséges késleltetés

Eltérően a Dáma-döntéstől (ahol nincs késleltetés): Hotelnél **lesz** egy rövid, mesterséges késleltetés **lépésenként** (nem csak a teljes AI-kör végén) — mivel egy Hotel-kör több allépésből áll (dobás → vásárlás → építés → kör vége), egy azonnali, egy villanás alatt lezajló teljes kör nehezen követhető lenne, még az animáció-rendszer (bábu, pénz, építés) mellett is. A pontos késleltetés-érték (ms) implementációs részlet, playteszteléssel finomhangolandó.

### 4.8 Ki-/bekapcsolható teljes naplózó rendszer

**IMPLEMENTÁLVA** (game-agnosztikus, a `GameRoom` core-ban): `GameRoomCreateOptions.enableGameLog` — ha igaz, minden alkalmazott akció (emberi vagy AI) + az azt követő teljes állapot egy JSONL sorba íródik a `logs/games/<gameType>-<sessionId>.jsonl` fájlba ([src/server/core/GameRoom.ts](../src/server/core/GameRoom.ts): `logAction`). **Nincs, és a felhasználó megerősítése szerint SOSEM lesz hozzá lobby-UI kapcsoló** — a naplózó rendszer szándékosan, véglegesen rejtve marad a normál felhasználók elől, csak programozottan/kézzel indított szobáknál (pl. Hotel-0d.2 elemzési munkafolyamat, 7. szakasz) érhető el. A `logs/` mappa `.gitignore`-olva.

Cél: a 7. szakaszban leírt, csak-AI játékok utólag elemezhetők legyenek (döntések, nehézségi szintek közti különbségek, esetleges hibák). Ehhez egy **alapból kikapcsolt**, egy kapcsolóval bekapcsolható teljes naplózás kell — normál, emberek által játszott parti esetén nem fut (nincs extra tárolási/teljesítmény-teher, és nem gyűjt szükségtelen adatot élő játékosokról), csak amikor kifejezetten teszt-/elemzési célból bekapcsoljuk.

- **Mit naplózzunk:** minden ténylegesen alkalmazott akciót (a `GameRoom` core már úgyis egyetlen csővezetéken engedi át — `isActionAllowed` → reducer → `syncState` —, ez a természetes hely a naplózásra), a hozzá tartozó előtte/utána állapotot vagy legalább a diffet, és **AI-lépéseknél külön azt is, milyen jelölteket mérlegelt a keresés és milyen heurisztikus pontszámmal** (4.2-4.3) — enélkül utólag nem derülne ki, "miért" döntött úgy az AI, csak hogy "mit" lépett.
- **Formátum:** játszmánként egy strukturált, sorosan olvasható napló (pl. JSONL — soronként egy JSON-esemény), hogy később egyszerű szkripttel elemezhető legyen (pl. pénzügyi görbék játékosonként, nehézségi szint és győzelmi arány összefüggése, gyakori/szokatlan döntések keresése).
- **Ki-/bekapcsolás mechanizmusa (nyitott implementációs részlet):** valószínűleg szoba-létrehozáskori kapcsoló (pl. csak akkor íródik napló, ha a szoba csupa AI-szlotból áll — pontosan a 7. szakasz használati esetéhez illeszkedve) vagy egy környezeti változó — a pontos mechanizmus az implementáció megkezdésekor dől el.
- **Game-agnosztikus vagy Hotel-specifikus:** mivel a `GameRoom` core már ma is game-agnosztikus AI-infrastruktúrát ad (2. szakasz), és a naplózás alapja (akció + állapot rögzítése) semmiben sem Hotel-specifikus, érdemes ezt is a **core-ba** tenni — Dáma is örökölné, ugyanúgy, ahogy az AI-mechanizmust is örökölte. Az AI-döntés részletes (jelölt + pontszám) naplózása viszont játék-specifikus kiegészítő adat lenne, amit `computeAiMove` maga csatolna a naplóbejegyzéshez.

## 5. Diagram

Lásd: [diagrams/hotel-0d-ai-sequence.puml](./diagrams/hotel-0d-ai-sequence.puml) — egy tipikus kör, amiben egy AI lép, majd egy másik AI árverésen licitál. (A diagram a szoba-szintű üzenetfolyamot mutatja; az expectimax-keresés belső felépítését — 4.2-4.5 — egy külön, implementáció-közeli diagram fogja majd illusztrálni, amikor a kódolás megkezdődik.)

## 6. Eldöntött kérdések

Minden korábban nyitott döntési pont lezárva a megbeszélés során:

- **`computeAiMove` szignatúra-bővítés** (3.2): ELFOGADVA — `computeAiMove(state, slot)` a `GameRoom` core-ban, Dáma-implementáció változatlan viselkedéssel, figyelmen kívül hagyja az új paramétert.
- **`opponentType` → `aiOpponentCount`** (3.1): ELFOGADVA — Dáma is átáll rá, UI-ban bináris marad neki.
- **AI döntéshozatal jellege** (4.2-4.5): a korábban javasolt "egyszerű, önsértéstől mentes véletlen" helyett **expectimax + heurisztikus kiértékelés, önjáték-feltevéssel**, három nehézségi szint (1/2/3 saját lépés mélység), kemény idő-/csomópontkorlát biztonsági hálóként.
- **Hány AI-t engedjünk egy Hotel szobában, és mikor töltődnek fel a szlotok?** Javaslat elfogadva: a létrehozó a szoba-létrehozáskor (a jelenlegi játékosszám-választó mellett) egy számot ad meg (0 és `playerCount-1` között) ÉS egy nehézségi szintet (4.4), és ez a szám AZONNAL, a létrehozó csatlakozása után feltöltődik AI-val — a maradék hely(ek) nyitva maradnak valódi játékosoknak (ugyanaz az időzítés, mint Dámánál).
- **"AI gondolkodik…" késleltetés** (4.7): ELFOGADVA — lesz késleltetés, lépésenként, a Dáma-döntéstől eltérően.

**Implementáció-közeli, még nyitva hagyott finomhangolási részletek** (nem blokkolják a kódolás megkezdését, de érdemes tudni róluk): az értékelő függvény pontos súlyai (4.3), a biztonsági háló pontos idő-/csomópont-kerete (4.5), a lépésenkénti késleltetés pontos hossza (4.7), és a naplózás ki-/bekapcsolásának pontos mechanizmusa (4.8) — mindegyiket playteszteléssel/implementáció közben érdemes belőni.

## 8. Implementáció közben felmerült részletek

- **`computeAiMove(state, slot)`**: [GameRoom.ts](../src/server/core/GameRoom.ts) — a `maybeTriggerAiMove` minden AI-szlotot sorra kérdez, amíg egyik sem tud/akar lépni; `DamaRoom` a `slot`-ot csak arra használja, hogy ellenőrizze, épp az ő köre van-e.
- **`aiOpponentCount`**: [GameRoom.ts](../src/server/core/GameRoom.ts) — szerver-oldalon MINDIG `maxClients - 1`-re korlátozva, game-agnosztikusan (nem csak Hotelnél) — ez strukturálisan biztosítja, hogy soha ne lehessen egy szobában kizárólag AI (legalább a létrehozó mindig valódi játékos).
- **Nehézségi szint egy szobán/játékon belül egységes** (nem szlotonként eltérő) — a létrehozó egyetlen nehézséget választ, ami minden AI-ellenfélre vonatkozik abban a szobában (online) vagy partiban (hot-seat, 9. szakasz). **LEZÁRVA:** a felhasználó megerősítette, hogy szlotonkénti vegyes nehézségre nincs szükség — ez marad a végleges viselkedés.
- **Konkrét konstansok** (mind implementáció közbeni, playteszteléssel finomhangolandó becslés, lásd fent): `HOTEL_AI_MOVE_DELAY_MS = 600` ([src/shared/games/hotel/ai/index.ts](../src/shared/games/hotel/ai/index.ts) — közös konstans, amit `HotelRoom.aiMoveDelayMs()` ÉS `useHotSeatAi.ts` is ugyanonnan importál, lásd 9. szakasz), `SEARCH_TIME_BUDGET_MS = 200` és `MAX_NODE_DEPTH = 300` ([expectimax.ts](../src/shared/games/hotel/ai/expectimax.ts) — két EGYMÁSTÓL FÜGGETLEN biztonsági háló: a csomópont-mélység azért kell a falióra-korlát MELLETT, mert egy JS hívási verem néhányszor tíz ezredmásodperc alatt is kimerülhet, jóval a 200ms letelte előtt, ha a keresés valamiért egy állapotot ismételten újra kiértékelne).
- **Valós, a keresés által felfedezett hiba a MEGLÉVŐ (nem csak az AI által érintett) motorban:** `computeNightlyRent` (rules.ts) lefagyott (index -1), ha egy telken lépcső-jog van vásárolva, de még nincs rajta épület/kert — mert `canBuyStaircaseRightForLot` nem követeli meg, hogy legyen már épület a telken. Ez EMBERI játékban is előfordulhatott volna (nem AI-specifikus hiba), csak eddig senki nem futott bele. Első körben javítva (0 épület + nincs kert esetén a bérleti díj 0), majd a felhasználó kérésére továbbfejlesztve: mivel a bérleti díj ilyenkor úgyis mindig 0, a `ROLL_MOVE_DICE` landolási logikája (`applyRollMoveDice`, reducer.ts) most már EGYÁLTALÁN nem lép be az `AWAITING_NIGHTS_ROLL` fázisba egy még beépítetlen, lépcsős telken landolva — a mező a saját típusa szerint (PURCHASE/CONSTRUCTION/stb.) oldódik fel azonnal, mintha nem is lenne rajta lépcső. Ez önmagában is alátámasztja a 7. szakasz "csak-AI játékok tesztelése hibakeresésre is jó" indoklását — már ez a kis léptékű, teszt-szintű AI-vs-AI lejátszás (lásd alább) is talált egy éles hibát.
- **Action-enumerator csapda, amit a keresés futás közben feltárt:** `getValidActions(state).constructionOptions` szándékosan FÜGGETLEN attól, hogy `canStartConstruction(state)` épp igaz-e (a UI ezt külön ellenőrzi, mielőtt használná a listát) — az AI enumerátorának ezt is le kellett kérdeznie, különben egy, a keresés SAJÁT hipotetikus szimulációjában frissen megvásárolt telek nem-ÉPÍTKEZÉS mezőn állva is "érvényes" építkezési jelöltnek tűnt volna, amit a reducer csendben elutasított volna (változatlan állapotot adva vissza) — végtelen rekurzióhoz vezetve. Javítva az enumerátorban, PLUSZ két, egymástól független védőháló hozzáadva (ld. fent) minden hasonló, jövőbeli eltérés ellen.
- **Tesztek:** [src/shared/games/hotel/ai/strategy.test.ts](../src/shared/games/hotel/ai/strategy.test.ts) — alap-viselkedés (null ha nem cselekedhet, valódi 1-6 dobás, FORFEIT nem induló lépés) + egy kis léptékű "csak-AI játék" füst-teszt, ami mindhárom nehézségi szinttel vegyítve, korlátozott lépésszámban fut le összeomlás nélkül. Ez NEM helyettesíti a 7. szakaszban leírt, implementáció utáni, valódi (naplózás-alapú) csak-AI játékelemzést — csak egy kicsi, gyors előzetes ellenőrzés ugyanabból az elvből.

### 8.1 `simulateHotelGame`-mel végzett hangolási kör (7.1 kipróbálva élesben)

A [scripts/simulate-hotel-ai-games.ts](../scripts/simulate-hotel-ai-games.ts)-sel több felállást lejátszatva (0-ról indulva, mesterséges "AI gondolkodik" késleltetés nélkül, ahogy kérted) a Nehéz szint kezdetben **szisztematikusan rosszabbul teljesített** (29% győzelem a Könnyű 60%-ához képest, majd egy külön kör után a Közepes mutatott hasonlóan gyenge, 29%-os arányt) — ez három, egymást követő, valódi hibát/hiányosságot tárt fel:

1. **Készpénz-biztonsági büntetés hiánya** (4.3-ban már leírt `cashSafetyPenalty`) — a mélyebb keresés a csőd-szakadék előtt nem óvatoskodott, csak utána. Javítva: fokozatos, négyzetes büntetés 2500 alatti készpénznél (max. −6000 nulla készpénznél).
2. **Beépítetlen telkek kockázatának be nem árazása** — egy `simulateHotelGame`-mel rögzített, lépésenkénti nyomkövetéssel (döntésenkénti jelölt-pontszámok + tulajdon-pillanatképek) sikerült pontosan visszavezetni, hogy a Közepes szint korai, több telket egyszerre felvásárló stratégiája miatt vesztett — a beépítetlen telkeket bárki féláron elveheti. `heuristic.ts`: `UNBUILT_LOT_PORTFOLIO_FACTOR` (eredetileg 0.3, ld. pont 3).
3. **Valódi reducer-hiba, amit a felhasználó vett észre a nyomkövetés eredménye alapján**: `applyBuyLot` (reducer.ts) a féláras "elvételkor" (`canForceBuyFromOwner`) csak levonta a vevő pénzét, de **soha nem fizette ki az eladót** — pedig a szabály ("féláron lehet TŐLE megvenni") egyértelműen játékos-játékos tranzakciót ír le, nem bank-vásárlást. Javítva: az előző tulajdonos megkapja a felárat. Ennek fényében az `UNBUILT_LOT_PORTFOLIO_FACTOR`-t 0.3-ról **0.65-re** enyhítettük (a valós kockázat "csak" a fele, nem a teljes érték elvesztése).

**Váratlan mellékhatás:** a reducer-hiba javítása (a pénz most már körben marad, nem tűnik el) + a telek-kockázat helyes beárazása miatt a szimulált játékok **sokkal tovább tartanak** — a legtöbb 2 fős meccs nem ért véget tényleges csőddel még 1000 lépés után sem (ez akár normális is lehet egy jól játszott, két hasonlóan okos fél közötti partinál, nem feltétlenül hiba). Ezért a szimulációs szkript mérőszáma **győzelem helyett a rögzített lépésszám (400) utáni nettó vagyon**-összehasonlításra váltott (`leaderPlayerId` — valódi csőd-alapú győzelem, ha van, továbbra is elsőbbséget élvez).

**Végső, elfogadott eredmény** (400 lépés, nettó vagyon alapján, 0 csőd egyik meccsben sem): EASY 50% (6/12), MEDIUM 50% (2/4), HARD 33% (3/9) — a Nehéz enyhén alulteljesít, de ez a mintaméret mellett (N=9) még belefér a statisztikai zajba, nem szisztematikus probléma többé. **Itt megálltunk** — a finomabb egyensúly-kérdéseket (súlyok pontos hangolása, miért pont 33% a Nehéz) implementáció utáni, valódi emberekkel való playtesztelésre hagytuk, az eredeti terv szerint (1. szakasz, "Nincs hatókörben").

## 7. Hotel-0d.2 (jövőbeli fázis): csak-AI játékok végignézése és elemzése

Külön, jövőbeli fázisként megjelölve (nem ezzel a körrel egyszerre) érdemes lesz olyan teljes játékokat lejátszatni/végignézni, ahol **minden szlotot AI tölt ki**, akár vegyes nehézségi szinteken (pl. Könnyű vs. Közepes vs. Nehéz egy 3-4 fős szobában) — ez adja a legkönnyebb módot arra, hogy:

- ellenőrizzük, a heurisztika (4.3) és a nehézségi szintek (4.4) ténylegesen érdemi, egymástól megkülönböztethető viselkedést eredményeznek-e (pl. a Nehéz szint tényleg többet nyer a Könnyű ellen?),
- felszínre kerüljenek olyan hibák/végtelen ciklusok/váratlan holtpontok, amik csak sok, gyors, felügyelet nélküli lejátszás során derülnek ki,
- adatot gyűjtsünk a 4.3 súlyainak playteszteléshez.

Ehhez a 4.8-ban tervezett naplózó rendszer ad alapot — ez a szakasz maga csak a FELADATOT jelöli meg (mikor/hogyan futtatunk ilyen teszt-játékokat, milyen szempontok szerint elemezzük a naplót), a tényleges elemzés/tesztfuttatás módszertana egy külön, implementáció utáni beszélgetés témája.

### 7.1 IMPLEMENTÁLVA: `simulateHotelGame` szimulációs modul

[src/shared/games/hotel/ai/simulate.ts](../src/shared/games/hotel/ai/simulate.ts) — egy önálló, `GameRoom`/Colyseus/adatbázis NÉLKÜLI modul, ami közvetlenül a motort hajtja (`createInitialState` + `chooseHotelAiAction` + `reducer`, ugyanúgy, mint a `strategy.test.ts` füst-tesztje), tetszőleges játékosszámmal és nehézségi-szint felállással, végig a játék végéig (vagy egy `maxSteps` biztonsági korlátig). Mivel ez a lejátszási mód sosem megy át a `GameRoom`-on, a `HotelRoom.aiMoveDelayMs()`-ben beállított "AI gondolkodik…" mesterséges késleltetésnek (4.7) itt nincs is értelme/hatása — ez az út eleve villámgyors, késleltetés nélkül fut.

Hozzá tartozó futtató szkript: [scripts/simulate-hotel-ai-games.ts](../scripts/simulate-hotel-ai-games.ts) (`npm run ai:simulate-hotel`) — néhány előre beállított felállást (2/3/4 fős, vegyes nehézségi szintekkel) játszik le egymás után, és konzolra írja a végeredményt (győztes, végső készpénz/nettó vagyon, csőd) — ez a nyers adat a 4.3 súlyainak playteszteléséhez.

## 9. IMPLEMENTÁLVA: Hot-seat AI

A hot-seat módban (egy eszközön, felváltva játszó emberek) is választható AI ellenfél — **pontosan ugyanazt a döntéshozó logikát** használja, mint az online mód, semmi duplikálás nélkül:

- **Architektúra-váltás, ami ezt lehetővé tette:** a teljes AI-modul (`heuristic.ts`, `actionEnumerator.ts`, `expectimax.ts`, `index.ts`, `simulate.ts`) és a `dice.ts` átköltözött `src/server/games/hotel/ai/` / `src/server/games/hotel/dice.ts` helyről **`src/shared/games/hotel/ai/`** / **`src/shared/games/hotel/dice.ts`** alá. Indoklás: egyik fájl sem használt valódi szerver-specifikus API-t (fs, Prisma, Colyseus) — csak a megosztott motort (`reducer`, `rules`, stb.) és `Math.random()`-ot —, tehát természetüknél fogva megosztott (shared) kód, csak eddig a szerver mappában lakott, mert csak `HotelRoom` használta. A költözés után mindkét oldal (kliens hot-seat, szerver online) ugyanabból az egyetlen forrásból importál.
- **`useHotSeatAi`** ([src/client/games/hotel/ui/useHotSeatAi.ts](../src/client/games/hotel/ui/useHotSeatAi.ts)) — a `GameRoom.maybeTriggerAiMove`/`tryApplyOneAiMove` kliens-oldali megfelelője: a helyi `GameTransport`-ot figyeli, minden állapotváltozás után (a szerver-oldali `HOTEL_AI_MOVE_DELAY_MS` késleltetéssel, ugyanabból a megosztott konstansból) megnézi, van-e AI-szlot, aminek lépnie kell (`chooseHotelAiAction`), és ha igen, közvetlenül dispatch-eli — nincs `GameRoom`, nincs hálózat, a `LocalGameTransport`-tal dolgozik közvetlenül.
- **`HotelSetupPage.tsx`** — minden hot-seat játékosnál egy "AI" jelölőnégyzet, plusz egy közös nehézségi szint-választó (ha legalább egy játékos AI) — ugyanaz az "egy nehézség az egész partira" egyszerűsítés, mint az online szobáknál (lásd 8. szakasz, szlotonkénti nehézség lezárva).
- **`HotelGamePage.tsx`** — az akciókerék inaktívvá válik ("interactive=false"), amíg egy AI-szlot köre van, és a `StatusChip` "(AI gondolkodik…)" feliratot mutat a soron lévő AI játékos neve mellett.
- **Böngészőben manuálisan tesztelve** (Playwright): AI-szlot bekapcsolása a beállító oldalon → játék indítása → emberi játékos kör vége → AI-szlot automatikusan dobott, lépett, majd (mivel nem volt mit vásárolnia/építenie) automatikusan véget vetett a körének → vezérlés visszakerült az emberi játékoshoz. Konzol-hibák nélkül, több egymást követő körön át konzisztensen működött.
