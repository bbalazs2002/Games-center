# Éles béta telepítés — Specifikáció

**Státusz:** IMPLEMENTÁLVA és élesben fut — a 12. szakasz szerinti lépések végrehajtva, a szolgáltatás nyilvánosan elérhető a `balazs.gyserver.domenet.info/game-center` alatt. A tényleges, végrehajtott parancsokat lásd [deployment-kezi-utmutato.md](./deployment-kezi-utmutato.md). Kezdetben (2026-07-29) Dáma+Hotel, 2026-07-30-tól (a Ramses-0d playtest-javítási kör lezárása után) Ramses is él — lásd 4. szakasz.
**Utolsó frissítés:** 2026-07-30
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [fazis-0b-multiplayer-specifikacio.md](./fazis-0b-multiplayer-specifikacio.md) (a mai `GameRoom`/Prisma/Colyseus architektúra, amit ez a terv változtatás nélkül visz élesbe)

## 1. Cél és hatókör

A cél egy **éles, de moduláris** telepítés a felhasználó saját szerverén, a `balazs.gyserver.domenet.info/game-center` útvonalon, úgy hogy:

- csak a ténylegesen kész játékok érhetők el a nyilvánosság számára — kezdetben (2026-07-29) Dáma és Hotel, a Ramses kódja a repóban maradt és tovább fejlődött, amíg 2026-07-30-án (a Ramses-0d playtest-javítási kör lezárása után) az is bekapcsolásra került;
- egy új játék készre válásakor **egy konfigurációs kapcsoló** elég a bekapcsolásához, nem kódmódosítás;
- a meglévő Apache2 + PHP-oldalak zavartalanul futnak tovább ugyanazon a domainen;
- egy **központi, projekt-független PostgreSQL-konténer** szolgálja ki az adatbázist — nem a games-center repóhoz/deploy-hoz kötött, hanem egy önálló, később más projektek adatbázisait is befogadó, külön induló infrastruktúra-elem (6. szakasz);
- a kiadás GitHub Actions + SSH alapú, a felhasználó kontrollja alatt (béta fázisban nem minden `master` push megy ki automatikusan élesbe).

**Nincs hatókörben (tudatosan kihagyva, a projekt jelenlegi léptéke miatt):**
- Játékonkénti külön konténer/folyamat — a mai kód egyetlen közös Express/Colyseus szerverre épül (auth, lobby, feedback API mind megosztott), ennek szétbontása aránytalanul nagy átalakítás lenne egy személyes/családi léptékű projektnél. Ehelyett egy közös konténer + futásidejű kapcsoló (4. szakasz).
- Zero-downtime blue-green/rolling deploy — egy rövid (néhány másodperces) újraindítási ablak elfogadható ezen a léptéken; lásd 10. szakasz.
- Autoscaling, load balancer, több szerveres elrendezés.
- Automatikus, minden push-ra futó éles deploy — a build/teszt igen, a tényleges éles telepítés csak kézi indításra (11. szakasz).
- A központi Postgres alá tervezett JÖVŐBELI projektek konkrét adatbázisai — ez a terv csak magát a megosztható infrastruktúrát hozza létre és a games-center saját adatbázisát telepíti bele, más projektek bekötése külön, jövőbeli feladat.

## 2. Eldöntött architekturális pontok

A felhasználóval egyeztetve (2026-07-29):

| Kérdés | Döntés |
|---|---|
| Konténer-granularitás | **Egy közös konténer** minden játékkal, futásidejű/build-idejű kapcsolóval — nem játékonkénti külön konténer. |
| CI/CD módszer | **SSH + build a szerveren** — a GitHub Actions nem épít/tol image-et registrybe, hanem SSH-n utasítja a szervert: `git pull` + `docker compose build` + `up -d`. Nincs szükség konténer-registryre. |
| Apache helye | **Közvetlenül a hoszton** (nem konténerben) — a reverse proxy egy hagyományos VirtualHost/Location-blokk a meglévő Apache-konfigurációban. |
| Deploy indítása | **Kézi jóváhagyás** — a lint/typecheck/teszt minden push-nál lefut, de az éles telepítés egy külön, kézzel indított workflow (`workflow_dispatch`). |
| Adatbázis-infrastruktúra | **Központi, önálló Postgres-konténer** (2026-07-29, felülírja a korábbi "meglévő konténer újrahasznosítása" tervet) — saját docker-compose, saját mappa a szerveren, NEM a games-center repo része/életciklusa, hogy más jövőbeli projektek is csatlakozhassanak hozzá anélkül, hogy ehhez a repóhoz lennének kötve. |
| SSH-hozzáférés | **Két külön, sudo NÉLKÜLI, minimális jogkörű user** (2026-07-30) — `claude-ops` (Claude egyszeri, interaktív beállításhoz) és `deploy` (GitHub Actions, minden publikáláskor), mindkettő csak `docker`+`webapps` csoporttag. Minden valódi root-ot igénylő lépés (felhasználó-létrehozás, Apache-szerkesztés, systemd unit-fájlok) kizárólag a felhasználó saját root-hozzáférésével történik — lásd [deployment-kezi-utmutato.md](./deployment-kezi-utmutato.md) A.0/A.3/A.4. |

## 3. Architektúra áttekintés

```
GitHub repo (bbalazs2002/Games-center)
   │  push → CI workflow (lint+typecheck+test, mindig)
   │  kézi indítás → Deploy workflow (SSH)
   ▼
Szerver (SSH, privát kulcs)
   ├─ Apache2 (hoszton, meglévő PHP-oldalak + balazs.gyserver.domenet.info vhost)
   │    └─ ProxyPass "/game-center/" → http://127.0.0.1:2567/  (HTTP + WS upgrade)
   ├─ games-center-app konténer (ÚJ, ebből a repóból épül)
   │    ├─ Express (API: /api/auth, /api/game-log, /api/feedback)
   │    ├─ Colyseus (WS: lobby/dama/hotel/ramses — 2026-07-30-tól mindhárom bekapcsolva, lásd 4. szakasz)
   │    └─ statikus kliens build kiszolgálása (express.static)
   └─ shared-postgres konténer (ÚJ, DE NEM ennek a repónak a része)
        ├─ saját docker-compose.yml, külön szerver-mappában (6. szakasz)
        ├─ saját docker hálózat (pl. "shared-infra"), amihez a games-center-app
        │    és később más projektek konténerei is csatlakoznak
        └─ games_center adatbázis + saját, csak erre jogosult DB-user
```

Lásd [deployment-architektura.puml](./diagrams/deployment-architektura.puml) a teljes UML deployment-diagramért.

**Kulcs-döntés (app):** a kliens (React SPA) és a szerver (Express+Colyseus) MA két külön folyamat (Vite dev server + `tsx watch`), élesben viszont EGY konténerben, EGY Node-folyamatban futnak — a szerver szolgálja ki a `vite build` kimenetét statikus fájlként is. Ez a legkevesebb mozgó alkatrészt igénylő megoldás egy egykonténeres, SSH-deploy-os beállításhoz, és nem igényel külön webszervert a konténeren belül.

**Kulcs-döntés (adatbázis):** a Postgres tudatosan NEM a games-center `docker-compose.deploy.yml`-jében él, hanem egy teljesen önálló, külön mappában/repóban kezelt compose-fájlban — ha a games-center-app konténert bármikor törlik/újraépítik, a Postgres és a benne lévő adatok érintetlenek maradnak, és fordítva: a Postgres saját életciklusa (frissítés, backup, újraindítás) nem esik egybe a games-center deploy-jaival.

## 4. Moduláris játék-kiadás mechanizmusa — IMPLEMENTÁLVA

`src/client/shell/gamesRegistry.ts` és `src/server/index.ts` egy **egyetlen, közös `ENABLED_GAMES` környezeti változót** olvas, aminek mindkét oldal ugyanazt a forrás-listát látja:

- **Kliens (build-idejű):** mivel a Vite csak build-időben tudja a kódba fordítani a környezeti változókat, a `vite.config.ts` explicit módon átvezeti a build-kontextusból kapott `ENABLED_GAMES` értéket `import.meta.env.VITE_ENABLED_GAMES`-ként (`define` opció) — így nem kell két külön, szinkronban tartandó változónevet bevezetni, csak egy build-argot. `gamesRegistry.ts` egy `getEnabledGames()` szűrést kap, amit `HomePage`/`GameLoader`/routing mind ugyanonnan olvas.
- **Szerver (futásidejű):** `src/server/index.ts` a `gameServer.define(...)` hívásokat egy `ENABLED_GAMES.includes(id)` feltétellel látja el — ez nemcsak a menüből tünteti el egy kikapcsolt játékot, hanem ténylegesen NEM regisztrálja azt Colyseus szobaként sem, tehát egy direkt API/WS-hívással sem érhető el kikapcsolt állapotban.
- **Alapértelmezett érték** (ha a változó nincs beállítva): minden játék — így a helyi fejlesztői környezet (`npm run dev`) és a `vitest`/CI futás viselkedése nem változik.
- **A `.github/workflows/deploy.yml`-ben ténylegesen beállított build-idejű érték:** kezdetben (2026-07-29) `ENABLED_GAMES: dama,hotel`, 2026-07-30-tól (a Ramses-0d playtest-javítási kör lezárása után) `ENABLED_GAMES: dama,hotel,ramses` — a specifikáció szerinti "egy játék készre válásakor csak ezt az egy sort kell bővíteni" pontosan így valósult meg. **A szerver-oldali `/var/www/games-center/.env.production` fájlban nincs explicit `ENABLED_GAMES` sor** — ez a fenti "nincs beállítva → minden játék" alapértelmezésre hagyatkozik szándékosan (a runtime oldal sosem volt ténylegesen korlátozva, csak a kliens build), ami eltér az eredeti "defense in depth" szándéktól (mindkét oldal explicit tiltsa a ki nem kapcsolt játékot), de a jelenlegi (mindhárom játék be van kapcsolva) állapotban ez nem okoz gyakorlati különbséget.

## 5. Docker image (games-center-app)

Új gyökér `Dockerfile`, két lépcsős (multi-stage) build:

**1. `build` fázis** (`node:22-alpine`):
- `npm ci` (minden függőség, dev is — kell a `vite build`/`tsc`/`prisma generate` lépésekhez)
- forrás bemásolása
- `npx prisma generate`
- `npm run build` (`tsc --noEmit` + `vite build` → `dist/`)

**2. `runtime` fázis** (`node:22-alpine`):
- `npm ci --omit=dev` PLUSZ a `tsx` csomag (a szerver továbbra is forrásból, `tsx`-szel fut — konzisztens a mai dev-móddal, nem igényel külön szerver-build lépést)
- `COPY --from=build dist/` (a lefordított kliens)
- `COPY src/server/ src/shared/ prisma/` (a szerver forrása + a Prisma séma)
- `COPY public/` (statikus assetek — Hotel property-card fotók, `full-board.glb` stb., amiket a szerver fog kiszolgálni)
- `ENTRYPOINT`: előbb `npx prisma migrate deploy`, majd `npx tsx src/server/index.ts` (a migráció a konténer indulásakor fut, nem külön CI-lépésként — a `DATABASE_URL` ekkor már a 6. szakaszban létrehozott központi Postgres felé mutat)

**`.dockerignore`:** `node_modules`, `.git`, `dist`, `temp/`, `logs/`, `assets/` (a git által is figyelmen kívül hagyott nyers forrásfotók), `.env*`, `.playwright-mcp/`.

**Szükséges kódváltoztatás ehhez a szakaszhoz:** `src/server/index.ts` ma nem szolgál ki semmilyen statikus fájlt (a Vite dev server és az Express teljesen külön fut ma). Élesben egy `express.static(path.join(__dirname, '../../dist'))` + egy catch-all route (SPA-fallback `index.html`-re, a React Router kliens-oldali routingjához) szükséges — ezt az `ENABLED_GAMES` szűréssel egy időben, egy implementációs körben érdemes megcsinálni.

## 6. Központi, megosztott PostgreSQL

**Miért önálló egység, nem a games-center repo része:** a cél, hogy egy jövőbeli második/harmadik projekt is ugyanehhez a Postgres-példányhoz tudjon csatlakozni anélkül, hogy a games-center repóját kellene klónoznia/ismernie, és hogy a games-center deploy-jai (git pull, konténer-újraépítés) SOSE érinthessék a más projektek adatait is tartalmazó adatbázis-szervert. Ezért ez egy teljesen különálló docker-compose egység, saját élettartammal.

**Elhelyezkedés a szerveren:** `/var/www/database` — dedikált mappa, nem a `/var/www/games-center` alatt (2026-07-29, lezárva).

**`docker-compose.yml`** (ebben a dedikált mappában, nem a games-center repóban):

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres          # csak az admin/superuser — az egyes
      POSTGRES_PASSWORD: <erős, csak itt élő jelszó>
    volumes:
      - shared-postgres-data:/var/lib/postgresql/data
    networks:
      - shared-infra
    # NINCS "ports:" — nem publikált a hoszt felé/internet felé, csak a
    # docker hálózaton belülről érhető el (lásd alant)

networks:
  shared-infra:
    name: shared-infra
    # external: false itt, mert EZ a compose hozza létre a hálózatot;
    # a games-center (és más projektek) saját compose-fájljukban
    # "external: true"-ként hivatkoznak rá, lásd 7. szakasz

volumes:
  shared-postgres-data:
```

**Miért nincs kifelé publikált port:** mivel a games-center-app (és a jövőbeli projektek konténerei is) ugyanazon a `shared-infra` docker-hálózaton lesznek, a Postgres a konténer NEVÉN (`postgres`, mint Docker-belüli DNS-név) érhető el számukra, a hálózat alapértelmezett 5432-es portján — nincs szükség a hoszt gépen keresztüli, pláne internet felőli elérésre, ami feleslegesen nagyobb támadási felületet jelentene.

**Projektenkénti izoláció — külön adatbázis és felhasználó minden projekthez:** mivel ez a Postgres-példány több projekt adatát fogja tárolni, minden projekt saját, a többiekétől elzárt adatbázist és felhasználót kap (nem az admin/superuser fut a games-center alkalmazásból). A games-center saját DB-jének/userének létrehozása egy egyszeri, kézi `psql` lépés (nem automatikus `docker-entrypoint-initdb.d/` script, mert az csak a konténer ELSŐ indításakor futna le — egy folyamatosan bővülő, több projektet befogadó szerverhez ez a minta nem illik, minden ÚJ projekthez ugyanezt a néhány sornyi SQL-t kell majd lefuttatni):

```sql
CREATE DATABASE games_center;
CREATE USER games_center WITH PASSWORD '<erős jelszó>';
GRANT ALL PRIVILEGES ON DATABASE games_center TO games_center;
-- Postgres 15+ esetén a public séma jogai is kellenek:
\c games_center
GRANT ALL ON SCHEMA public TO games_center;
```

A games-center `.env.production`-jában a `DATABASE_URL` ez alapján: `postgresql://games_center:<jelszó>@postgres:5432/games_center` — a `postgres` itt a docker hálózaton belüli konténernév, NEM `127.0.0.1`/`localhost` (az a games-center-app KONTÉNERÉN belülről nem a Postgres-t jelentené).

**Ez a szakasz teljes egészében a kézi útmutató (12. szakasz 10. lépés) "egyszeri beállítás" részébe kerül** — a games-center CI/CD-je (10. szakasz) sosem nyúl hozzá, csak a már létező `games_center` adatbázishoz csatlakozik.

## 7. `docker-compose` az éles szerveren (games-center-app)

Egy külön, csak a szerveren élő `docker-compose.deploy.yml` (nem a repo gyökerének fejlesztői `docker-compose.yml`-je, ami a helyi Postgres-t indítja fejlesztéshez) — ez a fájl **nem** definiál Postgres szolgáltatást, csak az appot, és a 6. szakaszban létrehozott `shared-infra` hálózathoz csatlakozik:

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env.production   # a szerveren él, nincs verziókezelve
    ports:
      # Csak a loopback-interfészen ("127.0.0.1", NEM "0.0.0.0") — a konténer
      # így kizárólag a HOSZTON futó Apache-ról érhető el, az internet felől
      # közvetlenül nem, mindenki más az Apache-on/TLS-en keresztül jut be.
      - "127.0.0.1:2567:2567"
    networks:
      - shared-infra

networks:
  shared-infra:
    external: true   # a 6. szakaszban már létrehozott hálózathoz csatlakozik,
                      # nem hoz létre újat
```

`.env.production` tartalma (a szerveren, git alá SOHA nem kerül, 0600 jogosultsággal):
- `DATABASE_URL` — a 6. szakaszban létrehozott `games_center` adatbázisra mutat: `postgresql://games_center:<jelszó>@postgres:5432/games_center`
- `JWT_SECRET`
- `PORT=2567` (a konténer belső portja — meg kell egyeznie a fenti `ports:` leképezés jobb oldalával és a §8 Apache-blokkjának portjával)
- `VITE_SERVER_URL` — **build-idejű** Vite-változó, ezért ezt build-argként kell átadni a `docker compose build`-nek, nem elég futásidejű env-ként megadni (a Vite a build pillanatában égeti be a kliens bundle-be). Éles értéke a nyilvános, `/game-center`-t is tartalmazó cím (pl. `https://balazs.gyserver.domenet.info/game-center`).
- `ENABLED_GAMES` — **opcionális**, futásidejű (szerver-oldali) szűrés (lásd 4. szakasz). A ténylegesen élesített szerveren ez a sor NINCS beállítva (a 4. szakasz "nincs beállítva → minden játék" alapértelmezésére hagyatkozva) — csak a build-idejű, kliens-oldali `ENABLED_GAMES` (a `.github/workflows/deploy.yml` saját `env:` blokkja) tartja karban ténylegesen, melyik játék jelenik meg a menüben.

### 7.1 Rendszerindításkori automatikus indulás — pontosítva (2026-07-29)

**A felhasználó jogos észrevétele:** az, hogy a Docker DÉMON magától elindul rendszerindításkor (`docker.service`/`docker.socket` `enabled`, lásd 9. szakasz), önmagában NEM garantálja, hogy a KONTÉNEREK is elindulnak vele — ez két külön dolog, és az előző verzió tévesen összemosta őket.

**Mit csinál valójában a `restart: unless-stopped`:** ez egy, a Docker démon által figyelt szabály, ami akkor lép életbe, ha egy MÁR LÉTEZŐ konténer leáll — akár összeomlás miatt (fut közben, éles üzemben), akár azért, mert maga a démon (és vele a szerver) újraindult. A dokumentált Docker-viselkedés szerint egy `unless-stopped` konténer a démon újraindulásakor IS visszatér, kivéve, ha valaki előtte kézzel `docker stop`-olta — egy szerver-reboot nem ilyen kézi leállítás, tehát ez a mechanizmus elvben lefedi a reboot-utáni esetet is, feltéve, hogy a konténer maga már létrejött egyszer (`docker compose up -d` lefutott rajta legalább egyszer) és nem lett explicit törölve (`docker compose down`/`docker rm`).

**Miért nem elég ez önmagában, és mit teszünk hozzá:** ez a viselkedés a Docker belső állapot-perzisztálásán múlik, amit nem tesztelt ez a terv élesben (csak a dokumentáció alapján állítható) — egy személyes szerveren, ahol senki nem veszi észre azonnal egy hibás újraindulást, ez kockázatosan kevés bizonyosság. Ezért **explicit systemd unit** biztosítja a konténerek indítását rendszerindításkor, a `restart: unless-stopped`-tól FÜGGETLEN, közvetlenül ellenőrizhető (`systemctl status`, `journalctl -u`) mechanizmusként — a kettő kiegészíti egymást, nem helyettesíti: a systemd unit a BOOT-kori indulásért felel, a `restart: unless-stopped` pedig a normál üzem közbeni összeomlás-utáni önjavításért.

Két unit, egyenként a saját compose-mappájukhoz kötve, a `shared-postgres`-t a games-center-app elé sorolva (`Requires=`/`After=`):

```ini
# /etc/systemd/system/shared-postgres.service
[Unit]
Description=Shared PostgreSQL (games-center + jövőbeli projektek)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
# Nem root — a `deploy` user (docker-csoporttag, sudo nélkül, lásd
# docs/deployment-kezi-utmutato.md A.0) futtatja, ugyanaz a felhasználó,
# amit a GitHub Actions is használ a CI/CD deploy-hoz.
User=deploy
WorkingDirectory=/var/www/database
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/games-center.service
[Unit]
Description=Games Center app
Requires=docker.service shared-postgres.service
After=docker.service shared-postgres.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=deploy
WorkingDirectory=/var/www/games-center
ExecStart=/usr/bin/docker compose -f docker-compose.deploy.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.deploy.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable shared-postgres.service games-center.service
```

Mindkét `ExecStart` idempotens (`docker compose up -d` no-op-ol, ha a konténer már fut) — a systemd unit tehát nemcsak reboot után hasznos, hanem bármikor kézzel is futtatható (`sudo systemctl start games-center`) ellenőrzésképpen anélkül, hogy tényleg újra kéne indítani a szervert.

**Ellenőrzés, mielőtt ténylegesen megbízunk benne:** a kézi útmutató (12. szakasz 10. lépés) egy valódi `sudo reboot`-ot (vagy legalább `sudo systemctl restart docker`-t, ami a démon-újraindulás részét szimulálja anélkül, hogy az egész szerver leállna) ír elő tesztlépésként, `docker ps`-sel megerősítve utána, hogy mindkét konténer (`shared-postgres`, `games-center-app`) fut — így ez nem csak dokumentáció-alapú feltételezés marad, hanem élesben igazolt tény.

## 8. Apache reverse proxy

**A szerveren futó Apache verzió (`server-diagnostics.sh` kimenete alapján, 2026-07-29): 2.4.54 (Ubuntu)** — ez már támogatja az egysoros, modern `upgrade=websocket` paraméteres szintaxist (2.4.47+ kell hozzá), tehát NEM kell két külön `ws://`/`http://` blokk, elég egyetlen `ProxyPass`/`ProxyPassReverse` pár.

**Szükséges Apache-modulok:** `mod_proxy` és `mod_proxy_http` már be van kapcsolva (a script `-M` kimenete ezt megerősítette). `mod_proxy_wstunnel` **NINCS** még bekapcsolva (nem szerepelt az engedélyezett modulok listájában) — ezt kell aktiválni, még akkor is, ha a konfiguráció maga csak egyetlen `http://` sémájú `ProxyPass`-t ír, mert az `upgrade=websocket` paraméter mögötti tényleges WebSocket-átvitelt ez a modul végzi:

```bash
sudo a2enmod proxy_wstunnel
sudo systemctl reload apache2
```

**Miért kell ez, ha a többi, már reverse proxy mögött futó projekt (`pub`, `kozitabor`, `page`) enélkül is működik?** Mert azok — a diagnosztika szerint is — sima HTTP-alapú alkalmazások: minden böngésző↔szerver kommunikációjuk különálló HTTP kérés/válasz párokból áll (oldal betöltése, API-hívás), amit a már bekapcsolt `mod_proxy`+`mod_proxy_http` tökéletesen lefed. A Games Center viszont az ELSŐ ezen a szerveren, aminek van egy valódi **WebSocket**-alapú rétege — a Colyseus, ami a `lobby`/`dama`/`hotel` szobák állapotszinkronját (lépések, élő lobbylista stb.) egyetlen, hosszú életű, kétirányú kapcsolaton viszi, nem HTTP kérés/válasz ciklusokon.

Egy WebSocket-kapcsolat egy sima HTTP kéréssel INDUL (`Upgrade: websocket` fejléccel), de a szerver `101 Switching Protocols` válasza után a kapcsolat elhagyja a HTTP szemantikát — onnantól egy nyers, kétirányú bájt-csatorna, aminek semmi köze a kérés/válasz mintához. A `mod_proxy_http` kizárólag a HTTP kérés/válasz modellt érti; ezt az `Upgrade`-et NEM tudja kezelni, a kapcsolat felépülhet, de az utána érkező WebSocket-keretek nem jutnak át. A `mod_proxy_wstunnel` pontosan erre a helyzetre való: felismeri az `Upgrade` fejlécet, és onnantól nyers TCP-alagútként viselkedik, mindkét irányba szabadon továbbítva a bájtokat.

**Gyakorlati következmény, ha ezt kihagynánk:** az oldal betöltése, a statikus fájlok és a sima `/api/*` hívások (auth, feedback, game-log) továbbra is működnének `mod_proxy_wstunnel` nélkül is — csak a tényleges játékmenet (lépések küldése, élő lobby-frissítés) nem, mert az kizárólag a WebSocket-kapcsolaton megy. Ez egy könnyen elrejtőző hibaosztály lenne (az oldal "működik", csak játszani nem lehet vele), ezért érdemes ezt előre, tudatosan bekapcsolni, nem hibakereséssel utólag felfedezni.

**Célfájl:** a `server-diagnostics.sh` szerint két releváns vhost létezik — `/etc/apache2/sites-enabled/balazs.conf` (plain HTTP) és `/etc/apache2/sites-enabled/balazs-le-ssl.conf` (HTTPS, Let's Encrypt/certbot-generált, `ServerName balazs.gyserver.domenet.info`). A blokk a **`balazs-le-ssl.conf`**-ba kerül (ez szolgálja ki ténylegesen a HTTPS-forgalmat) — a plain HTTP vhost tipikusan (certbot-alapértelmezés szerint) csak HTTPS-re irányít át, ezt érdemes a fájl tartalmának gyors átnézésével megerősíteni, mielőtt oda is bekerülne bármi.

**A blokk tartalma**, prefix-levágással (a konténer maga NEM tud a `/game-center` előtagról — lásd alant), a `<VirtualHost *:443>` szekción belül, konkrét porttal (2567 — szabadnak igazolva a diagnosztikában, egybeesik a kód mai `PORT ?? 2567` alapértelmezésével):

```apache
ProxyPass        "/game-center/" "http://127.0.0.1:2567/" upgrade=websocket
ProxyPassReverse "/game-center/" "http://127.0.0.1:2567/"
ProxyPreserveHost On
```

**Miért prefix-levágás, nem prefix-tudatos szerver:** így a konténer szerver-oldali kódja (Express route-ok, Colyseus alapértelmezett útvonalai) semmit sem tud a `/game-center` előtagról, egyszerűbb marad, és a helyi fejlesztői környezet (ahol nincs előtag) változtatás nélkül működik. Kizárólag a **kliensnek** kell tudnia a saját alap-útvonaláról:

- `vite.config.ts`: `base: process.env.VITE_BASE_PATH ?? '/'` — élesben `VITE_BASE_PATH=/game-center/` build-arg.
- `routes.tsx`: `createBrowserRouter([...], { basename: import.meta.env.BASE_URL })` (a Vite automatikusan biztosítja a `BASE_URL`-t a fenti `base` alapján, nem kell külön változó).
- A már ma is létező `VITE_SERVER_URL` (4 helyen használt, lásd `colyseusClient.ts`/`LoggingGameTransport.ts`/`AuthContext.tsx`/`FeedbackModal.tsx`) élesben `https://balazs.gyserver.domenet.info/game-center`-re állítva — ez a rész NEM igényel kódváltoztatást, csak a build-time értéket kell helyesen beállítani.

**TLS:** a `balazs.gyserver.domenet.info` Apache-on már fut HTTPS — ez a `/game-center` útvonalra is automatikusan érvényes lesz, mert a TLS-lezárás az Apache-nál marad, a konténer belül (és a Postgres is) továbbra is sima, titkosítatlan belső hálózaton fut.

## 9. Nyitott kérdések

Mind a 6 pont lezárva (2026-07-29), a `server-diagnostics.sh` szerveren futtatott kimenete alapján:

1. ~~**Hol éljen a `shared-postgres` compose-mappája a szerveren**~~ — **LEZÁRVA:** `/var/www/database`.
2. ~~**Docker hálózat neve**~~ — **LEZÁRVA:** `shared-infra` — a meglévő hálózatok (`bridge`, `host`, `none`, `kozitabor_default`, `page_default`, `pub_default`) egyike sem ütközik ezzel a névvel, a javasolt név megmarad.
3. ~~**HTTPS állapota**~~ — **LEZÁRVA:** van TLS a `balazs.gyserver.domenet.info` Apache-on, ezzel nem kell foglalkozni ebben a tervben.
4. ~~**Deploy célmappa/felhasználó (games-center-app)**~~ — **LEZÁRVA:** a repo a `/var/www/games-center` mappába kerül (a script szerint még nem létezik); a deploy futhat dedikált, minimális jogkörű felhasználóval (a pontos user létrehozása a 12. szakasz 8. lépésének feladata).
5. ~~**Docker Compose verzió**~~ — **LEZÁRVA:** `docker compose` (v2, plugin, `v5.1.1`) érhető el, a régi `docker-compose` (v1) NINCS telepítve — minden deploy-parancs a `docker compose` (szóközös) szintaxist használja.
6. ~~**Apache verzió**~~ — **LEZÁRVA:** 2.4.54 (Ubuntu) — a modern, egysoros `upgrade=websocket` szintaxis használható (lásd 8. szakasz, frissítve).

**Új, a diagnosztika során felszínre került (korábban nem is feltett) pontok, szintén lezárva:**
- **Port-ütközés:** a 8080-as port már foglalt (`pub-app-1` konténer használja) — ezért NEM 8080, hanem **2567** lett a games-center-app belső/proxyzott portja (a kód mai `PORT ?? 2567` alapértelmezésével egybeesik, tehát az élesben sem kell felülírni, bár a `.env.production` explicit módon úgyis kiírja). Az 5432/5433/2567/3000 portok mind szabadnak bizonyultak.
- **Docker démon rendszerindításkori indulása:** `docker.service` és `docker.socket` is `enabled` — ez a démon SAJÁT elindulását fedi, nem a konténerekét; a konténerek explicit boot-kori indítását külön systemd unit garantálja (7.1 szakasz, a felhasználó jogos észrevétele nyomán pontosítva).
- **Meglévő Postgres-konténer:** nincs futó Postgres a szerveren — a `shared-postgres` névre/portra nézve nincs ütközési kockázat.
- **A szerver más projektjei** (`pub-app-1`, `pub-memcached-1`, `pub-mysql-1`, `kozitabor_default`/`page_default`/`pub_default` hálózatok) megerősítik, hogy eddig minden projekt a SAJÁT, elszigetelt adatbázis-konténerét futtatta (itt épp MySQL-t, nem Postgres-t) — a 6. szakasz központi, megosztott Postgres-e emiatt tudatos elmozdulás ettől a mintától, nem ennek folytatása; a meglévő projekteket ez a terv nem érinti/migrálja.

### 9.1 Diagnosztikai script

A 9. szakasz mind a 6 pontját, plusz a 6. szakasz biztonságos létrehozásához hasznos ellenőrzéseket (fut-e már bármilyen Postgres-konténer; foglalt-e az 5432-es/8080-as port; indul-e a Docker démon magától rendszerindításkor) egyetlen, kizárólag OLVASÓ (semmit nem módosító) script futtatása derítette ki: **[scripts/server-diagnostics.sh](../scripts/server-diagnostics.sh)**. Az eredményeket a 9. szakasz már tartalmazza — a script attól még újrafuttatható később is (pl. egy következő projekt bekötése előtt, ütközés-ellenőrzésként).

```bash
bash server-diagnostics.sh
# vagy, ha sudo kell néhány Apache-lekérdezéshez:
sudo bash server-diagnostics.sh
```

## 10. Rollback és leállási ablak

Mivel nincs image-registry (a build a szerveren történik), a rollback **git-szinten** történik: `git checkout <előző commit/tag>` a szerveren, majd újra `docker compose build && up -d`. Ez azt jelenti, hogy minden sikeres deployt érdemes egy git tag-gel megjelölni (pl. `deploy-2026-07-29`), hogy a "előző verzió" egyértelmű legyen visszaállításkor. Ez a games-center-app konténert érinti — a `shared-postgres` konténer és az adatai a games-center rollback-jeitől teljesen függetlenek.

A `docker compose up -d` a régi games-center-app konténert leállítja, mielőtt az új elindul — ez néhány másodperces (a Node-folyamat indulási idejéhez mérten) leállást jelent minden deploy alkalmával. Ezen a léptéken (családi/baráti kör, béta fázis) ez elfogadható; ha később gond lenne vele, egy egyszerű "épülj fel egy ideiglenes port alá, majd cseréld az Apache proxy-célját" mintával bővíthető, de ez most nincs hatókörben.

## 11. GitHub Actions workflow-k

**`.github/workflows/ci.yml`** — minden push-nál és PR-nél fut, deploy NÉLKÜL:
- `npm ci`
- `npm run lint`
- `npx tsc --noEmit` (kliens) + `npm run typecheck:server`
- `npm run test` (vitest)

**`.github/workflows/deploy.yml`** — kizárólag `workflow_dispatch`-csel indítható (GitHub felületén "Run workflow" gomb):
- SSH-kapcsolat a szerverre (pl. `appleboy/ssh-action`), titkosítva tárolt GitHub Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`
- a szerveren futó parancs(ok): `cd <deploy-mappa> && git pull && docker compose -f docker-compose.deploy.yml build --build-arg VITE_SERVER_URL=... --build-arg VITE_BASE_PATH=/game-center/ && docker compose -f docker-compose.deploy.yml up -d`
- a `prisma migrate deploy` a konténer saját `ENTRYPOINT`-jában fut (5. szakasz Docker-résznél már említve), nem a workflow-ban — így akkor is lefut, ha valaki a konténert a workflow-n kívül, kézzel indítja újra. Ez a lépés a 6. szakaszban létrehozott `games_center` adatbázist módosítja, a `shared-postgres` konténert magát sosem — a deploy workflow-nak nincs is jogosultsága/oka hozzáférni ahhoz.

## 12. Implementációs lépések sorrendje — MIND VÉGREHAJTVA

Ebben a sorrendben valósult meg (mindegyik önállóan tesztelhető/commitolható volt) — a tényleges, végrehajtott parancsokért lásd [deployment-kezi-utmutato.md](./deployment-kezi-utmutato.md):

1. `ENABLED_GAMES` szűrés bevezetése — kliens (`gamesRegistry.ts`) + szerver (`index.ts`) egyaránt, alapértelmezett "minden játék" viselkedéssel (ne törjön semmit helyi fejlesztésben/CI-ban).
2. `express.static` + SPA-fallback bekötése a szerverbe, hogy a `dist/` build kiszolgálható legyen ugyanabból a Node-folyamatból.
3. `vite.config.ts` `base` + `routes.tsx` `basename` — subpath-tudatos build.
4. `Dockerfile` + `.dockerignore` megírása, helyi `docker build`/`docker run` próba (subpath és `ENABLED_GAMES` nélkül, csak a konténerezés magának a működésének ellenőrzésére).
5. `.github/workflows/ci.yml` — ez már most, a többi pont előtt is bevezethető, önmagában hasznos.
6. A 9. szakasz maradék nyitott pontjainak lezárása a `server-diagnostics.sh` (9.1) kimenete alapján.
7. **A központi `shared-postgres` létrehozása a szerveren** (6. szakasz) — SSH-n, kézzel, egyszeri beállítás: dedikált mappa, `docker-compose.yml`, `shared-infra` hálózat létrehozása, `games_center` adatbázis+user SQL-lel. Ez FÜGGETLEN a games-center-app-tól, nem várja meg a következő lépéseket.
8. Szerver-oldali előkészítés a games-center-app-hoz (Apache modulok, vhost-blokk, deploy-mappa/felhasználó, `.env.production`, `shared-infra` hálózathoz csatlakozás) — SSH-n, kézzel, egyszeri beállítás, a 6. lépésben megismert konkrét adatokkal.
9. `docker-compose.deploy.yml` + `.github/workflows/deploy.yml` megírása, a 8. lépésben ténylegesen használt hálózat-/port-/parancs-szintaxissal.
10. **Teljes kézi útmutató megírása (`docs/deployment-kezi-utmutato.md`)** — minden olyan lépés dokumentálása, amit a felhasználónak saját kezűleg kell elvégeznie, két részre bontva: **(a) egyszeri beállítások** (a 7. lépés teljes `shared-postgres` telepítése; Apache reverse-proxy blokk pontos tartalma + `a2enmod proxy_wstunnel`/`a2ensite`/`systemctl reload apache2` parancsok — `mod_proxy`/`mod_proxy_http` már eleve bekapcsolva, lásd 8. szakasz; deploy-felhasználó létrehozása és jogosultságai; `.env.production` kitöltendő mezői; GitHub Secrets beállítása a repo Settings oldalán; **a két systemd unit (`shared-postgres.service`, `games-center.service`, lásd 7.1 szakasz) létrehozása és `enable`-ése, LEZÁRVA egy valódi `sudo reboot` (vagy `systemctl restart docker`) teszttel, `docker ps`-sel igazolva, hogy mindkét konténer magától visszatér** — a puszta `docker.service`/`docker.socket` `enabled` állapota önmagában csak a démon indulását fedi, a konténerekét nem); **(b) minden publikáláskor ismétlődő lépések** (a `deploy.yml` workflow kézi elindítása a GitHub felületén, sikeres deploy után egy git tag létrehozása a 10. szakasz rollback-mechanizmusához, a konténer logjának gyors ellenőrzése indulás után). Ezt a lépést csak a 7-9. pont UTÁN lehet megcsinálni, mert a leírásnak a ténylegesen kipróbált, működő parancsokat kell tartalmaznia, nem elvi vázlatot.
11. Első kézi próba-deploy a 10. lépésben megírt útmutató alapján, majd a `workflow_dispatch` workflow tesztelése éles környezetben.
12. `docs/Projekt-conception.md` roadmap frissítése, hogy a béta élesben elérhető.
