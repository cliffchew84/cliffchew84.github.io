/* ==========================================================================
   script.js — horizontal town portfolio (loads content from content.json)
   ========================================================================== */

document.documentElement.classList.add('js');

/* --- CONFIG ----------------------------------------------------------------- */
const CONFIG = {
  entriesPerPage: 4,
  filterDebounceMs: 500,
  resizeDebounceMs: 150,
  mobileBreakpoint: 700,
  walkPixelsPerSecond: 200,
  walkMinSeconds: 0.4,
  walkMaxSeconds: 1.2,
  slideTriggerRatio: 0.04,
  rodBaseSeconds: 0.35,
  rodTravelDivisor: 700,
  rodMinSeconds: 0.75,
  rodMaxSeconds: 1.7,
};

const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
const mqMobile = matchMedia(`(max-width: ${CONFIG.mobileBreakpoint}px)`);

/* --- PAGINATION ------------------------------------------------------------- */
let pagPage = 1;

function renderPagination() {
  const b = buildings[idx];
  const raw = b && b._raw;
  const allEntries = (raw && raw.entries) || [];
  const entries = scrollFilteredEntries();
  const totalPages = Math.max(1, Math.ceil(entries.length / CONFIG.entriesPerPage));

  pagPage = Math.min(Math.max(pagPage, 1), totalPages);

  const start = (pagPage - 1) * CONFIG.entriesPerPage;
  const pageEntries = entries.slice(start, start + CONFIG.entriesPerPage);
  const defaultIcon = allEntries[0]?.icon;
  if (!allEntries.length) {
    ui.body.innerHTML = '<p>No entries yet.</p>';
  } else if (!entries.length) {
    ui.body.innerHTML = '<p class="scroll-no-match">No matches in this section.</p>';
  } else {
    ui.body.innerHTML = buildEntriesHTML(pageEntries, defaultIcon);
  }

  const pager = $('panel-pager');
  if (totalPages > 1 && entries.length) {
    pager.innerHTML = buildPaginationHTML(pagPage, totalPages);
    pager.hidden = false;
    pager.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.onclick = () => {
        pagPage += Number(btn.dataset.step);
        renderPagination();
      };
    });
  } else {
    hidePager();
  }

  updateScrollFilterStatus(entries.length, allEntries.length);
}

function hidePager() {
  const pager = $('panel-pager');
  if (!pager) return;
  pager.hidden = true;
  pager.innerHTML = '';
}

function buildPaginationHTML(page, total) {
  return `<button type="button" class="pagination-btn" data-step="-1" aria-label="Previous page"${page === 1 ? ' disabled' : ''}>&#8249;</button>
    <span class="pagination-info" aria-live="polite" aria-current="page">${page} / ${total}</span>
    <button type="button" class="pagination-btn" data-step="1" aria-label="Next page"${page === total ? ' disabled' : ''}>&#8250;</button>`;
}

/* --- Preload character sprites (idle + walk sprite sheet) ------------------- */
['character-idle.webp', 'character-walk-sprite.webp']
  .forEach(f => { const img = new Image(); img.src = 'assets/' + f; });

/* --- Internal badge: shows only when this browser is marked internal ------- */
try {
  if (localStorage.getItem('ph_internal') === '1') {
    document.getElementById('internal-badge').hidden = false;
  }
} catch (e) { /* localStorage can fail in private mode. Ignore. */ }

/* --- UI ELEMENTS ------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const ui = {
  strip: $('strip'), char: $('char'), charEl: $('char-el'), stage: $('scroll-stage'),
  panel: $('panel'), mainPanel: document.querySelector('.main-panel'),
  title: $('panel-title'), sub: $('panel-sub'), body: $('panel-body'),
  intro: $('panel-intro'),
  row: document.querySelector('.buildings-row'), prev: $('town-prev'), next: $('town-next'),
};

const scrollEl = {
  filters: $('scroll-filters'), query: $('scroll-query'), clear: $('scroll-clear'),
  chips: $('scroll-chips'), status: $('scroll-filter-status'),
  count: $('scroll-filter-count'), clearAll: $('scroll-filter-clear'),
  panelCount: $('panel-count'), subSep: $('panel-sub-sep'),
};

const scrollFilters = { query: '', topics: new Set(), timer: 0 };

/* --- HELPERS ---------------------------------------------------------------- */

/* Send an event to PostHog if the SDK loaded. Ad blockers can remove it. */
function phCapture(event, props) {
  if (window.posthog && typeof window.posthog.capture === 'function') {
    window.posthog.capture(event, props);
  }
}

function buildTagsHTML(tags) {
  if (!tags) return '';
  const list = (Array.isArray(tags) ? tags : [tags]).filter(t => t && String(t).trim());
  if (!list.length) return '';
  return '<div class="entry-tags">' + list.map(t => `<span class="tag-bubble">${t}</span>`).join('') + '</div>';
}

function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildEntryHTML(entry, defaultIcon) {
  const icon = entry.icon || defaultIcon;
  const desc = entry.desc ? `<p class="entry-desc-text">${entry.desc}</p>` : '';
  const slug = slugify(entry.title);
  return `<li id="entry-${slug}" data-slug="${slug}"><a href="${entry.url}" target="_blank" rel="noopener noreferrer">
    <img class="entry-icon" src="assets/${icon}" alt="" aria-hidden="true" width="36" height="36">
    <div class="entry-content">
      <div class="entry-head"><span class="entry-title">${entry.title}</span><span class="entry-meta">${entry.meta}</span></div>
      ${desc}
      ${buildTagsHTML(entry.tags)}
    </div>
    <span class="entry-arrow">→</span></a></li>`;
}

function buildEntriesHTML(entries, defaultIcon) {
  return '<ul class="scroll-entries">' + entries.map(e => buildEntryHTML(e, defaultIcon)).join('') + '</ul>';
}

function buildSkillsHTML(skills) {
  return '<div class="skills"><h3 class="skills-title">Skills</h3>' +
    skills.map(sg => `<section class="skill-group"><h4>${sg.category}</h4><ul>` +
      sg.items.map(item => `<li>${item}</li>`).join('') +
    '</ul></section>').join('') + '</div>';
}

/* --- SCROLL FILTERS --------------------------------------------------------- */
function scrollFilteredEntries() {
  const b = buildings[idx];
  const entries = (b && b._raw && b._raw.entries) || [];
  const q = scrollFilters.query.trim().toLowerCase();

  return entries.filter(entry => {
    const topicOk = scrollFilters.topics.size === 0 ||
      (entry.topics || []).some(t => scrollFilters.topics.has(t));
    if (!topicOk) return false;
    if (!q) return true;

    const hay = [
      entry.title, entry.desc, entry.meta,
      ...(entry.tags || []), ...(entry.topics || [])
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every(token => hay.includes(token));
  });
}

function renderScrollFilters(b) {
  clearTimeout(scrollFilters.timer);
  const entries = (b && b._raw && b._raw.entries) || [];
  const topics = [...new Set(entries.flatMap(e => e.topics || []))]
    .sort((a, b) => a.localeCompare(b));

  // Every building with entries gets the filter bar. Topics add chips when present.
  const show = entries.length > 0;
  scrollEl.filters.hidden = !show;
  scrollEl.filters.classList.toggle('no-topics', topics.length === 0);

  scrollFilters.query = '';
  scrollFilters.topics.clear();
  scrollEl.query.value = '';
  scrollEl.clear.hidden = true;
  scrollEl.chips.innerHTML = '';

  if (!show) {
    updateScrollFilterStatus(0, 0);
    return;
  }

  scrollEl.query.placeholder = b.key === 'smith' ? 'Search projects' : 'Search this section';

  if (topics.length) {
    buildScrollChips(topics);
    scrollEl.chips.hidden = false;
  } else {
    scrollEl.chips.hidden = true;
  }

  updateScrollFilterStatus(entries.length, entries.length);
}

function buildScrollChips(topics) {
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'scroll-chip';
  all.textContent = 'All';
  all.setAttribute('aria-pressed', 'true');
  all.addEventListener('click', () => {
    scrollFilters.topics.clear();
    syncScrollChips();
    applyScrollFilters('all');
  });
  scrollEl.chips.appendChild(all);

  topics.forEach(topic => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scroll-chip';
    btn.textContent = topic;
    btn.dataset.topic = topic;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (scrollFilters.topics.has(topic)) scrollFilters.topics.delete(topic);
      else scrollFilters.topics.add(topic);
      syncScrollChips();
      applyScrollFilters(topic);
    });
    scrollEl.chips.appendChild(btn);
  });
}

function syncScrollChips() {
  scrollEl.chips.querySelectorAll('.scroll-chip').forEach(btn => {
    const topic = btn.dataset.topic;
    const on = topic ? scrollFilters.topics.has(topic) : scrollFilters.topics.size === 0;
    btn.setAttribute('aria-pressed', String(on));
  });
}

function applyScrollFilters(source) {
  pagPage = 1;
  renderPagination();
  trackScrollFilter(source);
}

function updateScrollFilterStatus(shown, total) {
  const b = buildings[idx];
  const unit = b && b.key === 'smith' ? 'projects' : 'entries';
  const one = unit === 'projects' ? 'project' : 'entry';
  const active = !!scrollFilters.query.trim() || scrollFilters.topics.size > 0;

  // The header subtitle shows the total. A filter never changes it.
  const hasTotal = total > 0;
  scrollEl.panelCount.textContent = hasTotal
    ? `${total} ${total === 1 ? one : unit}`
    : '';
  scrollEl.panelCount.hidden = !hasTotal;
  scrollEl.subSep.hidden = !hasTotal;

  // The status row appears only while a filter is active.
  const show = hasTotal && active;
  scrollEl.status.hidden = !show;
  scrollEl.clearAll.hidden = !show;
  scrollEl.count.textContent = show
    ? `${shown} of ${total} ${total === 1 ? one : unit}`
    : '';
}

function clearScrollFilters(focus, via) {
  trackFilterClear(via || 'clear');
  clearTimeout(scrollFilters.timer);
  scrollFilters.query = '';
  scrollFilters.topics.clear();
  scrollEl.query.value = '';
  scrollEl.clear.hidden = true;
  syncScrollChips();
  pagPage = 1;
  renderPagination();
  if (focus) scrollEl.query.focus();
}

/*
 * A clear is a discrete action, so it sends at once, with no debounce.
 * It records the filter state just before the reset.
 */
function trackFilterClear(via) {
  clearTimeout(scrollFilters.timer);
  const query = scrollFilters.query;
  const topics = [...scrollFilters.topics];
  if (!query.trim() && topics.length === 0) return;

  phCapture('scroll_filter_cleared', {
    via,
    building: buildings[idx]?.key,
    prior_query_length: query.length,
    prior_topics: topics,
    prior_results: scrollFilteredEntries().length
  });
}

function trackScrollFilter(source) {
  clearTimeout(scrollFilters.timer);
  scrollFilters.timer = setTimeout(() => {
    phCapture('scroll_filter_used', {
      source,
      building: buildings[idx]?.key,
      query_length: scrollFilters.query.length,
      topics: [...scrollFilters.topics],
      results: scrollFilteredEntries().length
    });
  }, CONFIG.filterDebounceMs);
}

function setupScrollFilterListeners() {
  scrollEl.query.addEventListener('input', () => {
    const next = scrollEl.query.value;
    if (scrollFilters.query.trim() && !next.trim()) trackFilterClear('empty');
    scrollFilters.query = next;
    scrollEl.clear.hidden = !scrollFilters.query;
    pagPage = 1;
    renderPagination();
    if (scrollFilters.query.trim()) trackScrollFilter('search');
  });

  scrollEl.clear.addEventListener('click', () => clearScrollFilters(true, 'search-x'));
  scrollEl.clearAll.addEventListener('click', () => clearScrollFilters(true, 'status'));

  scrollEl.query.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (scrollFilters.query) clearScrollFilters(true, 'escape');
    else scrollEl.query.blur();
  });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (scrollEl.filters.hidden) return;
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      scrollEl.query.focus();
    }
  });
}

function applyHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!raw) return false;
  const [key, entrySlug] = raw.split('/');
  const i = buildings.findIndex(b => b.key === key);
  if (i < 0) return false;
  select(i, key, 'hash', entrySlug);
  return true;
}

/* --- LOAD CONTENT & INIT ---------------------------------------------------- */
let buildings = [];
let buttons = [];
let idx = 0, ro = 0;
let charTargetLeft = 0;

async function init() {
  try {
    const res = await fetch('content.json');
    if (!res.ok) throw new Error('Failed to load content.json');
    const data = await res.json();

    // Set site title
    document.title = data.site.title;
    ui.strip.querySelector('.hero-title h1').textContent = data.site.title;
    ui.strip.querySelector('.hero-title p').textContent = data.site.tagline;

    // Transform content.json buildings into internal format
    buildings = data.buildings.map(b => ({
      key: b.key,
      label: b.label,
      img: `assets/${b.exterior}`,
      big: b.big,
      title: b.title,
      sub: b.subtitle,
      bg: `assets/${b.indoor}`,
      body: buildBodyHTML(b),
      // Store original for potential future use
      _raw: b
    }));

    buildButtons();
    setupListeners();
    setupScrollFilterListeners();
    layout();
    if (!applyHash()) select(0, buildings[0].key, 'initial');

  } catch (err) {
    console.error('Content load failed:', err);
    ui.body.innerHTML = '<p style="color:var(--gold);text-align:center;">Failed to load portfolio content.</p>';
  }
}

function buildBodyHTML(b) {
  if (b.key === 'residence') {
    return `<p>${b.intro}</p>${buildSkillsHTML(b.skills)}`;
  }
  // Library, Blacksmith, Market, Tavern
  const defaultIcon = b.entries[0]?.icon;
  return buildEntriesHTML(b.entries, defaultIcon);
}

function buildButtons() {
  ui.row.innerHTML = buildings.map((b, i) => `
    <button class="bldg-btn${b.big ? ' big' : ''}${i === 0 ? ' active' : ''}" data-key="${b.key}" aria-label="${b.label}">
      <div class="bldg-img-wrap">
        <img class="bldg-img" src="${b.img}" alt="${b.label}" width="104" height="104" ${i > 0 ? 'loading="lazy"' : ''}>
      </div>
      <span class="bldg-label">${b.label}</span>
    </button>`).join('');

  buttons = Array.from(ui.row.querySelectorAll('.bldg-btn'));
}

function applyNight(btn, on) {
  ui.strip.classList.toggle('night', on);
  document.documentElement.classList.toggle('night', on);
  btn.textContent = on ? '☀️ Day' : '🌙 Night';
  btn.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('night', on ? '1' : '0'); } catch (e) { /* Ignore private mode. */ }
}

function setupListeners() {
  buttons.forEach((btn, i) => btn.onclick = () => select(i, buildings[i].key, 'click'));
  ui.prev.onclick = () => nav(-1);
  ui.next.onclick = () => nav(1);
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (typing) return;
    if (e.key === 'ArrowRight') nav(1);
    if (e.key === 'ArrowLeft') nav(-1);
  });
  document.addEventListener('click', trackLinkClick);
  addEventListener('hashchange', applyHash);

  const nightBtn = $('night-toggle');
  applyNight(nightBtn, document.documentElement.classList.contains('night'));
  nightBtn.addEventListener('click', () => {
    const n = !ui.strip.classList.contains('night');
    applyNight(nightBtn, n);
    phCapture('theme_toggled', { theme: n ? 'night' : 'day' });
  });

  ui.panel.addEventListener('animationend', e => {
    if (e.animationName === 'unroll') { ui.stage.classList.add('is-open'); ui.stage.classList.remove('is-unrolling'); }
  });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, CONFIG.resizeDebounceMs);
  });
  mqMobile.addEventListener('change', layout);
  document.fonts?.ready.then(layout);
}

/* --- LAYOUT + CHARACTER ----------------------------------------------------- */
function layout() {
  const sw = ui.strip.clientWidth;
  const st = getComputedStyle(ui.row);
  const gap = parseFloat(st.columnGap) || 0;
  const cw = buttons.reduce((s, b) => s + b.offsetWidth, 0) + gap * (buttons.length - 1);
  const slide = cw + sw * CONFIG.slideTriggerRatio > sw + 1;
  ui.strip.classList.toggle('can-slide', slide);

  if (!slide) {
    ro = 0; ui.row.style.transform = ''; ui.prev.disabled = ui.next.disabled = true;
  } else {
    const b = buttons[idx], lb = buttons[buttons.length - 1];
    const c = b.offsetLeft + b.offsetWidth / 2;
    const ov = Math.max(0, lb.offsetLeft + lb.offsetWidth + parseFloat(st.paddingRight) - sw);
    ro = Math.min(0, Math.max(sw / 2 - c, -ov));
    ui.row.style.transform = `translateX(${ro}px)`;
    ui.prev.disabled = idx === 0; ui.next.disabled = idx === buttons.length - 1;
  }

  const cb = buttons[idx];
  if (cb) {
    const charHalf = (ui.char.offsetWidth || 58) / 2;
    const newLeft = Math.max(0, cb.offsetLeft + cb.offsetWidth / 2 + ro - charHalf);
    charTargetLeft = newLeft;
    ui.char.style.left = newLeft + 'px';
  }
}

/* --- CHARACTER WALK --------------------------------------------------------- */
function walk(dir) {
  if (dir === 'none') return;
  const reduced = mqReduced.matches;
  if (reduced) {
    ui.char.style.left = charTargetLeft + 'px';
    return;
  }
  const currentLeft = parseFloat(ui.char.style.left) || 0;
  const distance = Math.abs(charTargetLeft - currentLeft);
  const duration = Math.min(CONFIG.walkMaxSeconds, Math.max(CONFIG.walkMinSeconds, distance / CONFIG.walkPixelsPerSecond));

  ui.char.style.transitionDuration = `${duration}s`;
  ui.char.style.setProperty('--walk-duration', `${duration}s`);

  ui.charEl.classList.remove('char-move-left', 'char-move-right');
  ui.charEl.offsetWidth;
  if (dir === 'left' || dir === 'right') ui.charEl.classList.add('char-move-' + dir);

  setTimeout(() => {
    ui.charEl.classList.remove('char-move-left', 'char-move-right');
    ui.char.style.removeProperty('--walk-duration');
    ui.char.style.transitionDuration = '0.9s';
  }, duration * 1000);
}

/* --- NAVIGATION ------------------------------------------------------------- */
function nav(d) {
  const n = Math.min(Math.max(idx + d, 0), buttons.length - 1);
  if (n !== idx) select(n, buildings[n].key, 'arrow-key');
}

/* --- LINK TRACKING ---------------------------------------------------------- */
function trackLinkClick(e) {
  const a = e.target.closest('a[href]');
  if (!a) return;
  const raw = a.getAttribute('href');
  if (!raw || raw.startsWith('javascript:') || raw.startsWith('#')) return;
  let url;
  try { url = new URL(a.href); } catch (_) { return; }

  const external = url.host !== location.host;
  const samePage = !external && url.pathname === location.pathname && url.search === location.search;

  phCapture('link_clicked', {
    link_url: url.href,
    link_host: url.host,
    link_path: url.pathname,
    link_text: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
    link_type: external ? 'external' : (samePage ? 'same_page' : 'internal'),
    building: buildings[idx]?.key,
    entry_title: a.querySelector('.entry-title')?.textContent || a.dataset.entryTitle || null
  });
}

/* --- BUILDING SELECTION ----------------------------------------------------- */
function select(i, k, source, entrySlug) {
  const b = buildings.find(x => x.key === k); if (!b) return;
  const dir = i > idx ? 'right' : i < idx ? 'left' : 'none';
  idx = i;
  pagPage = 1; // reset to first page when switching buildings

  buttons.forEach((btn, j) => btn.classList.toggle('active', j === i));
  layout(); walk(dir);

  ui.mainPanel.style.backgroundImage = `url('${b.bg}')`;

  ui.title.textContent = b.title; ui.sub.textContent = b.sub;
  // Residence keeps its intro in the body, not in the header.
  const introText = b.key === 'residence'
    ? ''
    : ((b._raw && b._raw.intro) || b.intro || '');
  ui.intro.textContent = introText;
  ui.intro.hidden = !introText;
  ui.body.classList.toggle('is-residence', b.key === 'residence');
  renderScrollFilters(b);

  // If the building has entries, render them with pagination instead of raw body HTML
  const raw = b._raw;
  if (raw && raw.entries && raw.entries.length > 0) {
    renderPagination();
  } else {
    ui.body.innerHTML = b.body;
  }

  // A manual selection clears a stale building or entry hash.
  if (source !== 'hash' && location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  phCapture('building_viewed', {
    building: b.key,
    building_label: b.label,
    scroll_title: b.title,
    source: source || 'click'
  });

  const tr = Math.max(0, ui.stage.offsetHeight - 7);
  const tm = Math.min(CONFIG.rodMaxSeconds, Math.max(CONFIG.rodMinSeconds, CONFIG.rodBaseSeconds + tr / CONFIG.rodTravelDivisor));
  ui.stage.style.setProperty('--rod-travel', `${tr}px`);
  ui.stage.style.setProperty('--unroll-time', `${tm.toFixed(2)}s`);
  ui.stage.classList.remove('is-open', 'is-unrolling');
  ui.stage.offsetWidth;
  ui.stage.classList.add('is-unrolling');

  const tp = window.scrollY + ui.stage.getBoundingClientRect().top;
  if (window.scrollY > tp + 4) window.scrollTo({ top: tp, behavior: mqReduced.matches ? 'auto' : 'smooth' });

  if (entrySlug) focusEntryBySlug(entrySlug);
}

/* Open the page that holds an entry, then scroll to it and mark it. */
function focusEntryBySlug(slug) {
  const b = buildings[idx];
  const all = (b && b._raw && b._raw.entries) || [];
  const index = all.findIndex(e => slugify(e.title) === slug);
  if (index < 0) return false;

  const page = Math.floor(index / CONFIG.entriesPerPage) + 1;
  if (page !== pagPage) {
    pagPage = page;
    renderPagination();
  }

  const el = document.getElementById(`entry-${slug}`);
  if (!el) return false;

  document.querySelectorAll('.scroll-entries > li.is-target')
    .forEach(li => li.classList.remove('is-target'));
  el.classList.add('is-target');
  el.scrollIntoView({ block: 'center', behavior: mqReduced.matches ? 'auto' : 'smooth' });
  el.querySelector('a')?.focus({ preventScroll: true });
  return true;
}

/* --- START ------------------------------------------------------------------ */
init();