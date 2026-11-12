# HomeNAS

Web UI for the LatticeWork Amber NAS at `http://192.168.68.53`. Home network only.

## Run

Requirements: Node.js LTS on the machine that serves the UI.

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
npm start
```

Open `http://localhost:3001/`. Opening `file://` + `index.html` also works while the proxy runs.

`npm start` runs `node proxy.js` on port 3001. That single process serves the UI (`/`, `/app.js`, `/tailwind.css`) and
forwards `/life` plus all other paths to the NAS. Do not use port 5173 — the Town app owns it.

After a Mac restart, run `npm start` again. Nothing starts automatically.

### Background mode

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
nohup npm start > /tmp/homenas-proxy.log 2>&1 &
```

Survives closing the terminal. Does not survive a reboot. Log: `/tmp/homenas-proxy.log`.

### Check and stop

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN                        # expected: node ... TCP *:3001 (LISTEN)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/   # expected: 200
kill $(lsof -t -iTCP:3001)                              # stop the proxy
```

`EADDRINUSE` means an instance already runs. Check with `lsof` before starting another.

### After editing styles

`input.css` changes need a rebuild:

```bash
npm run build:css
```

## Files

| File                         | Purpose                                                             |
| ---------------------------- | ------------------------------------------------------------------- |
| `index.html`                 | Page shell and inline icons                                         |
| `app.js`                     | All application logic                                               |
| `proxy.js`                   | Port 3001: serves the UI, proxies the NAS API, records disk history |
| `input.css` → `tailwind.css` | Tailwind source and build output                                    |
| `.health-history.jsonl`      | Local daily disk snapshots (gitignored)                             |
| `PRD.md`                     | Scope and status tracker                                            |
| `NAS-API.md`                 | NAS endpoint notes (git-excluded, never committed)                  |

## Share with the household

The Mac that runs the proxy is the server. It must be awake.

| Device / browser       | Address                      |
| ---------------------- | ---------------------------- |
| iPhone / iPad (Safari) | `http://homenas.local:3001/` |
| Mac (Safari)           | `http://homenas.local:3001/` |
| Mac (Chrome)           | `http://192.168.68.54:3001/` |
| Android (any browser)  | `http://192.168.68.54:3001/` |

`homenas.local` works through Bonjour. Chrome and Android cannot resolve `.local` names; use the IP there. Safari
accepts the IP too.

Setup per device:

1. Open the address.
2. Add it to the home screen: Safari Share menu → “Add to Home Screen”; Chrome menu → “Add to Home screen”.
3. Sign in with a personal NAS account (`chewfamily`, never the admin account).
4. Tick “Keep me signed in on this computer”. A refresh then keeps the session.

Requirements:

- All devices on the main home Wi-Fi, not a guest network.
- Router reservation keeps the server Mac at `192.168.68.54`. Without a reservation the address can change; check it
  with `ipconfig getifaddr en0` on the Mac.
- LAN only. Nothing is exposed to the internet.
- HTTP, not HTTPS. Phase 4 adds HTTPS.

## Disk failure risk (experiment)

- The Health view records one snapshot per day: temperature, SMART status, power-on hours, power/load cycles,
  reallocated/pending/uncorrectable/CRC counters, LBAs written and read.
- Snapshots live in `.health-history.jsonl` on the server Mac. The NAS is never written to; the only NAS load is one
  SMART read per day.
- A rule-based rating (Low / Medium / High) lists its reasons from counters, temperature, age and snapshot trends.
- Advisory only. RAID 1 survives one failed disk. It is not a backup. Keep a second copy off the NAS.

## Remote access (Phase 4 — not implemented)

The app is LAN-only today. Outside the house, nothing reaches it. Any option below needs this Mac awake, and needs
hardening before it faces the internet.

| Option                      | Access                     | Gate                                                | Notes                                                                                                                                                                 |
| --------------------------- | -------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare Tunnel, quick    | Public URL                 | NAS login only                                      | `cloudflared tunnel --url http://localhost:3001`. Random `*.trycloudflare.com` address, changes on restart. No account, no domain. 100 MB upload cap on the free plan |
| Cloudflare Tunnel, named    | Stable URL `home.<domain>` | Cloudflare Access (email one-time code) + NAS login | Needs a domain on Cloudflare (free plan is enough). Same 100 MB upload cap                                                                                            |
| Tailscale                   | Private network            | Device enrollment                                   | App per device; end-to-end encrypted; no third-party traffic visibility; no upload cap                                                                                |
| Port forward + DDNS + Caddy | Public URL                 | NAS login                                           | Blocked: the Deco runs in bridge mode with no edge-router access. Exposes this Mac to internet scanners                                                               |

`cloudflared` was already used on this Mac for a ClickHouse tunnel (`cloudflared tunnel --url http://localhost:8123`).
Install: `brew install cloudflared`.

Hardening required before any public route:

- Rate limiting and lockout on `/auth/auth`.
- CORS locked to the public hostname only.
- Cloudflare Access in front, so the NAS login page is not reachable by strangers.
- Upload size expectations set (the 100 MB cap applies per request).

For large uploads, use the LAN address at home. A tunnel is for browsing and downloading away from home.

## Replicate on a new machine

Use this after a disk crash, a laptop replacement, or a move to a new server machine.

1. Install Node.js LTS.
2. Get the code:

   ```bash
   git clone https://github.com/cliffchew84/cliffchew84.github.io.git
   ```

3. Install dependencies (`node_modules` is not in git):

   ```bash
   cd cliffchew84.github.io/HomeNAS
   npm install
   ```

4. Start and verify:

   ```bash
   npm start
   curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/
   ```

5. Confirm the NAS address. `proxy.js` hardcodes `http://192.168.68.53`. Change that target if the NAS moves.
6. Find the new machine’s IP:

   ```bash
   ipconfig getifaddr en0
   ```

7. In the Deco app, reserve that IP for the new machine. Update the household bookmarks and home-screen shortcuts.
8. If the macOS firewall is on, allow `node` incoming connections.

Two files do not travel with git:

- `NAS-API.md` — intentionally excluded. Copy it from a backup if the endpoint notes matter.
- `.health-history.jsonl` — local disk history. A new machine starts collecting from zero.

## Notes

- The access token stays in memory. “Keep me signed in on this computer” stores it in this browser’s local storage only.
- Reload signs you out unless you kept me signed in.
- All files in this folder are tracked in git except `NAS-API.md` (via `.git/info/exclude`) and `.health-history.jsonl`
  (via `.gitignore`). No NAS credentials are stored in this folder.
