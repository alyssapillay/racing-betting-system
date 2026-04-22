const App = {
  _isSuperAdmin: false,
  _isBookmaker:  false,
  _stack: [],

  async init() {
    this.initMobileNav();
    const token = API.getToken(), op = API.getOp();
    if (token && op) {
      try { const me = await API.me(); API.setOp(me); this.showApp(me); }
      catch { API.clearToken(); this.showLogin(); }
    } else { this.showLogin(); }

    document.getElementById('login-form').addEventListener('submit', async(e) => {
      e.preventDefault();
      U.clearError('login-error');
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
      try {
        const res = await API.login(
          document.getElementById('login-email').value,
          document.getElementById('login-password').value
        );
        API.setToken(res.token); API.setOp(res.operator);
        this.showApp(res.operator);
      } catch(err) {
        U.setError('login-error', err.message);
        btn.disabled = false; btn.innerHTML = '<span>Sign In</span>';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      API.clearToken(); BetSlip.clear(); this.showLogin();
    });

    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.page) { this.navigateTo(item.dataset.page); this.closeSidebar(); }
      });
    });
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.page) this.navigateTo(item.dataset.page);
      });
    });
  },

  initMobileNav() {
    document.getElementById('mobile-menu-btn')?.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('sidebar-overlay')?.addEventListener('click', () => this.closeSidebar());
  },

  toggleSidebar() {
    const s = document.getElementById('sidebar'), o = document.getElementById('sidebar-overlay');
    if (s.classList.contains('open')) this.closeSidebar();
    else {
      s.classList.add('open'); o.classList.add('open');
      document.body.classList.add('sidebar-open');
      document.getElementById('mobile-menu-btn').textContent = '✕';
    }
  },
  closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
    document.body.classList.remove('sidebar-open');
    const btn = document.getElementById('mobile-menu-btn');
    if (btn) btn.textContent = '☰';
  },

  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  async showApp(op) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    const username = op.username || op.email || 'User';
    document.getElementById('sidebar-username').textContent = username;
    document.getElementById('sidebar-role').textContent = (op.role||'').replace(/_/g,' ').toUpperCase();
    document.getElementById('sidebar-avatar').textContent = username[0].toUpperCase();
    this._isSuperAdmin = op.role === 'super_admin';
    this._isBookmaker  = op.role === 'super_admin' || op.role === 'bookmaker';
    document.querySelectorAll('.super-admin-only').forEach(el => el.style.display = this._isSuperAdmin ? '' : 'none');
    document.querySelectorAll('.bookmaker-only').forEach(el =>  el.style.display = this._isBookmaker  ? '' : 'none');
    await WalletSelector.load();
    this.navigateTo('betslip');
  },

  // ── Root navigation — resets back stack ─────────────────────────
  navigateTo(page) {
    this._stack = [];
    this.closeSidebar();
    document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
    document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
    const titles = {
      dashboard:'Dashboard', betslip:'Bet Slip', bets:'Bet History',
      wallets:'Wallets', events:'Events', operators:'Operators',
      countries:'Countries', reports:'Reports'
    };
    this._showPage(page, titles[page] || page, {});
  },

  // ── Drill-down: push current, show new ──────────────────────────
  drillTo(page, title, params = {}) {
    const curPage  = document.querySelector('.page.active')?.id?.replace('page-', '');
    const curTitle = document.getElementById('page-title')?.textContent || '';
    this._stack.push({ page: curPage, title: curTitle });
    this._showPage(page, title, params);
  },

  // ── Back ─────────────────────────────────────────────────────────
  goBack() {
    if (!this._stack.length) return;
    const prev = this._stack.pop();
    this._showPage(prev.page, prev.title, prev.params || {});
  },

  // ── Internal page switcher ───────────────────────────────────────
  _showPage(page, title, params) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) { el.classList.add('active'); el.scrollTop = 0; }

    document.getElementById('page-title').textContent = title;

    // Show/hide back buttons everywhere
    const hasBack = this._stack.length > 0;
    document.getElementById('topbar-back')?.classList.toggle('hidden', !hasBack);
    document.getElementById('mobile-back-btn')?.classList.toggle('hidden', !hasBack);

    switch(page) {
      case 'dashboard':  Pages.renderDashboard();                break;
      case 'betslip':    Pages.renderBetslipPage();              break;
      case 'bets':       Pages.renderBetHistory();               break;
      case 'wallets':    Pages.renderWallets();                  break;
      case 'events':     Pages.renderSportsScreen();             break;
      case 'courses':    Pages.renderCoursesScreen(params);       break;
      case 'named-events': Pages.renderNamedEventsScreen(params); break;
      case 'meetings':   Pages.renderMeetingsScreen(params);     break;
      case 'races':      Pages.renderRacesScreen(params);        break;
      case 'operators':  Pages.renderOperators();                break;
      case 'countries':  Pages.renderCountries();                break;
      case 'reports':    Pages.renderReports();                  break;
    }
  }
};

App.init();

// Clock
setInterval(() => {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-ZA', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}, 1000);
