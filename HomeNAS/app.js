    // ====== CONFIG ======
    // No credentials live in this file. Sign in on the login screen.
    // Token is kept in memory by default; "Keep me signed in" stores it in this browser only.
    // API base. Served by the proxy (same origin — e.g. LAN URL) → use it directly.
    // Opened via file:// (no origin) → call the proxy on this machine explicitly.
    const PROXY_URL = window.location.protocol === 'file:' ? 'http://localhost:3001' : window.location.origin; // proxy -> NAS

    // ====== STATE ======
    let cookie = '';
    let currentUser = '';
    let currentPath = '/home';
    let selection = new Set();
    let pendingDeletes = new Set();
    let modalResolve = null;

    // ====== DOM ======
    const folderTree = document.getElementById('folderTree');
    const breadcrumb = document.getElementById('breadcrumb');
    const fileList = document.getElementById('fileList');
    const selectAll = document.getElementById('selectAll');
    const fileInput = document.getElementById('fileInput');
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modalTitle');
    const modalInput = document.getElementById('modalInput');
    const toast = document.getElementById('toast');

    // ====== PRESS FEEDBACK ======
    // Short vibration on phones that support it. No-op on desktop.
    document.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest && e.target.closest('button');
      if (btn && !btn.disabled && typeof navigator.vibrate === 'function') navigator.vibrate(10);
    });

    // ====== TOOLTIP ======
    // One fixed element positioned on hover/focus. Keeps tooltips above every
    // layer and outside the overflow-clipped sidebar and table containers.
    const tooltip = document.getElementById('tooltip');
    let tooltipTarget = null;

    function showTooltip(el) {
      const text = el.getAttribute('data-tooltip');
      if (!text) { hideTooltip(); return; }
      tooltipTarget = el;
      tooltip.textContent = text;
      tooltip.hidden = false;
      const rect = el.getBoundingClientRect();
      const tip = tooltip.getBoundingClientRect();
      // Tooltips must never cover the sticky bar. Treat its bottom edge as the ceiling.
      const header = document.querySelector('header');
      const ceiling = header ? header.getBoundingClientRect().bottom : 0;
      const below = el.getAttribute('data-tooltip-pos') === 'bottom';
      let top = below ? rect.bottom + 12 : rect.top - tip.height - 12;
      if (!below && top < ceiling + 4) top = rect.bottom + 8;   // no room above: flip down
      if (below && top + tip.height > window.innerHeight - 8) top = rect.top - tip.height - 8;
      let left = rect.left + rect.width / 2 - tip.width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
    }

    function hideTooltip() {
      tooltipTarget = null;
      tooltip.hidden = true;
    }

    document.addEventListener('mouseover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el) showTooltip(el); else hideTooltip();
    });
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest && e.target.closest('[data-tooltip]');
      if (el) showTooltip(el);
    });
    document.addEventListener('focusout', hideTooltip);
    document.addEventListener('mouseout', (e) => {
      if (tooltipTarget && !tooltipTarget.contains(e.relatedTarget)) hideTooltip();
    });
    // Reposition on scroll/resize so the tooltip tracks its button.
    window.addEventListener('scroll', () => { if (tooltipTarget) showTooltip(tooltipTarget); }, true);
    window.addEventListener('resize', () => { if (tooltipTarget) showTooltip(tooltipTarget); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTooltip(); });

    // ====== NAS batch/commit ======
    // One helper for the batch API. Returns the parsed body and throws on transport
    // or top-level failure. Callers inspect per-item results for arrays under data.data.
    async function nasBatch(des) {
      const res = await authFetch(`${PROXY_URL}/batch/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ des, blocking: true })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      if (data.result === false) throw new Error(String(data.error || 'NAS refused the request'));
      return data;
    }

    // Single-des convenience wrapper: throws with the item-level message on failure.
    async function nasBatchOne(des) {
      const data = await nasBatch([des]);
      const item = Array.isArray(data.data) ? data.data[0] : null;
      if (item && item.result === false) {
        const err = item.err || {};
        throw new Error(String(err.msg || err.id || item.error || 'NAS refused the request'));
      }
      return data;
    }

    // ====== TYPED CONFIRM ======
    // Enable/disable wiring for "type X to confirm" inputs.
    // expected: function returning the text the user must type.
    // ready: optional extra predicate (return false to keep the button disabled).
    function wireTypedConfirm(input, confirmBtn, expected, ready) {
      input.addEventListener('input', () => {
        confirmBtn.disabled = !(input.value === expected() && (!ready || ready()));
      });
    }

    // ====== DELETE SHARED FOLDER (internal common folders only) ======
    // Uses the Control Panel batch API: POST /api/batch/commit
    // des entry: ["folder", "delete", [], { folder_name: <internal name> }]
    const shareDeleteModal = document.getElementById('shareDeleteModal');
    const shareDeleteInput = document.getElementById('shareDeleteInput');
    const shareDeleteConfirm = document.getElementById('shareDeleteConfirm');
    const shareDeleteError = document.getElementById('shareDeleteError');
    const shareDeleteName = document.getElementById('shareDeleteName');
    const shareDeletePromptName = document.getElementById('shareDeletePromptName');
    let shareDeleteTarget = null;

    function openShareDeleteModal(id, display) {
      shareDeleteTarget = { id, display };
      shareDeleteName.textContent = display;
      shareDeletePromptName.textContent = display;
      shareDeleteInput.value = '';
      shareDeleteConfirm.disabled = true;
      shareDeleteError.classList.add('hidden');
      shareDeleteModal.classList.remove('hidden');
      shareDeleteInput.focus();
    }

    function closeShareDeleteModal() {
      shareDeleteModal.classList.add('hidden');
      shareDeleteTarget = null;
    }

    wireTypedConfirm(shareDeleteInput, shareDeleteConfirm, () => shareDeleteTarget && shareDeleteTarget.display, () => !!shareDeleteTarget);

    async function renameShareDisplayName(id, display, newDisplay) {
      await nasBatchOne(['folder', 'set_display_name', [], { folder_name: id, display_name: newDisplay }]);
    }

    async function deleteShareFolder(id, display) {
      await nasBatchOne(['folder', 'delete', [], { folder_name: id }]);
    }

    document.getElementById('shareDeleteCancel').addEventListener('click', closeShareDeleteModal);
    shareDeleteConfirm.addEventListener('click', async () => {
      if (!shareDeleteTarget) return;
      const { id, display } = shareDeleteTarget;
      shareDeleteConfirm.disabled = true;
      shareDeleteError.classList.add('hidden');
      try {
        await deleteShareFolder(id, display);
        closeShareDeleteModal();
        showToast(`Deleted shared folder ${display}`, 4000, 'success');
        // Leave the deleted folder view, if we are inside it.
        if (currentPath === '/' + id || currentPath.startsWith('/' + id + '/')) {
          selectPath('/home');
        }
        loadTree().catch(() => {});
      } catch (e) {
        shareDeleteError.textContent = 'Delete failed: ' + e.message;
        shareDeleteError.classList.remove('hidden');
        shareDeleteConfirm.disabled = false;
      }
    });

    // ====== SIDEBAR TOGGLE ======
    // The panel icon button hides the sidebar and shows it again.
    // The state is kept in localStorage. This is a display preference, not a secret.
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
    function setSidebarCollapsed(collapsed, persist = true) {
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
      sidebarToggle.setAttribute('data-tooltip', collapsed ? 'Show sidebar' : 'Hide sidebar');
      sidebarToggle.setAttribute('aria-label', sidebarToggle.getAttribute('data-tooltip'));
      if (sidebarOverlay) sidebarOverlay.classList.toggle('open', !collapsed && isMobile());
      if (!persist) return; // don't overwrite the stored desktop preference
      try {
        localStorage.setItem('homenas.sidebar.collapsed', collapsed ? '1' : '0');
      } catch (e) {
        // localStorage can be unavailable. The toggle still works.
      }
    }
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => setSidebarCollapsed(true, false));
    try {
      setSidebarCollapsed(isMobile() ? true : localStorage.getItem('homenas.sidebar.collapsed') === '1', false);
    } catch (e) {
      // keep the sidebar visible
    }
    sidebarToggle.addEventListener('click', () => {
      setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
    });

    // ====== GEAR MENU ======
    const gearMenuBtn = document.getElementById('gearMenuBtn');
    const gearMenu = document.getElementById('gearMenu');
    const gearDivider = document.getElementById('gearDivider');

    function setGearMenuOpen(open) {
      gearMenu.classList.toggle('hidden', !open);
      gearMenuBtn.setAttribute('aria-expanded', String(open));
    }
    function closeGearMenu(returnFocus = false) {
      setGearMenuOpen(false);
      if (returnFocus) gearMenuBtn.focus();
    }
    gearMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setGearMenuOpen(gearMenu.classList.contains('hidden'));
    });
    document.addEventListener('click', (e) => {
      if (!gearMenu.classList.contains('hidden') && !gearMenu.contains(e.target)) closeGearMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !gearMenu.classList.contains('hidden')) closeGearMenu(true);
    });

    // ====== AUTH ======
    // One wrapper: any 401 from the NAS ends the session (token expired/invalid).
    // 403 is an application error (e.g. not permitted) and does NOT end the session.
    class AuthExpired extends Error {}
    async function authFetch(url, options = {}) {
      // Browsers forbid setting Cookie from JS, so every request sends the token here.
      // The proxy converts it to the authorization_code cookie the NAS expects.
      const headers = { ...(options.headers || {}) };
      headers.Authorization = cookie ? `Bearer ${cookie}` : '';
      const res = await fetch(url, { ...options, headers }); // raw fetch — this IS the wrapper
      if (res.status === 401) {
        endSession();
        showLogin('Session expired. Please sign in again.');
        throw new AuthExpired('Session expired');
      }
      return res;
    }

    async function authenticate(user, pass) {
      const res = await fetch(`${PROXY_URL}/auth/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
      }); // raw fetch — must not trigger the session-expiry redirect
      const data = await res.json().catch(() => null);
      const token = data && data.data && data.data.access_token;
      if (!res.ok || !token) {
        const msg = data && (data.error?.msg || data.error);
        throw new Error(msg || 'Wrong username or password.');
      }
      return token;
    }

    const userBadge = document.getElementById('userBadge');
    const loginView = document.getElementById('loginView');
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginKeepSignedIn = document.getElementById('loginKeepSignedIn');
    const loginError = document.getElementById('loginError');
    const loginSubmit = document.getElementById('loginSubmit');

    function showLogin(msg) {
      document.querySelectorAll('.app-shell').forEach(el => el.classList.add('hidden'));
      document.querySelectorAll('[role="dialog"]').forEach(el => el.classList.add('hidden'));
      closePreview(); // hides too, and revokes the blob URL
      toast.classList.add('hidden');
      loginView.classList.remove('hidden');
      loginError.textContent = msg || '';
      loginError.classList.toggle('hidden', !msg);
      loginUsername.focus();
    }
    function showApp() {
      loginView.classList.add('hidden');
      document.querySelectorAll('.app-shell').forEach(el => el.classList.remove('hidden'));
      const isAdmin = currentUser === 'admin';
      ['healthBtn', 'changePasswordBtn', 'gearDivider'].forEach(id => {
        document.getElementById(id).classList.toggle('hidden', !isAdmin);
      });
    }
    function endSession() {
      cookie = '';
      currentUser = '';
      localStorage.removeItem('homenas.session');
    }
    function startSession(user, token, remember) {
      cookie = token;
      currentUser = user;
      userBadge.textContent = user === 'admin' ? user + ' (admin)' : user;
      if (remember) localStorage.setItem('homenas.session', JSON.stringify({ user, token }));
      else localStorage.removeItem('homenas.session');
      showApp();
    }

    // ====== FILE SYSTEM (life API) ======
    // /life/v1/folder returns both folders and files with size and date.
    // The NAS can be slow to answer the first request after an idle period,
    // so retry transient failures with a short wait.
    async function fsList(path, attempts = 3) {
      let lastError = null;
      for (let i = 0; i < attempts; i++) {
        try {
          const query = {
            root: 'local',
            path,
            option: {
              offset: 0,
              limit: 500,
              order: 'name',
              reverse: false,
              filter: [{ key: 'subtype', equal: false, value: 'hidden' }]
            }
          };
          const res = await authFetch(`${PROXY_URL}/life/v1/folder?query=${encodeURIComponent(JSON.stringify(query))}`, {
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          if (!data.result) throw new Error(data.error?.msg || data.error || 'Request failed');
          return data.data.items || [];
        } catch (e) {
          lastError = e;
          if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, 700));
        }
      }
      throw lastError;
    }

    // SMB exposes shares by display name, so match Finder.
    function itemLabel(item) {
      return (item.option && item.option.share && item.option.share.display_name) || item.name;
    }

    function shareType(item) {
      const share = item.option && item.option.share;
      return (share && share.type) || (item.subtype && item.subtype[0]) || '';
    }

    // Group shares the way a user thinks about them, not in filesystem order.
    const TREE_GROUPS = [
      { label: 'Personal', types: ['home', 'vphome'] },
      { label: 'Shared folders', types: ['internal'] },
      { label: 'User homes', types: ['homes'] },
      { label: 'System', types: ['system'] }
    ];

    function byLabel(a, b) {
      return itemLabel(a).localeCompare(itemLabel(b), undefined, { sensitivity: 'base' });
    }

    // Group collapse state. Display preference only (localStorage).
    let collapsedGroups = {};
    try { collapsedGroups = JSON.parse(localStorage.getItem('homenas.collapsedGroups') || '{}') || {}; } catch (e) { collapsedGroups = {}; }
    // Migrate the old Shared folders hide flag.
    try {
      if (localStorage.getItem('homenas.hideSharedFolders') === '1') {
        collapsedGroups['Shared folders'] = true;
        localStorage.setItem('homenas.collapsedGroups', JSON.stringify(collapsedGroups));
        localStorage.removeItem('homenas.hideSharedFolders');
      }
    } catch (e) { /* keep defaults */ }

    function isGroupCollapsed(label) { return collapsedGroups[label] === true; }

    function toggleGroup(label) {
      collapsedGroups[label] = !isGroupCollapsed(label);
      try { localStorage.setItem('homenas.collapsedGroups', JSON.stringify(collapsedGroups)); } catch (e) { /* ignore */ }
      loadTree().catch(() => {});
    }

    const GROUP_HEADER_CLASS = 'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600';

    function addTreeGroup(label, items) {
      // The Shared folders panel is always shown, even when empty.
      if (!items.length && label !== 'Shared folders') return;
      const header = document.createElement('li');
      header.className = 'mt-3 mb-1 first:mt-1';
      if (items.length === 0) {
        const heading = document.createElement('div');
        heading.className = 'px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400';
        heading.textContent = label;
        header.appendChild(heading);
        folderTree.appendChild(header);
        const empty = document.createElement('li');
        empty.className = 'my-0.5';
        empty.innerHTML = `<button class="${TREE_BUTTON_CLASS}" disabled>No shared folders</button>`;
        folderTree.appendChild(empty);
        return;
      }
      const collapsed = isGroupCollapsed(label);
      const toggle = document.createElement('button');
      toggle.className = GROUP_HEADER_CLASS;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('data-tooltip', collapsed ? `Show ${label}` : `Hide ${label}`);
      toggle.setAttribute('aria-label', `${collapsed ? 'Show' : 'Hide'} ${label}`);
      toggle.innerHTML = `
        <span class="tree-caret inline-block w-2.5 shrink-0 text-[9px] text-neutral-400 transition-transform duration-150 group-aria-[expanded=true]:rotate-90">▸</span>
        <span>${escapeHtml(label)}</span>
        <span class="ml-auto rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-neutral-500">${items.length}</span>
      `;
      toggle.addEventListener('click', () => toggleGroup(label));
      header.appendChild(toggle);
      folderTree.appendChild(header);
      if (collapsed) return; // group collapsed
      items.sort(byLabel).forEach(item => addTreeNode(itemLabel(item), item.path, folderTree, shareType(item), item.name));
    }

    // ====== TREE (share folders) ======
    async function loadTree() {
      const items = await fsList('/');
      const folders = items.filter(item => item.type === 'folder');
      folderTree.innerHTML = '';

      const grouped = new Set();
      TREE_GROUPS.forEach(group => {
        const groupItems = folders.filter(item => group.types.includes(shareType(item)));
        groupItems.forEach(item => grouped.add(item));
        addTreeGroup(group.label, groupItems);
      });

      addTreeGroup('Other', folders.filter(item => !grouped.has(item)));
      // Keep the highlight on the folder that is open.
      folderTree.querySelectorAll('button[data-path]').forEach(b => { b.dataset.active = String(b.dataset.path === currentPath); });
    }

    // Saffron-colored folder icons, so shares stand out from the white sidebar.
    const TREE_BUTTON_CLASS = 'group flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-200 active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 data-[active=true]:bg-blue-600 data-[active=true]:text-white [&[data-active=true]_.tree-caret]:text-blue-200 disabled:cursor-default disabled:text-neutral-400 disabled:hover:bg-transparent';

    function addTreeNode(name, path, container, type, id) {
      const li = document.createElement('li');
      li.className = 'my-0.5';
      // Delete belongs to top-level internal shares only (their own row, not subfolders).
      const canDeleteShare = type === 'internal' && container === folderTree && id;
      const trashSvg = icon('trash');
      const pencilSvg = icon('pencil');
      li.innerHTML = `
        <div class="flex items-center gap-0.5">
          <button data-path="${escapeHtml(path)}" data-active="false" aria-expanded="false" class="${TREE_BUTTON_CLASS} min-w-0 flex-1">
            <span class="tree-caret inline-block w-2.5 shrink-0 text-[10px] text-neutral-400 transition-transform duration-150 group-aria-[expanded=true]:rotate-90">▸</span>
            <span class="shrink-0">${svgTreeIcon(type)}</span>
            ${escapeHtml(name)}
          </button>
          ${canDeleteShare ? `<button class="tree-edit-share icon-btn shrink-0 p-1.5 text-neutral-400 hover:bg-blue-50 hover:text-blue-600" data-tooltip="Rename display name of ${escapeHtml(name)}" aria-label="Rename display name of ${escapeHtml(name)}" data-id="${escapeHtml(id)}" data-display="${escapeHtml(name)}">${pencilSvg}</button>` : ''}
          ${canDeleteShare ? `<button class="tree-delete-share icon-btn shrink-0 p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600" data-tooltip="Delete shared folder ${escapeHtml(name)}" aria-label="Delete shared folder ${escapeHtml(name)}" data-id="${escapeHtml(id)}" data-display="${escapeHtml(name)}">${trashSvg}</button>` : ''}
        </div>
        <ul class="ml-4 hidden border-l border-neutral-100 pl-2"></ul>
      `;
      const btn = li.querySelector('button');
      const childrenUl = li.querySelector('ul');
      let loaded = false;

      btn.addEventListener('click', async () => {
        const isOpen = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(isOpen));
        childrenUl.classList.toggle('hidden', !isOpen);
        selectPath(path);

        if (!isOpen || loaded) return;
        loaded = true;
        childrenUl.innerHTML = `<li class="my-0.5"><button class="${TREE_BUTTON_CLASS}" disabled>Loading…</button></li>`;
        try {
          const items = await fsList(path);
          const names = items.filter(item => item.type === 'folder' && !item.name.startsWith('.'));
          childrenUl.innerHTML = '';
          if (!names.length) {
            childrenUl.innerHTML = `<li class="my-0.5"><button class="${TREE_BUTTON_CLASS}" disabled>No subfolders</button></li>`;
            return;
          }
          names.forEach(item => addTreeNode(itemLabel(item), item.path || `${path}/${item.name}`, childrenUl, shareType(item)));
        } catch (e) {
          loaded = false; // allow a retry on the next click
          childrenUl.innerHTML = `<li class="my-0.5"><button class="${TREE_BUTTON_CLASS}" disabled>Error</button></li>`;
        }
      });
      container.appendChild(li);
    }

    // ====== FILE LIST ======
    async function loadFiles(path) {
      currentPath = path;
      updateBreadcrumb(path);
      updateSearchAvailability();
      document.getElementById('upLevelBtn').disabled = path === '/';
      selection.clear();
      selectAll.checked = false;
      selectAll.disabled = true;
      fileList.innerHTML = '<tr><td colspan="6" class="px-6 py-16 text-center text-sm text-neutral-400"><span class="animate-pulse">Loading…</span></td></tr>';
      try {
        const items = await fsList(path);
        currentItems = items;
        renderFiles(items, path);
      } catch (e) {
        fileList.innerHTML = '<tr><td colspan="6" class="px-6 py-16 text-center text-sm text-red-600">Error: ' + escapeHtml(e.message) + '</td></tr>';
      }
    }

    function fileRow(item, path, opts = {}) {
      const fullPath = item.path || `${path === '/' ? '' : path}/${item.name}`;
      const isFolder = item.type === 'folder';
      const label = itemLabel(item);
      const realName = label === item.name ? '' : ` title="Folder name: ${escapeHtml(item.name)}"`;
      const canModify = path !== '/';
      const pending = pendingDeletes.has(fullPath);
      // "Move up one level" is only meaningful when there is a folder above the current listing.
      const canMoveUp = isFolder && !pending && path !== '/' && parentOf(path) !== '/';
      const previewable = !isFolder && previewKind(item.name) !== null;
      const previewKindAttr = previewable ? previewKind(item.name) : '';
      const typeCell = pending ? 'Deleting…' : (opts.typeCell ?? (isFolder ? 'Folder' : fileType(item.name)));
      const dis = pending ? ' disabled' : '';

      // One consistent button shape for the action cell; attributes are escaped at construction.
      const rowBtn = (cls, attrString, icn) => `<button class="btn-icon${cls ? ' ' + cls : ''}" ${attrString}${dis}>${icn}</button>`;
      const upBtn = canMoveUp ? rowBtn('move-up-item', `data-path="${escapeHtml(fullPath)}" data-tooltip="Move up one folder" aria-label="Move ${escapeHtml(label)} up one folder"`, icon('folderUp')) : '';
      const downloadBtn = isFolder ? '' : rowBtn('download-item', `data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(item.name)}" data-tooltip="Download" aria-label="Download ${escapeHtml(label)}"`, icon('download'));
      const renameBtn = rowBtn('rename-item', `data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(label)}" data-tooltip="Rename" aria-label="Rename ${escapeHtml(label)}"`, icon('pencil'));
      const deleteBtn = rowBtn('btn-icon-danger delete-item', `data-path="${escapeHtml(fullPath)}" data-tooltip="Delete" aria-label="Delete ${escapeHtml(label)}"`, icon('trash'));

      const nameCellHtml = `
            <span class="flex items-center gap-2 font-medium text-neutral-800">
              <span class="shrink-0">${isFolder ? svgFolder() : previewable
                ? `<button class="preview-item block cursor-pointer rounded-md transition-opacity hover:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(item.name)}" data-size="${escapeHtml(String(item.size ?? ''))}" data-kind="${previewKindAttr}" aria-label="Preview ${escapeHtml(label)}">${svgFile(item.name)}</button>`
                : svgFile(item.name)}</span>
              ${previewable
                ? `<button class="preview-item cursor-pointer rounded text-left transition-colors hover:text-blue-700 hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(item.name)}" data-size="${escapeHtml(String(item.size ?? ''))}" data-kind="${previewKindAttr}" data-tooltip="Preview" aria-label="Preview ${escapeHtml(label)}">${escapeHtml(label)}</button>`
                : isFolder
                  ? escapeHtml(label)
                  : `<span class="rounded" data-tooltip="File format preview not supported">${escapeHtml(label)}</span>`}
            </span>`;
      const actionsHtml = (downloadBtn || canModify) ? `
              <span class="flex gap-1.5">
                ${downloadBtn}
                ${canModify ? upBtn + renameBtn + deleteBtn : ''}
              </span>` : '<span class="text-neutral-300">—</span>';

      return `
        <tr draggable="${pending ? 'false' : 'true'}" data-selected="false" data-deleting="${pending}" data-name="${escapeHtml(label)}" data-path="${escapeHtml(fullPath)}" data-type="${isFolder ? 'folder' : 'file'}" class="transition-colors odd:bg-white even:bg-neutral-50/60 hover:bg-blue-50/70 data-[selected=true]:bg-blue-50 data-[deleting=true]:opacity-45 data-[deleting=true]:[&_td]:pointer-events-none">
          <td class="cell-check border-b border-neutral-100 px-3 py-2"><input type="checkbox" class="row-check h-4 w-4 accent-blue-600" value="${escapeHtml(fullPath)}"${pending ? ' disabled' : ''} aria-label="Select ${escapeHtml(label)}"></td>
          <td class="cell-name border-b border-neutral-100 px-3 py-2"${realName}>${nameCellHtml}</td>
          <td class="cell-size border-b border-neutral-100 px-3 py-2 text-right tabular-nums text-neutral-600">${isFolder ? '—' : formatSize(item.size)}</td>
          <td class="cell-date border-b border-neutral-100 px-3 py-2 text-neutral-600">${formatDate(item.access_date)}</td>
          <td class="type cell-type border-b border-neutral-100 px-3 py-2 text-neutral-600">${typeCell}</td>
          <td class="cell-actions border-b border-neutral-100 px-3 py-2">${actionsHtml}</td>
        </tr>
      `;
    }

    // ====== SORTING ======
    const SORT_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    let sortKey = 'name';
    let sortDir = 1; // 1 = ascending, -1 = descending
    let currentItems = [];

    const SORT_VAL = {
      name: it => String((typeof itemLabel === 'function' ? itemLabel(it) : it.name) || it.name || '').toLowerCase(),
      size: it => Number(it.size || 0),
      access_date: it => String(it.access_date || ''),
      type: it => String(it.type === 'folder' ? 'Folder' : (typeof fileType === 'function' ? fileType(it.name || '') : (it.name || '').split('.').pop())).toLowerCase()
    };

    function applySort(items) {
      const val = SORT_VAL[sortKey];
      const folders = items.filter(i => i.type === 'folder');
      const files = items.filter(i => i.type !== 'folder');
      const cmp = (a, b) => {
        if (sortKey === 'size') return Number(val(a)) - Number(val(b));
        const va = val(a), vb = val(b);
        return typeof va === 'number' ? va - vb : SORT_COLLATOR.compare(String(va), String(vb));
      };
      folders.sort((a, b) => cmp(a, b) * sortDir);
      files.sort((a, b) => cmp(a, b) * sortDir);
      return folders.concat(files);
    }

    function updateSortHeaderUI() {
      document.querySelectorAll('.sort-header').forEach(btn => {
        const active = btn.dataset.sort === sortKey;
        btn.dataset.active = String(active);
        btn.dataset.dir = sortDir === -1 ? 'desc' : 'asc';
        const th = btn.closest('th');
        if (th) th.setAttribute('aria-sort', active ? (sortDir === -1 ? 'descending' : 'ascending') : 'none');
      });
      document.querySelectorAll('#mobileSortBar .sort-chip').forEach(chip => {
        chip.setAttribute('aria-pressed', String(chip.dataset.sort === sortKey));
      });
    }

    function rerenderCurrentView() {
      updateSortHeaderUI();
      if (searchState.active && searchState.results && searchInput.value.trim().length >= 2) {
        renderSearchResults(applySort(searchState.results));
      } else {
        renderFiles(currentItems, currentPath);
      }
    }

    function cycleSort(key) {
      if (sortKey === key) sortDir = -sortDir;
      else { sortKey = key; sortDir = 1; }
      rerenderCurrentView();
    }
    document.querySelectorAll('.sort-header').forEach(btn => {
      btn.addEventListener('click', () => cycleSort(btn.dataset.sort));
    });
    document.querySelectorAll('#mobileSortBar .sort-chip').forEach(btn => {
      btn.addEventListener('click', () => cycleSort(btn.dataset.sort));
    });

    // ====== TYPE FILTER ======
    // Files are classified by extension. Unknown formats go to "other" and stay
    // visible. Folders always show, in every category.
    const TYPE_CATEGORIES = [
      { key: 'photos', label: 'Photos', exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff', 'svg', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2', 'raf', 'srw', 'pef'] },
      { key: 'videos', label: 'Videos', exts: ['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts', 'm2ts'] },
      { key: 'audio', label: 'Audio', exts: ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'aif', 'wma', 'amr'] },
      { key: 'documents', label: 'Documents', exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'markdown', 'csv', 'tsv', 'epub', 'pages', 'numbers', 'key', 'tex', 'log'] },
      { key: 'code', label: 'Code', exts: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'sh', 'bash', 'zsh', 'fish', 'php', 'pl', 'lua', 'r', 'swift', 'kt', 'java', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'go', 'rs', 'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg', 'conf', 'env', 'properties', 'gradle', 'cmake', 'ipynb', 'awk', 'bat', 'ps1'] },
      { key: 'archives', label: 'Archives', exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'dmg', 'iso', 'pkg'] },
      { key: 'other', label: 'Other', exts: [] }
    ];
    // Files without an extension that people expect in a category.
    const TYPE_NAMES = { makefile: 'code', dockerfile: 'code', readme: 'documents', license: 'documents', changelog: 'documents' };
    const EXT_TO_TYPE = TYPE_CATEGORIES.reduce((map, cat) => {
      cat.exts.forEach(ext => { map[ext] = cat.key; });
      return map;
    }, {});
    const TYPE_LABEL = { all: 'All' };
    TYPE_CATEGORIES.forEach(cat => { TYPE_LABEL[cat.key] = cat.label; });

    const typeChips = document.getElementById('typeChips');
    const TYPE_KEYS = TYPE_CATEGORIES.map(cat => cat.key);

    // Filter choice persists across folders, shares and reloads (localStorage).
    let activeType = 'all';
    try {
      const saved = localStorage.getItem('homenas.typeFilter');
      if (saved === 'all' || TYPE_KEYS.includes(saved)) activeType = saved;
    } catch (e) { /* keep default */ }

    function categoryOf(item) {
      if (item.type === 'folder') return 'folders';
      const name = String(item.name || '').toLowerCase();
      if (TYPE_NAMES[name]) return TYPE_NAMES[name];
      const ext = extOf(name);
      if (!ext) return 'other';
      return EXT_TO_TYPE[ext] || 'other';
    }

    function visibleItems(items) {
      return items.filter(item => !item.name.startsWith('.'));
    }

    function filterByType(items) {
      if (activeType === 'all') return items;
      return items.filter(item => item.type === 'folder' || categoryOf(item) === activeType);
    }

    function typeCounts(items) {
      const counts = { all: items.length };
      TYPE_KEYS.forEach(key => { counts[key] = 0; });
      items.forEach(item => {
        if (item.type !== 'folder') counts[categoryOf(item)]++;
      });
      return counts;
    }

    // Counts come from the current list, so a folder is never a surprise.
    function renderTypeChips(items) {
      const counts = typeCounts(items);
      const chips = [{ key: 'all', label: 'All' }].concat(TYPE_CATEGORIES);
      const focused = document.activeElement && document.activeElement.classList.contains('type-chip')
        ? document.activeElement.dataset.type : null;
      typeChips.innerHTML = chips.map(chip => {
        const n = counts[chip.key] || 0;
        return `<button class="type-chip" type="button" data-type="${chip.key}" aria-pressed="${chip.key === activeType}" aria-label="${chip.label}, ${n} item${n === 1 ? '' : 's'}">${chip.label}<span class="type-count">${n}</span></button>`;
      }).join('');
      // Keep keyboard focus on the same chip after the row is rebuilt.
      if (focused) {
        const again = typeChips.querySelector(`.type-chip[data-type="${focused}"]`);
        if (again) again.focus({ preventScroll: true });
      }
    }

    function setActiveType(key) {
      activeType = key;
      try { localStorage.setItem('homenas.typeFilter', key); } catch (e) { /* ignore */ }
      selection.clear();
      selectAll.checked = false;
      rerenderCurrentView();
      updateSelection();
    }

    typeChips.addEventListener('click', (e) => {
      const btn = e.target.closest('.type-chip');
      if (!btn || btn.dataset.type === activeType) return;
      setActiveType(btn.dataset.type);
    });

    // "Show all" inside the filtered empty state.
    fileList.addEventListener('click', (e) => {
      if (e.target.closest('#clearTypeFilter')) setActiveType('all');
    });

    function typeEmptyRow(total) {
      const label = (TYPE_LABEL[activeType] || 'items').toLowerCase();
      return `<tr>
        <td colspan="6" class="px-6 py-14 text-center">
          <p class="text-sm font-semibold text-neutral-600">No ${escapeHtml(label)} in this folder</p>
          <p class="mt-1.5 text-xs text-neutral-400">This folder has ${total} item${total === 1 ? '' : 's'} of other types.</p>
          <div class="mt-4 flex justify-center"><button class="btn" type="button" id="clearTypeFilter">Show all</button></div>
        </td>
      </tr>`;
    }

    function renderFiles(items, path) {
      updateSortHeaderUI();
      const visible = visibleItems(items);
      renderTypeChips(visible);
      const shown = filterByType(visible);
      selectAll.disabled = !shown.length;
      if (!shown.length) {
        if (visible.length) {
          fileList.innerHTML = typeEmptyRow(visible.length);
          return;
        }
        fileList.innerHTML = `<tr>
          <td colspan="6" class="px-6 py-14 text-center">
            <svg class="mx-auto mb-4 h-40 w-auto" viewBox="0 0 220 150" role="img" aria-label="Empty folder illustration">
              <defs>
                <linearGradient id="heroRing" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#eef2ff"/>
                  <stop offset="1" stop-color="#e0e7ff"/>
                </linearGradient>
                <linearGradient id="heroBack" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#fde68a"/>
                  <stop offset="1" stop-color="#fcd34d"/>
                </linearGradient>
                <linearGradient id="heroBody" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#fcd34d"/>
                  <stop offset="1" stop-color="#f59e0b"/>
                </linearGradient>
                <linearGradient id="heroDoc" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#ffffff"/>
                  <stop offset="1" stop-color="#e8edf5"/>
                </linearGradient>
              </defs>
              <circle cx="110" cy="78" r="64" fill="url(#heroRing)"/>
              <rect x="62" y="30" width="52" height="38" rx="5" fill="url(#heroDoc)" stroke="#dbe2ee" stroke-width="1.5" transform="rotate(-9 88 49)"/>
              <line x1="72" y1="44" x2="100" y2="40" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" transform="rotate(-9 88 49)"/>
              <line x1="73" y1="53" x2="97" y2="49.4" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" transform="rotate(-9 88 49)"/>
              <rect x="104" y="24" width="52" height="38" rx="5" fill="url(#heroDoc)" stroke="#dbe2ee" stroke-width="1.5" transform="rotate(10 130 43)"/>
              <line x1="113" y1="37" x2="142" y2="42.3" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" transform="rotate(10 130 43)"/>
              <line x1="112" y1="46" x2="138" y2="50.8" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" transform="rotate(10 130 43)"/>
              <path d="M48 82a10 10 0 0 1 10-10h34l8-8h62a10 10 0 0 1 10 10v6H48z" fill="url(#heroBack)"/>
              <path d="M48 78a8 8 0 0 1 8-8h108a8 8 0 0 1 8 8v30a9 9 0 0 1-9 9H57a9 9 0 0 1-9-9z" fill="url(#heroBody)"/>
              <path d="M48 82h124v9a9 9 0 0 1-9 9H57a9 9 0 0 1-9-9z" fill="#d97706" opacity="0.35"/>
              <g fill="#f59e0b" opacity="0.9">
                <circle cx="184" cy="66" r="2.2"/>
                <circle cx="32" cy="64" r="2.2"/>
                <circle cx="196" cy="106" r="1.6"/>
                <circle cx="24" cy="104" r="1.6"/>
              </g>
            </svg>
            <p class="text-sm font-semibold text-neutral-600">This folder is empty</p>
            <p class="mt-1.5 text-xs text-neutral-400">Upload a file or create a folder to get started.</p>
          </td>
        </tr>`;
        return;
      }
      fileList.innerHTML = applySort(shown).map(item => fileRow(item, path)).join('');
      bindRowEvents();
    }

    function bindRowEvents() {
      fileList.querySelectorAll('.row-check').forEach(cb => {
        cb.addEventListener('change', updateSelection);
      });
      fileList.querySelectorAll('.download-item').forEach(btn => {
        btn.addEventListener('click', () => downloadItem(btn.dataset.path, btn.dataset.name));
      });
      fileList.querySelectorAll('.move-up-item').forEach(btn => {
        btn.addEventListener('click', () => moveFolderUp(btn.dataset.path));
      });
      fileList.querySelectorAll('.rename-item').forEach(btn => {
        btn.addEventListener('click', () => renameItem(btn.dataset.path, btn.dataset.name));
      });
      fileList.querySelectorAll('.delete-item').forEach(btn => {
        btn.addEventListener('click', () => deleteItem(btn.dataset.path));
      });
      fileList.querySelectorAll('.preview-item').forEach(btn => {
        btn.addEventListener('click', () => openPreview(btn.dataset.path, btn.dataset.name, btn.dataset.size, btn.dataset.kind));
      });
      fileList.querySelectorAll('tr[data-type="folder"]').forEach(row => {
        row.classList.add('cursor-pointer');
        // Single click opens the folder. Interactive children keep their behavior.
        row.addEventListener('click', (e) => {
          if (e.target.closest('input, button, a, label, select, textarea')) return;
          selectPath(row.dataset.path);
        });
      });
      fileList.querySelectorAll('tr').forEach(row => {
        row.addEventListener('dblclick', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
          if (row.dataset.type !== 'folder') return;
          selectPath(row.dataset.path);
        });
      });
    }

    function updateSelection() {
      selection.clear();
      fileList.querySelectorAll('.row-check:checked').forEach(cb => selection.add(cb.value));
      selectAll.checked = selection.size > 0 && selection.size === fileList.querySelectorAll('.row-check').length;
      document.getElementById('deleteSelectedBtn').disabled = selection.size === 0;
      document.getElementById('moveSelectedBtn').disabled = selection.size === 0;
      document.getElementById('copySelectedBtn').disabled = selection.size === 0;
      fileList.querySelectorAll('tr').forEach(row => {
        row.dataset.selected = String(selection.has(row.dataset.path));
      });
    }

    selectAll.addEventListener('change', () => {
      fileList.querySelectorAll('.row-check').forEach(cb => cb.checked = selectAll.checked);
      updateSelection();
    });

    // ====== DRAG AND DROP MOVE ======
    // Drop checked rows (or a single unselected row) onto a folder row in the list,
    // or onto a folder node in the sidebar tree, to MOVE them. Same share only.
    // Colliding names get a timestamp suffix — never an overwrite. Undoable by dragging back.
    let dragPaths = [];

    function pathsFromDragstart(row) {
      const path = row.dataset.path;
      const checked = [...fileList.querySelectorAll('.row-check:checked')].map(cb => cb.value);
      return checked.length && checked.includes(path) ? checked : [path];
    }

    function clearDropHighlights() {
      document.querySelectorAll('.drop-target-highlight').forEach(el => el.classList.remove('drop-target-highlight'));
    }

    function buildDragChip(count) {
      const chip = document.createElement('div');
      chip.className = 'fixed -left-[9999px] top-0 z-[70] rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xl';
      chip.textContent = count === 1 ? 'Move 1 item' : `Move ${count} items`;
      document.body.appendChild(chip);
      return chip;
    }

    async function moveItemsViaDrag(dest) {
      const paths = dragPaths;
      if (!paths.length || !dest) return;
      // Moving everything into its own parent is a no-op.
      const parents = new Set(paths.map(p => p.split('/').slice(0, -1).join('/')));
      if (parents.size === 1 && parents.has(dest)) { showToast('Items are already in ' + dest, 3000); dragPaths = []; return; }
      await runMoveCopy('move', paths, dest);
      dragPaths = [];
    }

    fileList.addEventListener('dragstart', (e) => {
      const row = e.target.closest('tr[data-path]');
      if (!row || row.dataset.deleting === 'true') { e.preventDefault(); return; }
      dragPaths = pathsFromDragstart(row);
      try { e.dataTransfer.setData('text/plain', dragPaths.join('\n')); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
      const chip = buildDragChip(dragPaths.length);
      try { e.dataTransfer.setDragImage(chip, 12, 12); } catch (_) {}
      setTimeout(() => chip.remove(), 0);
    });
    fileList.addEventListener('dragend', () => { dragPaths = []; clearDropHighlights(); });

    fileList.addEventListener('dragover', (e) => {
      if (!dragPaths.length) return;
      const row = e.target.closest('tr[data-type="folder"]');
      if (!row) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropHighlights();
      row.classList.add('drop-target-highlight');
    });
    fileList.addEventListener('dragleave', (e) => {
      const row = e.target.closest('tr[data-type="folder"]');
      if (row) row.classList.remove('drop-target-highlight');
    });
    fileList.addEventListener('drop', async (e) => {
      const row = e.target.closest('tr[data-type="folder"]');
      if (!row || !dragPaths.length) return;
      e.preventDefault();
      clearDropHighlights();
      await moveItemsViaDrag(row.dataset.path);
    });

    // Drop onto a breadcrumb segment to move items to that folder (the parent case in particular).
    // The '/' root is not a valid destination.
    breadcrumb.addEventListener('dragover', (e) => {
      if (!dragPaths.length) return;
      const a = e.target.closest('a[data-path]');
      if (!a) return;
      const dest = a.dataset.path;
      if (dest === '/') { e.dataTransfer.dropEffect = 'none'; return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropHighlights();
      a.classList.add('drop-target-highlight');
    });
    breadcrumb.addEventListener('dragleave', (e) => {
      const a = e.target.closest('a[data-path]');
      if (a) a.classList.remove('drop-target-highlight');
    });
    breadcrumb.addEventListener('drop', async (e) => {
      const a = e.target.closest('a[data-path]');
      if (!a || !dragPaths.length) return;
      e.preventDefault();
      clearDropHighlights();
      await moveItemsViaDrag(a.dataset.path);
    });

    // Drop onto the toolbar Up button to move items into the parent folder.
    const upLevelBtn = document.getElementById('upLevelBtn');
    upLevelBtn.addEventListener('dragover', (e) => {
      if (!dragPaths.length) return;
      const parent = parentOf(currentPath);
      if (parent === currentPath || parent === '/') { e.dataTransfer.dropEffect = 'none'; return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropHighlights();
      upLevelBtn.classList.add('drop-target-highlight');
    });
    upLevelBtn.addEventListener('dragleave', () => { upLevelBtn.classList.remove('drop-target-highlight'); });
    upLevelBtn.addEventListener('drop', async (e) => {
      const parent = parentOf(currentPath);
      if (!dragPaths.length || parent === currentPath || parent === '/') return;
      e.preventDefault();
      clearDropHighlights();
      await moveItemsViaDrag(parent);
    });

    folderTree.addEventListener('dragover', (e) => {
      if (!dragPaths.length) return;
      const btn = e.target.closest('button[data-path]');
      if (!btn) return;
      const dest = btn.dataset.path;
      if (!safeDest(dest)) { e.dataTransfer.dropEffect = 'none'; return; }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDropHighlights();
      btn.classList.add('drop-target-highlight');
    });
    folderTree.addEventListener('dragleave', (e) => {
      const btn = e.target.closest('button[data-path]');
      if (btn) btn.classList.remove('drop-target-highlight');
    });
    folderTree.addEventListener('drop', async (e) => {
      const btn = e.target.closest('button[data-path]');
      if (!btn || !dragPaths.length) return;
      const dest = btn.dataset.path;
      if (!safeDest(dest)) { showToast('That folder cannot take items.', 4000, 'error'); dragPaths = []; return; }
      e.preventDefault();
      clearDropHighlights();
      await moveItemsViaDrag(dest);
    });

    // ====== SEARCH ======
    // Recursive filename search within the current share. The NAS has no search API
    // (verified 404 on all plausible life endpoints), so this walks the share with the
    // folder listing API. Runs only on explicit submit (Enter or the Search button) to
    // keep NAS load low. Capped at 200 hits; the × button or Escape stops it.
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const searchStatus = document.getElementById('searchStatus');
    const searchForm = document.getElementById('searchForm');
    const searchSubmitBtn = document.getElementById('searchSubmitBtn');
    let searchState = { active: false, token: 0, results: [] };

    function currentShareName() { return currentPath.split('/')[1] || ''; }

    function updateSearchAvailability() {
      const share = currentShareName();
      searchInput.disabled = !share;
      searchSubmitBtn.disabled = !share;
      searchInput.placeholder = share ? 'Search in ' + share : 'Open a share to search';
      if (!share && searchState.active) { clearSearch(); }
    }

    function clearSearch() {
      searchState.active = false;
      searchState.token++;
      searchInput.value = '';
      searchState.results = [];
      searchClear.classList.add('hidden');
      searchStatus.textContent = '';
    }

    async function runSearch(rawQuery) {
      const query = rawQuery.trim();
      const share = currentShareName();
      if (!share || query.length < 2) return;
      const token = ++searchState.token;
      searchState.active = true;
      searchClear.classList.remove('hidden');
      searchStatus.textContent = 'Searching…';
      const q = query.toLowerCase();
      const MAX = 200;
      const matches = [];
      const stack = ['/' + share];
      while (stack.length && matches.length < MAX) {
        if (token !== searchState.token) return;
        const dir = stack.pop();
        let items;
        try { items = await fsList(dir); } catch (_) { continue; }
        for (const it of items) {
          const full = it.path || (dir === '/' ? '/' + it.name : `${dir}/${it.name}`);
          if (it.name.toLowerCase().includes(q)) matches.push({ ...it, parent: dir });
          if (it.type === 'folder' && it.name !== '@SmbRecyclebin') stack.push(full);
        }
        if (token !== searchState.token) return;
        searchStatus.textContent = 'Searching… ' + matches.length + ' found';
      }
      searchState.results = matches;
      searchStatus.textContent = matches.length ? matches.length + ' found' : 'No matches';
      renderSearchResults(matches);
    }

    function renderSearchResults(matches) {
      const visible = visibleItems(matches);
      renderTypeChips(visible);
      const shown = filterByType(visible);
      selectAll.disabled = !shown.length;
      if (!shown.length) {
        if (visible.length) {
          const label = (TYPE_LABEL[activeType] || 'items').toLowerCase();
          fileList.innerHTML = `<tr><td colspan="6" class="px-6 py-14 text-center">
            <p class="text-sm font-semibold text-neutral-500">No ${escapeHtml(label)} in these results</p>
            <p class="mt-1 text-xs text-neutral-400">${visible.length} match${visible.length === 1 ? '' : 'es'} of other types were found.</p>
            <div class="mt-4 flex justify-center"><button class="btn" type="button" id="clearTypeFilter">Show all</button></div>
          </td></tr>`;
        } else {
          fileList.innerHTML = `<tr><td colspan="6" class="px-6 py-14 text-center">
            <p class="text-sm font-semibold text-neutral-500">No matches for “${escapeHtml(searchInput.value.trim())}”</p>
            <p class="mt-1 text-xs text-neutral-400">Check the spelling or try a shorter part of the name.</p>
          </td></tr>`;
        }
      } else {
        fileList.innerHTML = applySort(shown).map(it => fileRow(it, it.parent, {
          typeCell: `<span class="block max-w-[160px] truncate text-[11px] text-neutral-500" title="${escapeHtml(it.parent)}">${escapeHtml(it.parent)}</span>`
        })).join('');
      }
      bindRowEvents();
    }

    // Search runs only on explicit submit (Enter or the Search button) — not while typing.
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (query.length < 2) { searchStatus.textContent = 'Type at least 2 characters'; return; }
      runSearch(query);
    });
    searchInput.addEventListener('input', () => {
      const value = searchInput.value;
      searchClear.classList.toggle('hidden', !value);
      if (!value.trim()) {
        const wasActive = searchState.active;
        clearSearch();
        if (wasActive) loadFiles(currentPath);
      }
    });
    searchClear.addEventListener('click', () => { clearSearch(); loadFiles(currentPath); });

    // ====== BREADCRUMB ======
    function updateBreadcrumb(path) {
      const parts = path.split('/').filter(Boolean);
      const crumbs = [{ label: 'Home', path: '/' }];
      let acc = '';
      parts.forEach(part => {
        acc += '/' + part;
        crumbs.push({ label: part, path: acc });
      });
      breadcrumb.innerHTML = crumbs.map((c, i) =>
        `${i ? '<span class="text-neutral-300" aria-hidden="true">›</span>' : ''}<a class="rounded px-0.5 text-blue-600 hover:text-blue-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" href="#" data-path="${escapeHtml(c.path)}">${escapeHtml(c.label)}</a>`
      ).join('');
      breadcrumb.querySelectorAll('a').forEach(a =>
        a.addEventListener('click', (e) => { e.preventDefault(); selectPath(a.dataset.path); }));
    }

    // ====== RECYCLE BIN ======
    // Reads @SmbRecyclebin per share. Deletes from this app and from Finder/SMB land here; Purge and Empty bin are the permanent paths.
    const RECYCLE_SHARES = ['home', 'Homes', 'VPHome', 'SharedFolder'];
    const binModal = document.getElementById('recycleModal');
    const binBody = document.getElementById('recycleBody');
    const binShareSelect = document.getElementById('recycleShareSelect');
    const binRefreshBtn = document.getElementById('recycleRefreshBtn');
    const binEmptyBtn = document.getElementById('recycleEmptyBtn');
    RECYCLE_SHARES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      binShareSelect.appendChild(opt);
    });
    let recycleShare = 'home';
    let recycleItems = [];

    function binPathOf(share) { return '/' + share + '/@SmbRecyclebin'; }
    function binOriginalOf(share, fullPath) {
      const prefix = binPathOf(share);
      return fullPath.startsWith(prefix) ? share + fullPath.slice(prefix.length) : fullPath;
    }

    async function walkBin(path, depth, out) {
      if (depth > 12 || out.length >= 2000) return;
      let items;
      try { items = await fsList(path); } catch (e) { return; }
      for (const it of items) {
        const full = it.path || `${path}/${it.name}`;
        out.push({ type: it.type === 'folder' ? 'folder' : 'file', path: full, name: it.name, size: it.size ?? null, date: it.access_date ?? null });
        if (it.type === 'folder') await walkBin(full, depth + 1, out);
      }
    }

    async function loadRecycleBin() {
      binBody.innerHTML = '<p class="text-neutral-400">Loading…</p>';
      recycleItems = [];
      await walkBin(binPathOf(recycleShare), 0, recycleItems);
      renderRecycleBin();
    }

    function renderRecycleBin() {
      binEmptyBtn.disabled = recycleItems.length === 0;
      if (!recycleItems.length) {
        binBody.innerHTML = `<p class="py-10 text-center text-sm text-neutral-400">The “${escapeHtml(recycleShare)}” bin is empty or not available for this share.</p>`;
        return;
      }
      const undoIcon = icon('undo');
      const purgeIcon = icon('trash');
      binBody.innerHTML = `<table class="w-full border-collapse text-xs"><thead><tr>
        <th class="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-left font-semibold uppercase tracking-wider text-neutral-500">Name</th>
        <th class="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-left font-semibold uppercase tracking-wider text-neutral-500">Original location</th>
        <th class="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-right font-semibold uppercase tracking-wider text-neutral-500">Size</th>
        <th class="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-left font-semibold uppercase tracking-wider text-neutral-500">Deleted</th>
        <th class="border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-left font-semibold uppercase tracking-wider text-neutral-500">Actions</th>
      </tr></thead><tbody>` +
        recycleItems.map((it, i) => `<tr class="odd:bg-neutral-50/60 hover:bg-blue-50">
          <td class="border-b border-neutral-100 px-2 py-2 font-medium text-neutral-800"><span class="flex items-center gap-2">${it.type === 'folder' ? svgFolder() : svgFile(it.name)}<span class="max-w-[220px] truncate" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</span></span></td>
          <td class="border-b border-neutral-100 px-2 py-2 text-neutral-600"><span class="max-w-[260px] truncate block" title="${escapeHtml(binOriginalOf(recycleShare, it.path))}">${escapeHtml(binOriginalOf(recycleShare, it.path))}</span></td>
          <td class="border-b border-neutral-100 px-2 py-2 text-right tabular-nums text-neutral-600">${it.type === 'folder' ? '—' : formatSize(it.size)}</td>
          <td class="border-b border-neutral-100 px-2 py-2 text-neutral-600">${formatDate(it.date)}</td>
          <td class="border-b border-neutral-100 px-2 py-2"><span class="flex gap-1.5">
            <button class="btn-icon" data-restore="${i}" data-tooltip="Restore" aria-label="Restore ${escapeHtml(it.name)}">${undoIcon}</button>
            <button class="btn-icon btn-icon-danger" data-purge="${i}" data-tooltip="Delete permanently" aria-label="Delete ${escapeHtml(it.name)} permanently">${purgeIcon}</button>
          </span></td>
        </tr>`).join('') + '</tbody></table>';
      binBody.querySelectorAll('[data-restore]').forEach(btn => btn.addEventListener('click', () => restoreBinItem(Number(btn.dataset.restore))));
      binBody.querySelectorAll('[data-purge]').forEach(btn => btn.addEventListener('click', () => askPurgeBinItem(Number(btn.dataset.purge))));
    }

    // Restore = reverse move, mirroring the verified bin path layout.
    async function restoreBinItem(i) {
      const it = recycleItems[i];
      if (!it) return;
      const rel = binOriginalOf(recycleShare, it.path).slice(recycleShare.length); // keeps leading '/'
      const target = '/' + recycleShare + rel;
      try {
        showToast('Restoring ' + it.name + '…');
        const res = await authFetch(`${PROXY_URL}/life/v1/folder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'move', items: [{ source: { root: 'local', path: it.path }, target: { root: 'local', path: target } }] })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.result === false) throw new Error(data.error || ('HTTP ' + res.status));
        showToast('Restored to ' + target, 4000, 'success');
        await loadRecycleBin();
      } catch (e) {
        showToast('Restore failed: ' + e.message, 8000, 'error');
      }
    }

    const purgeConfirmModal = document.getElementById('purgeConfirmModal');
    const purgeConfirmName = document.getElementById('purgeConfirmName');
    let purgeTarget = null;
    function askPurgeBinItem(i) {
      purgeTarget = recycleItems[i];
      if (!purgeTarget) return;
      purgeConfirmName.textContent = purgeTarget.name;
      purgeConfirmModal.classList.remove('hidden');
    }
    document.getElementById('purgeConfirmCancel').addEventListener('click', () => { purgeConfirmModal.classList.add('hidden'); purgeTarget = null; });
    document.getElementById('purgeConfirmOk').addEventListener('click', async () => {
      if (!purgeTarget) return;
      const target = purgeTarget;
      purgeConfirmModal.classList.add('hidden');
      purgeTarget = null;
      try {
        await deletePaths([target.path]);
        showToast('Deleted ' + target.name + ' forever', 4000, 'success');
        await loadRecycleBin();
      } catch (e) {
        showToast('Delete failed: ' + e.message, 8000, 'error');
      }
    });

    const emptyBinModal = document.getElementById('emptyBinModal');
    const emptyBinOk = document.getElementById('emptyBinOk');
    document.getElementById('emptyBinShareName').textContent = '';
    function openEmptyBin() {
      document.getElementById('emptyBinShareName').textContent = recycleShare;
      emptyBinModal.classList.remove('hidden');
      emptyBinOk.focus();
    }
    document.getElementById('emptyBinCancel').addEventListener('click', () => emptyBinModal.classList.add('hidden'));
    emptyBinOk.addEventListener('click', async () => {
      if (!recycleItems.length) { emptyBinModal.classList.add('hidden'); return; }
      const paths = recycleItems.map(it => it.path);
      const count = paths.length;
      emptyBinModal.classList.add('hidden');
      binModal.classList.add('hidden'); // the browser goes away; the purge modal takes over
      // Show the purge in the blocking transfers modal, like any other long operation.
      const id = startTransfer(`Empty recycle bin — ${recycleShare} (${count} item${count === 1 ? '' : 's'})`, 'delete');
      try {
        await deletePaths(paths);
        finishTransfer(id, true);
      } catch (e) {
        finishTransfer(id, false, e.message);
      }
      await loadRecycleBin();
    });

    binShareSelect.addEventListener('change', () => { recycleShare = binShareSelect.value; loadRecycleBin(); });
    binRefreshBtn.addEventListener('click', loadRecycleBin);
    binEmptyBtn.addEventListener('click', openEmptyBin);
    document.getElementById('recycleBinBtn').addEventListener('click', () => { binModal.classList.remove('hidden'); loadRecycleBin(); });
    document.getElementById('recycleCloseBtn').addEventListener('click', () => binModal.classList.add('hidden'));
    binModal.addEventListener('click', (e) => { if (e.target === binModal) binModal.classList.add('hidden'); });

    // ====== PREVIEW (image / PDF / text / CSV) ======
    // Fetches the original file through the same /life/v1/file path as Download,
    // then shows it in memory only: blob URL for image/PDF, raw text for the rest.
    // Nothing is written to disk; blob URLs are revoked on close. The thumbnail
    // service stays deferred per the PRD.
    const imagePreviewModal = document.getElementById('imagePreviewModal');
    const imagePreviewImg = document.getElementById('imagePreviewImg');
    const imagePreviewStatus = document.getElementById('imagePreviewStatus');
    const imagePreviewName = document.getElementById('imagePreviewName');
    const imagePreviewMeta = document.getElementById('imagePreviewMeta');
    const textPreviewView = document.getElementById('textPreviewView');
    const csvPreviewView = document.getElementById('csvPreviewView');
    const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
    const videoPreviewPlayer = document.getElementById('videoPreviewPlayer');
    const audioPreviewPlayer = document.getElementById('audioPreviewPlayer');
    const previewTruncation = document.getElementById('previewTruncation');
    let imagePreviewUrl = null;

    function closePreview() {
      imagePreviewModal.classList.add('hidden');
      [imagePreviewImg, textPreviewView, csvPreviewView, pdfPreviewFrame, videoPreviewPlayer, audioPreviewPlayer, previewTruncation].forEach(el => el.classList.add('hidden'));
      imagePreviewImg.removeAttribute('src');
      pdfPreviewFrame.removeAttribute('srcdoc');
      pdfPreviewFrame.src = 'about:blank';
      videoPreviewPlayer.pause();
      videoPreviewPlayer.removeAttribute('src');
      videoPreviewPlayer.load();
      audioPreviewPlayer.pause();
      audioPreviewPlayer.removeAttribute('src');
      audioPreviewPlayer.load();
      textPreviewView.textContent = '';
      csvPreviewView.innerHTML = '';
      imagePreviewStatus.classList.remove('hidden');
      imagePreviewStatus.textContent = 'Loading…';
      if (imagePreviewUrl) { URL.revokeObjectURL(imagePreviewUrl); imagePreviewUrl = null; }
    }

    function showPreviewView(el) {
      [imagePreviewImg, textPreviewView, csvPreviewView, pdfPreviewFrame, videoPreviewPlayer, audioPreviewPlayer].forEach(v => v.classList.add('hidden'));
      imagePreviewStatus.classList.add('hidden');
      el.classList.remove('hidden');
    }

    // Minimal delimited-text parser: handles quoted fields, escaped quotes, CRLF.
    function parseDelimited(text, delim) {
      const rows = [];
      let row = [], field = '', inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
          } else field += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === delim) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(field); field = '';
          if (row.length > 1 || row[0] !== '') rows.push(row);
          row = [];
        } else field += ch;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows;
    }

    function renderCsvPreview(text, delim) {
      const rows = parseDelimited(text, delim);
      if (!rows.length) {
        csvPreviewView.innerHTML = '<p class="p-6 text-center text-sm text-neutral-500">This file is empty.</p>';
        previewTruncation.textContent = '';
        previewTruncation.classList.add('hidden');
        showPreviewView(csvPreviewView);
        return;
      }
      const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
      const cappedCols = Math.min(colCount, PREVIEW_CSV_COL_CAP);
      const totalRows = rows.length;
      const visible = rows.slice(0, PREVIEW_CSV_ROW_CAP);
      const notes = [];
      if (totalRows > PREVIEW_CSV_ROW_CAP) notes.push('first ' + PREVIEW_CSV_ROW_CAP + ' of ' + totalRows + ' rows');
      if (colCount > PREVIEW_CSV_COL_CAP) notes.push('first ' + PREVIEW_CSV_COL_CAP + ' of ' + colCount + ' columns');
      if (notes.length) { previewTruncation.textContent = 'Showing ' + notes.join('; '); previewTruncation.classList.remove('hidden'); }
      else { previewTruncation.textContent = ''; previewTruncation.classList.add('hidden'); }
      const cell = (v, tag) => `<${tag} class="max-w-[240px] truncate border border-neutral-200 px-2 py-1 text-left align-top text-[11px] leading-4 ${tag === 'th' ? 'font-semibold text-neutral-900 bg-neutral-50' : 'text-neutral-700'}" title="${escapeHtml(v)}">${escapeHtml(v)}</${tag}>`;
      const head = visible[0].slice(0, cappedCols).map(v => cell(v, 'th')).join('');
      const body = visible.slice(1).map(r => '<tr>' + Array.from({ length: cappedCols }, (_, i) => cell(r[i] ?? '', 'td')).join('') + '</tr>').join('');
      csvPreviewView.innerHTML = `<p class="mb-2 text-[10px] uppercase tracking-wider text-neutral-500">First row shown as header</p>` +
        `<table class="w-full border-collapse"><thead class="sticky top-0 bg-neutral-50"><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      showPreviewView(csvPreviewView);
    }

    async function openPreview(path, name, size, kind) {
      closePreview(); // resets every view to Loading; also revokes any previous URL
      imagePreviewModal.classList.remove('hidden');
      imagePreviewName.textContent = name;
      imagePreviewMeta.textContent = size === '' || size === undefined ? '' : formatSize(size);
      try {
        const query = { root: 'local', path };
        const res = await authFetch(`${PROXY_URL}/life/v1/file?query=${encodeURIComponent(JSON.stringify(query))}&download=true`, {
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error?.msg || data.error || 'NAS refused the file');
        }
        const blob = await res.blob();
        if (kind === 'image' || kind === 'pdf' || kind === 'video' || kind === 'audio') {
          imagePreviewUrl = URL.createObjectURL(blob);
          if (kind === 'image') {
            imagePreviewImg.onload = () => showPreviewView(imagePreviewImg);
            imagePreviewImg.onerror = () => { imagePreviewStatus.textContent = 'Could not display this image.'; imagePreviewStatus.classList.remove('hidden'); };
            imagePreviewImg.src = imagePreviewUrl;
          } else if (kind === 'pdf') {
            pdfPreviewFrame.src = imagePreviewUrl;
            showPreviewView(pdfPreviewFrame);
          } else if (kind === 'audio') {
            audioPreviewPlayer.onerror = () => { imagePreviewStatus.textContent = 'Could not play this audio (format not supported in this browser). MP3 and M4A are supported.'; imagePreviewStatus.classList.remove('hidden'); audioPreviewPlayer.classList.add('hidden'); };
            audioPreviewPlayer.src = imagePreviewUrl;
            showPreviewView(audioPreviewPlayer);
          } else {
            videoPreviewPlayer.onerror = () => { imagePreviewStatus.textContent = 'Could not play this video (format not supported in this browser). MP4 and WebM are supported.'; imagePreviewStatus.classList.remove('hidden'); videoPreviewPlayer.classList.add('hidden'); };
            videoPreviewPlayer.onloadeddata = () => showPreviewView(videoPreviewPlayer);
            videoPreviewPlayer.src = imagePreviewUrl;
            // If the browser accepts the source, showPreviewView runs on 'loadeddata'.
            // Show the player immediately as a fallback in case the event does not fire.
            showPreviewView(videoPreviewPlayer);
          }
          return;
        }
        // Text-like kinds: show the whole file up to the cap.
        const truncated = blob.size > PREVIEW_TEXT_CAP;
        const text = await (truncated ? blob.slice(0, PREVIEW_TEXT_CAP) : blob).text();
        if (kind === 'csv' || kind === 'tsv') {
          renderCsvPreview(text, kind === 'tsv' ? '\t' : ',');
          if (truncated) { previewTruncation.textContent = (previewTruncation.textContent ? previewTruncation.textContent + '; ' : '') + 'first 512 KB of file'; previewTruncation.classList.remove('hidden'); }
          return;
        }
        if (truncated) { previewTruncation.textContent = 'Showing first 512 KB'; previewTruncation.classList.remove('hidden'); }
        textPreviewView.textContent = text.length ? text : '(empty file)';
        showPreviewView(textPreviewView);
      } catch (e) {
        imagePreviewStatus.textContent = 'Preview failed: ' + e.message;
        imagePreviewStatus.classList.remove('hidden');
        showToast('Preview failed: ' + e.message, 8000, 'error');
      }
    }

    document.getElementById('imagePreviewCloseBtn').addEventListener('click', closePreview);
    imagePreviewModal.addEventListener('click', (e) => { if (e.target === imagePreviewModal) closePreview(); });

    // ====== TRANSFERS ======
    // XHR instead of fetch: only XHR reports upload/download progress.
    // Cancel = xhr.abort(). While any transfer is active, beforeunload asks the
    // browser to confirm before the tab is closed or reloaded (this also fires on
    // hard refresh and browser close — the platform does not distinguish them).
    // The modal is blocking while transfers run and stays open until the user closes it.
    const transferModal = document.getElementById('transferModal');
    const transferList = document.getElementById('transferList');
    const transferCloseBtn = document.getElementById('transferCloseBtn');
    const transfers = new Map();
    let transferSeq = 0;

    function hasActiveTransfers() {
      for (const t of transfers.values()) if (t.state === 'active') return true;
      return false;
    }

    function formatEta(sec) {
      if (!Number.isFinite(sec) || sec < 0) return '';
      if (sec < 60) return '~' + Math.max(1, Math.round(sec)) + 's';
      const m = Math.floor(sec / 60), s = Math.round(sec % 60);
      return '~' + m + 'm ' + s + 's';
    }

    function startTransfer(name, kind, payload) {
      const id = String(++transferSeq);
      transfers.set(id, { id, name, kind, loaded: 0, total: 0, rate: 0, lastAt: 0, lastLoaded: 0, state: 'active', xhr: null, message: '', payload: payload || null });
      renderTransferModal();
      return id;
    }

    function updateTransfer(id, loaded, total) {
      const t = transfers.get(id);
      if (!t || t.state !== 'active') return;
      const now = performance.now();
      if (t.lastAt) {
        const dt = (now - t.lastAt) / 1000;
        const dl = loaded - t.lastLoaded;
        if (dt > 0.05 && dl >= 0) {
          const inst = dl / dt;
          t.rate = t.rate > 0 ? 0.7 * t.rate + 0.3 * inst : inst;
        }
      }
      t.lastAt = now; t.lastLoaded = loaded; t.loaded = loaded; t.total = total;
      renderTransferModal();
    }

    function finishTransfer(id, ok, message) {
      const t = transfers.get(id);
      if (!t) return;
      t.state = ok ? 'done' : 'error';
      t.message = message || '';
      t.loaded = ok && t.total > 0 ? t.total : t.loaded;
      renderTransferModal();
    }

    async function retryUpload(t) {
      const { file, path } = t.payload;
      transfers.delete(t.id); // drop the failed row; the retry registers a fresh one
      renderTransferModal();
      try {
        await uploadOne(file, path);
        if (currentPath === path) {
          await loadFiles(path);
          setTimeout(() => { if (currentPath === path) loadFiles(path); }, 1200);
        }
        showToast('Uploaded ' + file.name, 3000, 'success');
      } catch (e) {
        showToast('Retry failed: ' + e.message, 8000, 'error');
      }
    }

    function closeTransferModal() {
      transfers.clear();
      renderTransferModal();
    }

    function transferTile(t) {
      if (t.state === 'done') return 'bg-emerald-50 text-emerald-600';
      if (t.state === 'error') return 'bg-red-50 text-red-500';
      if (t.kind === 'delete') return 'bg-red-50 text-red-600';
      return t.kind === 'upload' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600';
    }

    function transferIcon(t) {
      if (t.state === 'done') return icon('check');
      if (t.state === 'error') return icon('errorCircle');
      if (t.kind === 'delete') return icon('trash');
      return t.kind === 'upload'
        ? icon('upload')
        : icon('download');
    }

    function renderTransferModal() {
      const items = Array.from(transfers.values());
      transferModal.classList.toggle('hidden', items.length === 0);
      const active = hasActiveTransfers();
      const errors = items.some(t => t.state === 'error');
      const allUploads = items.length > 0 && items.every(t => t.kind === 'upload');
      const allDeletes = items.length > 0 && items.every(t => t.kind === 'delete');

      const titleIcon = document.getElementById('transferTitleIcon');
      titleIcon.innerHTML = active
        ? (allDeletes
          ? icon('trash', 'h-6 w-6')
          : icon('upload', 'h-6 w-6'))
        : errors
          ? icon('warning', 'h-6 w-6')
          : icon('check', 'h-6 w-6');
      titleIcon.className = 'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ' +
        (active ? (allDeletes ? 'bg-red-500' : 'bg-blue-600') : errors ? 'bg-amber-500' : 'bg-emerald-500');

      document.getElementById('transferTitleText').textContent =
        active ? (allDeletes ? 'Emptying the recycle bin' : 'Transfers in progress')
          : errors ? (allDeletes ? 'Empty bin finished with errors' : 'Transfers finished with errors')
            : allDeletes ? 'Bin emptied' : 'Transfers complete';
      document.getElementById('transferSubtitle').textContent =
        active ? 'Please keep this tab open.'
          : errors ? (allDeletes ? 'Some items could not be deleted. Review the list below.' : 'Some files failed. Review the list below, then close.')
            : allDeletes ? 'Everything was permanently deleted. You can safely close this tab.'
              : allUploads ? 'The files are fully uploaded. You can safely close this tab.'
                : 'The files are fully downloaded. You can safely close this tab.';
      document.getElementById('transferFooterNote').classList.toggle('hidden', !active);
      transferCloseBtn.classList.toggle('hidden', active || items.length === 0);

      // Aggregate bar across all transfers with a known size (queue-level progress).
      const sized = items.filter(t => t.total > 0);
      const agg = document.getElementById('transferAggregate');
      if (sized.length > 1) {
        const tl = sized.reduce((s, t) => s + t.loaded, 0);
        const tt = sized.reduce((s, t) => s + t.total, 0);
        agg.classList.remove('hidden');
        document.getElementById('transferAggregateBar').style.width = Math.min(100, (100 * tl) / tt).toFixed(1) + '%';
        document.getElementById('transferAggregateMeta').textContent = `${formatSize(tl)} of ${formatSize(tt)} · ${Math.floor((100 * tl) / tt)}%`;
      } else {
        agg.classList.add('hidden');
      }

      transferList.innerHTML = items.map(t => {
        const pct = t.total > 0 ? Math.min(100, (100 * t.loaded) / t.total) : (t.state !== 'active' ? 100 : null);
        const barColor = t.state === 'done' ? 'bg-emerald-500' : t.state === 'error' ? 'bg-red-400' : 'bg-blue-600';
        const bar = pct === null
          ? `<div class="h-full w-2/5 animate-pulse rounded-full ${barColor}"></div>`
          : `<div class="h-full rounded-full transition-[width] duration-200 ${barColor}" style="width:${pct.toFixed(1)}%"></div>`;
        let meta, pctText;
        if (t.state === 'done') { meta = t.kind === 'delete' ? 'Done' : 'Done · ' + (t.total > 0 ? formatSize(t.total) : formatSize(t.loaded)); pctText = ''; }
        else if (t.state === 'error') { meta = 'Failed' + (t.message ? ': ' + t.message : ''); pctText = ''; }
        else {
          if (t.kind === 'delete') { meta = 'Deleting items…'; pctText = ''; }
          else {
            const bytes = t.total > 0 ? formatSize(t.loaded) + ' of ' + formatSize(t.total) : formatSize(t.loaded) + ' so far';
            const eta = t.rate > 0 && t.total > t.loaded ? ' · ' + formatEta((t.total - t.loaded) / t.rate) + ' left' : '';
            meta = bytes + eta;
            pctText = pct === null ? '…' : ' · ' + Math.floor(pct) + '%';
          }
        }
        const cancel = t.state === 'active'
          ? `<button class="shrink-0 text-xs font-semibold text-red-600 transition-colors hover:text-red-800 hover:underline" data-cancel="${t.id}" aria-label="Cancel ${escapeHtml(t.name)}">Cancel</button>`
          : (t.state === 'error' && t.kind === 'upload' && t.payload
            ? `<button class="shrink-0 text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800 hover:underline" data-retry="${t.id}" aria-label="Retry upload of ${escapeHtml(t.name)}">Retry</button>`
            : '');
        return `<li class="flex items-center gap-3 px-6 py-4">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${transferTile(t)}">${transferIcon(t)}</span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-neutral-800" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</p>
            <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-neutral-100">${bar}</div>
            <p class="mt-1 flex items-center justify-between gap-3 text-xs tabular-nums text-neutral-500"><span class="truncate">${escapeHtml(meta)}</span>${pctText ? `<span class="shrink-0 font-semibold text-neutral-700">${escapeHtml(pctText.replace(' · ', ''))}</span>` : ''}</p>
          </div>
          ${cancel}
        </li>`;
      }).join('');
    }

    transferList.addEventListener('click', (e) => {
      const cancelBtn = e.target.closest('[data-cancel]');
      if (cancelBtn) {
        const t = transfers.get(cancelBtn.dataset.cancel);
        if (t && t.xhr) { try { t.xhr.abort(); } catch (_) {} }
        return;
      }
      const retryBtn = e.target.closest('[data-retry]');
      if (retryBtn) {
        const t = transfers.get(retryBtn.dataset.retry);
        if (t && t.payload && t.kind === 'upload') retryUpload(t);
      }
    });
    transferCloseBtn.addEventListener('click', closeTransferModal);
    transferModal.addEventListener('click', (e) => { if (e.target === transferModal && !hasActiveTransfers()) closeTransferModal(); });

    window.addEventListener('beforeunload', (e) => {
      if (hasActiveTransfers()) { e.preventDefault(); e.returnValue = ''; }
    });

    // ====== SIGN IN / OUT ======
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      loginError.classList.add('hidden');
      const user = loginUsername.value.trim();
      const pass = loginPassword.value;
      const remember = loginKeepSignedIn.checked;
      if (!user || !pass) return;
      loginSubmit.disabled = true;
      try {
        const token = await authenticate(user, pass);
        loginPassword.value = '';
        startSession(user, token, remember);
        try { await loadTree(); } catch (err) { showToast('Could not load folders: ' + err.message, 8000, 'error'); }
        loadFiles('/home');
      } catch (err) {
        loginError.textContent = err.message;
        loginError.classList.remove('hidden');
      } finally {
        loginSubmit.disabled = false;
      }
    });

    // Show/hide the login password.
    const toggleLoginPassword = document.getElementById('toggleLoginPassword');
    toggleLoginPassword.addEventListener('click', () => {
      const showing = loginPassword.type === 'text';
      loginPassword.type = showing ? 'password' : 'text';
      toggleLoginPassword.setAttribute('aria-pressed', String(!showing));
      toggleLoginPassword.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      toggleLoginPassword.dataset.tooltip = showing ? 'Show password' : 'Hide password';
      loginPassword.focus();
    });

    document.getElementById('signOutBtn').addEventListener('click', () => {
      closeGearMenu();
      endSession();
      showLogin('Signed out.');
    });

    // ====== CHANGE PASSWORD ======
    // NAS rule (from the Control Panel UI): 8–32 chars, charset [A-Za-z0-9!@#$%^&*()_+\-=/ .],
    // must contain an uppercase letter, a lowercase letter and a digit.
    const NAS_PASSWORD_RE = /(?=^[a-zA-Z0-9!@#$%^&*()_+\-=/\\.]{8,32}$)((?=.*\d))(?=.*[A-Z])(?=.*[a-z]).*$/;
    const changePasswordModal = document.getElementById('changePasswordModal');
    const currentPasswordInput = document.getElementById('currentPasswordInput');
    const newPasswordInput = document.getElementById('newPasswordInput');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    const newPasswordError = document.getElementById('newPasswordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');
    const changePasswordError = document.getElementById('changePasswordError');
    const changePasswordConfirm = document.getElementById('changePasswordConfirm');

    function newPasswordProblem(pw) {
      if (!pw) return '';
      return NAS_PASSWORD_RE.test(pw) ? '' : 'Needs 8–32 characters, uppercase and lowercase letters, and a digit.';
    }
    function validateChangePassword() {
      const problem = newPasswordProblem(newPasswordInput.value);
      newPasswordError.textContent = problem;
      newPasswordError.classList.toggle('hidden', !problem);
      const mismatch = confirmPasswordInput.value !== newPasswordInput.value;
      confirmPasswordError.textContent = mismatch ? 'Passwords do not match.' : '';
      confirmPasswordError.classList.toggle('hidden', !mismatch);
      changePasswordConfirm.disabled =
        !currentPasswordInput.value ||
        !!problem ||
        !confirmPasswordInput.value ||
        mismatch;
    }
    [currentPasswordInput, newPasswordInput, confirmPasswordInput].forEach(el => el.addEventListener('input', validateChangePassword));

    function openChangePasswordModal() {
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';
      [newPasswordError, confirmPasswordError, changePasswordError].forEach(el => el.classList.add('hidden'));
      changePasswordConfirm.disabled = true;
      changePasswordModal.classList.remove('hidden');
      currentPasswordInput.focus();
    }
    function closeChangePasswordModal() { changePasswordModal.classList.add('hidden'); }

    async function changeAdminPassword() {
      changePasswordConfirm.disabled = true;
      changePasswordError.classList.add('hidden');
      const current = currentPasswordInput.value;
      const next = newPasswordInput.value;
      try {
        // Step 1: verify the current password. Read-only call, changes nothing.
        const verifyRes = await fetch(`${PROXY_URL}/auth/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: currentUser, password: current })
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        const gotToken = verifyData && verifyData.data && verifyData.data.access_token;
        if (!verifyRes.ok || verifyData.result === false || !gotToken) {
          throw new Error('Current password is incorrect.');
        }
        // Step 2: change the password. This invalidates all sessions.
        const res = await authFetch(`${PROXY_URL}/user/modify_user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            },
          body: JSON.stringify({ username: currentUser, option: { password: next } })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.result === false) {
          throw new Error(data.error || data.message || ('HTTP ' + res.status));
        }
        localStorage.removeItem('homenas.adminPass'); // obsolete copy, if any
        endSession();
        closeChangePasswordModal();
        showLogin('Password changed. Sign in with the new password.');
      } catch (e) {
        changePasswordError.textContent = 'Change failed: ' + e.message;
        changePasswordError.classList.remove('hidden');
        changePasswordConfirm.disabled = false;
      }
    }

    document.getElementById('changePasswordBtn').addEventListener('click', () => { closeGearMenu(); openChangePasswordModal(); });
    document.getElementById('changePasswordCancel').addEventListener('click', closeChangePasswordModal);
    changePasswordConfirm.addEventListener('click', changeAdminPassword);

    // ====== HEALTH (admin) ======
    // Read-only probes, taken from the Control Panel code (untested against live NAS):
    //   GET /hwmonitor/get_sensors            -> object {key: value|object}; keys/units not documented, rendered raw
    //   batch/commit storage/get_diskinfo_list -> [{NAME, TYPE, HIGH, MAX_HIGH, MIN_HIGH, BADSECTOR_THRESHOLD, SMART}]
    //   batch/commit storage/get_smart_attr    -> {<disk>: [{id, attribute, value, worst, threash, raw, status}]}
    const healthModal = document.getElementById('healthModal');
    const healthBody = document.getElementById('healthBody');
    const healthRefreshBtn = document.getElementById('healthRefreshBtn');

    function sensorValue(v) {
      if (v === null || v === undefined) return '—';
      if (typeof v === 'object') return escapeHtml(JSON.stringify(v));
      return escapeHtml(String(v));
    }

    async function loadHealth() {
      healthRefreshBtn.disabled = true;
      healthRefreshBtn.textContent = 'Refreshing…';
      healthBody.innerHTML = '<p class="text-neutral-400">Loading…</p>';
      try {
        // Thermal sensors (direct endpoint, as the Control Panel calls it)
        let sensors = null;
        const sensorWarnings = [];
        try {
          // POST, not GET — the NAS 404s otherwise (verified live 2026-11-11)
          const res = await authFetch(`${PROXY_URL}/hwmonitor/get_sensors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
          });
          const data = await res.json().catch(() => null);
          if (data && data.result === false) {
            sensorWarnings.push('Sensors probe returned an error: ' + String(data.error || data.err || 'unknown'));
          } else {
            sensors = data && data.data !== undefined ? data.data : null;
          }
        } catch (e) {
          sensorWarnings.push('Sensors failed: ' + e.message);
        }

        // Volume + disk info + SMART attributes (one batch call)
        let disks = [], smartByDisk = {}, volume = null;
        try {
          const data = await nasBatch([
            ['storage', 'get_volume_info_list', [], {}],
            ['storage', 'get_diskinfo_list', [], {}],
            ['storage', 'get_smart_attr', [], {}]
          ]);
          const items = Array.isArray(data.data) ? data.data : [];
          const volItem = items[0] || {}, diskItem = items[1] || {}, smartItem = items[2] || {};
          if (volItem.result === false) sensorWarnings.push('Volume probe failed: ' + String(volItem.error || 'unknown'));
          else volume = Array.isArray(volItem.data) ? (volItem.data[0] || null) : (volItem.data || null);
          if (diskItem.result === false) sensorWarnings.push('Disk probe failed: ' + String(diskItem.error || 'unknown'));
          else disks = Array.isArray(diskItem.data) ? diskItem.data : [];
          if (smartItem.result === false) sensorWarnings.push('SMART probe failed: ' + String(smartItem.error || 'unknown'));
          else smartByDisk = smartItem.data && typeof smartItem.data === 'object' ? smartItem.data : {};
        } catch (e) {
          sensorWarnings.push('Storage / SMART probe failed: ' + e.message);
        }

        // ====== DISK HISTORY (failure-risk experiment) ======
        // One compact snapshot per day. The proxy stores it on this Mac; the NAS is never written to.
        const smartRawOf = (diskName, id) => {
          const list = Array.isArray(smartByDisk[diskName]) ? smartByDisk[diskName] : [];
          const attr = list.find(a => String(a.id) === String(id));
          if (!attr) return null;
          const m = String(attr.raw ?? '').match(/-?\d+/);
          return m ? Number(m[0]) : null;
        };
        let historySamples = [];
        try {
          const histRes = await fetch(`${PROXY_URL}/health/history`);
          const histData = await histRes.json();
          if (histData && histData.result) historySamples = Array.isArray(histData.samples) ? histData.samples : [];
        } catch (e) { historySamples = []; }
        const nowDate = new Date();
        const todayKey = nowDate.getFullYear() + '-' + String(nowDate.getMonth() + 1).padStart(2, '0') + '-' + String(nowDate.getDate()).padStart(2, '0');
        const lastHistoryDate = historySamples.length ? String(historySamples[historySamples.length - 1].date || '') : '';
        const willSnapshot = disks.length > 0 && lastHistoryDate !== todayKey;
        if (willSnapshot) {
          const snapshot = {
            date: todayKey,
            disks: disks.map(d => ({
              name: d.NAME, model: d.MODEL, smart: d.SMART, state: d.STATE,
              temp_c: parseFloat(d.TEMPERATURE), alert_c: parseFloat(d.HIGH), shutdown_c: parseFloat(d.MAX_HIGH),
              power_on_hours: smartRawOf(d.NAME, 9),
              power_cycles: smartRawOf(d.NAME, 12),
              load_cycles: smartRawOf(d.NAME, 193),
              reallocated: smartRawOf(d.NAME, 5),
              pending: smartRawOf(d.NAME, 197),
              offline_uncorrectable: smartRawOf(d.NAME, 198),
              crc_errors: smartRawOf(d.NAME, 199),
              lbas_written: smartRawOf(d.NAME, 241),
              lbas_read: smartRawOf(d.NAME, 242)
            }))
          };
          authFetch(`${PROXY_URL}/health/history`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }).catch(() => {});
        }
        const historyCount = historySamples.length + (willSnapshot ? 1 : 0);
        const historyLast = willSnapshot ? todayKey : lastHistoryDate;

        // Rule-based failure-risk rating. Advisory only, conventional thresholds.
        // Level 2 = high, 1 = medium, 0 = low. Every rating carries explicit reasons.
        const riskOf = (d) => {
          const reasons = [];
          let level = 0;
          const bump = (lvl, why) => { level = Math.max(level, lvl); reasons.push(why); };
          const name = d.NAME;
          const raw = id => smartRawOf(name, id);

          if (String(d.SMART).toLowerCase() !== 'normal') bump(2, 'SMART status is \u201C' + d.SMART + '\u201D');
          if (String(d.STATE).toLowerCase() !== 'normal') bump(2, 'drive state is \u201C' + d.STATE + '\u201D');

          const pending = raw(197), offUnc = raw(198), realloc = raw(5), crc = raw(199);
          if (pending > 0) bump(2, pending + ' pending sector(s) — data the drive could not read');
          if (offUnc > 0) bump(2, offUnc + ' offline uncorrectable sector(s)');
          if (realloc >= 16) bump(2, realloc + ' reallocated sector(s)');
          else if (realloc > 0) bump(1, realloc + ' reallocated sector(s)');
          if (crc > 0) bump(1, crc + ' UDMA CRC error(s) — check the SATA cable');

          const t = parseFloat(d.TEMPERATURE), hi = parseFloat(d.HIGH), shut = parseFloat(d.MAX_HIGH);
          if (Number.isFinite(t) && Number.isFinite(shut) && t >= shut) bump(2, t + '\u00A0\u00B0C is at or above the shutdown threshold');
          else if (Number.isFinite(t) && Number.isFinite(hi) && t >= hi) bump(1, t + '\u00A0\u00B0C is at or above the alert threshold');

          const poh = raw(9);
          if (poh >= 50000) bump(1, poh + ' power-on hours (about ' + (poh / 8760).toFixed(1) + ' years)');
          else if (poh >= 20000) reasons.push(poh + ' power-on hours (about ' + (poh / 8760).toFixed(1) + ' years)');

          // Temperature excursions across stored samples.
          const mine = historySamples.map(x => (x.disks || []).find(y => y.name === name)).filter(Boolean);
          if (Number.isFinite(hi)) {
            const hotDays = mine.filter(x => Number(x.temp_c) >= hi).length;
            if (hotDays > 0) bump(1, hotDays + ' previous snapshot(s) at or above the alert temperature');
          }
          // Growth across snapshots — the strongest real signal.
          if (mine.length >= 2) {
            const first = mine[0], last = mine[mine.length - 1];
            const grew = k => Number(last[k] ?? 0) > Number(first[k] ?? 0);
            if (grew('pending')) bump(2, 'pending sectors increased since the first snapshot');
            if (grew('offline_uncorrectable')) bump(2, 'offline uncorrectable sectors increased');
            if (grew('reallocated')) bump(1, 'reallocated sectors increased since the first snapshot');
            if (grew('crc_errors')) bump(1, 'CRC errors increased since the first snapshot');
          }
          if (!reasons.length) reasons.push('no warning counters, temperature within limits, no growth across snapshots');
          return { level, reasons };
        };
        const riskLabel = ['Low', 'Medium', 'High'];
        const riskTone = ['bg-emerald-50 text-emerald-700 ring-emerald-200', 'bg-amber-50 text-amber-800 ring-amber-200', 'bg-red-50 text-red-700 ring-red-200'];

        const tempTone = (v) => {
          const n = parseFloat(v);
          if (Number.isNaN(n)) return 'text-neutral-700';
          if (n >= 60) return 'text-red-600';
          if (n >= 55) return 'text-amber-600';
          return 'text-emerald-600';
        };
        const warnBg = (v) => {
          const n = parseFloat(v);
          if (Number.isNaN(n)) return 'bg-neutral-50 ring-neutral-200';
          if (n >= 60) return 'bg-red-50 ring-red-200';
          if (n >= 55) return 'bg-amber-50 ring-amber-200';
          return 'bg-emerald-50 ring-emerald-200';
        };
        const tempIcon = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4.5 4.5 0 1 0 4 0z"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/></svg>';
        const fanIcon = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" fill-opacity="0.9"/><path d="M12 9.8c0-2.6 1.7-4.6 4-4.6 1.9 0 3.3 1.3 3.3 3 0 2.2-2.3 2.9-4.5 2.9M14.2 12c2.3 1.3 3.2 3.6 1.9 5.9-1.2 2-3.7 2.5-5.9.9M12 14.2c-2.6 0-4.6.8-4.6 2.4 0 1.4 2 2.5 4 2.5M9.8 12c-1 2-3.6 2.8-5.9.9-2-1.2-2.5-3.2-1.4-5.3"/></svg>';
        const plugIcon = '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7z"/><path d="M12 16v5"/></svg>';

        // Overall status banner — derive from whatever the probes returned
        const healthNotes = [];
        if (volume) {
          if (volume.status && String(volume.status).toLowerCase() !== 'normal') healthNotes.push('Volume status: ' + volume.status);
          if (volume.resync && String(volume.resync) !== '100.0%') healthNotes.push('RAID resync: ' + volume.resync);
          if (Array.isArray(volume.faileddisks) && volume.faileddisks.length) healthNotes.push(volume.faileddisks.length + ' failed disk(s)');
        }
        disks.forEach(d => {
          if (String(d.SMART).toLowerCase() !== 'normal') healthNotes.push(d.NAME + ': SMART ' + d.SMART);
          if (String(d.STATE).toLowerCase() !== 'normal') healthNotes.push(d.NAME + ': state ' + d.STATE);
          const t = parseFloat(d.TEMPERATURE), hi = parseFloat(d.HIGH);
          if (!Number.isNaN(t) && !Number.isNaN(hi) && t >= hi) healthNotes.push(d.NAME + ': ' + t + '°C ≥ alert threshold');
        });
        if (sensors && typeof sensors === 'object') {
          const cpu = parseFloat(sensors['CPU']);
          if (!Number.isNaN(cpu) && cpu >= 55) healthNotes.push('CPU: ' + cpu + '°C');
        }
        const anyData = !!volume || disks.length > 0 || (sensors && Object.keys(sensors).length > 0);
        let banner;
        if (!anyData) {
          banner = `<div class="mb-4 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200"><p class="text-sm font-semibold text-amber-800">No health data returned</p><p class="text-xs text-amber-800/90">Check the probe warnings below.</p></div>`;
        } else if (healthNotes.length === 0) {
          banner = `<div class="mb-4 flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200"><svg class="h-6 w-6 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><div><p class="text-sm font-semibold text-emerald-800">All nominal</p><p class="text-xs text-emerald-700/90">Storage, RAID, SMART and thermals look good.</p></div></div>`;
        } else {
          banner = `<div class="mb-4 flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200"><svg class="mt-0.5 h-6 w-6 shrink-0 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg><div><p class="text-sm font-semibold text-amber-800">Needs attention</p><ul class="mt-0.5 list-disc pl-4 text-xs text-amber-800/90">${healthNotes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div></div>`;
        }

        let html = banner;
        html += '<h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">Thermal / sensors</h4><p class="mb-3 text-[11px] text-neutral-400">Values as reported by the NAS; units not documented (≈ °C / RPM / V).</p>';
        if (sensors && typeof sensors === 'object' && Object.keys(sensors).length) {
          const get = (k) => sensors[k];
          const find = (re) => Object.entries(sensors).find(([k]) => re.test(k));
          const cpu = get('CPU');
          const ambient = find(/ambient/i);
          const system = find(/system/i);
          const fan = find(/fan/i);
          const dcin = find(/dcin/i);
          const cards = [
            { label: 'CPU', value: cpu, unit: '°C', icon: tempIcon, tone: tempTone(cpu), ring: warnBg(cpu), tip: 'Processor temperature. Sustained high temps make the NAS throttle or shut down. Units not documented by the NAS (assumed °C).' },
            { label: 'CPU ambient', value: ambient && ambient[1], unit: '°C', icon: tempIcon, tone: tempTone(ambient && ambient[1]), ring: warnBg(ambient && ambient[1]), tip: 'Air temperature around the processor inside the case. Units not documented by the NAS (assumed °C).' },
            { label: 'System', value: system && system[1], unit: '°C', icon: tempIcon, tone: tempTone(system && system[1]), ring: warnBg(system && system[1]), tip: 'Overall system/enclosure temperature sensor. Exact location is not documented by the NAS (assumed °C).' },
            { label: 'Fan', value: fan && fan[1], unit: 'RPM', icon: fanIcon, tone: 'text-neutral-700', ring: 'bg-neutral-50 ring-neutral-200', tip: 'System fan speed in rotations per minute. A higher value usually means the NAS is cooling harder.' },
            { label: 'DC in', value: dcin && dcin[1], unit: 'V', icon: plugIcon, tone: 'text-neutral-700', ring: 'bg-neutral-50 ring-neutral-200', tip: 'External power adapter (DC) input voltage. Nominal for this unit is about 19 V.' },
          ];
          html += '<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">' +
            cards.map(c => `<div class="rounded-xl p-3 ring-1 ${c.ring}" data-tooltip="${escapeHtml(c.tip)}"><div class="flex items-center justify-between gap-1 text-neutral-500"><span class="text-[10px] font-semibold uppercase tracking-wider">${escapeHtml(c.label)}</span><span class="text-neutral-400">${c.icon}</span></div><p class="mt-1.5 text-2xl font-semibold tabular-nums leading-none ${c.tone}">${c.value !== undefined ? escapeHtml(String(c.value)) : '—'}<span class="ml-1 text-xs font-medium text-neutral-400">${c.unit}</span></p></div>`).join('') +
            '</div>';
        } else {
          html += '<p class="text-xs text-neutral-400">No sensor data returned.</p>';
        }

        html += '<h4 class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Storage &amp; RAID</h4>';
        if (volume) {
          const total = Number(volume.totalspace), free = Number(volume.freespace);
          const usedPct = Number.isFinite(total) && total > 0 ? Math.min(100, Math.round(((total - free) / total) * 100)) : 0;
          const usedTone = usedPct >= 90 ? 'bg-red-500' : usedPct >= 75 ? 'bg-amber-500' : 'bg-blue-500';
          const raidOk = String(volume.status || '').toLowerCase() === 'normal';
          html += `<div class="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div><p class="text-sm font-semibold text-neutral-800">${escapeHtml(String(volume.name || 'volume'))} <span class="text-[11px] font-normal text-neutral-400">${escapeHtml(String(volume.fs_type || ''))}${volume.raidtype ? ' · ' + escapeHtml(String(volume.raidtype)) : ''}</span></p>
              <p class="mt-0.5 text-xs text-neutral-500">${formatSize(free)} free of ${formatSize(total)} · ${usedPct}% used</p></div>
              <span class="rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${raidOk ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}">${escapeHtml(String(volume.raidtype || '?').toUpperCase())} · ${escapeHtml(String(volume.status || '?'))}</span>
            </div>
            <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100"><div class="h-full rounded-full ${usedTone}" style="width:${Math.max(2, usedPct)}%"></div></div>
            <p class="mt-1.5 text-[10px] text-neutral-400">Resync: ${escapeHtml(String(volume.resync ?? '—'))} · Encrypted: ${escapeHtml(String(volume.encrypted ?? '—'))}</p>
          </div>`;
        } else {
          html += '<p class="text-xs text-neutral-400">No volume info returned.</p>';
        }

        html += '<h4 class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Disks</h4>';
        if (disks.length) {
          html += '<div class="grid gap-2 sm:grid-cols-2">' + disks.map(d => {
            const t = parseFloat(d.TEMPERATURE);
            const maxH = parseFloat(d.MAX_HIGH);
            const pct = (Number.isFinite(t) && Number.isFinite(maxH) && maxH > 0) ? Math.min(100, Math.max(2, (t / maxH) * 100)) : 50;
            const barTone = (Number.isFinite(t) && Number.isFinite(maxH) && t >= maxH) ? 'bg-red-500' : (Number.isFinite(t) && parseFloat(d.HIGH) && t >= parseFloat(d.HIGH)) ? 'bg-amber-500' : 'bg-emerald-500';
            const smartOk = String(d.SMART).toLowerCase() === 'normal';
            return `<div class="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <div class="flex items-center justify-between gap-2"><p class="text-sm font-semibold text-neutral-800">${escapeHtml(String(d.NAME ?? '—'))}<span class="ml-2 text-[11px] font-normal text-neutral-400">${escapeHtml(String(d.TYPE ?? ''))}</span></p><span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ${smartOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}">SMART ${escapeHtml(String(d.SMART ?? '?'))}</span></div>
              <p class="mt-0.5 truncate text-[11px] text-neutral-400">${escapeHtml(String(d.MODEL ?? ''))}</p>
              <p class="mt-2 text-3xl font-semibold tabular-nums leading-none ${tempTone(d.TEMPERATURE)}">${escapeHtml(String(d.TEMPERATURE ?? '—'))}<span class="ml-1 text-xs font-medium text-neutral-400">°C</span></p>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100"><div class="h-full rounded-full ${barTone}" style="width:${pct}%"></div></div>
              <p class="mt-1.5 text-[10px] text-neutral-400">Shutdown ≥ ${escapeHtml(String(d.MAX_HIGH ?? '—'))} °C · Alert ≥ ${escapeHtml(String(d.HIGH ?? '—'))} °C · State: ${escapeHtml(String(d.STATE ?? '—'))}</p>
            </div>`;
          }).join('') + '</div>';
        } else {
          html += '<p class="text-xs text-neutral-400">No disk info returned.</p>';
        }

        html += '<h4 class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">Failure risk</h4>';
        if (disks.length) {
          html += '<div class="grid gap-2 sm:grid-cols-2">' + disks.map(d => {
            const r = riskOf(d);
            return `<div class="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-neutral-800">${escapeHtml(String(d.NAME ?? '—'))}</p>
                <span class="rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${riskTone[r.level]}">${riskLabel[r.level]} risk</span>
              </div>
              <ul class="mt-1.5 list-disc pl-4 text-[11px] leading-relaxed text-neutral-600">${r.reasons.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
            </div>`;
          }).join('') + '</div>';
          html += '<p class="mt-2 text-[10px] leading-relaxed text-neutral-400">Rule-based rating from SMART counters, temperature, age and snapshot trends. Advisory only — keep backups; a Low rating is not a guarantee.</p>';
        }

        html += '<h4 class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">SMART attributes</h4>';
        const names = Object.keys(smartByDisk);
        if (!names.length) {
          html += '<p class="text-xs text-neutral-400">No SMART attributes returned.</p>';
        } else {
          html += names.map(name => {
            const items = Array.isArray(smartByDisk[name]) ? smartByDisk[name] : [];
            const rows = items.map(a => {
              const st = String(a.status ?? '').toLowerCase();
              const stTone = st === 'normal' ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold';
              return `<tr class="odd:bg-neutral-50/60"><td class="py-1 pl-2 pr-2 text-right tabular-nums text-neutral-500">${escapeHtml(String(a.id ?? ''))}</td><td class="border-b border-neutral-100 py-1 pr-2 text-neutral-700">${escapeHtml(String(a.attribute ?? '—'))}</td><td class="border-b border-neutral-100 py-1 pr-2 text-right tabular-nums text-neutral-800">${escapeHtml(String(a.value ?? '—'))}</td><td class="border-b border-neutral-100 py-1 pr-2 text-right tabular-nums text-neutral-600">${escapeHtml(String(a.worst ?? '—'))}</td><td class="border-b border-neutral-100 py-1 pr-2 text-right tabular-nums text-neutral-600">${escapeHtml(String(a.threash ?? a.threshold ?? '—'))}</td><td class="border-b border-neutral-100 py-1 pr-2 text-right tabular-nums text-neutral-600">${escapeHtml(String(a.raw ?? '—'))}</td><td class="border-b border-neutral-100 py-1 pr-2 ${stTone}">${escapeHtml(String(a.status ?? '—'))}</td></tr>`;
            }).join('');
            const head = ['ID', 'Attribute', 'Value', 'Worst', 'Threshold', 'Raw', 'Status'].map(h =>
              `<th class="border-b border-neutral-200 py-1 text-xs font-semibold text-neutral-500 ${h === 'Attribute' ? 'text-left' : 'text-right'}">${h}</th>`).join('');
            return `<p class="mb-1 mt-3 text-xs font-semibold text-neutral-600">${escapeHtml(name)}</p>` +
              `<div class="overflow-x-auto rounded-lg border border-neutral-200"><table class="w-full border-collapse text-xs"><thead><tr class="bg-neutral-50">${head}</tr></thead><tbody>${rows || '<tr><td class="py-2 text-neutral-400" colspan="7">No attributes</td></tr>'}</tbody></table></div>`;
          }).join('');
        }

        if (historyCount > 0) {
          html += `<p class="mt-3 text-[11px] leading-relaxed text-neutral-400">Disk history: ${historyCount} daily snapshot${historyCount === 1 ? '' : 's'}, latest ${escapeHtml(historyLast)}. Collected locally to rate failure risk (experiment).</p>`;
        } else {
          html += '<p class="mt-3 text-[11px] leading-relaxed text-neutral-400">No disk history yet. The next Health refresh stores today\'s snapshot.</p>';
        }

        healthBody.innerHTML = html;
      } catch (e) {
        healthBody.innerHTML = '<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Health probe failed: ' + escapeHtml(e.message) + '</p>';
      } finally {
        healthRefreshBtn.disabled = false;
        healthRefreshBtn.textContent = 'Refresh';
      }
    }

    document.getElementById('healthBtn').addEventListener('click', () => { closeGearMenu(); healthModal.classList.remove('hidden'); loadHealth(); });
    document.getElementById('healthCloseBtn').addEventListener('click', () => healthModal.classList.add('hidden'));
    document.getElementById('healthRefreshBtn').addEventListener('click', loadHealth);
    healthModal.addEventListener('click', (e) => { if (e.target === healthModal) healthModal.classList.add('hidden'); });

    // ====== DOWNLOAD ======
    // The NAS serves the file at /life/v1/file with download=true.
    // The proxy forwards our token as the authorization_code cookie.
    // XHR instead of fetch so large files report progress and can be cancelled.
    async function downloadItem(path, name) {
      try {
        showToast('Downloading ' + name + '…');
        const id = startTransfer(name, 'download');
        const query = { root: 'local', path };
        let url;
        try {
          url = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `${PROXY_URL}/life/v1/file?query=${encodeURIComponent(JSON.stringify(query))}&download=true`);
            xhr.setRequestHeader('Authorization', cookie ? `Bearer ${cookie}` : '');
            xhr.responseType = 'blob';
            xhr.addEventListener('progress', (e) => {
              updateTransfer(id, e.loaded, e.lengthComputable ? e.total : 0);
            });
            xhr.addEventListener('load', () => {
              const status = xhr.status;
              if (status === 401) { endSession(); showLogin('Session expired. Please sign in again.'); reject(new AuthExpired('Session expired')); return; }
              const contentType = xhr.getResponseHeader('content-type') || '';
              if (contentType.includes('application/json')) {
                xhr.response.text().then(text => {
                  let msg = 'NAS refused the download';
                  try { const data = JSON.parse(text); msg = data.error?.msg || data.error || msg; } catch (_) {}
                  reject(new Error(msg));
                });
                return;
              }
              if (status < 200 || status >= 300) { reject(new Error('HTTP ' + status)); return; }
              resolve(URL.createObjectURL(xhr.response));
            });
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.addEventListener('abort', () => reject(new Error('Cancelled by user')));
            transfers.get(id).xhr = xhr;
            xhr.send();
          });
          finishTransfer(id, true);
        } catch (e) {
          finishTransfer(id, false, e.message === 'Cancelled by user' ? 'cancelled' : e.message);
          throw e;
        }
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Give the browser a minute to start reading the blob before revoking it.
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        showToast('Downloaded ' + name, 3000, 'success');
      } catch (e) {
        if (e instanceof AuthExpired) return; // login screen is already shown
        showToast('Download failed: ' + e.message, 8000, 'error');
      }
    }

    // ====== ACTIONS ======
    // Delegated handler for the sidebar share buttons (rename / delete).
    folderTree.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.tree-edit-share');
      if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        openModal('Display name for ' + editBtn.dataset.display, editBtn.dataset.display, async (newName) => {
          const name = newName.trim();
          if (name === editBtn.dataset.display) return;
          try {
            showToast('Renaming ' + editBtn.dataset.display + '…');
            await renameShareDisplayName(editBtn.dataset.id, editBtn.dataset.display, name);
            await loadTree();
            showToast('Renamed to ' + name, 3000, 'success');
          } catch (err) {
            showToast('Rename failed: ' + err.message, 8000, 'error');
          }
        }, 'Save');
        return;
      }
      const btn = e.target.closest('.tree-delete-share');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openShareDeleteModal(btn.dataset.id, btn.dataset.display);
    });

    function selectPath(path) {
      clearSearch();
      folderTree.querySelectorAll('button[data-path]').forEach(b => { b.dataset.active = String(b.dataset.path === path); });
      loadFiles(path);
      updateSearchAvailability();
      if (isMobile()) setSidebarCollapsed(true, false);
    }

    document.getElementById('refreshBtn').addEventListener('click', () => {
      clearSearch();
      loadFiles(currentPath);
      loadTree().catch(() => {});
    });
    document.getElementById('upLevelBtn').addEventListener('click', () => {
      const parent = parentOf(currentPath);
      if (parent !== currentPath) { clearSearch(); selectPath(parent); }
    });

    // ====== CREATE / RENAME ======
    function validName(name) {
      return Boolean(name) && name !== '.' && name !== '..' && !name.includes('/');
    }

    function joinPath(base, name) {
      return (base === '/' ? '' : base) + '/' + name;
    }

    function parentOf(path) {
      const index = path.lastIndexOf('/');
      return index <= 0 ? '/' : path.slice(0, index);
    }

    async function createFolder(path, name) {
      const res = await authFetch(`${PROXY_URL}/life/v1/folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'mkdir',
          items: { source: { root: 'local', path: joinPath(path, name) } }
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      if (data.result === false) throw new Error(data.error || 'Create failed');
    }

    async function renamePath(path, name) {
      const target = joinPath(parentOf(path), name);
      if (target === path) return;
      const res = await authFetch(`${PROXY_URL}/life/v1/folder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'move', // a rename is a move to the same folder
          items: [{ source: { root: 'local', path }, target: { root: 'local', path: target } }]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      if (data.result === false) throw new Error(data.error || 'Rename failed');
    }

    async function refreshViews(path) {
      await loadFiles(path);
      if (searchState.active && searchInput.value.trim().length >= 2) await runSearch(searchInput.value);
      try {
        await loadTree();
      } catch (e) {
        // keep the current tree if it cannot reload
      }
      // The NAS may apply the change just after the response.
      setTimeout(() => {
        if (currentPath === path) loadFiles(path);
      }, 1000);
    }

    window.renameItem = (path, name) => {
      if (currentPath === '/') {
        showToast('Open a share or folder first.', 6000, 'error');
        return;
      }
      openModal('Rename', name, async (newName) => {
        if (!validName(newName)) {
          showToast('Invalid name. Do not use "/" or dots only.', 5000, 'error');
          return;
        }
        try {
          showToast('Renaming…');
          await renamePath(path, newName);
          await refreshViews(currentPath);
          showToast(`Renamed to ${newName}`, 3000, 'success');
        } catch (e) {
          showToast('Rename failed: ' + e.message, 8000, 'error');
        }
      }, 'Rename');
    };

    // ====== MOVE TO RECYCLE BIN ======
    // Deletes now move items into the share's @SmbRecyclebin (where one exists or
    // the user asks for one), mirroring the original folder tree — same layout SMB
    // uses. One level of mkdir per missing level; name collisions in the bin get a
    // timestamp suffix. The NAS can answer result:true with a silent no-op, so the
    // file is re-listed afterwards to confirm it actually moved.
    const binChoiceModal = document.getElementById('binChoiceModal');
    const binChoiceShareEl = document.getElementById('binChoiceShare');
    let binChoiceByShare = {}; // per-session choice per share: 'bin' | 'permanent'
    let binChoiceResolve = null;

    function askBinChoice(share) {
      return new Promise(resolve => {
        binChoiceShareEl.textContent = share;
        binChoiceModal.classList.remove('hidden');
        binChoiceResolve = resolve;
      });
    }
    function settleBinChoice(value) {
      binChoiceModal.classList.add('hidden');
      if (binChoiceResolve) { binChoiceResolve(value); binChoiceResolve = null; }
    }
    document.getElementById('binChoiceCreate').addEventListener('click', () => settleBinChoice('create'));
    document.getElementById('binChoicePermanent').addEventListener('click', () => settleBinChoice('permanent'));
    document.getElementById('binChoiceCancel').addEventListener('click', () => settleBinChoice('cancel'));
    binChoiceModal.addEventListener('click', (e) => { if (e.target === binChoiceModal) settleBinChoice('cancel'); });

    const shareOf = (path) => path.split('/')[1];

    function binTargetOf(sourcePath, share) {
      return '/' + share + '/@SmbRecyclebin' + sourcePath.slice(share.length + 1);
    }

    function TIMESTAMP_SUFFIX() {
      const d = new Date();
      const p = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    function splitName(name) {
      const dot = name.lastIndexOf('.');
      if (dot <= 0) return { base: name, ext: '' };
      return { base: name.slice(0, dot), ext: name.slice(dot) };
    }

    // One mkdir per missing level, from the bin root down to 'dir'.
    async function mkdirp(dir) {
      const parts = dir.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        try {
          await createFolder(parentOf(current), part);
        } catch (_) {
          // tolerate "already exists" — the move check afterwards is the source of truth
          try { await fsList(current, 1); } catch (e) { throw new Error('Could not create ' + current + ' (' + e.message + ')'); }
        }
      }
    }

    // If 'targetPath' already exists in the bin, suffix the base name with a timestamp.
    async function resolveCollision(targetPath) {
      const dir = parentOf(targetPath);
      let existing = [];
      try { existing = await fsList(dir, 1); } catch (_) { return { targetPath, renamedTo: null }; }
      const names = new Set(existing.map(it => it.name));
      const name = targetPath.split('/').pop();
      if (!names.has(name)) return { targetPath, renamedTo: null };
      const { base, ext } = splitName(name);
      const stamped = `${dir}/${base}.${TIMESTAMP_SUFFIX()}${ext}`;
      return { targetPath: stamped, renamedTo: stamped.split('/').pop() };
    }

    // 'bin' | 'create' | 'permanent' | 'cancel' — remembered per share for this session.
    async function binModeForShare(share) {
      if (binChoiceByShare[share]) return binChoiceByShare[share];
      try {
        await fsList('/' + share + '/@SmbRecyclebin', 1);
        binChoiceByShare[share] = 'bin';
        return 'bin';
      } catch (_) {
        const choice = await askBinChoice(share);
        binChoiceByShare[share] = choice === 'permanent' ? 'permanent' : choice === 'create' ? 'create' : '';
        if (choice === 'cancel') return 'cancel';
        return choice; // 'create' (bin will be made on demand) or 'permanent'
      }
    }

    async function moveOneToBin(sourcePath, share) {
      const name = sourcePath.split('/').pop();
      const mode = await binModeForShare(share);
      if (mode === 'cancel') return { status: 'cancelled' };
      if (mode === 'permanent') {
        await deletePaths([sourcePath]);
        return { status: 'permanent', name };
      }
      const target = binTargetOf(sourcePath, share);
      const targetDir = parentOf(target);
      if (mode === 'create') {
        // Hard-fail (never fall back to permanent delete silently) if the bin cannot be made.
        try {
          await createFolder('/' + share, '@SmbRecyclebin');
          try { await fsList('/' + share + '/@SmbRecyclebin', 1); }
          catch (_) { throw new Error('the recycle bin could not be created for ' + share + ' — the file was NOT deleted'); }
        } catch (e) {
          binChoiceByShare[share] = ''; // choice not remembered — ask again next delete
          throw e;
        }
      }
      try {
        await mkdirp(targetDir);
      } catch (e) {
        binChoiceByShare[share] = ''; // let the user choose again
        throw e;
      }
      const { targetPath, renamedTo } = await resolveCollision(target);
      const res = await authFetch(`${PROXY_URL}/life/v1/folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', items: [{ source: { root: 'local', path: sourcePath }, target: { root: 'local', path: targetPath } }] })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.result === false) throw new Error(data.error || ('HTTP ' + res.status));
      // result:true is not proof — re-list the source folder and require the item gone.
      let gone = false;
      for (let i = 0; i < 6; i++) {
        try {
          const items = await fsList(parentOf(sourcePath), 1);
          if (!items.some(it => (it.path || parentOf(sourcePath) + '/' + it.name) === sourcePath)) { gone = true; break; }
        } catch (_) {}
        await new Promise(r => setTimeout(r, 700));
      }
      if (!gone) throw new Error('the NAS did not move the file — it was NOT deleted');
      return { status: 'bin', name, renamedTo };
    }

    // ====== DELETE ======
    async function deletePaths(paths) {
      const res = await authFetch(`${PROXY_URL}/life/v1/folderex`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'delete',
          items: paths.map(path => ({ source: { root: 'local', path } }))
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json().catch(() => ({}));
      if (data.result === false) throw new Error(data.error || 'Delete failed');
    }

    function markDeleting(paths) {
      fileList.querySelectorAll('tr').forEach(row => {
        if (!paths.includes(row.dataset.path)) return;
        row.dataset.deleting = 'true';
        const typeCell = row.querySelector('.type');
        if (typeCell) typeCell.textContent = 'Deleting…';
        const check = row.querySelector('.row-check');
        if (check) {
          check.checked = false;
          check.disabled = true;
        }
        row.querySelectorAll('button').forEach(btn => { btn.disabled = true; });
      });
    }

    // The NAS removes items in a background task. Poll until the item is gone.
    async function waitUntilGone(path, paths, tries = 10, interval = 400) {
      for (let i = 0; i < tries; i++) {
        try {
          const items = await fsList(path);
          if (!items.some(item => paths.includes(item.path))) return true;
        } catch (e) {
          // keep waiting on a transient error
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      }
      return false;
    }

    async function deleteAndRefresh(paths) {
      const path = currentPath;
      const hadFolder = [...fileList.querySelectorAll('tr')]
        .some(row => paths.includes(row.dataset.path) && row.dataset.type === 'folder');

      paths.forEach(p => pendingDeletes.add(p));
      markDeleting(paths);      selection.clear();
      document.getElementById('deleteSelectedBtn').disabled = true;
      const share = paths.length ? shareOf(paths[0]) : '';
      const summary = { moved: [], permanent: [], failed: [], cancelled: 0, renamed: [] };
      for (const p of paths) {
        try {
          const r = await moveOneToBin(p, share);
          if (r.status === 'bin') summary.moved.push(p);
          else if (r.status === 'permanent') summary.permanent.push(p);
          else summary.cancelled += 1;
          if (r.renamedTo) summary.renamed.push({ from: p.split('/').pop(), to: r.renamedTo });
        } catch (e) {
          summary.failed.push({ path: p, message: e.message });
        }
      }

      const handled = summary.moved.concat(summary.permanent);
      paths.forEach(p => pendingDeletes.delete(p));
      if (handled.length) {
        summary.gone = await waitUntilGone(path, handled);
      } else {
        summary.gone = false;
      }

      if (currentPath === path) {
        await loadFiles(path);
        if (searchState.active && searchInput.value.trim().length >= 2) await runSearch(searchInput.value);
      }
      if (hadFolder) {
        loadTree().catch(() => {});
      }
      return summary;
    }

    window.deleteItem = async (path) => {
      if (currentPath === '/') {
        showToast('Open a share or folder first.', 6000, 'error');
        return;
      }
      const name = path.split('/').pop();
      if (!confirm(`Delete "${name}"?`)) return;
      try {
        showToast('Deleting ' + name + '…', 60000);
        const summary = await deleteAndRefresh([path]);
        if (summary.failed.length) { showToast('Delete failed: ' + summary.failed[0].message, 8000, 'error'); return; }
        if (summary.cancelled) { showToast('Nothing was deleted.', 3000); return; }
        if (summary.permanent.length) { showToast('Deleted permanently: ' + name, 5000, 'success'); return; }
        if (summary.renamed.length) { showToast('Name already in bin — saved as ' + summary.renamed[0].to, 8000, 'info'); }
        showToast(summary.gone ? 'Moved to recycle bin: ' + name : 'Move to bin is still running on the NAS.', summary.gone ? 3000 : 8000, summary.gone ? 'success' : 'info');
      } catch (e) {
        showToast('Delete failed: ' + e.message, 8000, 'error');
      }
    };

    document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
      const paths = [...selection];
      if (!paths.length || !confirm(`Delete ${paths.length} item(s)?`)) return;
      try {
        showToast('Deleting ' + paths.length + ' item(s)…', 60000);
        const summary = await deleteAndRefresh(paths);
        if (summary.failed.length) {
          const done = summary.moved.length + summary.permanent.length;
          showToast(done
            ? `Deleted ${done} item(s); ${summary.failed.length} failed (${summary.failed[0].message})`
            : `Delete failed: ${summary.failed[0].message}`, 9000, 'error');
          return;
        }
        if (summary.cancelled) { showToast('Nothing was deleted.', 3000); return; }
        const items = summary.moved.concat(summary.permanent);
        const names = items.map(p => p.split('/').pop());
        const shown = [];
        let len = 0;
        for (const n of names) {
          if (shown.length >= 2 || len + n.length > 64) break;
          shown.push(n); len += n.length + 2;
        }
        const rest = names.length - shown.length;
        const nameSummary = shown.join(', ') + (rest > 0 ? ` (+${rest} more)` : '');
        const mode = summary.permanent.length && summary.moved.length
          ? `${summary.moved.length} to bin, ${summary.permanent.length} permanently`
          : summary.permanent.length ? 'permanently' : 'to recycle bin';
        showToast(`Deleted (${mode}): ${nameSummary}`, 6000, 'success');
        if (summary.renamed.length) {
          showToast('Renamed to avoid a bin collision: ' + summary.renamed.map(r => `${r.from} → ${r.to}`).join(', '), 8000, 'info');
        }
      } catch (e) {
        showToast('Delete failed: ' + e.message, 8000, 'error');
      }
    });

    // ====== MOVE / COPY ======
    // Same-share only (product decision). The picker browses the current share;
    // @SmbRecyclebin is never a destination. Name collisions get a timestamp suffix
    // — never an overwrite. Errors are reported per item; list + search refresh after.
    const moveCopyModal = document.getElementById('moveCopyModal');
    const moveCopyTitle = document.getElementById('moveCopyTitle');
    const moveCopyCrumbs = document.getElementById('moveCopyCrumbs');
    const moveCopyFolderList = document.getElementById('moveCopyFolderList');
    const moveCopyConfirm = document.getElementById('moveCopyConfirm');
    const moveCopySummary = document.getElementById('moveCopySummary');
    let moveCopyState = null;


    // Valid move/copy destination: a folder inside a share, never the root, never a recycle bin.
    function safeDest(path) {
      return !!path && path !== '/' && !path.split('/').includes('@SmbRecyclebin');
    }

    function openMoveCopy(mode) {
      const paths = [...selection];
      if (!paths.length) return;
      const share = currentShareName();
      if (!share) { showToast('Open a share first.', 6000, 'error'); return; }
      moveCopyState = { mode, paths, cwd: '/' };
      moveCopyTitle.textContent = (mode === 'move' ? 'Move' : 'Copy') + ' ' + paths.length + ' item' + (paths.length === 1 ? '' : 's') + ' to…';
      moveCopyConfirm.textContent = (mode === 'move' ? 'Move' : 'Copy') + ' here';
      moveCopyModal.classList.remove('hidden');
      renderMoveCopyPicker();
    }

    function closeMoveCopy() { moveCopyModal.classList.add('hidden'); moveCopyState = null; }

    function renderMoveCopyCrumbs() {
      const { cwd } = moveCopyState;
      const parts = cwd.split('/').filter(Boolean);
      let acc = '';
      const crumbs = [{ label: 'Home', target: '/' }];
      parts.forEach(p => { acc += '/' + p; crumbs.push({ label: p, target: acc }); });
      moveCopyCrumbs.innerHTML = crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return `${i ? '<span class="text-neutral-300">/</span>' : ''}<button class="rounded px-1 py-0.5 ${isLast ? 'font-semibold text-neutral-800' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'}" data-nav="${escapeHtml(c.target)}">${escapeHtml(c.label)}</button>`;
      }).join('');
      moveCopyCrumbs.querySelectorAll('[data-nav]').forEach(btn => {
        btn.addEventListener('click', () => { moveCopyState.cwd = btn.dataset.nav; renderMoveCopyPicker(); });
      });
    }

    async function renderMoveCopyPicker() {
      const { cwd, mode, paths } = moveCopyState;
      renderMoveCopyCrumbs();
      moveCopyFolderList.innerHTML = '<li class="px-5 py-6 text-center text-xs text-neutral-400">Loading…</li>';
      let items = [];
      try { items = await fsList(cwd); } catch (e) {
        moveCopyFolderList.innerHTML = `<li class="px-5 py-6 text-center text-xs text-red-600">Could not open ${escapeHtml(cwd)}: ${escapeHtml(e.message)}</li>`;
        moveCopyConfirm.disabled = true;
        return;
      }
      const folders = items.filter(it => it.type === 'folder' && it.name !== '@SmbRecyclebin');
      moveCopyFolderList.innerHTML = folders.length
        ? folders.map(it => {
            const full = it.path || (cwd === '/' ? '/' + it.name : cwd + '/' + it.name);
            return `<li><button class="flex w-full items-center gap-2.5 px-5 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-blue-50" data-into="${escapeHtml(full)}">${svgFolder()}<span class="truncate">${escapeHtml(it.name)}</span></button></li>`;
          }).join('')
        : '<li class="px-5 py-8 text-center text-xs text-neutral-400">This folder is empty.</li>';
      moveCopyFolderList.querySelectorAll('[data-into]').forEach(btn => {
        btn.addEventListener('click', () => { moveCopyState.cwd = btn.dataset.into; renderMoveCopyPicker(); });
      });
      const sameDir = cwd === currentPath;
      const destOk = safeDest(cwd);
      moveCopyConfirm.disabled = !destOk || (mode === 'move' && sameDir);
      if (!destOk) {
        moveCopySummary.textContent = cwd === '/'
          ? 'Choose a share, then a folder inside it.'
          : 'That location cannot take items. Choose a folder inside a share.';
      } else if (mode === 'move' && sameDir) {
        moveCopySummary.textContent = `${paths.length} item(s) move to ${cwd} — this is where they are`;
      } else {
        moveCopySummary.textContent = mode === 'move'
          ? `${paths.length} item(s) move to ${cwd}`
          : `${paths.length} item(s) copied to ${cwd}`;
      }
    }

    // Shared collision handling + executor for the picker and drag-and-drop moves.
    async function runMoveCopy(mode, paths, cwd) {
      let existing = [];
      try { existing = await fsList(cwd); } catch (_) {}
      const names = new Set(existing.map(it => it.name));
      const items = paths.map(p => {
        const name = p.split('/').pop();
        let targetName = name;
        if (names.has(name)) {
          const dot = name.lastIndexOf('.');
          const base = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : '';
          targetName = `${base}.${TIMESTAMP_SUFFIX()}${ext}`;
        }
        names.add(targetName);
        return { source: p, target: (cwd === '/' ? '' : cwd) + '/' + targetName, renamedTo: targetName === name ? null : targetName };
      });
      const failed = [], renamed = [], done = [];
      for (const it of items) {
        try {
          const res = await authFetch(`${PROXY_URL}/life/v1/folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: mode, items: [{ source: { root: 'local', path: it.source }, target: { root: 'local', path: it.target } }] })
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.result === false) throw new Error(data.error || ('HTTP ' + res.status));
          done.push(it.target);
          if (it.renamedTo) renamed.push(`${it.source.split('/').pop()} → ${it.renamedTo}`);
        } catch (e) {
          failed.push(`${it.source.split('/').pop()}: ${e.message}`);
        }
      }
      selection.clear();
      updateSelection();
      await refreshViews(currentPath);
      if (searchState.active && searchInput.value.trim().length >= 2) await runSearch(searchInput.value);
      const modeText = mode === 'move' ? 'Moved' : 'Copied';
      if (failed.length) {
        showToast(`${modeText} ${done.length} of ${items.length}; failed: ${failed[0]}`, 9000, 'error');
      } else {
        showToast(`${modeText} ${done.length} item(s) to ${cwd}`, 5000, 'success');
      }
      if (renamed.length) {
        showToast('Renamed to avoid collisions: ' + renamed.slice(0, 3).join(', ') + (renamed.length > 3 ? ` (+${renamed.length - 3} more)` : ''), 8000, 'info');
      }
      return { done, failed };
    }

    // "Move up one level": move a folder row into the parent of the current listing.
    // Async by design — the move runs through runMoveCopy (timestamp rename on collision).
    async function moveFolderUp(path) {
      const dest = parentOf(currentPath);
      if (dest === '/') return;
      await runMoveCopy('move', [path], dest);
    }

    async function executeMoveCopy() {
      if (!moveCopyState) return;
      const { mode, paths, cwd } = moveCopyState;
      moveCopyModal.classList.add('hidden');
      await runMoveCopy(mode, paths, cwd);
      moveCopyState = null;
    }

    document.getElementById('moveSelectedBtn').addEventListener('click', () => openMoveCopy('move'));
    document.getElementById('copySelectedBtn').addEventListener('click', () => openMoveCopy('copy'));
    document.getElementById('moveCopyConfirm').addEventListener('click', executeMoveCopy);
    document.getElementById('moveCopyCloseBtn').addEventListener('click', closeMoveCopy);
    document.getElementById('moveCopyCancel').addEventListener('click', closeMoveCopy);
    moveCopyModal.addEventListener('click', (e) => { if (e.target === moveCopyModal) moveCopyModal.classList.add('hidden'); });

    // ====== UPLOAD ======
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadStatus = document.getElementById('uploadStatus');

    async function uploadOne(file, path) {
      const form = new FormData();
      form.append('application/json', JSON.stringify({
        root: 'local',
        path,
        mtime: new Date(file.lastModified || Date.now()).toISOString(),
        size: file.size,
        filename: file.name
      }));
      // The NAS reads the file from the field named after the file itself.
      form.append(file.name, file, file.name);

      const id = startTransfer(file.name, 'upload', { file, path });
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${PROXY_URL}/life/v1/file/upload`);
          xhr.setRequestHeader('Authorization', cookie ? `Bearer ${cookie}` : '');
          xhr.upload.addEventListener('progress', (e) => {
            updateTransfer(id, e.loaded, e.lengthComputable ? e.total : 0);
          });
          xhr.addEventListener('load', () => {
            const status = xhr.status;
            let data = {};
            try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
            if (status === 401) { endSession(); showLogin('Session expired. Please sign in again.'); reject(new AuthExpired('Session expired')); return; }
            if (status < 200 || status >= 300) { reject(new Error('HTTP ' + status)); return; }
            if (data.result === false) { reject(new Error(data.error || 'Upload failed')); return; }
            resolve();
          });
          xhr.addEventListener('error', () => reject(new Error('Network error')));
          xhr.addEventListener('abort', () => reject(new Error('Cancelled by user')));
          transfers.get(id).xhr = xhr;
          xhr.send(form);
        });
        finishTransfer(id, true);
      } catch (e) {
        finishTransfer(id, false, e.message === 'Cancelled by user' ? 'cancelled' : e.message);
        throw e;
      }
    }

    async function uploadFiles(files) {
      if (currentPath === '/') {
        showToast('Open a share or folder before uploading.', 6000, 'error');
        return 0;
      }
      const targetPath = currentPath;
      const failed = [];
      let done = 0;
      for (let i = 0; i < files.length; i++) {
        uploadStatus.textContent = `${i + 1} of ${files.length}…`;
        try {
          await uploadOne(files[i], targetPath);
          done++;
        } catch (e) {
          if (e.message === 'Cancelled by user' || e instanceof AuthExpired) {
            failed.push(`${files[i].name}: ${e instanceof AuthExpired ? 'session expired' : 'cancelled'}`);
            break; // stop the queue on cancel or when the session is dead
          }
          failed.push(`${files[i].name}: ${e.message}`);
        }
      }
      const sessionDead = failed.some(f => f.includes('session expired'));
      if (!sessionDead) {
        await loadFiles(targetPath);
        if (searchState.active && searchInput.value.trim().length >= 2) await runSearch(searchInput.value);
        // The NAS may index the new file just after the response.
        setTimeout(() => {
          if (currentPath === targetPath) {
            if (searchState.active && searchInput.value.trim().length >= 2) runSearch(searchInput.value);
            else loadFiles(targetPath);
          }
        }, 1200);
      }

      if (failed.length && done) {
        showToast(`Uploaded ${done} of ${files.length} to ${targetPath}. Failed: ${failed[0]}`, 8000, 'error');
      } else if (failed.length) {
        showToast(`Upload failed: ${failed[0]}`, 8000, 'error');
      } else {
        showToast(`Uploaded ${done} file(s) to ${targetPath}`, 3000, 'success');
      }
      return done;
    }

    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files);
      fileInput.value = '';
      if (!files.length) return;
      uploadBtn.disabled = true;
      try {
        await uploadFiles(files);
      } finally {
        uploadBtn.disabled = false;
        uploadStatus.textContent = '';
      }
    });

    // ====== DRAG AND DROP UPLOAD ======
    // Drop files anywhere on the window; they upload to the current folder.
    // Folders dropped here are not supported yet (browsers expose them only
    // through the entries API); they are ignored.
    const dropOverlay = document.getElementById('dropOverlay');
    const dropPath = document.getElementById('dropPath');
    let dragDepth = 0;
    function hasFiles(e) {
      return Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
    }
    function hideDropOverlay() {
      dragDepth = 0;
      dropOverlay.classList.add('hidden');
      dropOverlay.classList.remove('flex');
    }
    document.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      if (dropOverlay.classList.contains('hidden')) {
        dropPath.textContent = currentPath === '/' ? 'Open a share or folder first — nothing will upload at the root.' : 'Upload to ' + currentPath;
        dropOverlay.classList.remove('hidden');
        dropOverlay.classList.add('flex');
      }
    });
    document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) hideDropOverlay();
    });
    document.addEventListener('drop', async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      hideDropOverlay();
      const files = Array.from(e.dataTransfer.files);
      if (!files.length) return;
      if (currentPath === '/') { showToast('Open a share or folder before uploading.', 6000, 'error'); return; }
      uploadBtn.disabled = true;
      try {
        await uploadFiles(files);
      } finally {
        uploadBtn.disabled = false;
        uploadStatus.textContent = '';
      }
    });

    // ====== NEW FOLDER ======
    document.getElementById('newFolderBtn').addEventListener('click', () => {
      if (currentPath === '/') {
        showToast('Open a share or folder first.', 6000, 'error');
        return;
      }
      openModal('New Folder', '', async (name) => {
        if (!validName(name)) {
          showToast('Invalid name. Do not use "/" or dots only.', 5000, 'error');
          return;
        }
        try {
          showToast('Creating ' + name + '…');
          await createFolder(currentPath, name);
          await refreshViews(currentPath);
          showToast(`Created ${name}`, 3000, 'success');
        } catch (e) {
          showToast('Create failed: ' + e.message, 8000, 'error');
        }
      }, 'Create');
    });

    // ====== MODAL ======
    function openModal(title, value, onConfirm, confirmLabel = 'OK') {
      modalTitle.textContent = title;
      modalInput.value = value;
      document.getElementById('modalConfirm').textContent = confirmLabel;
      modal.classList.remove('hidden');
      modalInput.focus();
      modalResolve = onConfirm;
    }
    document.getElementById('modalCancel').addEventListener('click', () => { modal.classList.add('hidden'); modalResolve = null; });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!moveCopyModal.classList.contains('hidden')) { closeMoveCopy(); return; }
      if (!binChoiceModal.classList.contains('hidden')) { settleBinChoice('cancel'); return; }
      if (!shareDeleteModal.classList.contains('hidden')) { closeShareDeleteModal(); return; }
      if (!changePasswordModal.classList.contains('hidden')) { closeChangePasswordModal(); return; }
      if (!modal.classList.contains('hidden')) { modal.classList.add('hidden'); modalResolve = null; }
      if (!healthModal.classList.contains('hidden')) { healthModal.classList.add('hidden'); }
      if (!recycleModal.classList.contains('hidden')) { recycleModal.classList.add('hidden'); return; }
      if (!purgeConfirmModal.classList.contains('hidden')) { purgeConfirmModal.classList.add('hidden'); return; }
      if (!emptyBinModal.classList.contains('hidden')) { emptyBinModal.classList.add('hidden'); return; }
      if (!imagePreviewModal.classList.contains('hidden')) { closePreview(); return; }
      if (!transferModal.classList.contains('hidden') && !hasActiveTransfers()) { closeTransferModal(); return; }
      if (searchState.active) { clearSearch(); loadFiles(currentPath); return; }
    });
    document.getElementById('modalConfirm').addEventListener('click', async () => {
      const val = modalInput.value.trim();
      if (!val) return;
      modal.classList.add('hidden');
      if (modalResolve) await modalResolve(val);
      modalResolve = null;
    });

    // ====== TOAST ======
    const TOAST_VARIANTS = {
      info: 'bg-neutral-900',
      success: 'bg-emerald-600',
      error: 'bg-red-600'
    };

    function showToast(msg, ms = 3000, type = 'info') {
      toast.textContent = msg;
      Object.values(TOAST_VARIANTS).forEach(cls => toast.classList.remove(cls));
      toast.classList.add(TOAST_VARIANTS[type] || TOAST_VARIANTS.info);
      toast.classList.remove('hidden');
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.add('hidden'), ms);
    }

    // ====== ICONS ======
    // Shared inline icons for JS-generated content. Static markup keeps its own inline SVGs.
    const ICON_BODIES = {
      trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
      pencil: '<path d="M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
      download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
      upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
      folderUp: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 15v-4M9.5 12.5 12 10l2.5 2.5"/>',
      undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 1 0-9 9 9.4 9.4 0 0 0 5.7-2"/>',
      check: '<polyline points="20 6 9 17 4 10"/>',
      errorCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'
    };
    function icon(name, size = 'h-4 w-4') {
      return `<svg class="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_BODIES[name] || ''}</svg>`;
    }

    // ====== UTIL ======
    function formatSize(size) {
      const n = Number(size);
      if (size === null || size === undefined || size === '' || Number.isNaN(n)) return '—';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = n;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
      return (unit === 0 ? value : value.toFixed(1)) + ' ' + units[unit];
    }

    function formatDate(iso) {
      if (!iso) return '—';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '—';
      return date.toLocaleString();
    }

    // Phase 3 (5.3.5): preview is offered for these file kinds only.
    const PREVIEWABLE_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const PREVIEWABLE_VIDEO_EXTS = ['mp4', 'webm', 'mov'];
    const PREVIEWABLE_AUDIO_EXTS = ['mp3', 'm4a'];
    const PDF_PREVIEW_EXTS = ['pdf'];
    const TSV_PREVIEW_EXTS = ['tsv'];
    const CSV_PREVIEW_EXTS = ['csv'];
    const TEXT_PREVIEW_EXTS = ['txt', 'md', 'markdown', 'json', 'geojson', 'yaml', 'yml', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'sh', 'bash', 'zsh', 'ini', 'cfg', 'conf', 'log', 'env', 'sql', 'toml', 'c', 'h', 'cc', 'cpp', 'hpp', 'java', 'go', 'rs', 'php', 'pl', 'lua', 'r', 'swift', 'kt', 'cs', 'm', 'mm', 'properties', 'bat', 'ps1', 'awk', 'gradle', 'cmake', 'command', 'tool', 'shell', 'ash', 'ksh', 'csh', 'tcsh', 'zshrc', 'bashrc'];
    const TEXT_PREVIEW_NAMES = ['makefile', 'dockerfile', 'readme', 'license', 'changelog', 'authors', 'notice', 'profile'];
    const PREVIEW_TEXT_CAP = 512 * 1024; // 512 KB
    const PREVIEW_CSV_ROW_CAP = 200;
    const PREVIEW_CSV_COL_CAP = 60;

    // Lowercase extension of a file name. Empty when there is none.
    function extOf(name) {
      const s = String(name || '');
      const dot = s.lastIndexOf('.');
      if (dot < 0 || dot === s.length - 1) return '';
      return s.slice(dot + 1).toLowerCase();
    }

    // Returns 'image' | 'video' | 'audio' | 'pdf' | 'csv' | 'tsv' | 'text' | null
    function previewKind(name) {
      const ext = extOf(name);
      if (PREVIEWABLE_IMAGE_EXTS.includes(ext)) return 'image';
      if (PREVIEWABLE_VIDEO_EXTS.includes(ext)) return 'video';
      if (PREVIEWABLE_AUDIO_EXTS.includes(ext)) return 'audio';
      if (PDF_PREVIEW_EXTS.includes(ext)) return 'pdf';
      if (CSV_PREVIEW_EXTS.includes(ext)) return 'csv';
      if (TSV_PREVIEW_EXTS.includes(ext)) return 'tsv';
      if (TEXT_PREVIEW_EXTS.includes(ext)) return 'text';
      if (!ext && TEXT_PREVIEW_NAMES.includes(name.toLowerCase())) return 'text';
      return null;
    }

    function fileType(name) {
      const ext = extOf(name);
      return ext ? ext.toUpperCase() + ' file' : 'File';
    }

    function escapeHtml(s) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return String(s).replace(/[&<>"']/g, c => map[c]);
    }
    function svgFolder() { return '<svg class="h-[18px] w-[18px] shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'; }
    function svgTreeIcon(type) {
      if (type === 'home' || type === 'vphome') return '<svg class="h-[18px] w-[18px] shrink-0 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>';
      if (type === 'homes') return '<svg class="h-[18px] w-[18px] shrink-0 text-violet-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
      return svgFolder();
    }
    function svgFile(name) {
      const ext = extOf(name);
      const img = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
      const vid = ['mp4','webm','mov','mkv'].includes(ext);
      const pdf = ext === 'pdf';
      const fileIcon = (cls, inner) => `<svg class="h-[18px] w-[18px] shrink-0 ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
      const page = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
      if (img) return fileIcon('text-emerald-600', '<rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="7.5" cy="7.5" r="1"/><path d="M21 14l-5-5L5 17"/>');
      if (vid) return fileIcon('text-violet-500', '<polygon points="23 7 16 12 23 17 23 7"/><rect x="2" y="3" width="20" height="14" rx="2"/>');
      if (pdf) return fileIcon('text-red-500', page);
      return fileIcon('text-neutral-400', page);
    }

    // ====== INIT ======
    (async () => {
      localStorage.removeItem('homenas.adminPass'); // obsolete key, if any
      // Resume a remembered session if it is still valid.
      try {
        const raw = localStorage.getItem('homenas.session');
        if (raw) {
          const { user, token } = JSON.parse(raw);
          cookie = token;
          currentUser = user;
          await fsList('/'); // throws when the token is dead or the NAS is down
          userBadge.textContent = user === 'admin' ? user + ' (admin)' : user;
          showApp();
          try { await loadTree(); } catch (e) { showToast('Could not load folders: ' + e.message, 8000, 'error'); }
          loadFiles('/home');
          return;
        }
      } catch (e) {
        endSession();
        showLogin('Session expired. Please sign in again.');
        return;
      }
      showLogin('');
    })();
