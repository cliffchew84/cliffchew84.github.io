# Mobile UX Audit & Remediation Plan for HomeNAS

## Executive Summary

The HomeNAS web app has solid desktop functionality but the mobile experience is severely lacking. The current implementation treats mobile as an afterthought—responsive CSS exists but doesn't address touch ergonomics, viewport constraints, or mobile-specific workflows. This document catalogs every issue and provides a prioritized remediation plan.

---

## Current Mobile Breakpoints (from tailwind.css)

```css
@media (max-width: 767px)  /* Tablet/phone */
@media (max-width: 639px)  /* Small phone */
@media (min-width: 640px)  /* sm */
@media (min-width: 768px)  /* md */
```

**Problem**: Only two breakpoints, no consideration for:
- iPhone SE (375px) vs iPhone Pro Max (430px) vs foldables
- Landscape vs portrait
- Safe areas (notches, home indicators)
- Touch target minimums (48×48px)

---

## 1. HEADER / TOOLBAR (Critical)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| 11 icon buttons in a single row | `index.html:69-113` | Horizontal overflow, tiny 40px targets |
| Tooltips on hover only | `data-tooltip` attributes | Useless on touch |
| Search input fixed `w-40` | `index.html:105` | Too narrow on mobile |
| No visual hierarchy | All buttons same size | Can't distinguish primary actions |
| Sync button + Add Photos button competing | `index.html:73-79` | Confusing primary actions |

### Required Changes

#### A. Two-row responsive toolbar
```html
<!-- Mobile: Row 1 = Primary actions, Row 2 = Secondary -->
<div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
  <div class="flex items-center gap-2 flex-wrap">
    <!-- Primary: Upload, Add Photos, New Folder -->
  </div>
  <div class="flex items-center gap-2 flex-1 md:order-none order-1">
    <!-- Breadcrumb + Search -->
  </div>
  <div class="flex items-center gap-1 flex-wrap justify-end md:order-none order-2">
    <!-- Sort, View options, Refresh -->
  </div>
</div>
```

#### B. Touch-friendly button sizing
```css
/* Minimum 48×48px touch targets */
@media (max-width: 767px) {
  .btn-icon, .icon-btn { 
    min-width: 48px; 
    min-height: 48px; 
    padding: 12px; 
  }
  .btn { 
    min-height: 48px; 
    padding: 12px 16px; 
  }
}
```

#### C. Replace tooltips with labels or bottom sheet
- Remove `data-tooltip` on mobile
- Use `aria-label` + visible text labels for primary actions
- Long-press → context menu (native or custom)

#### D. Search input full-width on mobile
```html
<input id="searchInput" class="w-full md:w-40 ...">
```

---

## 2. FILE LIST / TABLE (Critical)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Table → card layout at 768px | `tailwind.css: ~line 1200` | Late breakpoint, cramped at 375-768px |
| Checkbox 22×22px | `tailwind.css: td.cell-check input` | Below 48px minimum |
| Action buttons 40×40px | `tailwind.css: td.cell-actions button` | Below 48px minimum |
| No swipe actions | N/A | Standard mobile pattern missing |
| Truncated names no tooltip | `td.cell-name` | Can't see full filename |
| Date/type columns always visible | `td.cell-date, td.cell-type` | Wasted horizontal space |

### Required Changes

#### A. Card layout at 640px (not 768px)
```css
@media (max-width: 639px) { /* Was 767px */ }
```

#### B. Mobile file card design
```
┌─────────────────────────────────────┐
│ ☐  📄 IMG_20261114_193022.heic      │
│      2.4 MB • 2 min ago • HEIC      │
│      [⋯]  [⬇]  [📁]  [🗑]           │
└─────────────────────────────────────┘
```
- Full-width card, single tap selects, long-press = multi-select
- Actions as icon buttons (48×48) in a row
- Swipe left → Delete, Swipe right → More

#### C. Column visibility toggle
- Mobile: Show only Name + Size by default
- "Columns" button in toolbar → bottom sheet to toggle Date/Type
- Persist preference in localStorage

#### D. Virtual scrolling for large lists
- Current: renders all rows → jank at 500+ files
- Implement: IntersectionObserver or fixed-height buffer

---

## 3. SIDEBAR / NAVIGATION (High)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Fixed 280px drawer | `index.html:63` | OK width but no gesture dismiss |
| No swipe from edge | N/A | Standard mobile pattern |
| Overlay doesn't close on route change | `sidebar-overlay` | Stays open after navigation |
| Tree items small touch targets | `folderTree` in app.js | Hard to tap nested folders |

### Required Changes
- Add swipe-from-left-edge to open (Hammer.js or native)
- Swipe right on drawer or tap overlay to close
- Increase tree item height to 48px minimum
- Add "Home" / "Shares" quick links at top
- Auto-close on folder selection (mobile only)

---

## 4. MODALS / DIALOGS (High)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| Fixed `max-w-sm` (384px) | `index.html:148, 180, 218...` | Too narrow on 375px (16px margins = 343px content) |
| No bottom-sheet variant | All modals | Centered modals hard to reach on large phones |
| Keyboard covers inputs | Login, rename, etc. | No `scroll-padding` or viewport handling |
| Sync modal `max-h-[62vh]` | `index.html:191` | Too tall on small phones |

### Required Changes

#### A. Responsive modal widths
```css
@media (max-width: 480px) {
  .modal-content { 
    max-width: calc(100vw - 32px); 
    margin: 16px;
    border-radius: 16px 16px 0 0; /* bottom sheet */
  }
}
```

#### B. Bottom sheets for action modals
- Sync modal → bottom sheet (draggable, 50%/90% snap points)
- Move/Copy picker → bottom sheet with full-height folder tree
- Image preview → full-screen with swipe-down to dismiss

#### C. Keyboard handling
```css
@media (max-width: 767px) {
  html { scroll-padding-bottom: 200px; }
  .modal:focus-within { padding-bottom: env(keyboard-inset-height, 200px); }
}
```

#### D. Sync modal specific
- Reduce `max-h-[62vh]` to `max-h-[85vh]` with `max-h-[calc(100vh - 120px)]`
- Sticky header + footer, scrollable body
- Large touch targets for all buttons

---

## 5. SYNC / UPLOAD FLOW (Critical - Core Feature)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| `max-w-2xl` (672px) | `index.html:180` | Wider than phone screen |
| `max-h-[62vh]` | `index.html:191` | Cuts off on small phones |
| Batch name input small | `app.js:3369` | Hard to tap, no autocomplete hints |
| Format table horizontal scroll | `app.js: syncTableHtml` | Hidden columns |
| Progress bars thin (2px) | `app.js: syncProgressBar` | Hard to see, hard to tap |
| "Keep screen on" text only | `app.js:3475` | No wake lock UI feedback |

### Required Changes

#### A. Full-screen mobile sync modal
```html
<div id="syncModal" class="fixed inset-0 z-60 flex items-end sm:items-center justify-center ...">
  <div class="w-full max-w-2xl rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl max-h-[90vh] sm:max-h-[62vh] flex flex-col">
    <!-- Sticky header -->
    <!-- Scrollable body -->
    <!-- Sticky footer -->
  </div>
</div>
```

#### B. Responsive format table
```css
@media (max-width: 480px) {
  .sync-format-table { 
    display: block; 
    overflow-x: auto; 
    white-space: nowrap; 
  }
  /* Or: convert to card list */
}
```
Better: Convert to vertical card list on mobile
```
┌─────────────────────────┐
│ HEIC photo     12  245 MB │
│ JPEG photo      3   12 MB │
│ MOV video       2   890 MB│
│ ──────────────────────── │
│ Total          17  1.1 GB │
└─────────────────────────┘
```

#### C. Progress visualization
- Thicker progress bars (8px minimum)
- Circular progress for current file
- Percentage + bytes in readable format
- Color coding: blue=active, green=done, amber=paused, red=error

#### D. Wake lock UI feedback
```javascript
// Show indicator when wake lock active
const indicator = document.createElement('div');
indicator.className = 'wake-lock-indicator';
indicator.innerHTML = '🔆 Screen kept on';
```

---

## 6. LOGIN SCREEN (High)

### Current Issues
| Issue | Location | Impact |
|-------|----------|--------|
| `max-w-sm` centered card | `index.html:14` | OK but no safe-area handling |
| No biometric/WebAuthn hint | N/A | Missed opportunity for "Keep signed in" |
| Proxy down banner tiny | `index.html:22` | Easy to miss |

### Required Changes
- Full-screen on mobile with safe-area insets
- Large inputs (48px height, 18px font prevents zoom on iOS)
- "Use Face ID / Touch ID" hint when credential exists
- Prominent proxy-down banner with retry button

---

## 7. TOUCH INTERACTIONS (High)

### Missing Patterns
| Pattern | Needed For |
|---------|------------|
| Pull-to-refresh | File list, sync modal |
| Swipe actions | File rows (delete, more) |
| Long-press multi-select | File list |
| Swipe-down dismiss | Modals, image preview |
| Edge swipe | Open sidebar |
| Double-tap zoom | Image preview |
| Pinch zoom | Image preview, PDF |

### Implementation Priority
1. **Long-press multi-select** → replaces checkbox UI on mobile
2. **Swipe actions** → delete/archive without modal
3. **Pull-to-refresh** → standard refresh pattern
4. **Swipe-down dismiss** → modals, preview
5. **Edge swipe** → sidebar
6. **Pinch zoom** → image/PDF preview

---

## 8. TYPOGRAPHY & SPACING (Medium)

### Current Issues
- Base `text-sm` (14px) → too small for comfortable mobile reading
- Line height tight in tables
- No fluid type scaling

### Required
```css
@media (max-width: 767px) {
  :root { --base-font: 16px; } /* Prevents iOS zoom on focus */
  body { font-size: 16px; line-height: 1.6; }
  .text-xs { font-size: 13px; } /* Not 12px */
  .text-sm { font-size: 15px; }
}
```

---

## 9. SAFE AREAS & NOTCHES (Medium)

### Required CSS
```css
:root {
  --safe-top: env(safe-area-inset-top, 0);
  --safe-bottom: env(safe-area-inset-bottom, 0);
  --safe-left: env(safe-area-inset-left, 0);
  --safe-right: env(safe-area-inset-right, 0);
}

@media (max-width: 767px) {
  .modal-bottom-sheet {
    padding-bottom: calc(16px + var(--safe-bottom));
    border-radius: 16px 16px 0 0;
  }
  .fixed-bottom-bar {
    padding-bottom: calc(8px + var(--safe-bottom));
  }
  .full-screen-preview {
    padding-top: var(--safe-top);
    padding-bottom: var(--safe-bottom);
  }
}
```

---

## 10. PWA / INSTALLABILITY (Medium) — updated 2026-11-15

Done 2026-11-15: web app manifest (`manifest.json`, `start_url: "/"`, `display: "standalone"`, theme/background color, 192 px and 512 px maskable PNG icons); `<link rel="manifest">`; `apple-touch-icon` (180 px); Apple capable/status-bar/title meta tags; theme-color meta; 192/180/32 px PNG icons generated from one design; proxy serves all of them on exact paths; the home-screen icon now opens HomeNAS fullscreen. Android still only offers “Add to Home screen” over plain LAN HTTP, because Android requires HTTPS for the real “Install app” entry. Same for Chrome on desktop.

### Not done — the one missing piece: a service worker
A service worker is the second installability requirement for Android and cannot register on a plain HTTP LAN address. It ships when Phase 4 brings HTTPS. With it, Android shows “Install app” and the shortcut gets standalone treatment everywhere.

| Feature | Status |
|---------|--------|
| Web App Manifest | ✅ |
| Icons (192/512/180/32) | ✅ |
| Install meta/link tags | ✅ |
| Service Worker | ⏳ needs HTTPS (Phase 4) |
| Offline fallback | ⏳ needs service worker |
| Install prompt | ⏳ needs HTTPS |
| Splash screens | Derived from manifest on Add to Home Screen |

### Shipped `manifest.json` (2026-11-15)
```json
{
  "name": "HomeNAS",
  "short_name": "HomeNAS",
  "start_url": "/",
  "display": "standalone",
  "categories": ["utilities", "productivity"],
  "theme_color": "#2563eb",
  "background_color": "#f8fafc",
  "lang": "en",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

---

## 11. PERFORMANCE ON MOBILE (Medium)

### Issues
- No code splitting (single 4500+ line `app.js`)
- All modals in initial HTML
- No lazy loading for heavy features (PDF viewer, video player, health charts)

### Fixes
- Dynamic `import()` for modal content
- `IntersectionObserver` for image lazy loading
- Debounce search input (already 300ms? verify)
- Compress Tailwind (PurgeCSS already runs)

---

## 12. ACCESSIBILITY (Often Overlooked)

### Mobile-Specific
- Focus visible states on all interactive elements
- `aria-live` for toast/status announcements
- Touch target spacing (8px minimum between targets)
- High contrast mode support
- Reduced motion respect (`prefers-reduced-motion`)

---

## PRIORITIZED IMPLEMENTATION ORDER

### Phase 1: Critical Usability (Week 1)
1. Toolbar → two-row responsive layout with 48px touch targets
2. File list → card layout at 640px, 48px touch targets
3. Sync modal → full-screen bottom sheet on mobile
4. Login → full-screen with 16px font inputs
5. Add `viewport-fit=cover` and safe-area CSS variables

### Phase 2: Core Touch Patterns (Week 2)
1. Long-press multi-select on file list
2. Swipe actions (delete, more) on file cards
3. Pull-to-refresh on file list
4. Swipe-down dismiss on modals/preview
5. Edge swipe for sidebar

### Phase 3: Polish & PWA (Week 3)
1. Web App Manifest + icons — done 2026-11-15 (HomeNAS icon and fullscreen launch on a home screen icon)
2. Service Worker (offline shell) — needs HTTPS (Phase 4); also the last piece for a real Android install
3. Keyboard handling for modals
4. Format table → card list on mobile
5. Virtual scrolling for file list

### Phase 4: Advanced (Week 4)
1. Pinch zoom for image/PDF preview
2. Biometric auth hint
3. Install prompt + shortcuts
4. Background sync for uploads (future)
5. Comprehensive a11y audit

---

## FILES TO MODIFY

| File | Changes |
|------|---------|
| `index.html` | Toolbar restructuring, modal markup, manifest link, safe-area meta |
| `tailwind.css` (input.css) | All mobile breakpoints, touch targets, card layouts, safe areas |
| `app.js` | Touch handlers, modal behavior, sync modal rendering, file card rendering |
| `package.json` | Add `@tailwindcss/forms`, `workbox` for SW |
| New: `public/manifest.json` | PWA manifest |
| New: `public/sw.js` | Service worker |
| New: `public/icons/` | 192/512px icons (maskable) |

---

## TESTING CHECKLIST

### Devices
- [ ] iPhone SE (375×667) - smallest common
- [ ] iPhone 14/15 Pro (393×852) - standard
- [ ] iPhone 14/15 Pro Max (430×932) - large
- [ ] Android small (360×720)
- [ ] Android large (412×915)
- [ ] iPad Mini (768×1024) - tablet breakpoint
- [ ] Landscape on all above

### Scenarios
- [ ] Cold start → login → file list
- [ ] Upload flow (1, 10, 100 files)
- [ ] Folder upload from Mac (drag + picker)
- [ ] Sync pause/resume/reload
- [ ] Long file list (500+ items) scroll performance
- [ ] Image preview swipe/dismiss/zoom
- [ ] Sidebar open/close gestures
- [ ] Keyboard covers input handling
- [ ] Safe area on notched devices
- [ ] PWA install → standalone launch
- [ ] Offline: cached shell loads, network requests queue

---

## ESTIMATED EFFORT

| Phase | Files | Lines Changed | Days |
|-------|-------|---------------|------|
| 1 Critical | 3 | ~800 | 2-3 |
| 2 Touch | 2 | ~600 | 2-3 |
| 3 PWA | 4 | ~400 | 1-2 |
| 4 Advanced | 3 | ~500 | 2-3 |
| **Total** | | **~2300** | **7-11** |

---

*This audit covers every mobile UX gap visible in the current codebase. Each item is actionable and tested against the actual HTML/CSS/JS structure.*