const App = {
  async init() {
    const token = API.getToken();
    const user  = API.getUser();
    if (token && user) {
      try { const me = await API.me(); API.setUser(me); this.showApp(me); }
      catch { API.clearToken(); this.showLogin(); }
    } else { this.showLogin(); }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      U.clearError('login-error');
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.innerHTML = '<div class="spinner"></div>';
      try {
        const res = await API.login(document.getElementById('login-email').value, document.getElementById('login-password').value);
        API.setToken(res.token); API.setUser(res.user); this.showApp(res.user);
      } catch(err) {
        U.setError('login-error', err.message);
        btn.disabled = false; btn.innerHTML = '<span>Sign In</span>';
      }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      API.clearToken(); BetSlip.clear(); this.showLogin();
    });

    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { if (item.dataset.page) this.navigateTo(item.dataset.page); });
    });
  },

  showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  showApp(user) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('sidebar-username').textContent = user.username;
    document.getElementById('sidebar-role').textContent = user.role.toUpperCase();
    document.getElementById('sidebar-avatar').textContent = user.username[0].toUpperCase();
    document.getElementById('sidebar-balance').textContent = U.fmt.money(user.wallet_balance);
    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = user.role==='admin' ? '' : 'none'; });
    this.navigateTo('dashboard');
  },

  navigateTo(page) {
    document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page===page));
    const titles = { dashboard:'Dashboard', countries:'Countries & Courses', meetings:'Race Meetings', races:'Races & Horses', betslip:'Bet Slip', mybets:'My Bets', users:'User Management', reports:'Reports & Analytics' };
    document.getElementById('page-title').textContent = titles[page] || page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(`page-${page}`);
    if (el) el.classList.add('active');
    switch(page) {
      case 'dashboard':  Pages.renderDashboard(); break;
      case 'countries':  Pages.renderCountries(); break;
      case 'meetings':   Pages.renderMeetings(); break;
      case 'races':      Pages.renderRaces(); break;
      case 'betslip':    Pages.renderBetslipPage(); break;
      case 'mybets':     Pages.renderMyBets(); break;
      case 'users':      Pages.renderUsers(); break;
      case 'reports':    Pages.renderReports(); break;
    }
  }
};

App.init();
setInterval(async () => {
  if (!API.getToken()) return;
  try { const me = await API.me(); API.setUser(me); document.getElementById('sidebar-balance').textContent = U.fmt.money(me.wallet_balance); }
  catch {}
}, 30000);
