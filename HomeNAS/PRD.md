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
- ✅ One view for all main areas: Storage, RAID, Health, SMART, Thermal (the Health/overview view; Shares removed by product decision)

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
- ✅ Thermal status: CPU temperature, disk thermal state, shutdown thresholds (Health view)
- ✅ SMART detail: raw attributes per disk (Health view)

### 5.2 Phase 2 — Admin and Maintenance

#### 5.2.1 Recycle Bin Browser
- ✅ Browse deleted items by share (verified in the UI 2026-11-12)
- ✅ Restore individual files or folders (restore round-trip verified live)
- ✅ Purge selected items permanently (per item and Empty bin with a confirmation modal — no typed text, per product decision 2026-11-12)

### 5.3 Phase 3 — Quality of Life

#### 5.3.1 UI Enhancements
- ✅ Toast notifications tied to specific actions
- ✅ Mobile responsive layout (built and verified in the UI 2026-11-12): off-canvas sidebar drawer + overlay below 768 px (auto-closes on selection), file table becomes stacked cards (sort chips replace the hidden column headers), full-width search, larger tap targets on row actions, badge hidden on narrow phones. Desktop behavior kept unchanged
- ✅ Gear (Settings) menu in the header combining Health, Change password, and Sign out (built and verified in the UI 2026-11-12). Health and Change password are hidden for non-admin sessions; Esc/click-outside closes; focus returns to the gear on Esc
- ✅ Column sorting (built and verified in the UI 2026-11-12): sortable Name/Size/Modified/Type headers, folders always above files, toggles asc/desc; applies to search results too
- ✅ Up-nav button (built and verified in the UI 2026-11-12): toolbar button navigates one folder up (Windows Explorer style); disabled at root; per-folder-row 'move up one level' button remains; items can also be dragged onto the button or onto a breadcrumb segment
- 🚧 Built 2026-11-12 (unverified — built off the home network): file-type filter chips above the list — All plus Photos, Videos, Audio, Documents, Code, Archives and Other, each with a live count for the current folder. Classification is by extension; unknown or missing extensions go to Other; folders stay visible in every category. The choice persists across folders, shares, search, sort and page reload (`localStorage homenas.typeFilter`); changing it clears the selection; the recycle bin view is not filtered. A filtered empty result shows "No <type> in this folder" with a Show all button, never the empty-folder illustration. The Type column keeps the file extension: category and preview support are separate (a HEIC file is a Photo that cannot preview)

#### 5.3.2 Advanced File Operations
- ✅ Bulk move/copy between folders (built and verified in the UI 2026-11-12): toolbar Move/Copy buttons (enabled with a selection); destination picker (folder browser across all shares; @SmbRecyclebin excluded); collision → automatic timestamp rename; per-item error reporting; list + search re-render after; drag-and-drop move for checked (or single) rows onto folder rows or tree folder nodes (any share); per-folder-row 'move up one level' action (built 2026-11-12); drag-and-drop onto breadcrumb segments and the toolbar Up button (built and verified 2026-11-12). Cross-share move and copy verified by probe 2026-11-12 (folder moved /home → /SharedFolder; folder copied /home → /VPHome, both listed and cleaned up); picker now starts at the share list and any folder inside a share is a valid destination; bins excluded. Folder copy is verified on the NAS. Cross-share drag-and-drop onto sidebar tree nodes enabled
- ✅ Search files by name — within the current share only (built and verified in the UI 2026-11-12; recursive walk of the share, max 200 results, runs only on explicit submit — Enter or Search button, to limit NAS load; ×/Escape stops; NAS has no search endpoint — verified 404). Cross-share scope intentionally narrowed by product decision

#### 5.3.3 Alerts
- SMART warnings
- High temperature alerts
- RAID degraded alerts

#### 5.3.4 Performance
- The file list remains smooth and usable with at least 1,000 items
- ✅ Immediate-correcting UI after every file operation (views re-render immediately after upload/rename/create/delete; list re-fetches twice to cover NAS indexing lag)
- App keeps working after brief disconnects while uploading

#### 5.3.5 Photo Preview
- ✅ Preview modal (built and verified in the UI 2026-11-12): image preview for JPEG, PNG, WebP, GIF; text preview for code/config/log files (whole file, first 512 KB with notice); PDF preview via the browser’s native viewer; CSV/TSV as a table (first 200 rows, first 60 columns, first row shown as header)
- “Preview” via the file-type icon (icon-as-trigger), not a separate button
- Previews operate through the storage-share paths (in-memory only, never written to disk)
- Deferred: a thumbnail service produces small JPEG previews on demand

#### 5.3.6 Video Preview
- ✅ Built and verified in the UI 2026-11-12 (un-deferred by product decision): MP4, WebM, MOV (H.264) preview in the shared preview modal (native `<video controls>`). MKV and AVI are excluded — browsers cannot decode them. Whole file is buffered in memory before playback (MP4/MOV only play correctly in Safari/Chrome for H.264; seeks work offline once buffered)
- “Preview” via the file-type icon (icon-as-trigger), consistent with images
- Previews operate through the storage-share paths (in-memory only, never written to disk)

#### 5.3.8 Audio Preview
- ✅ Built and verified in the UI 2026-11-12: MP3 and M4A play in the shared preview modal (native `<audio controls>`); whole file is buffered in memory before playback
- "Preview" via the file-type icon, consistent with images and video
- Previews operate through the storage-share paths (in-memory only, never written to disk)

#### 5.3.9 Disk Failure-Risk (experiment)
- ✅ Stage 1 built and verified in the UI 2026-11-12: daily disk-health snapshot stored locally by the proxy (`.health-history.jsonl`, gitignored). Records per disk: model, SMART status/state, temperature + alert/shutdown thresholds, power-on hours (attr 9), power cycles (12), load cycles (193), reallocated sectors (5), pending sectors (197), offline uncorrectable (198), CRC errors (199), LBAs written/read (241/242). Health view shows snapshot count and latest date. The NAS is never written to; one SMART read per day. The endpoint requires a bearer header (presence check, not NAS validation — stops casual LAN writes) and keeps one snapshot per day, server-enforced
- ✅ Stage 2 built and verified in the UI 2026-11-12: rule-based Low/Medium/High risk per disk with explicit reasons — trend growth of attributes 5/187/197/198/199, temperature excursions vs thresholds, age from power-on hours, usage rates from LBAs written and load cycles per day. Conventional default thresholds first, tuned with real data
- 🔮 Stage 3 (optional): population base rates by disk model and age (Backblaze/Google published data), clearly labelled as population statistics — never a personal probability
- Not a substitute for backups; RAID 1 covers single-disk death only

#### 5.3.7 Large Transfer Progress
- Bulk download as one ZIP archive — moved from Phase 1; requires a reliable NAS or server-side ZIP path
- Bulk ZIP job progress and queue state when the NAS exposes a job-status API
- ✅ Large upload progress, including percent, bytes transferred, estimated time remaining, cancel, retry on failure, aggregate queue view (built and verified in the UI 2026-11-12). Downloads show the same progress too

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
- **Status**: ✅ Closed 2026-11-12 by user — chewfamily session tested in the UI; admin-only items (Health, Change password) now hidden for non-admins via the gear menu

### App deletes go to the recycle bin
- **Issue**: Deleting from HomeNAS used the NAS delete API (`folderex action=delete`), which was permanent and bypassed the bin. Now deletes in the UI **move the item(s) into the share's `@SmbRecyclebin`** (original folder tree mirrored) instead of deleting — same layout as SMB deletes. Collision → automatic timestamp rename. Share with no bin → asks per session: create bin / delete permanently / cancel. Empty mirror shells persist in the bin (same as SMB). `result:true` is not trusted — the source folder is re-listed to confirm the move.
- **Status**: ✅ Fixed 2026-11-12 — Purge/Empty bin in the Recycle Bin browser remain the permanent paths

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

