const U = {
  fmt: {
    money:    (v) => `R ${Number(v||0).toFixed(2)}`,
    odds:     (v) => Number(v||0).toFixed(2),
    date:     (s) => s ? new Date(s).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) : '—',
    datetime: (s) => s ? new Date(s).toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—',
    pct:      (v) => `${Number(v||0).toFixed(1)}%`,
  },

  countdown(isoString) {
    if (!isoString) return null;
    const diff = new Date(isoString) - new Date();
    if (diff <= 0) return { expired: true, label: 'CLOSED', cls: 'countdown-expired' };
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    let cls = 'countdown-ok';
    let label;
    if (h > 0)       { label = `${h}h ${m}m`; cls = 'countdown-ok'; }
    else if (m >= 10) { label = `${m}m ${s}s`; cls = 'countdown-ok'; }
    else if (m >= 3)  { label = `${m}m ${s}s`; cls = 'countdown-warn'; }
    else              { label = `${m}m ${s}s`; cls = 'countdown-urgent'; }
    return { expired: false, label, cls };
  },

  statusPill(status) {
    const map = {
      open:'pill-green', upcoming:'pill-blue', active:'pill-green',
      finished:'pill-gray', closed:'pill-gray', pending:'pill-yellow',
      active_slip:'pill-blue', won:'pill-green', lost:'pill-red',
      refunded:'pill-purple', single:'pill-blue', multi:'pill-purple',
      admin:'pill-gold', punter:'pill-gray', clerk:'pill-blue',
      scratched:'pill-red', deposit:'pill-green', withdrawal:'pill-red',
      bet:'pill-yellow', winnings:'pill-green', refund:'pill-purple',
    };
    const labels = {
      active_slip:'Active', won:'Won ✓', lost:'Lost', open:'Open',
      finished:'Finished', upcoming:'Upcoming',
    };
    const cls = map[status] || 'pill-gray';
    const label = labels[status] || (status ? status.charAt(0).toUpperCase()+status.slice(1) : '—');
    return `<span class="pill ${cls}">${label}</span>`;
  },

  toast(msg, type='success', duration=3500) {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.style.opacity='0'; el.style.transform='translateX(20px)'; el.style.transition='0.3s'; setTimeout(()=>el.remove(),300); }, duration);
  },

  modal: {
    show(title, bodyHTML, wide=false) {
      document.getElementById('modal-title').textContent = title;
      document.getElementById('modal-body').innerHTML = bodyHTML;
      document.getElementById('modal').style.maxWidth = wide ? '780px' : '560px';
      document.getElementById('modal-overlay').classList.remove('hidden');
    },
    close() { document.getElementById('modal-overlay').classList.add('hidden'); }
  },

  el(id) { return document.getElementById(id); },
  loading(c) { c.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>'; },
  empty(c, msg='No records found') { c.innerHTML = `<div class="empty-state"><div class="empty-icon">🏇</div><p>${msg}</p></div>`; },
  setError(id,msg) { const e=document.getElementById(id); if(e){e.textContent=msg;e.classList.remove('hidden');} },
  clearError(id) { const e=document.getElementById(id); if(e){e.textContent='';e.classList.add('hidden');} },
  escHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
  confirm(m) { return window.confirm(m); },
};

document.getElementById('modal-close').addEventListener('click', ()=>U.modal.close());
document.getElementById('modal-overlay').addEventListener('click', (e)=>{ if(e.target===document.getElementById('modal-overlay')) U.modal.close(); });

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(updateClock, 1000);
updateClock();
