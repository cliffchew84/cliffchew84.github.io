# HomeNAS Product Requirements Document

# Focus: What to build and when.

---

## 1. Project Overview

This document describes the requirements for an internet-facing user interface for the LatticeWork Amber NAS (AM1213-1). The UI manages the NAS but does not run custom code on it — it lives on another device.

The interface is built to work inside the home network first, then over the outside world later. From one place you can see the whole picture: storage, shares, users, health, LEDs, and file operations.

The NAS API contract (curl examples, auth, base URL) is documented in this repository.

## 2. Target Device

### 2.1 Appliance
- Model: LatticeWork Amber AM1213-1
- Serial: 0199
- Firmware: 1.45.1-476427 (latest)
- Two 1 TB disks in RAID 1
- Volume: volume1 (total ~993.8 GB, free ~922 GB)
- RAID status: Normal; resync at 100%; SMART healthy

### 2.2 Network
- Amber router in bridge mode; NAS IP is a static reservation (Deco mesh)
- mDNS names: CliffyGardens.local / latticenode.local
- No edge router access

### 2.3 Shares
| Share | Name shown | Protocols | Recycle Bin |
|------|-----------|------------|-------------|
| ChewFamilyMedia | Media | CIFS, AFP, NFS, FTP | Yes |
| home | home | CIFS only | No |
| TimeMachine | TimeMachine | CIFS, AFP only | No |

### 2.4 Users
| Username | Role | Scope |
|----------|------|-------|
| admin | Administrator | Everything |
| chewfamily | Standard | Media share only |

### 2.5 LED Current State
- Color: Blue, steady; brightness 10%; DND schedule active (off 23:00–07:00)

### 2.6 Known Limitations
No native cloud sync, no backup client, no scheduled power on/off, no bulk download endpoint. Pairing external services (media server, remote sync) via this frontend instead.

## 3. Public API

The NAS exposes a local HTTP API. Features below are driven by these modules: auth, storage, folder, fileshare, network, smb, system, user, health, hwmonitor (thermal + LED), bonjour, eventlog.

Endpoint examples are documented in this repository.

## 4. Requirements

### 4.1 Browser Support
Latest two versions of Chrome, Firefox, Safari, Edge, plus mobile Safari and Chrome on Android.

### 4.2 Responsive Layout
Desktop, tablet, and phone — independent breakpoints.

### 4.3 Security
- Access token kept only in memory, never written to disk
- HTTPS in production (via a private-network tunnel)
- Only the admin role can touch admin endpoints
- Every form is validated before submission

## 5. Feature Phases

Legend: ⬜ Planned | 🚧 In Progress | 🔮 Future

### 5.1 Phase 1 — Core (MVP)

#### 5.1.1 Authentication
- Login page (username + password)
- Access token kept in memory only
- Auto-logout when the token expires
- “Remember me” stores username only

#### 5.1.2 Dashboard
- One view for all main areas: Storage, RAID, Health, Users, Shares, LED, SMART, Thermal
- One auto-refresh cycle per area (every 30 s)

#### 5.1.3 File Browser
- Folder list, file list, breadcrumb navigation
- Single file download
- Create folder
- File metadata columns (name, size, modified date, type) once available
- Recursive folder tree (left pane)
- Rename and delete files/folders
- Drag-and-drop upload (multi-file)
- Multi-select (checkboxes)
- Bulk actions: delete multiple, download several as one archive

#### 5.1.4 Share Management
- List, edit display name
- Toggle protocol enablement per share
- Toggle recycle bin per share

#### 5.1.5 User Management
- List users with role and current scope
- Create user, change password, edit description
- Delete user (with option to remove their home directory)
- Password policy enforced (min length, mixed case, digits)

#### 5.1.6 LED Control
- Picker over WHITE, RED, GREEN, BLUE, YELLOW, MAGENTA, AMBER, AMBER_BLUE, OFF
- Brightness slider 0–100%
- Do Not Disturb schedule (start/end times)
- Live preview + apply button that registers and activates the state

#### 5.1.7 Health Monitoring (admin only)
- Thermal status: CPU temperature, disk thermal state, shutdown thresholds
- Sensors: CPU ambient, system temp, fan RPM, DC voltage
- SMART detail: raw attributes per disk
- Daily scheduled check and “run now” button

### 5.2 Phase 2 — Admin and Maintenance

#### 5.2.1 Network Settings
- View interface IP, MAC, gateway, DNS, DHCP vs. static per interface
- Change hostname
- View Bonjour/mDNS services

#### 5.2.2 Firmware
- Show current version, firmware logs, update prompt

#### 5.2.3 Service Control
- Enable/disable SMB, AFP, NFS, FTP per share
- Restart Samba daemons

#### 5.2.4 Recycle Bin Browser
- Browse deleted items by share
- Restore individual files or folders
- Purge selected items permanently

#### 5.2.5 Event Log
- Filter events by date and severity
- Login and logout events
- Error events

### 5.3 Phase 3 — Quality of Life

#### 5.3.1 UI Enhancements
- Dark theme (system preference or manual toggle)
- Command palette (modals on shortcut)
- Keyboard shortcuts help overlay
- Toast notifications tied to specific actions

#### 5.3.2 Advanced File Operations
- Bulk move/copy between directories
- Share-time download links (time-limited URLs)
- Folder size treemap visualization
- Search files by name across opened shares

#### 5.3.3 Alerts
- SMART warnings
- High temperature alerts
- RAID degraded alerts
- Do Not Disturb alerts, dismissible, persisted in a notification center

#### 5.3.4 Performance
- Smooth rendering of folders with 1000+ files
- Immediate-correcting UI after every file operation
- App keeps working after brief disconnects while uploading
- Automatic updates without manual refresh (within seconds)
- Smart caching of repeated API responses

#### 5.3.5 Media Preview
- Image preview modal for JPEG, PNG, WebP, GIF
- Video preview modal for MP4, WebM playback
- “Preview” button appears for supported types automatically
- Previews operate through the storage-share paths (not copied to your browser)
- A thumbnail service produces small JPEG previews on demand
- *Note:* because storage shares stream full files, true video seeking needs a streaming layer added later

#### 5.3.6 Multi-File Archive Download
- Select multiple files, ask for a single ZIP download
- Forced download queues reported progress

#### 5.3.7 Sync & Backup Integration
- Recommended external tools documented in a settings page:
  - `rsync` (scheduled)
  - Syncthing (real-time two-way sync)
  - Immich (photos automatically uploaded)
- A “Sync” action opens the matching tool’s web UI or triggers its job on the managing device
- Status shown in the UI where tools are running
- *Note:* engines run on the managing device, not the NAS itself

### 5.4 Phase 4 — Remote & Offline-Capable Operation

Access retained from phones and laptops on the home private network. Goals: HTTPS, restart survival, quick rebuild from source; that source is this repository.

- HTTPS anywhere reachable from private network
- Survives restart without losing access
- All requests reach the NAS through one secure origin


### 5.5 Phase 5 — Hardware Integrations & Automation

#### 5.5.1 LED & Buzzer Automation
- Trigger from NAS events, conditions, schedules, and external webhooks:
  - RAID resync starts → blue, pulsing; quiet buzzer
  - RAID degraded → red, fast blinking; buzzer beeps
  - CPU temp above 70 °C → yellow then red as it climbs; quiet buzzer
  - Disk SMART warning → amber, double blink; single buzzer beep
  - Backup job complete → green, single flash; quiet buzzer
  - DND start → off; DND end → restore prior state
  - System boot → amber_blue, pulsing; single buzzer beep
  - Admin login → green, steady; quiet buzzer
- Brightness and blink frequency adjustable (frequency controls pause interval; null = steady)
- Do Not Disturb schedule turns LED and buzzer off

#### 5.5.2 Automation Engine
- A rule builder: IF (event or condition) THEN (LED action + optional buzzer/notification)
- Conditions: thermal thresholds, RAID state, SMART attributes, time schedules, external webhooks
- Actions: set LED color/brightness/pattern, trigger buzzer, send notification, run a script
- Rules persist in the app and still evaluate headlessly — even when no browser is open
- Webhook endpoint accepts external triggers (e.g., backup jobs, CI/CD calls)

#### 5.5.3 Health Webhooks
- Receives NAS health events, forwards them to Discord, Slack, Pushover, ntfy.sh, Home Assistant, and any custom URL
- Payload includes event type, severity, timestamp, and details (temp, disk, RAID state)

### 5.6 Phase 6 — External Media Server Integration

Run Jellyfin, Immich, or PhotoPrism on a separate device (never on the NAS) and connect it to the NAS media share. The frontend stays the primary surface.

- Running media server, its auth, and database settings
- Mounted NAS share feeding the media server
- Transcoding pipeline notes for the chosen product
- Mobile apps provided by the media server
- AI features exposed by Immich / PhotoPrism
- File items tag with metadata (albums, people, faces)

#### 5.6.1 Frontend Integration Points
- “Open in [server]” deep links from the file browser for each file
- Thumbnail grid produced through the same thumbnail service
- Album/people/tags synced back into the local browse experience
- Unified search through the media server index

## 6. User Roles and Permissions

| Area | Admin | Standard |
|-----|-------|--------|
| Dashboard | Full view of all areas | Own permitted shares |
| File browser | All shares | Permitted shares |
| Upload/download | All shares | Permitted shares |
| Rename / delete | All shares | Permitted shares |
| Share management | Full | None |
| User management | Full | None |
| LED control | Full | View only |
| LED automation | Full | View only |
| Health detail | Full | Thermal only |
| Health webhooks | Full | None |
| Media preview | Full | Permitted shares |
| Media server access | Full | Permitted shares |
| Network settings | Full | None |
| Firmware | Full | None |
| Service control | Full | None |
| Event log | Full | None |

## 7. Out of Scope
- Native backup client for Windows, Mac, or phone
- Torrent or bulk download client
- Media server built onto the NAS (the NAS cannot host it)
- Cloud sync (Google Drive, Dropbox, S3)
- Database hosting
- Container runtime
- Firmware modification
- Hardware repair
- Scheduled power on/off (not supported by this appliance)

## 7.1 Known Issues / Deferred

### HTTPS for Local Development
- **Issue**: Browser shows "Not Secure" warning on `http://localhost:8000`
- **Cause**: Self-signed certs on NAS; proxy runs HTTP only
- **Workaround**: Click "Advanced → Proceed" in browser
- **Fix (later)**: Use `mkcert` for trusted local certs, or terminate TLS at reverse proxy (Caddy/Traefik)
- **Status**: ⏸ Deferred — does not block LAN usage

---

## 8. Success Criteria

The product is ready for release when the following state is reached:
- Login works for both accounts
- Dashboard shows disks, RAID, health, LED
- File browser can browse share folders, download files, create folders
- File browser supports recursive tree, file metadata, rename, delete, multi-select, upload
- Share management lists and edits shares, toggles protocols, recycle bin
- User management creates, modifies, deletes users
- LED control changes color, brightness, and DND schedule
- Health page thermal / sensors / SMART live (admin)
- Daily health check schedule and run-now are present
- Phase 5 automation rules, LED+buzzer mapping, and webhook forwards are implemented
- Phase 6 media preview, shared search, and external media server integration are in place
- Multi-file archive download persists in progress
- Alerts are dismissible and recorded
- A build that serves the UI at any device on the private network is ready to release

---

