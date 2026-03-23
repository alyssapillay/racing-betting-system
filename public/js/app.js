const App = {
  async init() {
    const token = API.getToken(), op = API.getOp();
    if (token && op) {
      try { const me = await API.me(); API.setOp(me); this.showApp(me); }
      catch { API.clearToken(); this.showLogin(); }
    } else { this.showLogin(); }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      U.clearError('login-error');
      const btn = document.getElementById('login-btn');
      btn.disabled=true; btn.innerHTML='<div class="spinner"></div>';
      try {
        const res = await API.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
        API.setToken(res.token); API.setOp(res.operator);
        this.showApp(res.operator);
      } catch(err) {
        U.setError('login-error', err.message);
        btn.disabled=false; btn.innerHTML='<span>Sign In</span>';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      API.clearToken(); BetSlip.clear(); this.showLogin();
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { if(item.dataset.page) this.navigateTo(item.dataset.page); });
    });
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

    // Load wallets for selector
    await WalletSelector.load();
    this.navigateTo('dashboard');
  },

  navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page===page));
    const titles = { dashboard:'Dashboard', betslip:'Bet Slip', bets:'Bet History', wallets:'Customer Wallets', events:'Events', operators:'Operators', countries:'Countries & Courses', reports:'Reports' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.add('active');
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
