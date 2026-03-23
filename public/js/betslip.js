const BetSlip = {
  selections: [],
  mode: 'single',
  stakeValue: 0,

  add(sel) {
    if (this.selections.find(s => s.horse_id === sel.horse_id)) { U.toast('Already on slip','warning'); return; }
    if (this.selections.find(s => s.race_id === sel.race_id)) { U.toast('One horse per race','warning'); return; }
    this.selections.push(sel);
    this.render();
    U.toast(`${sel.horse_name} added @ ${U.fmt.odds(sel.odds)}`, 'success', 2000);
  },

  remove(horse_id) { this.selections = this.selections.filter(s => s.horse_id !== horse_id); this.render(); },
  clear() { this.selections = []; this.stakeValue = 0; this.render(); },
  setMode(m) { this.mode = m; this.render(); },
  getCount() { return this.selections.length; },

  getCombinedOdds() {
    if (!this.selections.length) return 0;
    if (this.mode === 'single') return this.selections.length === 1 ? this.selections[0].odds : 0;
    return this.selections.reduce((acc, s) => acc * s.odds, 1);
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
    const page = document.getElementById('page-betslip');
    if (page && page.classList.contains('active')) Pages.renderBetslipPage();
  },

  async submit() {
    if (!this.selections.length) { U.toast('Add at least one selection','warning'); return; }
    if (this.mode==='single' && this.selections.length>1) { U.toast('Switch to Multi for multiple selections','warning'); return; }
    if (this.mode==='multi' && this.selections.length<2) { U.toast('Multi requires at least 2 selections','warning'); return; }
    if (!this.stakeValue || this.stakeValue<=0) { U.toast('Enter a valid stake','warning'); return; }
    try {
      const result = await API.submitBetslip({ selections: this.selections.map(s=>({horse_id:s.horse_id})), stake: this.stakeValue, slip_type: this.mode });
      U.toast(`Bet placed! Potential return: ${U.fmt.money(result.potential_return)}`,'success',5000);
      this.clear();
      const me = await API.me();
      API.setUser(me);
      document.getElementById('sidebar-balance').textContent = U.fmt.money(me.wallet_balance);
    } catch(err) { U.toast(err.message,'error'); }
  }
};
