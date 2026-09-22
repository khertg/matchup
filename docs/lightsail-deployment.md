# Deploying Q2Dink alongside another app on the same Lightsail instance, via Cloudflare Tunnel

The Lightsail instance already runs a different, unrelated app (`trackit`: its own C#.NET +
React + Postgres stack, in Docker, fronted by its own Caddy on ports 80/443). Q2Dink needs to join
it at `q2dink.khertgeverola.dev` **without touching `trackit`'s Caddy, containers, config or DNS in
any way** — no shared Docker network, no edited Caddyfile, no reload of a production service that
isn't ours.

Read `deploy/README.md` first — it's still the source of truth for what each command below does,
the security-header/CSP notes, backups, and day-to-day operations. This document only covers what's
different here: **Q2Dink gets its own Cloudflare Tunnel** — an outbound-only connection from a
`cloudflared` container (added to Q2Dink's own stack only) to Cloudflare's edge, which terminates
TLS and serves the subdomain. Q2Dink's own Caddy is remapped off ports 80/443 onto two unused,
never-opened-in-the-firewall ports (`deploy/docker-compose.prod.yml` already supports this via
`HTTP_PORT`/`HTTPS_PORT`), so there is nothing on this instance for `trackit` to conflict with, and
nothing reachable from the internet on those ports either — Cloudflare's tunnel is the only actual
path in.

Postgres needs no special handling: Q2Dink's `db` service publishes no host port and lives in its
own `internal: true` network inside its own Compose project, so it can't collide with `trackit`'s
Postgres regardless.

## 1. Prerequisites

- A Cloudflare account (the tunnel is free).
- `khertgeverola.dev`'s DNS delegated to Cloudflare (its nameservers set at your registrar to
  Cloudflare's). **If any other records already exist for this domain** (for `trackit` or anything
  else), recreate them in Cloudflare's DNS *before* switching nameservers, so nothing else on the
  domain goes down during the cutover.
- Enough headroom to run a second Postgres plus a few more containers alongside the existing stack:
  ```bash
  free -h
  df -h
  ```

## 2. Create the tunnel in Cloudflare (dashboard, no CLI needed)

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**.
2. Choose **Cloudflared**, name it `q2dink`, click **Save tunnel**.
3. On the **Install and run a connector** page, pick **Docker** as the environment. Cloudflare
   shows a `docker run` command containing a long `--token` value — copy just that token (not the
   whole command; section 3 below adds a `cloudflared` service to Q2Dink's own compose stack
   instead of running this command by hand). Click through to finish creating the tunnel.
4. Open the `q2dink` tunnel → **Routes** tab → **Add a published application**. This opens an
   "Add published application" dialog — this is where you tell Cloudflare's edge "requests for this
   hostname should go through this tunnel, to this address inside it." Fill in:
   - **Hostname → Subdomain**: `q2dink`
   - **Hostname → Domain**: `khertgeverola.dev` (the full hostname preview should read
     `q2dink.khertgeverola.dev`)
   - **Path**: leave blank
   - **Service URL**: `http://caddy:80` (include the `http://` — this single field takes a full URL,
     not a separate protocol dropdown)

   `caddy:80` is not reachable yet at this point — it's just the address `cloudflared` will be told
   to connect to once it's actually running. It only resolves once `cloudflared` and Q2Dink's
   `caddy` container are started together in section 3 below, in the same Compose project (Docker
   gives every service in a project a DNS name matching its service name, so `caddy` resolves to
   the Caddy container from anywhere else in that same project — including `cloudflared` once it
   joins it). Leave **Additional application settings** collapsed — the defaults are fine. Saving
   this doesn't test the connection, so don't worry that nothing is running yet.
5. Click **Add route**. Cloudflare creates and manages the DNS record for
   `q2dink.khertgeverola.dev` itself from here on — nothing to add by hand in DNS.

## 3. Deploy Q2Dink, tunnel-only

```bash
git clone <your repository> q-2-dink && cd q-2-dink/deploy
cp .env.example .env
```

Edit `.env`:

- `POSTGRES_PASSWORD` — a long random one (`openssl rand -base64 24`).
- **`DOMAIN=:80`** — this is the repo's existing "plain HTTP, no ACME" mode (documented in
  `deploy/README.md`'s "Try it locally first" note, normally used for local testing). Reused here
  for the same underlying reason: Q2Dink's own Caddy never needs to know the public hostname or
  manage a certificate — Cloudflare terminates TLS at its edge, and the hop from `cloudflared` to
  `caddy` stays inside the Docker network.
- **`HTTP_PORT=18080`** and **`HTTPS_PORT=18443`** — `trackit` already owns 80 and 443 on this
  host, so Caddy needs to bind something else. Pick ports that don't clash with what `docker ps`
  showed `trackit` using (80, 443, 4000, 8093, 5432) — `18080`/`18443` are just an example, any free
  pair works. **Do not open these in the Lightsail networking/firewall tab.** Nothing needs to reach
  them from the internet — `cloudflared` reaches Caddy over the internal Docker network by its
  service name (`caddy:80`, the container's own port, unrelated to whatever host port it's also
  mapped to), and leaving the firewall closed is what actually keeps these two ports from being a
  second, un-monitored way into the app alongside the tunnel.
- `CLOUDFLARE_TUNNEL_TOKEN=<the token from step 2>` — a secret, same as `POSTGRES_PASSWORD`; `.env`
  is already gitignored so this never gets committed.

Now add a small override file that adds `cloudflared` as a fourth service, **without editing the
tracked `docker-compose.prod.yml`** (keeps `git pull` conflict-free). Compose only *replaces*
single-value fields across `-f` files — list fields like `ports:` are concatenated, not replaced,
which is why the port remapping above has to happen through `.env`/the base file rather than by
trying to clear `ports:` here:

```bash
cat > cloudflare-tunnel.override.yml <<'EOF'
# Local only — do not commit. Adds a cloudflared sidecar that reaches Caddy by its Compose service
# name and tunnels q2dink.khertgeverola.dev to it via Cloudflare's edge.
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      caddy:
        condition: service_started
    networks: [edge]
EOF
```

Bring it up with both files:

```bash
GIT_SHA=$(git rev-parse --short HEAD) \
  docker compose -f docker-compose.prod.yml -f cloudflare-tunnel.override.yml up -d --build
```

(Every future update on this box uses the same two `-f` flags — see `deploy/README.md`'s
"Updating" section for the rest of that flow.)

## 4. Verify

```bash
bash deploy/smoke.sh https://q2dink.khertgeverola.dev
```

Then double-check `trackit` is still up and unaffected — it should be, since nothing about this
touched it: `sudo docker ps` should show `trackit-backend-1`, `trackit-frontend-1`,
`trackit-postgres-1` and `trackit-caddy-1` exactly as before, and its own URL still works.

## Good to know

- **Nothing to open in the firewall for Q2Dink.** `cloudflared` only makes outbound connections, so
  the tunnel itself needs no inbound rule. Caddy's `HTTP_PORT`/`HTTPS_PORT` from step 3 *are* bound
  on the host (Docker needs to bind something), but as long as they're never added to Lightsail's
  networking/firewall tab, they're unreachable from the internet — only from other processes on the
  same instance, same as the ports `trackit` binds without listing here.
- **TRUST_PROXY** (`docker-compose.prod.yml`'s `api` service) stays `true` unchanged —
  `deploy/README.md`'s existing "Behind another proxy or CDN" note already covers exactly this case
  (Cloudflare sets the real client address; Caddy and the API trust it).
- **Rotating the tunnel token**: if it's ever compromised, revoke and reissue it from the same
  Cloudflare Tunnel page, update `CLOUDFLARE_TUNNEL_TOKEN` in `.env`, then
  `docker compose -f docker-compose.prod.yml -f cloudflare-tunnel.override.yml up -d` to pick it up
  — no `trackit`-side change needed, ever.
- **Everyday operations, backups, and future updates**: unchanged from `deploy/README.md` — just
  remember the extra `-f cloudflare-tunnel.override.yml` on every `docker compose` command for this
  deployment.
