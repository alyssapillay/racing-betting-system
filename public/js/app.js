const App = {
  async init() {
    this.initMobileNav();

    const token = API.getToken(), op = API.getOp();
    if (token && op) {
      try { const me = await API.me(); API.setOp(me); this.showApp(me); }
      catch { API.clearToken(); this.showLogin(); }
    } else { this.showLogin(); }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
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

    // Desktop sidebar nav
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (item.dataset.page) { this.navigateTo(item.dataset.page); this.closeSidebar(); }
      });
    });

    // Mobile bottom nav
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      item.addEventListener('click', () => { if (item.dataset.page) this.navigateTo(item.dataset.page); });
    });
  },

  initMobileNav() {
    const btn     = document.getElementById('mobile-menu-btn');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    btn?.addEventListener('click', () => this.toggleSidebar());
    overlay?.addEventListener('click', () => this.closeSidebar());
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen  = sidebar.classList.contains('open');
    if (isOpen) this.closeSidebar();
    else {
      sidebar.classList.add('open');
      overlay.classList.add('open');
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
    document.getElementById('sidebar-username').textContent = op.username;
    document.getElementById('sidebar-role').textContent = op.role.replace('_',' ').toUpperCase();
    document.getElementById('sidebar-avatar').textContent = op.username[0].toUpperCase();

    const isSuperAdmin = op.role === 'super_admin';
    const isBookmaker  = op.role === 'super_admin' || op.role === 'bookmaker';

    document.querySelectorAll('.super-admin-only').forEach(el => { el.style.display = isSuperAdmin ? '' : 'none'; });
    document.querySelectorAll('.bookmaker-only').forEach(el => { el.style.display   = isBookmaker  ? '' : 'none'; });

    await WalletSelector.load();
    this.navigateTo('dashboard');
  },

  navigateTo(page) {
    this.closeSidebar();

    // Update desktop sidebar
    document.querySelectorAll('.sidebar .nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));

    // Update mobile bottom nav
    document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));

    const titles = {
      dashboard:'Dashboard', betslip:'Bet Slip', bets:'Bet History',
      wallets:'Customer Wallets', events:'Events', operators:'Operators',
      countries:'Countries & Courses', reports:'Reports'
    };
    document.getElementById('page-title').textContent = titles[page] || page;

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) { el.classList.add('active'); el.scrollTop = 0; }

    switch(page) {
      case 'dashboard':  Pages.renderDashboard(); break;
      case 'betslip':    Pages.renderBetslipPage(); break;
      case 'bets':       Pages.renderBetHistory(); break;
      case 'wallets':    Pages.renderWallets(); break;
      case 'events':     Pages.renderEvents(); break;
      case 'operators':  Pages.renderOperators(); break;
      case 'countries':  Pages.renderCountries(); break;
      case 'reports':    Pages.renderReports(); break;
    }
  }
};

App.init();

// Keep slip badge in sync on mobile nav too
const _origBetSlipRender = BetSlip.render.bind(BetSlip);
BetSlip.render = function() {
  _origBetSlipRender();
  const count = this.selections.length;
  const mobileBadge = document.getElementById('mobile-slip-badge');
  if (mobileBadge) {
    mobileBadge.textContent = count;
    mobileBadge.classList.toggle('hidden', count === 0);
  }
};
