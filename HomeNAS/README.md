# HomeNAS

Simple web UI for the LatticeWork Amber NAS at `http://192.168.68.53`. Use it on the home network only.

## Layout

- `index.html` — the page shell (markup and inline icons).
- `app.js` — all application logic.
- `proxy.js` — the API proxy on port 3001. Serves the UI files and forwards `/life` and `/` to the NAS, rewriting the bearer token to the NAS cookie.
- `input.css` → `tailwind.css` — Tailwind build for this folder.

## Run

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
npm start
```

The proxy listens on port 3001 on all interfaces and serves the UI itself. Open `http://localhost:3001/` on this Mac, or `file://` + `index.html` if the proxy is already running.

Changes to `input.css` require:

```bash
npm run build:css
```

## Check

Proxy on port 3001:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

## Share with the household

This Mac is the server. It must be awake and running the proxy.

| Device / browser | Address | Notes |
|---|---|---|
| iPhone / iPad (Safari) | `http://homenas.local:3001/` | `.local` resolves through Bonjour |
| Mac (Safari) | `http://homenas.local:3001/` | `.local` resolves through Bonjour |
| Mac (Chrome) | `http://192.168.68.57:3001/` | Chrome does not resolve `.local` here — use the IP |
| Android (any browser) | `http://192.168.68.57:3001/` | Android cannot resolve `.local` names |

Steps for a family member:

1. Open the address for the device.
2. Add it to the home screen (Share → “Add to Home Screen” in Safari; menu → “Add to Home screen” in Chrome).
3. Sign in with their own NAS account (chewfamily — never the admin account).
4. Tick **“Keep me signed in on this computer”** so a refresh does not sign them out.

Requirements:

- Every device must be on the same home Wi-Fi (not a guest network).
- The router must keep this Mac at `192.168.68.57`. Reserve the address in the Deco app.
- Nothing is exposed to the internet. The addresses above work only at home.
- HTTP, not HTTPS: traffic is not encrypted on the local network. Phase 4 covers HTTPS.

## Notes

- The access token stays in memory. “Keep me signed in on this computer” stores it in this browser’s local storage only.
- Reload signs you out, unless you kept me signed in.
- All files in this folder are tracked in git. NAS endpoint details live in `NAS-API.md`, which is excluded via `.git/info/exclude` and is never committed. No NAS credentials are stored anywhere in this folder.
