/* ==========================================================================
   script.js — horizontal town portfolio (loads content from content.json)
   ========================================================================== */

document.documentElement.classList.add('js');
/* --- PAGINATION ------------------------------------------------------------- */
const ENTRY_PER_PAGE = 4;
let pagPage = 1;

function renderPagination() {
  const b = buildings[idx];
  const raw = b && b._raw;
  const allEntries = (raw && raw.entries) || [];
  const entries = scrollFilteredEntries();
  const totalPages = Math.max(1, Math.ceil(entries.length / ENTRY_PER_PAGE));

  pagPage = Math.min(Math.max(pagPage, 1), totalPages);

  const start = (pagPage - 1) * ENTRY_PER_PAGE;
  const pageEntries = entries.slice(start, start + ENTRY_PER_PAGE);
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
    <span class="pagination-info">${page} / ${total}</span>
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

const splitEl = {
  view: $('split-view'), title: $('split-title'), kicker: $('split-kicker'),
  count: $('split-count'), query: $('split-query'), clear: $('split-clear'),
  chips: $('split-chips'), list: $('split-list'), empty: $('split-empty'),
  emptyClear: $('split-empty-clear'), announce: $('split-announce'),
  card: $('scene-card'), cardTitle: $('scene-card-title'),
  overline: $('scene-overline'), meta: $('scene-meta'), desc: $('scene-desc'),
  tags: $('scene-tags'), link: $('scene-link'),
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

function buildEntryHTML(entry, defaultIcon) {
  const icon = entry.icon || defaultIcon;
  const desc = entry.desc ? `<p class="entry-desc-text">${entry.desc}</p>` : '';
  return `<li><a href="${entry.url}" target="_blank" rel="noopener noreferrer">
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

/* --- BLACKSMITH SPLIT VIEW -------------------------------------------------- */
const splitState = {
  building: null,
  entries: [],
  entry: null,
  query: '',
  topics: new Set(),
  filterTimer: 0,
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isSplitBuilding(b) {
  return !!(b && b._raw && b._raw.layout === 'split' && (b._raw.entries || []).length);
}

function filteredSplitEntries() {
  const q = splitState.query.trim().toLowerCase();
  return splitState.entries.filter(entry => {
    const topicOk = splitState.topics.size === 0 ||
      (entry.topics || []).some(t => splitState.topics.has(t));
    if (!topicOk) return false;
    if (!q) return true;
    const hay = [
      entry.title, entry.desc, entry.meta,
      ...(entry.tags || []), ...(entry.topics || [])
    ].join(' ').toLowerCase();
    return q.split(/\s+/).every(token => hay.includes(token));
  });
}

function enterSplit(b, entrySlug) {
  splitState.building = b;
  splitState.entries = (b._raw.entries || []).filter(e => e.url);
  splitState.query = '';
  splitState.topics = new Set();
  splitState.entry = null;

  splitEl.query.value = '';
  splitEl.clear.hidden = true;
  splitEl.title.textContent = b.title;
  splitEl.kicker.textContent = b.sub;

  buildSplitChips();

  const found = entrySlug
    ? splitState.entries.find(e => slugify(e.title) === entrySlug)
    : null;

  renderSplitList();
  selectSplitEntry(found || splitState.entries[0], 'initial', false);
}

function buildSplitChips() {
  splitEl.chips.innerHTML = '';
  const topics = [...new Set(splitState.entries.flatMap(e => e.topics || []))];

  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'split-chip';
  all.textContent = 'All';
  all.setAttribute('aria-pressed', 'true');
  all.addEventListener('click', () => {
    splitState.topics.clear();
    syncSplitChips();
    renderSplitList();
    trackSplitFilter('all');
  });
  splitEl.chips.appendChild(all);

  topics.forEach(topic => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'split-chip';
    btn.textContent = topic;
    btn.dataset.topic = topic;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      if (splitState.topics.has(topic)) splitState.topics.delete(topic);
      else splitState.topics.add(topic);
      syncSplitChips();
      renderSplitList();
      trackSplitFilter(topic);
    });
    splitEl.chips.appendChild(btn);
  });
}

function syncSplitChips() {
  splitEl.chips.querySelectorAll('.split-chip').forEach(btn => {
    const topic = btn.dataset.topic;
    const on = topic ? splitState.topics.has(topic) : splitState.topics.size === 0;
    btn.setAttribute('aria-pressed', String(on));
  });
}

function renderSplitList() {
  const items = filteredSplitEntries();
  splitEl.list.innerHTML = '';

  items.forEach(entry => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'split-item';
    btn.dataset.slug = slugify(entry.title);
    btn.setAttribute('aria-current', String(splitState.entry === entry));

    const icon = document.createElement('img');
    icon.className = 'split-item-icon';
    icon.src = `assets/${entry.icon || splitState.entries[0]?.icon || ''}`;
    icon.alt = '';
    icon.width = 26;
    icon.height = 26;

    const body = document.createElement('span');
    body.className = 'split-item-body';
    const title = document.createElement('span');
    title.className = 'split-item-title';
    title.textContent = entry.title;
    const meta = document.createElement('span');
    meta.className = 'split-item-meta';
    meta.textContent = entry.meta || '';
    body.append(title, meta);

    const arrow = document.createElement('span');
    arrow.className = 'split-item-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';

    btn.append(icon, body, arrow);
    btn.addEventListener('click', () => selectSplitEntry(entry, 'list', true));
    li.appendChild(btn);
    splitEl.list.appendChild(li);
  });

  splitEl.empty.hidden = items.length > 0;
  splitEl.list.hidden = items.length === 0;
  updateSplitCount(items.length);
}

function updateSplitCount(shown) {
  const total = splitState.entries.length;
  const n = typeof shown === 'number' ? shown : filteredSplitEntries().length;
  splitEl.count.textContent = n === total
    ? `${total} projects`
    : `${n} of ${total} projects`;
}

function selectSplitEntry(entry, source, updateHash) {
  if (!entry) return;
  const changed = splitState.entry !== entry;
  splitState.entry = entry;

  splitEl.cardTitle.textContent = entry.title;
  splitEl.meta.textContent = entry.meta || '';
  splitEl.desc.textContent = entry.desc || '';
  splitEl.overline.textContent = entry.topics && entry.topics.length
    ? `Blacksmith · ${entry.topics[0]}`
    : 'Blacksmith · Project';

  splitEl.tags.innerHTML = '';
  (entry.tags || []).forEach(tag => {
    const bubble = document.createElement('span');
    bubble.className = 'tag-bubble';
    bubble.textContent = tag;
    splitEl.tags.appendChild(bubble);
  });

  splitEl.link.href = entry.url;
  splitEl.link.hidden = !entry.url;
  splitEl.link.dataset.entryTitle = entry.title;
  splitEl.link.setAttribute('aria-label', `Open ${entry.title} in a new tab`);

  syncSplitActive();

  if (changed) {
    splitEl.card.scrollTop = 0;
    splitEl.card.classList.remove('is-swapping');
    void splitEl.card.offsetWidth;
    splitEl.card.classList.add('is-swapping');
  }

  splitEl.announce.textContent = `Now showing ${entry.title}`;

  if (updateHash) {
    history.replaceState(null, '', `#${splitState.building.key}/${slugify(entry.title)}`);
  }

  if (source === 'list' || source === 'search') {
    scrollSplitIntoViewOnMobile();
  }

  phCapture('blacksmith_entry_selected', {
    entry_title: entry.title,
    building: splitState.building.key,
    source: source || 'list',
    query_length: splitState.query.length,
    topics: [...splitState.topics]
  });
}

function syncSplitActive() {
  const slug = splitState.entry ? slugify(splitState.entry.title) : '';
  splitEl.list.querySelectorAll('.split-item').forEach(btn => {
    btn.setAttribute('aria-current', String(btn.dataset.slug === slug));
  });
}

function scrollSplitIntoViewOnMobile() {
  if (!matchMedia('(max-width: 900px)').matches) return;
  const panel = document.querySelector('.scene-panel');
  if (!panel) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  panel.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

function clearSplitFilters() {
  splitState.query = '';
  splitState.topics.clear();
  splitEl.query.value = '';
  splitEl.clear.hidden = true;
  syncSplitChips();
  renderSplitList();
  splitEl.query.focus();
}

function trackSplitFilter(source) {
  clearTimeout(splitState.filterTimer);
  splitState.filterTimer = setTimeout(() => {
    phCapture('blacksmith_filter_used', {
      source,
      query_length: splitState.query.length,
      topics: [...splitState.topics],
      results: filteredSplitEntries().length
    });
  }, 500);
}

function setupSplitListeners() {
  splitEl.query.addEventListener('input', () => {
    splitState.query = splitEl.query.value;
    splitEl.clear.hidden = !splitState.query;
    renderSplitList();
    if (splitState.query.trim()) trackSplitFilter('search');
  });

  splitEl.clear.addEventListener('click', clearSplitFilters);
  splitEl.emptyClear.addEventListener('click', clearSplitFilters);

  splitEl.query.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (splitState.query) clearSplitFilters();
      else splitEl.query.blur();
    }
    if (e.key === 'Enter') {
      const first = filteredSplitEntries()[0];
      if (first) {
        e.preventDefault();
        selectSplitEntry(first, 'search', true);
        splitEl.query.blur();
      }
    }
  });

  splitEl.list.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...splitEl.list.querySelectorAll('.split-item')];
    const i = items.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
    if (next) next.focus();
  });

  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (splitEl.view.hidden) return;
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      splitEl.query.focus();
    }
  });

  window.addEventListener('hashchange', applyHash);
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
  const entries = (b && b._raw && b._raw.entries) || [];
  const topics = [...new Set(entries.flatMap(e => e.topics || []))]
    .sort((a, b) => a.localeCompare(b));

  // Every building with entries gets the filter bar. Topics add chips when present.
  const show = !isSplitBuilding(b) && entries.length > 0;
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

function clearScrollFilters(focus) {
  scrollFilters.query = '';
  scrollFilters.topics.clear();
  scrollEl.query.value = '';
  scrollEl.clear.hidden = true;
  syncScrollChips();
  pagPage = 1;
  renderPagination();
  if (focus) scrollEl.query.focus();
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
  }, 500);
}

function setupScrollFilterListeners() {
  scrollEl.query.addEventListener('input', () => {
    scrollFilters.query = scrollEl.query.value;
    scrollEl.clear.hidden = !scrollFilters.query;
    pagPage = 1;
    renderPagination();
    if (scrollFilters.query.trim()) trackScrollFilter('search');
  });

  scrollEl.clear.addEventListener('click', () => clearScrollFilters(true));
  scrollEl.clearAll.addEventListener('click', () => clearScrollFilters(true));

  scrollEl.query.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    if (scrollFilters.query) clearScrollFilters(true);
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
    setupSplitListeners();
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

function setupListeners() {
  buttons.forEach((btn, i) => btn.onclick = () => select(i, buildings[i].key, 'click'));
  ui.prev.onclick = () => nav(-1);
  ui.next.onclick = () => nav(1);
  document.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (typing) return;
    if (!splitEl.view.hidden && e.target.closest('.split-sidebar')) return;
    if (e.key === 'ArrowRight') nav(1);
    if (e.key === 'ArrowLeft') nav(-1);
  });
  document.addEventListener('click', trackLinkClick);
  $('night-toggle').addEventListener('click', e => {
    const n = ui.strip.classList.toggle('night');
    e.target.textContent = n ? '☀️ Day' : '🌙 Night';
    e.target.setAttribute('aria-pressed', n);
    phCapture('theme_toggled', { theme: n ? 'night' : 'day' });
  });
  ui.panel.addEventListener('animationend', e => {
    if (e.animationName === 'unroll') { ui.stage.classList.add('is-open'); ui.stage.classList.remove('is-unrolling'); }
  });
  addEventListener('resize', layout);
  matchMedia('(max-width: 700px)').addEventListener('change', layout);
  document.fonts?.ready.then(layout);
}

/* --- LAYOUT + CHARACTER ----------------------------------------------------- */
function layout() {
  const sw = ui.strip.clientWidth;
  const st = getComputedStyle(ui.row);
  const gap = parseFloat(st.columnGap) || 0;
  const cw = buttons.reduce((s, b) => s + b.offsetWidth, 0) + gap * (buttons.length - 1);
  const slide = cw + sw * 0.04 > sw + 1;
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    ui.char.style.left = charTargetLeft + 'px';
    return;
  }
  const currentLeft = parseFloat(ui.char.style.left) || 0;
  const distance = Math.abs(charTargetLeft - currentLeft);
  const duration = Math.min(1.2, Math.max(0.4, distance / 200));

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

  const splitMode = isSplitBuilding(b);
  ui.mainPanel.classList.toggle('is-split', splitMode);
  ui.stage.hidden = splitMode;
  splitEl.view.hidden = !splitMode;

  ui.mainPanel.style.backgroundImage = `url('${b.bg}')`;

  if (splitMode) {
    hidePager();
    enterSplit(b, entrySlug);
  } else {
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

    if (location.hash.startsWith('#smith')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  phCapture('building_viewed', {
    building: b.key,
    building_label: b.label,
    scroll_title: b.title,
    source: source || 'click'
  });

  if (!splitMode) {
    const tr = Math.max(0, ui.stage.offsetHeight - 7);
    const tm = Math.min(1.7, Math.max(0.75, 0.35 + tr / 700));
    ui.stage.style.setProperty('--rod-travel', `${tr}px`);
    ui.stage.style.setProperty('--unroll-time', `${tm.toFixed(2)}s`);
    ui.stage.classList.remove('is-open', 'is-unrolling');
    ui.stage.offsetWidth;
    ui.stage.classList.add('is-unrolling');
  }

  const focusEl = splitMode ? splitEl.view : ui.stage;
  const tp = window.scrollY + focusEl.getBoundingClientRect().top;
  if (window.scrollY > tp + 4) window.scrollTo({ top: tp, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* --- START ------------------------------------------------------------------ */
init();