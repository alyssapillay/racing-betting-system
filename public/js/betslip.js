// Active wallet for current transaction
const WalletSelector = {
  current: null,
  wallets: [],

  async load() {
    try {
      this.wallets = await API.getWallets();
      this.render();
    } catch(e) { console.error('Wallet load error:', e); }
  },

  select(walletId) {
    this.current = this.wallets.find(w => w.id === walletId) || null;
    this.render();
    BetSlip.render();
    U.toast(this.current ? `Wallet: ${this.current.name}` : 'No wallet selected', 'info', 2000);
  },

  render() {
    const el = U.el('wallet-selector-bar');
    if (!el) return;
    if (!this.wallets.length) { el.innerHTML='<span class="text-muted text-small">No wallets</span>'; return; }
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px">Active Wallet:</span>
        ${this.wallets.filter(w=>w.is_active).map(w=>`
          <button class="wallet-chip ${this.current?.id===w.id?'active':''}" onclick="WalletSelector.select('${w.id}')">
            <span class="wallet-chip-name">${U.escHTML(w.name)}</span>
            <span class="wallet-chip-bal">${U.fmt.money(w.balance)}</span>
          </button>
        `).join('')}
        <button class="btn btn-xs btn-ghost" onclick="Pages.showCreateWalletModal()">+ New</button>
      </div>
    `;
  }
};

const BetSlip = {
  selections: [],
  mode: 'single',
  stakeValue: 0,

  add(sel) {
    if (!WalletSelector.current) { U.toast('Select a wallet first','warning'); return; }
    if (this.selections.find(s=>s.selection_id===sel.selection_id)) { U.toast('Already on slip','warning'); return; }
    if (this.selections.find(s=>s.event_id===sel.event_id)) { U.toast('One selection per event','warning'); return; }
    this.selections.push(sel);
    this.render();
    U.toast(`${sel.name} @ ${U.fmt.odds(sel.odds)}`, 'success', 2000);
  },

  remove(selId) { this.selections=this.selections.filter(s=>s.selection_id!==selId); this.render(); },
  clear() { this.selections=[]; this.stakeValue=0; this.render(); },
  setMode(m) { this.mode=m; this.render(); },
  getCount() { return this.selections.length; },

  getCombinedOdds() {
    if (!this.selections.length) return 0;
    if (this.mode==='single') return this.selections.length===1?this.selections[0].odds:0;
    return this.selections.reduce((acc,s)=>acc*s.odds,1);
  },
  getPotentialReturn() {
    const odds=this.getCombinedOdds();
    if (odds<=0||this.stakeValue<=0) return 0;
    return parseFloat((this.stakeValue*odds).toFixed(2));
  },

  render() {
    const count=this.selections.length;
    const badge=U.el('slip-badge');
    if(badge){badge.textContent=count;badge.classList.toggle('hidden',count===0);}
    const page=U.el('page-betslip');
    if(page&&page.classList.contains('active')) Pages.renderBetslipPage();
  },

  async submit() {
    if (!WalletSelector.current) { U.toast('Select a wallet first','warning'); return; }
    if (!this.selections.length) { U.toast('Add at least one selection','warning'); return; }
    if (this.mode==='single'&&this.selections.length>1){ U.toast('Switch to Multi','warning'); return; }
    if (this.mode==='multi'&&this.selections.length<2){ U.toast('Multi needs 2+ selections','warning'); return; }
    if (!this.stakeValue||this.stakeValue<=0){ U.toast('Enter a valid stake','warning'); return; }

    try {
      const result = await API.placeBet({
        wallet_id: WalletSelector.current.id,
        selections: this.selections.map(s=>({selection_id:s.selection_id})),
        stake: this.stakeValue,
        slip_type: this.mode,
      });
      U.toast(`Bet placed! Potential return: ${U.fmt.money(result.potential_return)}`,'success',5000);
      // Update wallet balance in memory
      const wallet = WalletSelector.wallets.find(w=>w.id===WalletSelector.current.id);
      if (wallet) {
        wallet.balance = result.new_wallet_balance;
        WalletSelector.current.balance = result.new_wallet_balance;
      }
      WalletSelector.render();
      this.clear();
    } catch(err) { U.toast(err.message,'error',5000); }
  }
};
