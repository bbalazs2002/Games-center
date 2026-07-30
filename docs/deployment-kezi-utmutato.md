# Games Center — éles telepítés: kézi útmutató

**Státusz (2026-07-30, frissítve):** A teljes telepítés élesben fut — a szolgáltatás nyilvánosan elérhető a `balazs.gyserver.domenet.info/game-center` alatt (tehát A.3, Apache reverse proxy, és A.5, GitHub Secrets, is elvégezve — a `Deploy` workflow több sikeres futása és a nyilvános elérhetőség ezt közvetve igazolja). Mindhárom játék (Dáma, Hotel, majd 2026-07-30-tól Ramses is) él. A.4 (systemd auto-start) és A.6 (kifejezett `reboot`-teszt) elvégzését Claude nem tudja közvetlenül visszaigazolni (root-hozzáférést igénylő, a felhasználó saját gépén végzett lépések) — ha ezek még nincsenek meg, egy szerver-újraindítás a konténerek kézi újraindítását igényelheti, lásd A.4/A.6 lent.

**Kapcsolódik:** [deployment-specifikacio.md](./deployment-specifikacio.md) — ott van a teljes indoklás/architektúra; ez a dokumentum csak a ténylegesen végrehajtandó parancsokat gyűjti össze, sorban.

**Két SSH-azonosító, két külön célra** (2026-07-30, a felhasználó kérésére pontosítva):

| Felhasználó | Ki használja | Jogkör | Kulcs helye |
|---|---|---|---|
| `claude-ops` | Claude, interaktívan, az egyszeri beállításokhoz | `docker` + `webapps` csoporttagság, **sudo NINCS** | csak a fejlesztői gépen (`~/.ssh/games_center_claude_ops`) |
| `deploy` | GitHub Actions, minden publikáláskor automatikusan | `docker` + `webapps` csoporttagság, **sudo NINCS** | GitHub Secrets (`SSH_PRIVATE_KEY`) |

Egyik usernek sincs sudo-ja — minden, ami valódi root-ot igényel (felhasználó-létrehozás, Apache-szerkesztés, systemd unit-fájlok) **kizárólag a felhasználó saját, root-os hozzáférésével** történik, a lenti lépéseknél `🔧 TE (root)` jelzéssel. Minden más lépést (docker compose, git, SQL) Claude végez `claude-ops`-ként, `🤖 CLAUDE` jelzéssel — ill. később a CI a `deploy` userrel, automatikusan.

**Fontos, korábbi hiba javítva:** mindkét user shellje `/bin/bash` (NEM `/usr/sbin/nologin`) — a `nologin` shell nemcsak az interaktív bejelentkezést tiltja, hanem SSH-n keresztüli TÁVOLI PARANCSVÉGREHAJTÁST is (`ssh user@host parancs`), ami mindkét user egyetlen valódi feladatát ellehetetlenítené.

**Fontos, korábbi hiba javítva (2026-07-30):** az első éles `Deploy` workflow-futás elhasalt git "dubious ownership" hibával — a `/var/www/games-center` repót `claude-ops` klónozta (A.2), a `git pull`-t viszont a CI-ben a `deploy` user futtatja, más UID-vel, amit git 2.35+ biztonsági okból elutasít, amíg nincs explicit `safe.directory` kivétel. A `.github/workflows/deploy.yml` script-je ezért az első sorban (a `set -e` után, a `cd` előtt) mindig beállítja ezt a `deploy` user saját `~/.gitconfig`-jában, idempotens módon (nem duplázza a bejegyzést ismételt futtatásra sem). Ez NEM root-igényű lépés, csak a `deploy` user saját konfigját érinti.

---

## A) Egyszeri beállítások

### A.0 ✅ KÉSZ — 🔧 TE (root) — a két felhasználó létrehozása

```bash
sudo groupadd --system webapps
sudo useradd --system --create-home --shell /bin/bash --groups docker,webapps claude-ops
sudo useradd --system --create-home --shell /bin/bash --groups docker,webapps deploy

sudo mkdir -p /var/www/games-center /var/www/database
sudo chown root:webapps /var/www/games-center /var/www/database
sudo chmod 2775 /var/www/games-center /var/www/database
```

(`2775` = a setgid-bit miatt minden újonnan létrehozott fájl/mappa öröklődően a `webapps` csoporté marad, nem csak annak a usernek, aki létrehozta — így `claude-ops` és `deploy` kölcsönösen tudják írni ugyanazokat a mappákat.)

Kulcsok elhelyezése (a nyilvános kulcsokat Claude adja meg — lásd lent — ide másolva):

```bash
sudo -u claude-ops mkdir -p ~claude-ops/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBzj2AlZFS2cDA1N5nFkoSBPuwm0ZueN4F7q7assmuT9 games-center-deploy" | sudo -u claude-ops tee ~claude-ops/.ssh/authorized_keys > /dev/null
sudo chmod 700 ~claude-ops/.ssh
sudo chmod 600 ~claude-ops/.ssh/authorized_keys

sudo -u deploy mkdir -p ~deploy/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGPVwTAHVNK6wj992I1n3uo2lN+qkECrWmAizGKQYHqW games-center-ci-deploy" | sudo -u deploy tee ~deploy/.ssh/authorized_keys > /dev/null
sudo chmod 700 ~deploy/.ssh
sudo chmod 600 ~deploy/.ssh/authorized_keys
```

Miután ez megvan, add meg a szerver címét (host, esetleg egyedi port), hogy `claude-ops`-ként tudjak csatlakozni és folytatni az A.1-től.

### A.1 ✅ KÉSZ — 🤖 CLAUDE — Központi Postgres (`shared-postgres`)

```bash
cd /var/www/database
cat > docker-compose.yml <<'EOF'
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: <ERŐS_JELSZÓ_1>
    volumes:
      - shared-postgres-data:/var/lib/postgresql/data
    networks:
      - shared-infra

networks:
  shared-infra:
    name: shared-infra

volumes:
  shared-postgres-data:
EOF
docker compose up -d
```

A games-center saját adatbázisa/usere (a `postgres` admin-userrel):

```bash
docker compose exec postgres psql -U postgres
```

```sql
CREATE DATABASE games_center;
CREATE USER games_center WITH PASSWORD '<ERŐS_JELSZÓ_2>';
GRANT ALL PRIVILEGES ON DATABASE games_center TO games_center;
\c games_center
GRANT ALL ON SCHEMA public TO games_center;
\q
```

### A.2 ✅ KÉSZ (+ első build/indítás igazolva) — 🤖 CLAUDE — games-center-app célmappa

**A build és az első indítás is megtörtént és igazolva van** (nem csak a klónozás/`.env.production`): `docker compose -f docker-compose.deploy.yml build` majd `up -d` lefutott, a konténer elindult, a `prisma migrate deploy` mindkét migrációt sikeresen alkalmazta a `shared-postgres`-en, a szerver válaszol (`curl http://127.0.0.1:2567/` → HTTP 200). A konténer egyelőre csak a szerver saját loopback-jén érhető el — az A.3 (Apache) hiányzik ahhoz, hogy kívülről is elérhető legyen.

```bash
git clone https://github.com/bbalazs2002/Games-center.git /var/www/games-center
cd /var/www/games-center
```

`.env.production` (a `DATABASE_URL` jelszava = A.1-ben létrehozott `<ERŐS_JELSZÓ_2>`; `JWT_SECRET`-et frissen generálni, NEM a fejlesztői `.env`-ét újrahasználni):

```bash
openssl rand -base64 48
```

```bash
cat > /var/www/games-center/.env.production <<'EOF'
DATABASE_URL="postgresql://games_center:<ERŐS_JELSZÓ_2>@postgres:5432/games_center"
JWT_SECRET="<az openssl rand kimenete>"
PORT=2567
EOF
chmod 640 /var/www/games-center/.env.production
```

(`640`, NEM `600`: a fájlt `claude-ops` hozza létre, de a `docker compose build/up`-ot a CI-ben `deploy` user futtatja — ő csak a közös `webapps` csoporton keresztül tudja olvasni a `.env.production`-t. `600`-zal a `deploy` konténerindítása `permission denied`-del elhasal. Ez élesben elő is fordult 2026-07-30-án, javítva.)

(A `VITE_SERVER_URL`/`VITE_BASE_PATH`/`ENABLED_GAMES` NEM ide kerül, azok build-time argumentumok, a `.github/workflows/deploy.yml` adja át őket minden deploy-nál.)

### A.3 🔧 TE (root) — Apache reverse proxy

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel
```

`/etc/apache2/sites-enabled/balazs-le-ssl.conf` — a meglévő `<VirtualHost *:443>` blokkon belülre, a `</VirtualHost>` elé:

```apache
ProxyPass        "/game-center/" "http://127.0.0.1:2567/" upgrade=websocket
ProxyPassReverse "/game-center/" "http://127.0.0.1:2567/"
ProxyPreserveHost On
```

```bash
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### A.4 🔧 TE (root) — Rendszerindításkori automatikus indulás (systemd)

Lásd `docs/deployment-specifikacio.md` §7.1 — a `restart: unless-stopped` önmagában nem elég, ez a kifejezett, ellenőrizhető mechanizmus. A unit-ok `deploy` userként futtatják a `docker compose`-t (nem root-ként), mivel `deploy` már tagja a `docker` csoportnak:

```bash
sudo tee /etc/systemd/system/shared-postgres.service > /dev/null <<'EOF'
[Unit]
Description=Shared PostgreSQL (games-center + jövőbeli projektek)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
User=deploy
WorkingDirectory=/var/www/database
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/games-center.service > /dev/null <<'EOF'
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
EOF

sudo systemctl daemon-reload
sudo systemctl enable shared-postgres.service games-center.service
```

### A.5 🔧 TE — GitHub Secrets

A repo GitHub oldalán: **Settings → Secrets and variables → Actions → New repository secret**, négy bejegyzés:

| Név | Érték |
|---|---|
| `SSH_HOST` | a szerver címe/domainje |
| `SSH_PORT` | a szerver SSH-portja (nem a szokásos 22, lásd `server-diagnostics.sh` kimenete) |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | a `deploy` userhez tartozó privát kulcs (Claude generálta, `games_center_ci_deploy` — a teljes fájltartalom, `-----BEGIN OPENSSH PRIVATE KEY-----`-től `-----END...`-ig) |

### A.6 🔧 TE + 🤖 CLAUDE — Ellenőrzés: reboot-teszt, mielőtt élesnek tekintjük

```bash
docker ps   # jegyezzük fel, mi fut most
sudo reboot
```

Néhány perc múlva, új SSH-munkamenetben:

```bash
docker ps   # mindkét konténernek (shared-postgres, games-center-app) újra futnia kell
sudo systemctl status shared-postgres games-center
```

Ha bármelyik hiányzik: `sudo journalctl -u shared-postgres -u games-center --no-pager | tail -50` a hibakereséshez.

---

## B) Minden publikáláskor ismétlődő lépések

1. **Deploy indítása:** GitHub repo → **Actions** fül → **Deploy** workflow → **Run workflow** gomb (csak `workflow_dispatch`, sosem indul automatikusan pushra).
2. **Sikeres futás után, a fejlesztői gépen:** a most kiszállított commit megjelölése egy tag-gel, hogy a rollback (lásd `deployment-specifikacio.md` §10) egyértelmű célpontot találjon:
   ```bash
   git tag deploy-$(date +%Y-%m-%d-%H%M)
   git push --tags
   ```
3. **Gyors ellenőrzés a szerveren** (log + fut-e valóban), `claude-ops` vagy `deploy` userrel:
   ```bash
   docker compose -f /var/www/games-center/docker-compose.deploy.yml logs --tail=50 app
   docker ps
   ```
4. **Böngészőben:** `https://balazs.gyserver.domenet.info/game-center/` — legalább egy hot-seat Dáma/Hotel parti gyors végigkattintása, hogy a WebSocket-kapcsolat (Colyseus) is ténylegesen működik, nem csak az oldal töltődik be.

---

## C) Rollback

```bash
ssh deploy@<szerver>
cd /var/www/games-center
git fetch --tags
git checkout <előző deploy-tag>
docker compose -f docker-compose.deploy.yml build \
  --build-arg ENABLED_GAMES=dama,hotel \
  --build-arg VITE_BASE_PATH=/game-center/ \
  --build-arg VITE_SERVER_URL=https://balazs.gyserver.domenet.info/game-center
docker compose -f docker-compose.deploy.yml up -d
```
