const WalletSelector = {
  current: null,
  wallets: [],

  async load() {
    try { this.wallets = await API.getWallets(); this.render(); } catch(e) { console.error('Wallet load:', e); }
  },

  select(id) {
    this.current = this.wallets.find(w => w.id === id) || null;
    // Default to credit if available, else cash
    const w = this.current;
    if (w && (w.credit_limit||0) > 0) BetSlip.paymentType = 'credit';
    else BetSlip.paymentType = 'cash';
    this.render();
    const page = document.getElementById('page-betslip');
    if (page && page.classList.contains('active')) Pages.renderBetslipPage();
    if (this.current) U.toast(`${this.current.name} selected`, 'info', 1200);
  },

  render() {
    const el = document.getElementById('wallet-selector-bar');
    if (!el) return;
    const active = this.wallets.filter(w => w.is_active);
    if (!active.length) {
      el.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:13px">No wallets — <button class="btn btn-xs btn-primary" onclick="App.navigateTo(\'wallets\')">Create one</button></div>';
      return;
    }
    el.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${active.map(w => {
          const total = (w.cash_balance||0) + Math.max(0,(w.credit_limit||0)-(w.credit_used||0));
          return `<button class="wallet-chip ${this.current?.id===w.id?'active':''}" onclick="WalletSelector.select('${w.id}')">
            <span style="font-size:13px">👤</span>
            <span class="wallet-chip-name">${U.escHTML(w.name||'')}</span>
            <span class="wallet-chip-bal">${U.fmt.money(total)}</span>
          </button>`;
        }).join('')}
        <button class="btn btn-xs btn-ghost" onclick="App.navigateTo('wallets')">+ Manage</button>
      </div>
    `;
  }
};

const BetSlip = {
  selections:  [],
  mode:        'single',
  stakeValue:  0,
  paymentType: 'credit',   // DEFAULT = credit (account)

  add(sel) {
    if (!WalletSelector.current) { U.toast('Select a wallet first', 'warning'); return; }
    const betOn = sel.bet_on || 'win';
    if (this.selections.find(s => s.selection_id === sel.selection_id && s.bet_on === betOn)) {
      U.toast('Already on slip', 'warning'); return;
    }
    if (this.selections.find(s => s.event_id === sel.event_id)) {
      U.toast('One selection per event only', 'warning'); return;
    }
    this.selections.push({ ...sel, bet_on: betOn });
    this.render();
    U.toast(`${sel.name||''} (${betOn.toUpperCase()}) @ ${U.fmt.odds(sel.odds||0)}`, 'success', 2000);
  },

  remove(selId)      { this.selections = this.selections.filter(s => s.selection_id !== selId); this.render(); },
  clear()            { this.selections = []; this.stakeValue = 0; this.render(); },
  setMode(m)         { this.mode = m; this.render(); },
  setPaymentType(t)  { this.paymentType = t; this.render(); },

  setStake(v) {
    this.stakeValue = v;
    const el = document.getElementById('stake-input');
    if (el) el.value = v;
    const ret = document.getElementById('calc-return');
    if (ret) ret.textContent = U.fmt.money(this.getPotentialReturn());
  },

  getCount() { return this.selections.length; },

  getCombinedOdds() {
    if (!this.selections.length) return 0;
    if (this.mode === 'single') return this.selections.length === 1 ? (this.selections[0].odds || 0) : 0;
    return parseFloat(this.selections.reduce((a, s) => a * (s.odds || 1), 1).toFixed(4));
  },
  getPotentialReturn() {
    const odds = this.getCombinedOdds();
    if (odds <= 0 || this.stakeValue <= 0) return 0;
    return parseFloat((this.stakeValue * odds).toFixed(2));
  },

  render() {
    const count = this.selections.length;
    const badge = document.getElementById('slip-badge');
    if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
    const mbadge = document.getElementById('mobile-slip-badge');
    if (mbadge) { mbadge.textContent = count; mbadge.classList.toggle('hidden', count === 0); }
    const page = document.getElementById('page-betslip');
    if (page && page.classList.contains('active')) Pages.renderBetslipPage();
  },

  async submit() {
    if (!WalletSelector.current)  { U.toast('Select a wallet first', 'warning'); return; }
    if (!this.selections.length)  { U.toast('Add at least one selection', 'warning'); return; }
    if (this.mode === 'single' && this.selections.length > 1) { U.toast('Switch to Multi for multiple selections', 'warning'); return; }
    if (this.mode === 'multi'  && this.selections.length < 2) { U.toast('Multi needs 2+ selections', 'warning'); return; }
    if (!this.stakeValue || this.stakeValue <= 0) { U.toast('Enter a stake amount', 'warning'); return; }

    const btn = document.querySelector('.betslip-panel .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Placing...'; }

    try {
      const result = await API.placeBet({
        wallet_id:    WalletSelector.current.id,
        selections:   this.selections.map(s => ({ selection_id: s.selection_id, bet_on: s.bet_on || 'win' })),
        stake:        this.stakeValue,
        slip_type:    this.mode,
        payment_type: this.paymentType,
      });
      U.toast(`✅ Bet placed! Potential: ${U.fmt.money(result.potential_return)}`, 'success', 5000);
      // Update wallet in memory
      const w = WalletSelector.wallets.find(x => x.id === WalletSelector.current.id);
      if (w) {
        if (result.new_cash_balance !== undefined) w.cash_balance = result.new_cash_balance;
        if (result.credit_used      !== undefined) w.credit_used  = result.credit_used;
        WalletSelector.current = w;
      }
      WalletSelector.render();
      this.clear();
    } catch(err) {
      U.toast(err.message, 'error', 6000);
      if (btn) { btn.disabled = false; btn.textContent = 'Place Bet'; }
    }
  }
};
