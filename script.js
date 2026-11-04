/* ==========================================================================
   script.js — horizontal town portfolio (loads content from content.json)
   ========================================================================== */

document.documentElement.classList.add('js');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('no-anim');

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
  row: document.querySelector('.buildings-row'), prev: $('town-prev'), next: $('town-next'),
};

/* --- HELPERS ---------------------------------------------------------------- */
const DPO = { left: 0, top: -46 };

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
    <div class="entry-icon-wrap">
      <img class="entry-icon" src="assets/${icon}" alt="" aria-hidden="true" width="36" height="36">
      ${buildTagsHTML(entry.tags)}
    </div>
    <div class="entry-content">
      <div class="entry-head"><span class="entry-title">${entry.title}</span><span class="entry-meta">${entry.meta}</span></div>
      ${desc}
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
      pointer: b.pointer ? `assets/${b.pointer}` : null,
      title: b.title,
      sub: b.subtitle,
      bg: `assets/${b.indoor}`,
      body: buildBodyHTML(b),
      // Store original for potential future use
      _raw: b
    }));

    buildButtons();
    setupListeners();
    layout();
    select(0, buildings[0].key, 'initial');

  } catch (err) {
    console.error('Content load failed:', err);
    ui.body.innerHTML = '<p style="color:var(--gold);text-align:center;">Failed to load portfolio content.</p>';
  }
}

function buildBodyHTML(b) {
  if (b.key === 'residence') {
    return `<p>${b.intro}</p><p>${b.highlights}</p>${buildSkillsHTML(b.skills)}`;
  }
  // Library, Blacksmith, Market, Tavern
  const defaultIcon = b.entries[0]?.icon;
  return `<p>${b.intro}</p>${buildEntriesHTML(b.entries, defaultIcon)}`;
}

function buildButtons() {
  ui.row.innerHTML = buildings.map((b, i) => `
    <button class="bldg-btn${b.big ? ' big' : ''}${i === 0 ? ' active' : ''}" data-key="${b.key}" aria-label="${b.label}">
      <div class="bldg-img-wrap">
        ${b.pointer ? `<img class="bldg-pointer" src="${b.pointer}" alt="" aria-hidden="true" style="left:${DPO.left}px;top:${DPO.top}px" width="46" height="46">` : ''}
        <img class="bldg-img" src="${b.img}" alt="${b.label}" width="150" height="150" ${i > 0 ? 'loading="lazy"' : ''}>
      </div>
      <span class="bldg-label">${b.label}</span>
    </button>`).join('');

  buttons = Array.from(ui.row.querySelectorAll('.bldg-btn'));
}

function setupListeners() {
  buttons.forEach((btn, i) => btn.onclick = () => select(i, buildings[i].key, 'click'));
  ui.prev.onclick = () => nav(-1);
  ui.next.onclick = () => nav(1);
  document.onkeydown = e => { if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); };
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
  ui.strip.classList.add('can-slide');
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
    const newLeft = Math.max(0, cb.offsetLeft + cb.offsetWidth / 2 + ro - 42);
    charTargetLeft = newLeft;
    if (ui.char.style.left === '' || ui.char.style.transitionDuration === '0s') {
      ui.char.style.left = newLeft + 'px';
    } else {
      ui.char.style.left = newLeft + 'px';
    }
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
    entry_title: a.querySelector('.entry-title')?.textContent || null
  });
}

/* --- BUILDING SELECTION ----------------------------------------------------- */
function select(i, k, source) {
  const b = buildings.find(x => x.key === k); if (!b) return;
  const dir = i > idx ? 'right' : i < idx ? 'left' : 'none';
  idx = i;

  buttons.forEach((btn, j) => btn.classList.toggle('active', j === i));
  layout(); walk(dir);

  ui.mainPanel.style.backgroundImage = `url('${b.bg}')`;
  ui.title.textContent = b.title; ui.sub.textContent = b.sub; ui.body.innerHTML = b.body;

  phCapture('building_viewed', {
    building: b.key,
    building_label: b.label,
    scroll_title: b.title,
    source: source || 'click'
  });

  const tr = Math.max(0, ui.stage.offsetHeight - 7);
  const tm = Math.min(1.7, Math.max(0.75, 0.35 + tr / 700));
  ui.stage.style.setProperty('--rod-travel', `${tr}px`);
  ui.stage.style.setProperty('--unroll-time', `${tm.toFixed(2)}s`);
  ui.stage.classList.remove('is-open', 'is-unrolling');
  ui.stage.offsetWidth;
  ui.stage.classList.add('is-unrolling');

  const tp = window.scrollY + ui.stage.getBoundingClientRect().top;
  if (window.scrollY > tp + 4) window.scrollTo({ top: tp, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* --- START ------------------------------------------------------------------ */
init();