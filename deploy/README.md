# Deploying Matchup to a server

One small Linux server (a $5/month VPS is plenty) runs everything with Docker Compose:

```
internet ──► Caddy ──┬── /            the web app (static files)
 (80, 443, HTTPS)    └── /api/*  ──►  API ──► Postgres
```

Only Caddy is reachable from the internet. The API and the database sit on a private Docker network with no
published ports and no route out. Caddy gets and renews the HTTPS certificate by itself.

## Before you start

- A server with **Docker** and the **Compose plugin** (`docker compose version` works). Any recent Ubuntu or Debian is fine.
- A **domain** whose DNS **A record** points at the server's IP address (for example `matchup.example.com`).
- Ports **80 and 443** open to the internet (Caddy needs 80 to prove you own the domain).

## First deployment

```bash
git clone <your repository> matchup && cd matchup/deploy
cp .env.example .env
nano .env        # set DOMAIN and a long random POSTGRES_PASSWORD (openssl rand -base64 24)
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes a few minutes. Then check it:

```bash
docker compose -f docker-compose.prod.yml ps              # all three "running", api and db "healthy"
curl https://your-domain/api/health                        # {"ok":true}
```

Open `https://your-domain` in a browser, create a club, and start a session. Players open
`https://your-domain/club/<your-club>` (the Share button shows a QR code for it).

The database schema is created automatically the first time the API starts.

## Updating

```bash
cd matchup && git pull
cd deploy && docker compose -f docker-compose.prod.yml up -d --build
```

Only what changed is rebuilt. Migrations run automatically on start. **Never run `docker compose down -v`**: the
`-v` deletes the database volume.

## Backups

Run a backup by hand, or schedule it:

```bash
cd matchup/deploy && ./backup.sh              # writes ./backups/matchup-<date>.sql.gz, keeps the newest 14
```

Daily at 03:00 with cron (`crontab -e`):

```
0 3 * * * cd /home/you/matchup/deploy && ./backup.sh /home/you/matchup-backups >> /home/you/backup.log 2>&1
```

**Copy the backups off the server** (another machine, or object storage). A backup on the same disk does not
protect you from losing the disk.

To restore into an empty database:

```bash
cd matchup/deploy
gunzip -c backups/matchup-<date>.sql.gz | docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
```

Try a restore once, on a scratch database, before you need it.

## Hardening the server (worth an hour)

- **Firewall:** allow only SSH, 80 and 443, e.g. `ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable`.
  (Docker publishes ports by editing firewall rules itself, so also keep Postgres unpublished, as it is here.)
- **SSH:** use keys and turn off password login.
- **Updates:** enable unattended security upgrades (`apt install unattended-upgrades`), and reboot occasionally.
- **Monitoring:** point a free uptime checker at `https://your-domain/api/health`.

## Everyday operations

```bash
docker compose -f docker-compose.prod.yml logs -f api      # API logs (rate limits, errors)
docker compose -f docker-compose.prod.yml logs -f caddy    # HTTPS and proxy logs
docker compose -f docker-compose.prod.yml restart api
```

**A club lost both its password and its recovery code.** There is no email reset. Delete the club so it can be
created again (its live board and leaderboard go with it):

```bash
docker compose -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' <<'SQL'
delete from clubs where slug = 'the-club-slug';
SQL
```

## Good to know

- **One server.** Login lockouts and live-board connections are held in memory, which is right for one API
  process. Running several would need Postgres `LISTEN/NOTIFY` and a shared limiter (see `apps/api/README.md`).
- **Capacity.** A small server comfortably serves a few thousand simultaneous viewers; the API caps open live
  streams per address (`MAX_SUBSCRIBERS_PER_IP`) and in total (`MAX_SUBSCRIBERS_TOTAL`).
- **Behind another proxy or CDN** (for example Cloudflare in front): keep `TRUST_PROXY=true` only if that proxy
  is the one that sets the client address, and make sure it does not buffer `/api/*/live/stream`.
- **Try it locally first:** set `DOMAIN=:80`, `HTTP_PORT=8081` and a password in `.env`, then open
  `http://localhost:8081`. `:80` means plain HTTP on any host name, so use it for testing only.
