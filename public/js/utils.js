const U = {
  fmt: {
    money:(v)=>`R ${Number(v||0).toFixed(2)}`,
    odds:(v)=>Number(v||0).toFixed(2),
    date:(s)=>s?new Date(s).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}):'—',
    datetime:(s)=>s?new Date(s).toLocaleString('en-ZA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—',
    pct:(v)=>`${Number(v||0).toFixed(1)}%`,
  },

  countdown(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - new Date();
    if (diff <= 0) return { expired:true, label:'CLOSED', cls:'countdown-expired' };
    const h=Math.floor(diff/3600000), m=Math.floor((diff%3600000)/60000), s=Math.floor((diff%60000)/1000);
    let label, cls;
    if (h>0)      { label=`${h}h ${m}m`;     cls='countdown-ok'; }
    else if (m>=5){ label=`${m}m ${s}s`;     cls='countdown-warn'; }
    else          { label=`${m}m ${s}s`;     cls='countdown-urgent'; }
    return { expired:false, label, cls };
  },

  statusPill(status) {
    const map = {
      open:'pill-green', upcoming:'pill-blue', settled:'pill-gray', closed:'pill-gray',
      pending:'pill-yellow', won:'pill-green', lost:'pill-red', refunded:'pill-purple',
      single:'pill-blue', multi:'pill-purple',
      super_admin:'pill-gold', bookmaker:'pill-blue', clerk:'pill-gray',
      active:'pill-green', inactive:'pill-red',
      deposit:'pill-green', withdrawal:'pill-red', bet:'pill-yellow',
      winnings:'pill-green', refund:'pill-purple',
    };
    const labels = { super_admin:'Super Admin', won:'Won ✓', settled:'Settled' };
    const cls = map[status]||'pill-gray';
    const label = labels[status]||(status?status.charAt(0).toUpperCase()+status.slice(1):'—');
    return `<span class="pill ${cls}">${label}</span>`;
  },

  toast(msg, type='success', dur=3500) {
    const icons={success:'✅',error:'❌',warning:'⚠️',info:'ℹ️'};
    const el=document.createElement('div');
    el.className=`toast ${type}`;
    el.innerHTML=`<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(20px)';el.style.transition='0.3s';setTimeout(()=>el.remove(),300);},dur);
  },

  modal:{
    show(title,html,wide=false){
      document.getElementById('modal-title').textContent=title;
      document.getElementById('modal-body').innerHTML=html;
      document.getElementById('modal').style.maxWidth=wide?'800px':'580px';
      document.getElementById('modal-overlay').classList.remove('hidden');
    },
    close(){ document.getElementById('modal-overlay').classList.add('hidden'); }
  },

  el(id){ return document.getElementById(id); },
  loading(c){ c.innerHTML='<div class="loading"><div class="spinner"></div> Loading...</div>'; },
  empty(c,msg='No records'){ c.innerHTML=`<div class="empty-state"><div class="empty-icon">📭</div><p>${msg}</p></div>`; },
  setError(id,msg){ const e=document.getElementById(id); if(e){e.textContent=msg;e.classList.remove('hidden');} },
  clearError(id){ const e=document.getElementById(id); if(e){e.textContent='';e.classList.add('hidden');} },
  escHTML(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); },
  confirm(m){ return window.confirm(m); },
};

document.getElementById('modal-close').addEventListener('click',()=>U.modal.close());
document.getElementById('modal-overlay').addEventListener('click',(e)=>{ if(e.target===document.getElementById('modal-overlay'))U.modal.close(); });

let countdownInterval=null;
function startCountdowns(){
  if(countdownInterval) clearInterval(countdownInterval);
  countdownInterval=setInterval(()=>{
    document.querySelectorAll('[data-closes]').forEach(el=>{
      const cd=U.countdown(el.dataset.closes);
      if(!cd)return;
      el.textContent=cd.label;
      el.className=`race-countdown ${cd.cls}`;
    });
  },1000);
}

function updateClock(){
  const now=new Date();
  const el=document.getElementById('clock');
  if(el) el.textContent=now.toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(updateClock,1000);
updateClock();
