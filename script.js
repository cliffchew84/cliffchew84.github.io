/* ==========================================================================
   script.js — horizontal town portfolio
   ========================================================================== */

document.documentElement.classList.add('js');
if (matchMedia('(prefers-reduced-motion: reduce)').matches) document.documentElement.classList.add('no-anim');

/* --- Preload character sprites (idle + walk sprite sheet) ------------------- */
['character-idle.webp', 'character-walk-sprite.webp']
  .forEach(f => { const img = new Image(); img.src = 'assets/' + f; });

/* --- 1. BUILDING DATA ------------------------------------------------------ */
function entryList(icon, rows) {
  return '<ul class="scroll-entries">' + rows.map(([t, m, h, d]) => `
    <li><a href="${h}" target="_blank" rel="noopener noreferrer">
      <img class="entry-icon" src="assets/${icon}" alt="" aria-hidden="true" width="36" height="36">
      <div class="entry-content"><div class="entry-head"><span class="entry-title">${t}</span><span class="entry-meta">${m}</span></div>
      ${d ? `<p class="entry-desc-text">${d}</p>` : ''}</div><span class="entry-arrow">→</span></a></li>`).join('') + '</ul>';
}

const DPO = { left: 0, top: -46 };

const B = (o) => ({
  key: o.k, label: o.l, img: `assets/${o.i}`, big: o.b, pointer: o.p,
  title: o.t, sub: o.s, bg: `assets/${o.g}`, body: o.y
});

const buildings = {
  residence: B({ k: 'residence', l: 'Residence', i: 'residence-new.webp', b: 0, p: null,
    t: 'Residence', s: 'Resume · Profile', g: 'residenc-indoor.webp', y: `
    <p>I turn messy public data into clear tools. I write and speak about the craft. Ten years of pipelines and dashboards.</p>
    <p>Quests: HDB Resale Dashboard, SG Library Scraper, This Portfolio.</p>
    <div class="skills"><h3 class="skills-title">Skills</h3>
    <section class="skill-group"><h4>Human Languages</h4><ul><li>English (Fluent)</li><li>Mandarin (Fluent)</li><li>Japanese (Basic)</li><li>Thai (Basic)</li></ul></section>
    <section class="skill-group"><h4>Programming Languages</h4><ul><li>Python (Professional)</li><li>SQL (Professional)</li><li>JavaScript (Basic)</li></ul></section>
    <section class="skill-group"><h4>Databases</h4><ul><li>MySQL</li><li>PostgreSQL</li><li>BigQuery</li><li>MongoDB</li><li>Supabase</li><li>ClickHouse</li></ul></section>
    <section class="skill-group"><h4>Tech Tools</h4><ul><li>Tableau</li><li>Looker</li><li>Airflow</li><li>JupyterLab</li><li>Quarto</li><li>Neovim</li><li>DBeaver</li></ul></section>
    </div>` }),

  library: B({ k: 'library', l: 'Library', i: 'workshop-transparent-door.webp', b: 1, p: 'item-book-transparent.webp',
    t: 'Library', s: 'Essays · Notes', g: 'library-indoor.webp', y: `<p>Writings on data craft, public information, and the slow work of making things clear.</p>` +
    entryList('item-book-transparent.webp', [['Scraping ethics, in public', 'Essay · 2025', 'https://github.com/cliffchew84'],
               ['Visualization choices that matter', 'Essay · 2024', 'https://github.com/cliffchew84'],
               ['Building in public, sustainably', 'Notes · 2024', 'https://github.com/cliffchew84']]) }),

  smith: B({ k: 'smith', l: 'Blacksmith', i: 'blacksmith-transparent.webp', b: 1, p: 'item-hammer-transparent.webp',
    t: 'Blacksmith', s: 'Projects · Tools', g: 'blacksmith-indoor.webp', y: `<p>The tools I forge: dashboards, scrapers, pipelines. Each one made in the open.</p>` +
    entryList('item-hammer-transparent.webp', [['Library Books Explorer', 'Dashboard', 'https://cliff-library-books.netlify.app/',
      'Search the public library catalogue by title, author, or ISBN. Filter by branch and year, then keep a reading list.'],
      ['Fitness Tracker', 'App', 'https://cliff-fitness-tracker.netlify.app/',
        'Log workouts, sets, and body metrics. Charts show progress by week, month, and year.'],
      ['Grocery Run Planner', 'Tool', 'https://cliff-grocery-run.netlify.app/',
        'Plan a shopping run by aisle. Group items by store section and keep a running total.']]) }),

  market: B({ k: 'market', l: 'Market', i: 'market-transparent.webp', b: 1, p: 'item-bag-of-coins-transparent.webp',
    t: 'Market', s: 'Talks · Services', g: 'marketplace-indoors.webp', y: `<p>Where I speak and offer work. Talks on data craft and open data.</p>` +
    entryList('item-bag-of-coins-transparent.webp', [['Data Craft in the Open', 'Talk · 2025', 'https://github.com/cliffchew84'],
               ['Open Data Pipelines', 'Talk · 2024', 'https://github.com/cliffchew84']]) }),

  tavern: B({ k: 'tavern', l: 'Tavern', i: 'guild-hall-transparent-door.webp', b: 1, p: 'item-beer-transparent.webp',
    t: 'Tavern', s: 'Contact · Hire', g: 'tavern-indoors.webp', y: `<p>A place to rest and speak.</p>` +
    entryList('item-beer-transparent.webp', [['GitHub', 'Code & projects', 'https://github.com/cliffchew84'],
               ['LinkedIn', 'Professional profile', 'https://www.linkedin.com/in/cliff-chew-kt/']]) }),
};

/* --- 2. UI ELEMENTS -------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const ui = {
  strip: $('strip'), char: $('char'), charEl: $('char-el'), stage: $('scroll-stage'),
  panel: $('panel'), mainPanel: document.querySelector('.main-panel'),
  title: $('panel-title'), sub: $('panel-sub'), body: $('panel-body'),
  row: document.querySelector('.buildings-row'), prev: $('town-prev'), next: $('town-next'),
};

/* --- 3. BUILD BUTTONS ------------------------------------------------------ */
ui.row.innerHTML = Object.entries(buildings).map(([k, b], i) => `
  <button class="bldg-btn${b.big ? ' big' : ''}${i === 0 ? ' active' : ''}" data-key="${k}" aria-label="${b.label}">
    <div class="bldg-img-wrap">
      ${b.pointer ? `<img class="bldg-pointer" src="assets/${b.pointer}" alt="" aria-hidden="true" style="left:${DPO.left}px;top:${DPO.top}px" width="46" height="46">` : ''}
      <img class="bldg-img" src="${b.img}" alt="${b.label}" width="150" height="150" ${i > 0 ? 'loading="lazy"' : ''}>
    </div>
    <span class="bldg-label">${b.label}</span>
  </button>`).join('');

const buttons = Array.from(ui.row.querySelectorAll('.bldg-btn'));
buttons.forEach((b, i) => b.onclick = () => select(i, Object.keys(buildings)[i]));

/* --- 4. LAYOUT + CHARACTER ------------------------------------------------- */
let idx = 0, ro = 0;

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
  if (cb) ui.char.style.left = Math.max(0, cb.offsetLeft + cb.offsetWidth / 2 + ro - 42) + 'px';
}

/* --- 5. CHARACTER WALK ----------------------------------------------------- */
function walk(dir) {
  ui.char.classList.add('walking');
  ui.charEl.classList.remove('char-move-left', 'char-move-right');
  ui.charEl.offsetWidth;
  if (dir === 'left' || dir === 'right') ui.charEl.classList.add('char-move-' + dir);
  setTimeout(() => { ui.charEl.classList.remove('char-move-left', 'char-move-right'); ui.char.classList.remove('walking'); }, 800);
}

/* --- 6. SCROLL ANIMATION END ---------------------------------------------- */
ui.panel.addEventListener('animationend', e => {
  if (e.animationName === 'unroll') { ui.stage.classList.add('is-open'); ui.stage.classList.remove('is-unrolling'); }
});

/* --- 7. NIGHT TOGGLE ------------------------------------------------------- */
$('night-toggle').addEventListener('click', e => {
  const n = ui.strip.classList.toggle('night');
  e.target.textContent = n ? '☀️ Day' : '🌙 Night';
  e.target.setAttribute('aria-pressed', n);
});

/* --- 8. NAVIGATION --------------------------------------------------------- */
function nav(d) {
  const n = Math.min(Math.max(idx + d, 0), buttons.length - 1);
  if (n !== idx) select(n, Object.keys(buildings)[n]);
}
ui.prev.onclick = () => nav(-1);
ui.next.onclick = () => nav(1);
document.onkeydown = e => { if (e.key === 'ArrowRight') nav(1); if (e.key === 'ArrowLeft') nav(-1); };

/* --- 9. BUILDING SELECTION ------------------------------------------------- */
function select(i, k) {
  const d = buildings[k]; if (!d) return;
  const dir = i > idx ? 'right' : i < idx ? 'left' : 'none';
  idx = i;

  buttons.forEach((b, j) => b.classList.toggle('active', j === i));
  layout(); walk(dir);

  ui.mainPanel.style.backgroundImage = `url('${d.bg}')`;
  ui.title.textContent = d.title; ui.sub.textContent = d.sub; ui.body.innerHTML = d.body;

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

/* --- 10. INIT & RESIZE ----------------------------------------------------- */
addEventListener('resize', layout);
matchMedia('(max-width: 700px)').addEventListener('change', layout);
document.fonts?.ready.then(layout);

select(0, 'residence');