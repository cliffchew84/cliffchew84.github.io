# HomeNAS

Simple web UI for the LatticeWork Amber NAS at `http://192.168.68.53`. Use it on the home network only.

## Layout

- `index.html` — the whole user interface (markup and styles).
- `app.js` — all application logic.
- `proxy.js` — the API proxy on port 3001. Forwards `/life` and `/` to the NAS and rewrites the bearer token to the NAS cookie.
- `input.css` → `tailwind.css` — Tailwind build for this folder.

## Run

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
npm start
```

Open `HomeNAS/index.html` in a browser (double-click or `file://`), or serve this folder with any static server on any port except 5173 (the Town app uses 5173). The app calls the proxy at `http://localhost:3001`.

Changes to `input.css` require:

```bash
npm run build:css
```

## Check

Proxy on port 3001:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

## Notes

- The access token stays in memory. “Keep me signed in on this computer” stores it in this browser’s local storage only.
- Reload signs you out, unless you kept me signed in.
- All files in this folder are tracked in git. NAS endpoint details live in `NAS-API.md`, which is excluded via `.git/info/exclude` and is never committed. No NAS credentials are stored anywhere in this folder.
