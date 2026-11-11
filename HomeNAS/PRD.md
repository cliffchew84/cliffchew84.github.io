# HomeNAS Product Requirements Document

# Focus: What to build and when.

---

## 1. Project Overview

This document describes the requirements for an internet-facing user interface for the LatticeWork Amber NAS (AM1213-1). The UI manages the NAS but does not run custom code on it — it lives on another device.

The interface is built to work inside the home network first, then over the outside world later. From one place you can see the whole picture: storage, shares, users, health, and file operations.

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
Verified 2026-11-11 via the app API. Root now contains:

| Name | Internal name | Type |
|------|---------------|------|
| home | home | home |
| Homes | Homes | homes |
| VPHome | VPHome | vphome |
| SharedFolder | SharedFolder | internal (created 2026-11-11) |

`TimeMachine` is a folder inside `/home`, not a share. `ChewFamilyMedia` no longer exists. Protocols per share not verified.

### 2.4 Users
| Username | Role | Scope |
|----------|------|-------|
| admin | Administrator | Everything |
| chewfamily | Standard | Media share only |

### 2.6 Known Limitations
No native cloud sync, no backup client, no scheduled power on/off, no bulk download endpoint. Pairing external services is out of scope; use each service directly.

## 3. Public API

The NAS exposes a local HTTP API. Features are driven by these modules: auth, folder (via life + batch/commit), storage, nasfs, user, health, hwmonitor (thermal).

Endpoint notes are kept in a local-only file (`NAS-API.md`, excluded from this repository via `.git/info/exclude`). No NAS API details are committed to this repository.

## 4. Requirements

### 4.1 Browser Support
Latest two versions of Chrome, Firefox, Safari, Edge, plus mobile Safari and Chrome on Android.

### 4.2 Responsive Layout
Desktop, tablet, and phone — independent breakpoints.

### 4.3 Security
- Access token kept in memory by default; optional “Keep me signed in on this computer” stores it in this browser only
- HTTPS in production (via a private-network tunnel)
- Only the admin role can touch admin endpoints
- Every form is validated before submission

## 5. Feature Phases

Legend: ⬜ Planned | 🚧 In Progress | 🔮 Future | ✅ Done

### 5.1 Phase 1 — Core (MVP)

#### 5.1.1 Authentication
- ✅ Login page (username + password)
- ✅ Access token kept in memory by default; optional “Keep me signed in on this computer” stores it in this browser only
- ✅ Auto-logout when the token expires (any 401 ends the session)
- ✅ Change the admin password from within the app (NAS API verified live)

#### 5.1.2 Dashboard
- ⬜ One view for all main areas: Storage, RAID, Health, Shares, SMART, Thermal
- ⬜ One auto-refresh cycle per area (every 30 s)

#### 5.1.3 File Browser
- ✅ Folder list, file list, breadcrumb navigation
- ✅ Single file download
- ✅ Create folder
- ✅ File metadata columns (name, size, modified date, type) once available
- ✅ Recursive folder tree (left pane)
- ✅ Rename and delete files/folders
- ✅ Drag-and-drop upload (multi-file)
- ✅ Multi-select (checkboxes)
- ✅ Bulk delete (multiple files)

#### 5.1.4 Share Management
- ✅ List, edit display name (pencil action on internal shares; API verified live — the file-browser flow itself needs a click-through test)

#### 5.1.5 Health Monitoring (admin only)
- ⬜ Thermal status: CPU temperature, disk thermal state, shutdown thresholds
- ⬜ SMART detail: raw attributes per disk

### 5.2 Phase 2 — Admin and Maintenance

#### 5.2.1 Recycle Bin Browser
- Browse deleted items by share
- Restore individual files or folders
- Purge selected items permanently

### 5.3 Phase 3 — Quality of Life

#### 5.3.1 UI Enhancements
- ✅ Toast notifications tied to specific actions

#### 5.3.2 Advanced File Operations
- Bulk move/copy between folders — deferred; same-share first, cross-share move only after NAS API and failure behavior are verified
- Search files by name across opened shares

#### 5.3.3 Alerts
- SMART warnings
- High temperature alerts
- RAID degraded alerts

#### 5.3.4 Performance
- The file list remains smooth and usable with at least 1,000 items
- Immediate-correcting UI after every file operation
- App keeps working after brief disconnects while uploading

#### 5.3.5 Photo Preview
- Image preview modal for JPEG, PNG, WebP, GIF
- “Preview” button appears for supported image types
- Previews operate through the storage-share paths (not copied to your browser)
- Deferred: a thumbnail service produces small JPEG previews on demand

#### 5.3.6 Video Preview — Deferred, not deleted
- Video preview modal for MP4, WebM playback
- “Preview” button appears for supported video types
- Previews operate through the storage-share paths (not copied to your browser)
- *Note:* because storage shares stream full files, true video seeking needs a streaming layer added later

#### 5.3.7 Large Transfer Progress
- Bulk download as one ZIP archive — moved from Phase 1; requires a reliable NAS or server-side ZIP path
- Bulk ZIP job progress and queue state when the NAS exposes a job-status API
- Large upload progress, including percent, bytes transferred, estimated time remaining, cancel, retry, and one aggregate view for a multi-file queue

### 5.4 Phase 4 — Remote & Offline-Capable Operation

Access retained from phones and laptops on the home private network. Goals: HTTPS, restart survival, quick rebuild from source; that source is this repository.

- HTTPS anywhere reachable from private network
- Survives restart without losing access
- All requests reach the NAS through one secure origin


### 5.5 Phase 5 — Health Notifications

#### 5.5.1 Health Webhooks
- Receives NAS health events, forwards them to Discord, Slack, Pushover, ntfy.sh, Home Assistant, and any custom URL
- Payload includes event type, severity, timestamp, and details (temp, disk, RAID state)

## 6. User Roles and Permissions

| Area | Admin | Standard |
|-----|-------|--------|
| Dashboard | Full view of all areas | Own permitted shares |
| File browser | All shares | Permitted shares |
| Upload/download | All shares | Permitted shares |
| Rename / delete | All shares | Permitted shares |
| Share management | Full | None |
| Health detail | Full | Thermal only |
| Health webhooks | Full | None |
| Media preview | Full | Permitted shares |

## 7. Out of Scope
- Event log — use Amber OS Control Panel
- NAS network, firmware, and service administration — use Amber OS Control Panel
- Per-share protocol toggles and recycle-bin toggles — use Amber OS Control Panel
- General automation rules — use external tools if needed
- Native backup client for Windows, Mac, or phone
- Torrent or bulk download client
- Media server built onto the NAS (the NAS cannot host it)
- External media-server integration — use the media server directly
- Cloud sync (Google Drive, Dropbox, S3)
- Database hosting
- Container runtime
- Firmware modification
- Hardware repair
- Scheduled power on/off (not supported by this appliance)

## 7.1 Known Issues / Deferred

### HTTPS for Local Development
- **Issue**: Browser shows "Not Secure" warning on `http://localhost:5173`
- **Cause**: Self-signed certs on NAS; proxy runs HTTP only
- **Workaround**: Click "Advanced → Proceed" in browser
- **Fix (later)**: Use `mkcert` for trusted local certs, or terminate TLS at reverse proxy (Caddy/Traefik)
- **Status**: ⏸ Deferred — does not block LAN usage

### Family (chewfamily) usage untested
- **Issue**: Login as chewfamily works at the NAS level, but the app is untested with that account. Admin-only actions fail with NAS error toasts — expected.
- **Status**: ⏸ Known limitation — resolve with a chewfamily test session

---

## 8. Success Criteria

The product is ready for release when the following state is reached:
- Login works for both accounts
- Dashboard shows disks, RAID, health
- File browser can browse share folders, download files, create folders
- File browser supports recursive tree, file metadata, rename, delete, multi-select, upload
- Share management lists and edits share display names
- Health page thermal and SMART detail live (admin)
- Health webhook forwards are implemented
- Multi-file archive download persists in progress
- SMART, high temperature, and RAID degraded alerts work
- A build that serves the UI at any device on the private network is ready to release

---

