# HomeNAS on a Raspberry Pi — Deployment Notes

Target: Raspberry Pi 4 / 5, 2 GB or 4 GB, Raspberry Pi OS (64-bit) Bookworm or newer.

---

## 1. Prerequisites

```bash
sudo apt update && sudo apt install -y nodejs npm git
node -v   # should be 20+
npm -v
```

---

## 2. Get the code

```bash
cd ~
git clone <your-repo-url> HomeNAS
cd HomeNAS
npm ci --omit=dev   # installs only production dependencies
```

---

## 3. Environment

Create `.env` in `~/HomeNAS/`:

```dotenv
NAS_TARGET=http://192.168.68.53   # your NAS LAN address
PORT=3001                         # proxy port
```

The proxy reads these with `process.env.NAS_TARGET` and `process.env.PORT`.

---

## 4. Run with a small heap (recommended for 2 GB Pi)

### Option A — systemd (preferred, survives reboot, logs to journal)

```bash
sudo tee /etc/systemd/system/homenas-proxy.service > /dev/null <<'EOF'
[Unit]
Description=HomeNAS proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/HomeNAS
EnvironmentFile=/home/pi/HomeNAS/.env
ExecStart=/usr/bin/node --max-old-space-size=128 --optimize-for-size proxy.js
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now homenas-proxy
journalctl -u homenas-proxy -f   # watch logs
```

### Option B — pm2 (simple process manager, web UI optional)

```bash
npm i -g pm2
pm2 start proxy.js --name homenas-proxy \
  --node-args="--max-old-space-size=128 --optimize-for-size" \
  --env-file=.env
pm2 save
pm2 startup   # follow the printed command
```

### Option C — cron @reboot (no extra tools)

```bash
crontab -e
# add one line:
@reboot /usr/bin/node --max-old-space-size=128 --optimize-for-size /home/pi/HomeNAS/proxy.js >> /home/pi/homenas-proxy.log 2>&1
```

---

## 5. Firewall / LAN access

The proxy listens on `0.0.0.0:3001`. On the Pi:

```bash
sudo ufw allow from 192.168.68.0/24 to any port 3001 comment 'HomeNAS LAN'
sudo ufw enable
```

Replace the subnet with your actual LAN range.

---

## 6. HTTPS (Phase 4)

For a home LAN you can run the proxy on plain HTTP. If you want HTTPS later:

- Terminate TLS at a reverse proxy (Caddy, Nginx) on the Pi, or
- Use a Cloudflare Tunnel (`cloudflared`) pointed at `http://localhost:3001`.

The Node process stays unchanged; only the listener port changes.

---

## 6. Expected memory use

| Component | Typical RSS on Pi 4 (ARM64, Node 20) |
|---|---|
| OS (Raspberry Pi OS Lite 64-bit) | 300–400 MB |
| Node proxy with `--max-old-space-size=128` | 70–100 MB |
| Samba / other services | varies |
| **Total** | **well under 1 GB** on a 2 GB Pi |

The upload staging (`HomeNAS/.uploads/`) lives on disk. Chunks are streamed; a 5 MB chunk is the maximum in-flight buffer.

---

## 7. Updates

```bash
cd ~/HomeNAS
git pull
npm ci --omit=dev
sudo systemctl restart homenas-proxy   # or: pm2 restart homenas-proxy
```

---

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Proxy won't start | `journalctl -u homenas-proxy -n 50` |
| NAS returns 403 / 401 | Verify `NAS_TARGET` IP, and that the NAS user exists |
| UI shows "proxy down" banner | The proxy process is not listening on port 3001 |
| Upload stalls | Check `HomeNAS/.uploads/` disk space; `df -h /home/pi/HomeNAS` |
| OOM kill | Lower `--max-old-space-size` to 96, or add swap: `sudo dphys-swapfile swapoff && sudo dphys-swapfile setup && sudo dphys-swapfile swapon` |

---

## 9. What is NOT in this document

- NAS-side user creation, share setup, or SMB config.
- Cloudflare Tunnel or Caddy config (Phase 4).
- Backup of the NAS data.
- Monitoring beyond `journalctl` / `pm2 logs`.

---

*Generated from the HomeNAS project. Keep this file in the repo root or in `HomeNAS/pi-deployment.md`.*