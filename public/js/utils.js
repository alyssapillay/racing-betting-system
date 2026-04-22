const U = {
  fmt: {
    money: (v) => `R ${Number(v||0).toFixed(2)}`,
    odds:  (v) => Number(v||0).toFixed(2),
    pct:   (v) => `${Number(v||0).toFixed(1)}%`,
    date:  (s) => {
      if (!s) return '—';
      // Handle YYYY-MM-DD strings without timezone issues
      const parts = s.split('T')[0].split('-');
      if (parts.length === 3) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${parseInt(parts[2])} ${months[parseInt(parts[1])-1]} ${parts[0]}`;
      }
      return s;
    },
    datetime: (s) => {
      if (!s) return '—';
      try { return new Date(s).toLocaleString('en-ZA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); }
      catch { return s; }
    },
    shortDate: (s) => {
      if (!s) return '—';
      const parts = (s.split('T')[0]).split('-');
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return `${parseInt(parts[2])} ${months[parseInt(parts[1])-1]}`;
    },
  },

  // ── Countdown ─────────────────────────────────────────────────
  // Returns a live countdown string for a given ISO datetime
  countdown(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - Date.now();
    if (diff <= 0) return { expired: true, label: 'CLOSED', cls: 'countdown-expired' };

    const totalSecs = Math.floor(diff / 1000);
    const d = Math.floor(totalSecs / 86400);
    const h = Math.floor((totalSecs % 86400) / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;

    let label, cls;
    if (d > 0)       { label = `${d}d ${h}h`;               cls = 'countdown-ok'; }
    else if (h > 0)  { label = `${h}h ${m}m`;               cls = 'countdown-ok'; }
    else if (m >= 5) { label = `${m}m ${String(s).padStart(2,'0')}s`; cls = 'countdown-warn'; }
    else             { label = `${m}m ${String(s).padStart(2,'0')}s`; cls = 'countdown-urgent'; }

    return { expired: false, label, cls };
  },

  statusPill(status) {
    const map = {
      open:'pill-green', upcoming:'pill-blue', settled:'pill-gray',
      closed:'pill-gray', pending:'pill-yellow', won:'pill-green',
      lost:'pill-red', refunded:'pill-purple', single:'pill-blue',
      multi:'pill-purple', super_admin:'pill-gold', bookmaker:'pill-blue',
      clerk:'pill-gray', active:'pill-green', inactive:'pill-red',
      deposit:'pill-green', withdrawal:'pill-red', bet:'pill-yellow', cashed_out:'pill-orange', cashout:'pill-orange',
      winnings:'pill-green', refund:'pill-purple',
    };
    const labels = { super_admin:'Super Admin', won:'Won ✓', settled:'Settled', open:'Open' };
    const cls   = map[status] || 'pill-gray';
    const label = labels[status] || (status ? status.charAt(0).toUpperCase()+status.slice(1) : '—');
    return `<span class="pill ${cls}">${label}</span>`;
  },

  plBadge(value) {
    const pos = value >= 0;
    const color = pos ? 'var(--green)' : 'var(--red)';
    const icon  = pos ? '▲' : '▼';
    return `<span style="font-family:var(--font-mono);color:${color};font-weight:700">${icon} ${U.fmt.money(Math.abs(value))}</span>`;
  },

  toast(msg, type='success', dur=3500) {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
      el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='0.3s';
      setTimeout(() => el.remove(), 300);
    }, dur);
  },

  modal: {
    show(title, html, wide=false) {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML   = html;
      document.getElementById('modal').style.maxWidth   = wide ? '860px' : '580px';
      document.getElementById('modal-overlay').classList.remove('hidden');
      // Scroll modal body to top
      setTimeout(() => { const b = document.getElementById('modal-body'); if(b) b.scrollTop=0; }, 10);
    },
    close() { document.getElementById('modal-overlay').classList.add('hidden'); }
  },

  el(id)        { return document.getElementById(id); },
  loading(c)    { c.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>'; },
  empty(c, msg='No records found') { c.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><p>${msg}</p></div>`; },
  setError(id, msg) { const e=document.getElementById(id); if(e){e.textContent=msg;e.classList.remove('hidden');} },
  clearError(id)    { const e=document.getElementById(id); if(e){e.textContent='';e.classList.add('hidden');} },
  escHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
  confirm(m) { return window.confirm(m); },
};

// ── Modal close handlers ─────────────────────────────────────────
document.getElementById('modal-close').addEventListener('click', () => U.modal.close());
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) U.modal.close();
});

// ── Countdown ticker — updates all [data-closes] elements every second ──
let _cdInterval = null;
function startCountdowns() {
  if (_cdInterval) clearInterval(_cdInterval);
  function tick() {
    document.querySelectorAll('[data-closes]').forEach(el => {
      const cd = U.countdown(el.dataset.closes);
      if (!cd) return;
      el.textContent  = cd.label;
      el.className    = `race-countdown ${cd.cls}`;
    });
  }
  tick(); // run immediately
  _cdInterval = setInterval(tick, 1000);
}

// ── Clock ─────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-ZA', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(updateClock, 1000);
updateClock();

// ── Theme Toggle ─────────────────────────────────────────────────
function toggleTheme() {
  const curr = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = curr === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sb_theme', next);
  _updateThemeUI(next);
}
function _updateThemeUI(theme) {
  const light = theme === 'light';
  [document.getElementById('theme-icon'), document.getElementById('theme-icon-m')]
    .forEach(el => { if (el) el.textContent = light ? '🌙' : '☀️'; });
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = light ? 'Dark' : 'Light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#f4f5f9' : '#111318');
}
// Apply saved theme immediately
(function() {
  const t = localStorage.getItem('sb_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
  _updateThemeUI(t);
})();
