# HomeNAS

Simple web UI for the LatticeWork Amber NAS.

## Network

For now, use the home Wi-Fi network `ChewFamily5G`.

The UI talks to the NAS at `http://192.168.68.53`.
The NAS does not respond on other networks.

## Run

Go to the correct folder:

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
```

Start the API proxy:

```bash
node proxy.js
```

Start the static web server in a second terminal:

```bash
cd /Users/techinasia/Work/tia/cliff/cliffchew84.github.io/HomeNAS
python3 -m http.server 5173
```

Open:

```text
http://localhost:5173
```

## Check

Check the static server on port 5173:

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

Check the API proxy on port 3001:

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

Check the Wi-Fi network:

```bash
ipconfig getsummary en0 | grep SSID
```

Expected result:

```text
SSID : ChewFamily5G
```

## Notes

- `proxy.js` listens on port 3001.
- `index.html` calls `http://localhost:3001`.
- The access token stays in memory.
- Reload signs you out.
