const Pages = {

  // ─── DASHBOARD ────────────────────────────────────────────────
  async renderDashboard() {
    const page = U.el('page-dashboard');
    U.loading(page);
    try {
      const s = await API.dashStats();
      page.innerHTML = `
        <div class="stats-grid">
          <div class="stat-card gold"><div class="stat-icon">👛</div><div class="stat-label">Active Wallets</div><div class="stat-value">${s.total_wallets}</div></div>
          <div class="stat-card blue"><div class="stat-icon">🎯</div><div class="stat-label">Open Events</div><div class="stat-value">${s.open_events}</div></div>
          <div class="stat-card yellow"><div class="stat-icon">⏳</div><div class="stat-label">Pending Bets</div><div class="stat-value">${s.pending_bets}</div></div>
          <div class="stat-card green"><div class="stat-icon">💰</div><div class="stat-label">Total Staked</div><div class="stat-value money">${U.fmt.money(s.total_staked)}</div></div>
          <div class="stat-card red"><div class="stat-icon">⚡</div><div class="stat-label">Total Liability</div><div class="stat-value money">${U.fmt.money(s.total_liability)}</div></div>
          <div class="stat-card ${s.house_profit>=0?'gold':'red'}"><div class="stat-icon">${s.house_profit>=0?'📈':'📉'}</div><div class="stat-label">House P&L</div><div class="stat-value money">${U.fmt.money(s.house_profit)}</div></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
          <div class="card">
            <div class="card-title">🏆 Sports Breakdown</div>
            ${s.sports_breakdown.length ? s.sports_breakdown.map(sp=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:20px">${sp.icon}</span>
                <div style="flex:1"><div style="font-weight:600;font-size:13px">${sp.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${sp.bet_count} bets</div></div>
                <div style="text-align:right">
                  <div class="mono" style="color:var(--gold-bright)">${U.fmt.money(sp.staked)}</div>
                  <div class="mono" style="font-size:11px;color:${sp.staked-sp.paid>=0?'var(--green)':'var(--red)'}">${U.fmt.money(sp.staked-sp.paid)} P&L</div>
                </div>
              </div>
            `).join('') : '<p class="text-muted text-small">No bets yet</p>'}
          </div>
          <div class="card">
            <div class="card-title">🎟️ Recent Bets</div>
            ${s.recent_bets.length ? s.recent_bets.map(b=>`
              <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                <span style="font-size:16px">${b.sport_icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${U.escHTML(b.wallet_name)} → ${U.escHTML(b.selection_name)}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${U.escHTML(b.event_name)}</div>
                </div>
                <div style="text-align:right;white-space:nowrap">
                  <div class="mono" style="font-size:12px">${U.fmt.money(b.stake)}</div>
                  ${U.statusPill(b.status)}
                </div>
              </div>
            `).join('') : '<p class="text-muted text-small">No bets yet</p>'}
          </div>
        </div>
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  // ─── WALLETS ───────────────────────────────────────────────────
  async renderWallets() {
    const page = U.el('page-wallets');
    U.loading(page);
    try {
      const wallets = await API.getWallets();

      // Pair wallets by customer — match "Name" with "Name (Credit)"
      const customers = {};
      for (const w of wallets) {
        const baseName = w.name.replace(/\s*\(Credit\)\s*$/i, '').trim();
        if (!customers[baseName]) customers[baseName] = { name: baseName, phone: w.phone, cash: null, credit: null };
        if (w.wallet_type === 'credit') customers[baseName].credit = w;
        else customers[baseName].cash = w;
      }

      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Customer Wallets</div>
          <button class="btn btn-primary" onclick="Pages.showCreateWalletModal()">+ New Customer</button>
        </div>
        <div class="wallets-grid">
          ${Object.values(customers).map(cu => `
            <div class="customer-wallet-card">

              <!-- Customer Header -->
              <div class="cwc-header">
                <div class="cwc-avatar">${cu.name[0].toUpperCase()}</div>
                <div class="cwc-identity">
                  <div class="cwc-name">${U.escHTML(cu.name)}</div>
                  ${cu.phone ? `<div class="cwc-phone">📞 ${U.escHTML(cu.phone)}</div>` : ''}
                </div>
                <div class="cwc-total-badge">
                  Total: ${U.fmt.money((cu.cash?.balance||0) + (cu.credit?.available||0))}
                </div>
              </div>

              <!-- Side-by-side balances -->
              <div class="cwc-balances">

                <!-- Cash side -->
                <div class="cwc-balance-col cwc-cash">
                  <div class="cwc-bal-label">💵 Cash</div>
                  <div class="cwc-bal-amount">${U.fmt.money(cu.cash?.balance||0)}</div>
                  ${cu.cash ? `
                  <div class="cwc-bal-stats">
                    <span>${cu.cash.total_bets||0} bets</span>
                    <span class="${(cu.cash.total_won||0)-(cu.cash.total_staked||0)>=0?'money-pos':'money-neg'}">${U.fmt.money((cu.cash.total_won||0)-(cu.cash.total_staked||0))} P&L</span>
                  </div>
                  <div class="cwc-bal-actions">
                    <button class="btn btn-xs btn-success" onclick="Pages.showWalletFundsModal('${cu.cash.id}','${U.escHTML(cu.name)}','deposit')">+ Deposit</button>
                    <button class="btn btn-xs btn-warning" onclick="Pages.showWalletFundsModal('${cu.cash.id}','${U.escHTML(cu.name)}','withdraw')">- Withdraw</button>
                  </div>` : `
                  <div class="cwc-bal-stats"><span class="text-muted text-small">No cash wallet</span></div>
                  <button class="btn btn-xs btn-ghost" style="margin-top:6px;width:100%" onclick="Pages.showAddWalletTypeModal('${U.escHTML(cu.name)}',cu.phone,'cash')">+ Add Cash</button>
                  `}
                </div>

                <div class="cwc-divider"></div>

                <!-- Credit side -->
                <div class="cwc-balance-col cwc-credit">
                  <div class="cwc-bal-label">💳 Credit</div>
                  <div class="cwc-bal-amount" style="color:var(--purple)">${U.fmt.money(cu.credit?.available||0)}</div>
                  ${cu.credit ? `
                  <div class="cwc-bal-stats">
                    <span>Limit: ${U.fmt.money(cu.credit.credit_limit||0)}</span>
                    <span style="color:${(cu.credit.balance||0)<0?'var(--red)':'var(--text-muted)'}">Used: ${U.fmt.money(Math.abs(Math.min(cu.credit.balance||0,0)))}</span>
                  </div>
                  <div class="cwc-bal-actions">
                    <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCreditModal('${cu.credit.id}','${U.escHTML(cu.name)}',${cu.credit.credit_limit||0})">Edit Limit</button>
                    <button class="btn btn-xs btn-success" onclick="Pages.showWalletFundsModal('${cu.credit.id}','${U.escHTML(cu.name)} Credit','deposit')">Repay</button>
                  </div>` : `
                  <div class="cwc-bal-stats"><span class="text-muted text-small">No credit wallet</span></div>
                  <button class="btn btn-xs btn-ghost" style="margin-top:6px;width:100%" onclick="Pages.quickAddCredit('${U.escHTML(cu.name)}','${cu.phone||''}')">+ Add Credit</button>
                  `}
                </div>
              </div>

              <!-- Footer actions -->
              <div class="cwc-footer">
                ${cu.cash ? `<button class="btn btn-xs btn-info" onclick="Pages.showWalletTxns('${cu.cash.id}','${U.escHTML(cu.name)} Cash')">💵 Cash Txns</button>` : ''}
                ${cu.credit ? `<button class="btn btn-xs btn-info" onclick="Pages.showWalletTxns('${cu.credit.id}','${U.escHTML(cu.name)} Credit')">💳 Credit Txns</button>` : ''}
                ${cu.cash ? `<button class="btn btn-xs btn-ghost" onclick="Pages.showWalletBets('${cu.cash.id}','${U.escHTML(cu.name)}')">View Bets</button>` : ''}
              </div>

            </div>
          `).join('')}
        </div>
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  async quickAddCredit(name, phone) {
    U.modal.show(`Add Credit Wallet — ${name}`, `
      <div class="form-group">
        <label>Credit Limit (R)</label>
        <input type="number" id="qac-limit" value="1000" min="0" step="100" />
      </div>
      <div id="qac-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.doQuickAddCredit('${U.escHTML(name)}','${phone}')">Add Credit Wallet</button>
      </div>
    `);
  },

  async doQuickAddCredit(name, phone) {
    U.clearError('qac-error');
    const credit_limit = parseFloat(U.el('qac-limit').value) || 0;
    try {
      await API.createWallet({ name: name + ' (Credit)', phone: phone||null, wallet_type: 'credit', balance: 0, credit_limit });
      U.modal.close(); U.toast('Credit wallet added');
      await WalletSelector.load();
      this.renderWallets();
    } catch(err) { U.setError('qac-error', err.message); }
  },

  showEditCreditModal(id, name, currentLimit) {
    U.modal.show(`Edit Credit Limit — ${name}`, `
      <div class="form-group">
        <label>Credit Limit (R)</label>
        <input type="number" id="ecl-limit" value="${currentLimit}" min="0" step="100" />
      </div>
      <div id="ecl-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCreditLimit('${id}')">Save</button>
      </div>
    `);
  },

  async updateCreditLimit(id) {
    const limit = parseFloat(U.el('ecl-limit').value);
    if (isNaN(limit)||limit<0) { U.setError('ecl-error','Enter valid amount'); return; }
    try {
      await API.updateWallet(id, { credit_limit: limit });
      U.modal.close(); U.toast('Credit limit updated');
      await WalletSelector.load();
      this.renderWallets();
    } catch(err) { U.setError('ecl-error', err.message); }
  },


  showCreateWalletModal() {
    U.modal.show('New Customer', `
      <p class="text-muted text-small" style="margin-bottom:12px">Creates both a Cash and Credit wallet for this customer.</p>
      <div class="form-group"><label>Customer Name</label><input type="text" id="wn-name" placeholder="e.g. John Smith" /></div>
      <div class="form-group"><label>Phone Number</label><input type="text" id="wn-phone" placeholder="e.g. 082-111-2222" /></div>
      <div class="form-row form-row-2">
        <div class="form-group">
          <label>Opening Cash Balance (R)</label>
          <input type="number" id="wn-cash" value="0" min="0" step="100" />
        </div>
        <div class="form-group">
          <label>Credit Limit (R)</label>
          <input type="number" id="wn-credit" value="0" min="0" step="100" />
          <span class="text-muted text-small">Set 0 for no credit</span>
        </div>
      </div>
      <div id="wn-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createWallet()">Create Customer</button>
      </div>
    `);
  },


  async createWallet() {
    U.clearError('wn-error');
    const name         = U.el('wn-name').value.trim();
    const phone        = U.el('wn-phone').value.trim() || null;
    const cashBalance  = parseFloat(U.el('wn-cash').value)   || 0;
    const creditLimit  = parseFloat(U.el('wn-credit').value) || 0;
    if (!name) { U.setError('wn-error', 'Customer name required'); return; }
    try {
      // Always create cash wallet
      await API.createWallet({ name, phone, wallet_type: 'cash', balance: cashBalance, credit_limit: 0 });
      // Create credit wallet if limit > 0
      if (creditLimit > 0) {
        await API.createWallet({ name: name + ' (Credit)', phone, wallet_type: 'credit', balance: 0, credit_limit: creditLimit });
      }
      U.modal.close();
      U.toast(`${name} added${creditLimit > 0 ? ' with cash + credit wallets' : ' with cash wallet'}`);
      await WalletSelector.load();
      this.renderWallets();
    } catch(err) { U.setError('wn-error', err.message); }
  },


  showWalletFundsModal(id, name, type) {
    const isD = type==='deposit';
    U.modal.show(`${isD?'💰 Deposit':'💸 Withdraw'} — ${name}`, `
      <div class="form-group"><label>Amount (R)</label><input type="number" id="wf-amt" min="0.01" step="50" /></div>
      <div class="form-group"><label>Description</label><input type="text" id="wf-desc" placeholder="${isD?'Cash deposit':'Payout'}" /></div>
      <div id="wf-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn ${isD?'btn-success':'btn-warning'}" onclick="Pages.walletFunds('${id}','${type}')">Confirm</button>
      </div>
    `);
  },

  async walletFunds(id, type) {
    U.clearError('wf-error');
    const amount=parseFloat(U.el('wf-amt').value), description=U.el('wf-desc').value.trim()||undefined;
    if (!amount||amount<=0) { U.setError('wf-error','Enter valid amount'); return; }
    try {
      const res = type==='deposit' ? await API.depositWallet(id,{amount,description}) : await API.withdrawWallet(id,{amount,description});
      U.modal.close(); U.toast(`Done. New balance: ${U.fmt.money(res.new_balance)}`);
      await WalletSelector.load();
      this.renderWallets();
    } catch(err) { U.setError('wf-error',err.message); }
  },

  async showWalletTxns(id, name) {
    const txns = await API.getWalletTxns(id);
    U.modal.show(`Transactions — ${name}`, `
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Amount</th><th>Balance</th><th>Description</th><th>Date</th></tr></thead>
        <tbody>${txns.length?txns.map(t=>`<tr>
          <td>${U.statusPill(t.type)}</td>
          <td class="${t.type==='bet'?'money-neg':'money-pos'} mono">${t.type==='bet'?'-':'+'} ${U.fmt.money(t.amount)}</td>
          <td class="mono">${U.fmt.money(t.balance_after)}</td>
          <td class="text-muted text-small">${U.escHTML(t.description||'')}</td>
          <td class="text-muted text-small">${U.fmt.datetime(t.created_at)}</td>
        </tr>`).join(''):'<tr><td colspan="5" class="text-muted">No transactions</td></tr>'}</tbody>
      </table></div>
    `, true);
  },

  async showWalletBets(id, name) {
    const bets = await API.getWalletBets(id);
    U.modal.show(`Bets — ${name}`, `
      <div class="table-wrap"><table>
        <thead><tr><th>Sport</th><th>Selection</th><th>Event</th><th>Stake</th><th>Potential</th><th>Return</th><th>Status</th></tr></thead>
        <tbody>${bets.length?bets.map(b=>`<tr>
          <td>${b.sport_icon} ${b.sport_name}</td>
          <td><strong>${U.escHTML(b.selection_name)}</strong></td>
          <td class="text-muted text-small">${U.escHTML(b.event_name)}</td>
          <td class="mono">${U.fmt.money(b.stake)}</td>
          <td class="money-pos mono">${U.fmt.money(b.potential_return)}</td>
          <td class="${b.actual_return>0?'money-pos':'text-muted'} mono">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
          <td>${U.statusPill(b.status)}</td>
        </tr>`).join(''):'<tr><td colspan="7" class="text-muted">No bets</td></tr>'}</tbody>
      </table></div>
    `, true);
  },

  async deleteWallet(id) {
    if (!U.confirm('Delete this wallet?')) return;
    try { await API.deleteWallet(id); U.toast('Deleted'); await WalletSelector.load(); this.renderWallets(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ─── EVENTS (all sports) ────────────────────────────────────────
  async renderEvents() {
    const page = U.el('page-events');
    U.loading(page);
    try {
      const [sports, events] = await Promise.all([API.getSports(), API.getEvents()]);

      // Group by sport
      const bySport = {};
      for (const e of events) {
        if (!bySport[e.sport_id]) bySport[e.sport_id] = { name:e.sport_name, icon:e.sport_icon, events:[] };
        bySport[e.sport_id].events.push(e);
      }

      const isSuperAdmin = API.getOp()?.role === 'super_admin';

      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Events Management</div>
          <button class="btn btn-primary" onclick="Pages.showCreateEventModal()">+ New Event</button>
        </div>
        ${Object.keys(bySport).length===0 ? '<div class="empty-state"><div class="empty-icon">🎯</div><p>No events yet</p></div>' :
          Object.values(bySport).map(sp=>`
            <div style="margin-bottom:24px">
              <div class="country-section-header">
                <span style="font-size:28px">${sp.icon}</span>
                <span style="font-family:var(--font-display);font-size:22px;letter-spacing:1.5px">${sp.name}</span>
                <span class="pill pill-gray">${sp.events.length} event(s)</span>
              </div>
              ${sp.events.map(ev=>`
                <div class="race-block" id="ev-block-${ev.id}" style="margin-bottom:8px">
                  <div class="race-block-header" onclick="Pages.toggleEvent('${ev.id}')">
                    <div class="race-block-info">
                      <div class="race-block-name">${ev.flag||'🏆'} ${U.escHTML(ev.event_name)}</div>
                      <div class="race-block-meta">${ev.country_name||''} ${ev.course_name?'· '+ev.course_name:''} · ${U.fmt.date(ev.event_date)} ${ev.event_time} · ${ev.selection_count} selections ${ev.winner_name?'· 🏆 '+ev.winner_name:''}</div>
                    </div>
                    ${ev.closes_at?`<span class="race-countdown" data-closes="${ev.closes_at}">...</span>`:''}
                    ${U.statusPill(ev.status)}
                    <div class="flex gap-8" onclick="event.stopPropagation()">
                      <button class="btn btn-xs btn-info" onclick="Pages.showAddSelectionModal('${ev.id}','${U.escHTML(ev.event_name)}')">+ Selection</button>
                      ${ev.status==='open'?`<button class="btn btn-xs btn-warning" onclick="Pages.showSettleModal('${ev.id}')">🏆 Result</button>`:''}
                      <button class="btn btn-xs btn-ghost" onclick="Pages.showEventPL('${ev.id}')">P&L</button>
                      ${isSuperAdmin?`<button class="btn btn-xs btn-ghost" onclick="Pages.showEditEventModal('${ev.id}',${JSON.stringify(ev).replace(/"/g,'&quot;')})">✏️</button>`:''}
                      ${isSuperAdmin?`<button class="btn btn-xs btn-danger" onclick="Pages.deleteEvent('${ev.id}')">✕</button>`:''}
                    </div>
                  </div>
                  <div class="race-block-body hidden" id="ev-body-${ev.id}">
                    <div id="ev-sels-${ev.id}" style="margin-top:12px"></div>
                  </div>
                </div>
              `).join('')}
            </div>
          `).join('')
        }
      `;
      startCountdowns();
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async toggleEvent(evId) {
    const body = U.el(`ev-body-${evId}`);
    body.classList.toggle('hidden');
    if (!body.classList.contains('hidden')) await this.renderSelections(evId);
  },

  async renderSelections(evId) {
    const c = U.el(`ev-sels-${evId}`);
    try {
      const sels = await API.getSelections(evId);
      if (!sels.length) { c.innerHTML='<p class="text-muted text-small" style="padding:8px 0">No selections. Click "+ Selection" to add.</p>'; return; }

      const totalLiab = sels.reduce((s,sel)=>s+sel.total_liability,0);

      c.innerHTML = `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="border-bottom:2px solid var(--border)">
              <th style="padding:8px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">No.</th>
              <th style="padding:8px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Name</th>
              <th style="padding:8px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Info</th>
              <th style="padding:8px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Form</th>
              <th style="padding:8px;text-align:center;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Win Odds</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Bets</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Staked</th>
              <th style="padding:8px;text-align:right;color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:1px">Potential Win (client)</th>
              <th style="padding:8px;text-align:right;color:var(--red);font-size:10px;text-transform:uppercase;letter-spacing:1px">Potential Loss (house)</th>
              <th style="padding:8px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:1px">Status</th>
              <th style="padding:8px"></th>
            </tr></thead>
            <tbody>
              ${sels.map(s=>`<tr style="border-bottom:1px solid var(--border);transition:background 0.1s" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''">
                <td style="padding:10px 8px;color:var(--text-muted);font-family:var(--font-mono)">${s.barrier_number||'—'}</td>
                <td style="padding:10px 8px"><strong>${U.escHTML(s.name)}</strong>${s.is_winner?'<span style="margin-left:6px">🏆</span>':''}</td>
                <td style="padding:10px 8px;font-size:11px;color:var(--text-muted)">
                  ${s.jockey?`<div>🎽 ${U.escHTML(s.jockey)}</div>`:''}
                  ${s.trainer?`<div>🎩 ${U.escHTML(s.trainer)}</div>`:''}
                  ${s.colour||s.age?`<div>${U.escHTML(s.colour||'')} ${s.age?s.age+'yo':''}</div>`:''}
                  ${s.sub_info?`<div>${U.escHTML(s.sub_info)}</div>`:''}
                </td>
                <td style="padding:10px 8px;font-family:var(--font-mono);font-size:11px;color:var(--blue)">${U.escHTML(s.form||'—')}</td>
                <td style="padding:10px 8px;text-align:center">
                  <span style="font-family:var(--font-display);font-size:22px;color:var(--gold-bright)">${U.fmt.odds(s.odds)}</span>
                  ${s.opening_odds!==s.odds?`<div style="font-size:10px;color:var(--text-muted)">was ${U.fmt.odds(s.opening_odds)}</div>`:''}
                </td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono)">${s.bet_count}</td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono)">${U.fmt.money(s.total_staked)}</td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono);color:var(--gold-bright);font-weight:700">${U.fmt.money(s.total_liability)}</td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono);color:${s.house_exposure>=0?'var(--red)':'var(--green)'};font-weight:700">${U.fmt.money(Math.abs(s.house_exposure))} ${s.house_exposure>=0?'loss':'profit'}</td>
                <td style="padding:10px 8px">${U.statusPill(s.status)}</td>
                <td style="padding:10px 8px">
                  <div class="flex gap-8">
                    <button class="btn btn-xs btn-ghost" onclick="Pages.showEditSelectionModal('${s.id}',${JSON.stringify(s).replace(/"/g,'&quot;')})">✏️</button>
                    ${s.status==='active'?`<button class="btn btn-xs btn-warning" onclick="Pages.showScratchModal('${s.id}','${U.escHTML(s.name)}','${evId}')">Scratch</button>`:''}
                    <button class="btn btn-xs btn-danger" onclick="Pages.deleteSelection('${s.id}','${evId}')">✕</button>
                  </div>
                </td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border)">
                <td colspan="7" style="padding:10px 8px;font-weight:700;font-size:13px">TOTALS</td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono);color:var(--gold-bright);font-weight:700">${U.fmt.money(totalLiab)}</td>
                <td style="padding:10px 8px;text-align:right;font-family:var(--font-mono);color:var(--red);font-weight:700">Max house loss: ${U.fmt.money(totalLiab)}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;
    } catch(err) { c.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async showCreateEventModal() {
    const [sports, countries, courses] = await Promise.all([API.getSports(), API.getCountries(), API.getAllCourses()]);
    const isSuperAdmin = API.getOp()?.role === 'super_admin';
    U.modal.show('Create New Event', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Sport</label>
          <select id="ev-sport">
            ${sports.map(s=>`<option value="${s.id}">${s.icon} ${s.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Country (optional)</label>
          <select id="ev-country">
            <option value="">— None —</option>
            ${countries.map(c=>`<option value="${c.id}">${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group"><label>Event Name</label><input type="text" id="ev-name" placeholder="e.g. Arsenal vs Man City" /></div>
      <div class="form-group"><label>Course / Venue (optional)</label>
        <select id="ev-course">
          <option value="">— None —</option>
          ${courses.map(c=>`<option value="${c.id}">${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Date</label><input type="date" id="ev-date" ${!isSuperAdmin?'disabled':''} /></div>
        <div class="form-group"><label>Time</label><input type="time" id="ev-time" ${!isSuperAdmin?'disabled':''} /></div>
      </div>
      <div class="form-group"><label>Closes At (optional)</label><input type="datetime-local" id="ev-closes" ${!isSuperAdmin?'disabled':''} /></div>
      ${!isSuperAdmin?'<div class="alert alert-warning">⚠️ Date/time can only be set by Super Admin</div>':''}
      <div id="ev-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createEvent()">Create Event</button>
      </div>
    `);
  },

  async createEvent() {
    U.clearError('ev-error');
    const sport_id=U.el('ev-sport').value, event_name=U.el('ev-name').value.trim();
    const event_date=U.el('ev-date').value, event_time=U.el('ev-time').value;
    const country_id=U.el('ev-country').value||null, course_id=U.el('ev-course').value||null;
    const closesRaw=U.el('ev-closes').value;
    const closes_at = closesRaw ? new Date(closesRaw).toISOString() : null;
    if (!sport_id||!event_name) { U.setError('ev-error','Sport and name required'); return; }
    const isSuperAdmin = API.getOp()?.role === 'super_admin';
    if (isSuperAdmin && (!event_date||!event_time)) { U.setError('ev-error','Date and time required'); return; }
    try {
      await API.createEvent({sport_id,event_name,event_date:event_date||'2025-01-01',event_time:event_time||'00:00',country_id,course_id,closes_at});
      U.modal.close(); U.toast('Event created'); this.renderEvents();
    } catch(err) { U.setError('ev-error',err.message); }
  },

  async showEditEventModal(id, ev) {
    const isSuperAdmin = API.getOp()?.role === 'super_admin';
    // Format closes_at for datetime-local input
    let closesVal = '';
    if (ev.closes_at) {
      try {
        const d = new Date(ev.closes_at);
        closesVal = d.toISOString().slice(0,16);
      } catch(e) {}
    }
    U.modal.show('Edit Event', `
      <div class="form-group"><label>Event Name</label><input type="text" id="eed-name" value="${U.escHTML(ev.event_name)}" /></div>
      ${isSuperAdmin ? `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Race Date</label><input type="date" id="eed-date" value="${ev.event_date||''}" /></div>
        <div class="form-group"><label>Race Time</label><input type="time" id="eed-time" value="${ev.event_time||''}" /></div>
      </div>
      <div class="form-group">
        <label>Betting Closes At (leave blank = stays open)</label>
        <input type="datetime-local" id="eed-closes" value="${closesVal}" />
        <span class="text-muted text-small">Set this to when you want betting to close — countdown timer will show on the bet slip</span>
      </div>
      <div class="form-group"><label>Status</label>
        <select id="eed-status">
          ${['open','closed','settled'].map(s=>`<option value="${s}" ${ev.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      ` : `
      <div class="alert alert-info">ℹ️ Only Super Admin can change dates, times and status.</div>
      <div style="padding:10px;background:var(--bg-raised);border-radius:8px;font-size:13px;color:var(--text-secondary)">
        <div>📅 Date: <strong>${ev.event_date||'—'}</strong></div>
        <div>🕐 Time: <strong>${ev.event_time||'—'}</strong></div>
        <div>⏱️ Closes: <strong>${ev.closes_at ? new Date(ev.closes_at).toLocaleString() : 'Not set'}</strong></div>
        <div>Status: <strong>${ev.status}</strong></div>
      </div>
      `}
      <div id="eed-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateEvent('${id}')">Save Changes</button>
      </div>
    `, isSuperAdmin);
  },

  async updateEvent(id) {
    const isSuperAdmin = API.getOp()?.role === 'super_admin';
    const data = { event_name: U.el('eed-name')?.value?.trim() };
    if (isSuperAdmin) {
      data.event_date = U.el('eed-date')?.value || undefined;
      data.event_time = U.el('eed-time')?.value || undefined;
      data.status     = U.el('eed-status')?.value || undefined;
      const closesRaw = U.el('eed-closes')?.value;
      data.closes_at  = closesRaw ? new Date(closesRaw).toISOString() : null;
    }
    // Remove undefined keys
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    try { await API.updateEvent(id, data); U.modal.close(); U.toast('Event updated'); this.renderEvents(); }
    catch(err) { U.setError('eed-error', err.message); }
  },

  async deleteEvent(id) {
    if (!U.confirm('Delete this event and all selections?')) return;
    try { await API.deleteEvent(id); U.toast('Deleted'); this.renderEvents(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  showAddSelectionModal(evId, evName) {
    const isHorse = false; // Could detect sport here
    U.modal.show(`Add Selection — ${evName}`, `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Name</label><input type="text" id="sel-name" placeholder="e.g. Sparkling Water / Arsenal" /></div>
        <div class="form-group"><label>Sub Info (optional)</label><input type="text" id="sel-sub" placeholder="e.g. Home Win / Jockey name" /></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Barrier / No.</label><input type="number" id="sel-bar" min="1" /></div>
        <div class="form-group"><label>Win Odds</label><input type="number" id="sel-odds" step="0.01" min="1.01" /></div>
        <div class="form-group"><label>Age (racing)</label><input type="number" id="sel-age" min="2" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="sel-jockey" /></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="sel-trainer" /></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="sel-weight" placeholder="58kg" /></div>
        <div class="form-group"><label>Colour</label><input type="text" id="sel-colour" placeholder="Bay" /></div>
        <div class="form-group"><label>Form</label><input type="text" id="sel-form" placeholder="1-2-1" /></div>
      </div>
      <div id="sel-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.addSelection('${evId}')">Add</button>
      </div>
    `);
  },

  async addSelection(evId) {
    U.clearError('sel-error');
    const name=U.el('sel-name').value.trim(), odds=parseFloat(U.el('sel-odds').value);
    if (!name||!odds) { U.setError('sel-error','Name and odds required'); return; }
    const data = { name, sub_info:U.el('sel-sub').value.trim()||null, barrier_number:parseInt(U.el('sel-bar').value)||null, odds, age:parseInt(U.el('sel-age').value)||null, jockey:U.el('sel-jockey').value.trim()||null, trainer:U.el('sel-trainer').value.trim()||null, weight:U.el('sel-weight').value.trim()||null, colour:U.el('sel-colour').value.trim()||null, form:U.el('sel-form').value.trim()||null };
    try { await API.addSelection(evId,data); U.modal.close(); U.toast('Selection added'); this.renderSelections(evId); }
    catch(err) { U.setError('sel-error',err.message); }
  },

  showEditSelectionModal(id, s) {
    U.modal.show('Edit Selection', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Name</label><input type="text" id="es-name" value="${U.escHTML(s.name)}" /></div>
        <div class="form-group"><label>Sub Info</label><input type="text" id="es-sub" value="${U.escHTML(s.sub_info||'')}" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Win Odds</label><input type="number" id="es-odds" value="${s.odds}" step="0.01" /></div>
        <div class="form-group"><label>Barrier</label><input type="number" id="es-bar" value="${s.barrier_number||''}" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="es-jockey" value="${U.escHTML(s.jockey||'')}" /></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="es-trainer" value="${U.escHTML(s.trainer||'')}" /></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="es-weight" value="${U.escHTML(s.weight||'')}" /></div>
        <div class="form-group"><label>Age</label><input type="number" id="es-age" value="${s.age||''}" /></div>
        <div class="form-group"><label>Form</label><input type="text" id="es-form" value="${U.escHTML(s.form||'')}" /></div>
      </div>
      <div id="es-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateSelection('${id}','${s.event_id}')">Save</button>
      </div>
    `);
  },

  async updateSelection(id, evId) {
    const data = { name:U.el('es-name').value.trim(), sub_info:U.el('es-sub').value.trim()||null, odds:parseFloat(U.el('es-odds').value)||null, barrier_number:parseInt(U.el('es-bar').value)||null, jockey:U.el('es-jockey').value.trim()||null, trainer:U.el('es-trainer').value.trim()||null, weight:U.el('es-weight').value.trim()||null, age:parseInt(U.el('es-age').value)||null, form:U.el('es-form').value.trim()||null };
    try { await API.updateSelection(id,data); U.modal.close(); U.toast('Updated'); this.renderSelections(evId); }
    catch(err) { U.setError('es-error',err.message); }
  },

  showScratchModal(selId, name, evId) {
    U.modal.show(`Scratch — ${name}`, `
      <div class="alert alert-warning">All pending bets on ${name} will be refunded.</div>
      <div class="form-group"><label>Deduction % on other runners</label><input type="number" id="sc-ded" value="0" min="0" max="100" step="0.5" /></div>
      <div id="sc-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="Pages.scratchSel('${selId}','${evId}')">Confirm Scratch</button>
      </div>
    `);
  },

  async scratchSel(selId, evId) {
    const d=parseFloat(U.el('sc-ded').value);
    if (isNaN(d)||d<0||d>100) { U.setError('sc-error','Enter 0–100'); return; }
    try { const r=await API.scratchSelection(selId,{deduction_percent:d}); U.modal.close(); U.toast(r.message); this.renderSelections(evId); }
    catch(err) { U.setError('sc-error',err.message); }
  },

  async deleteSelection(id, evId) {
    if (!U.confirm('Remove this selection?')) return;
    try { await API.deleteSelection(id); U.toast('Removed'); this.renderSelections(evId); }
    catch(err) { U.toast(err.message,'error'); }
  },

  async showSettleModal(evId) {
    const sels = (await API.getSelections(evId)).filter(s=>s.status==='active');
    U.modal.show('Declare Winner', `
      <div class="form-group"><label>Winning Selection</label>
        <select id="win-sel">
          <option value="">Select winner...</option>
          ${sels.map(s=>`<option value="${s.id}">${s.barrier_number?s.barrier_number+'. ':''}${U.escHTML(s.name)} (${U.fmt.odds(s.odds)})</option>`).join('')}
        </select>
      </div>
      <div id="win-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-success" onclick="Pages.settleEvent('${evId}')">Settle & Pay Out</button>
      </div>
    `);
  },

  async settleEvent(evId) {
    const winner_selection_id = U.el('win-sel').value;
    if (!winner_selection_id) { U.setError('win-error','Select a winner'); return; }
    try {
      const r = await API.settleEvent(evId,{winner_selection_id});
      U.modal.close(); U.toast(`🏆 ${r.winner} wins! ${r.winners} bet(s) paid.`,'success',5000);
      this.renderEvents();
    } catch(err) { U.setError('win-error',err.message); }
  },

  async showEventPL(evId) {
    const res = await API.getEventResults(evId);
    U.modal.show(`P&L — ${res.event.event_name}`, `
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        <div class="stat-card green" style="padding:12px"><div class="stat-label">Staked</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.total_staked)}</div></div>
        <div class="stat-card red" style="padding:12px"><div class="stat-label">Paid Out</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.total_paid)}</div></div>
        <div class="stat-card ${res.summary.house_profit>=0?'gold':'red'}" style="padding:12px"><div class="stat-label">House P&L</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.house_profit)}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Wallet</th><th>Selection</th><th>Stake</th><th>Potential</th><th>Return</th><th>Status</th></tr></thead>
        <tbody>${res.bets.length?res.bets.map(b=>`<tr>
          <td>${U.escHTML(b.wallet_name)}</td>
          <td>${U.escHTML(b.selection_name)}</td>
          <td class="mono">${U.fmt.money(b.stake)}</td>
          <td class="mono">${U.fmt.money(b.potential_return)}</td>
          <td class="${b.actual_return>0?'money-pos':'text-muted'} mono">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
          <td>${U.statusPill(b.status)}</td>
        </tr>`).join(''):'<tr><td colspan="6" class="text-muted">No bets</td></tr>'}</tbody>
      </table></div>
    `,true);
  },

  // ─── BET SLIP PAGE ──────────────────────────────────────────────
  async renderBetslipPage() {
    const page = U.el('page-betslip');
    try {
      const [sports, events] = await Promise.all([API.getSports(), API.getEvents(null,'open')]);
      const bySport = {};
      for (const e of events) {
        if (!bySport[e.sport_id]) bySport[e.sport_id] = { name:e.sport_name, icon:e.sport_icon, events:[] };
        bySport[e.sport_id].events.push(e);
      }
      const slip=BetSlip, odds=slip.getCombinedOdds(), ret=slip.getPotentialReturn();
      page.innerHTML = `
        <!-- Wallet Selector Bar -->
        <div class="wallet-bar"><div id="wallet-selector-bar"></div></div>

        <div class="betslip-layout">
          <div>
            <div class="page-header"><div class="page-header-title">Place Bet</div></div>
            ${Object.keys(bySport).length===0?'<div class="empty-state"><div class="empty-icon">🎯</div><p>No open events</p></div>':
              Object.values(bySport).map(sp=>`
                <div style="margin-bottom:22px">
                  <div class="country-section-header">
                    <span style="font-size:26px">${sp.icon}</span>
                    <span style="font-family:var(--font-display);font-size:20px;letter-spacing:1.5px">${sp.name}</span>
                  </div>
                  ${sp.events.map(ev=>`
                    <div class="race-block" style="margin-bottom:8px">
                      <div class="race-block-header" onclick="Pages.toggleBetEvent('${ev.id}')">
                        <div class="race-block-info">
                          <div class="race-block-name">${ev.flag||'🏆'} ${U.escHTML(ev.event_name)}</div>
                          <div class="race-block-meta">${ev.country_name||''} · ${U.fmt.date(ev.event_date)} ${ev.event_time} · ${ev.selection_count} selections</div>
                        </div>
                        ${ev.closes_at?`<span class="race-countdown" data-closes="${ev.closes_at}">...</span>`:''}
                        <span style="color:var(--text-muted);font-size:12px">▼</span>
                      </div>
                      <div class="race-block-body hidden" id="bet-ev-body-${ev.id}">
                        <div id="bet-ev-sels-${ev.id}" class="horse-grid" style="margin-top:12px">
                          <div class="loading"><div class="spinner"></div></div>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')
            }
          </div>

          <!-- Bet Slip Panel -->
          <div class="betslip-panel">
            <div class="betslip-header">
              <h3>🎟️ Bet Slip</h3>
              ${slip.getCount()>0?`<button class="btn btn-xs btn-danger" onclick="BetSlip.clear()">Clear</button>`:''}
            </div>
            <div class="betslip-tabs">
              <div class="betslip-tab ${slip.mode==='single'?'active':''}" onclick="BetSlip.setMode('single')">Single</div>
              <div class="betslip-tab ${slip.mode==='multi'?'active':''}" onclick="BetSlip.setMode('multi')">Multi / Acca</div>
            </div>

            <!-- Active Wallet Display -->
            <div style="padding:10px 16px;border-bottom:1px solid var(--border);background:rgba(34,197,94,0.05)">
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:4px">Active Wallet</div>
              ${WalletSelector.current ? `
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong style="font-size:14px">${U.escHTML(WalletSelector.current.name)}</strong>
                  <span style="font-family:var(--font-mono);color:var(--green);font-size:14px">${U.fmt.money(WalletSelector.current.balance)}</span>
                </div>
              ` : '<div style="color:var(--yellow);font-size:12px">⚠️ No wallet selected — choose from wallet bar above</div>'}
            </div>

            ${slip.getCount()===0?`<div class="betslip-empty"><div style="font-size:32px;margin-bottom:8px">🎫</div><p>Click a selection card to add</p></div>`:`
              <div class="betslip-selections">
                ${slip.selections.map(s=>`
                  <div class="betslip-selection">
                    <div class="sel-info">
                      <div class="sel-horse">${s.sport_icon||''} ${U.escHTML(s.name)}</div>
                      <div class="sel-race">${U.escHTML(s.event_name)}</div>
                    </div>
                    <div class="sel-odds">${U.fmt.odds(s.odds)}</div>
                    <button class="sel-remove" onclick="BetSlip.remove('${s.selection_id}')">✕</button>
                  </div>
                `).join('')}
              </div>
            `}
            <div class="betslip-footer">
              ${slip.mode==='multi'&&slip.getCount()>=2?`<div class="betslip-calc-row"><span class="calc-label">Combined Odds</span><span class="calc-value odds">${U.fmt.odds(odds)}</span></div><hr class="betslip-divider">`:''}
              ${slip.mode==='single'&&slip.getCount()===1?`<div class="betslip-calc-row"><span class="calc-label">Win Odds</span><span class="calc-value odds">${U.fmt.odds(slip.selections[0].odds)}</span></div><hr class="betslip-divider">`:''}
              <div class="form-group"><label>Stake (R)</label>
                <input type="number" id="stake-input" placeholder="0.00" min="0.01" step="0.50"
                  value="${slip.stakeValue||''}" oninput="BetSlip.stakeValue=parseFloat(this.value)||0;Pages.updateCalc();" />
              </div>
              <div id="return-calc"><div class="betslip-calc-row"><span class="calc-label">Potential Return</span><span class="calc-value return">${U.fmt.money(ret)}</span></div></div>
              ${slip.getCount()>0?`<button class="btn btn-primary btn-full" onclick="BetSlip.submit()">Place Bet</button>`:''}
            </div>
          </div>
        </div>
      `;
      WalletSelector.render();
      startCountdowns();
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  updateCalc() {
    const c=U.el('return-calc');
    if(c) c.innerHTML=`<div class="betslip-calc-row"><span class="calc-label">Potential Return</span><span class="calc-value return">${U.fmt.money(BetSlip.getPotentialReturn())}</span></div>`;
  },

  async toggleBetEvent(evId) {
    const body = U.el(`bet-ev-body-${evId}`);
    body.classList.toggle('hidden');
    if (!body.classList.contains('hidden')) await this.renderBetSelections(evId);
  },

  async renderBetSelections(evId) {
    const c = U.el(`bet-ev-sels-${evId}`);
    try {
      const ev = await API.getEvent(evId);
      c.innerHTML = ev.selections.map(s => {
        const isSelected = BetSlip.selections.find(x => x.selection_id===s.id);
        const isScratched = s.status==='scratched';
        // Price history string: "5.00 → 4.75 → 4.50"
        const priceTrail = (s.price_history||[]).length > 0
          ? [...s.price_history.map(p=>U.fmt.odds(p.old_price)), U.fmt.odds(s.win_odds)].slice(-5).join(' → ')
          : '';
        return `
          <div class="horse-card ${isScratched?'scratched':''} ${isSelected?'selected':''}">
            ${s.barrier_number?`<div class="horse-barrier">No. ${s.barrier_number}</div>`:''}
            <div class="horse-name">${U.escHTML(s.name)}</div>
            ${s.jockey?`<div class="horse-detail">🎽 ${U.escHTML(s.jockey)}</div>`:''}
            ${s.trainer?`<div class="horse-detail">🎩 ${U.escHTML(s.trainer)}</div>`:''}
            ${s.sub_info?`<div class="horse-detail">${U.escHTML(s.sub_info)}</div>`:''}
            ${s.colour||s.age?`<div class="horse-detail">${U.escHTML(s.colour||'')}${s.age?' '+s.age+'yo':''}</div>`:''}
            ${s.form?`<div class="horse-form">Form: ${U.escHTML(s.form)}</div>`:''}
            ${priceTrail?`<div class="price-trail">${priceTrail}</div>`:''}

            <!-- Win / Place odds buttons -->
            <div class="odds-buttons">
              <button class="odds-btn odds-btn-win ${isSelected&&BetSlip.selections.find(x=>x.selection_id===s.id&&x.bet_on==='win')?'odds-btn-active':''}"
                onclick="${!isScratched?`Pages.addToBetSlip('${s.id}','${U.escHTML(s.name)}','${evId}','${U.escHTML(ev.event_name)}','${ev.sport_icon||''}',${s.win_odds},'win')`:''}">
                <div class="odds-btn-label">WIN</div>
                <div class="odds-btn-val">${U.fmt.odds(s.win_odds)}</div>
              </button>
              ${s.place_odds ? `
              <button class="odds-btn odds-btn-place ${isSelected&&BetSlip.selections.find(x=>x.selection_id===s.id&&x.bet_on==='place')?'odds-btn-active':''}"
                onclick="${!isScratched?`Pages.addToBetSlip('${s.id}','${U.escHTML(s.name)}','${evId}','${U.escHTML(ev.event_name)}','${ev.sport_icon||''}',${s.place_odds},'place')`:''}">
                <div class="odds-btn-label">PLACE</div>
                <div class="odds-btn-val">${U.fmt.odds(s.place_odds)}</div>
              </button>` : ''}
            </div>

            <!-- Bookmaker liability -->
            <div class="horse-liability">
              <span title="Potential payout">💰 ${U.fmt.money(s.total_liability||0)}</span>
              <span title="House exposure" style="color:${(s.house_exposure||0)>=0?'var(--red)':'var(--green)'}">📉 ${U.fmt.money(Math.abs(s.house_exposure||0))}</span>
            </div>
          </div>
        `;
      }).join('');
    } catch(err) { c.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  addToBetSlip(selId, name, evId, evName, sportIcon, odds, betOn='win') {
    BetSlip.add({ selection_id:selId, name, event_id:evId, event_name:evName, sport_icon:sportIcon, odds, bet_on:betOn });
    this.renderBetSelections(evId);
  },

  // ─── BET HISTORY ────────────────────────────────────────────────
  async renderBetHistory() {
    const page = U.el('page-bets');
    U.loading(page);
    try {
      const slips = await API.getBetslips();
      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Bet History</div>
          <div class="text-muted text-small">${slips.length} slip(s)</div>
        </div>
        ${slips.length===0 ? '<div class="empty-state"><div class="empty-icon">🎟️</div><p>No bets yet</p></div>' :
          slips.map(slip => {
            const isPending   = slip.status==='pending';
            const isCashedOut = slip.status==='cashed_out';
            return `<div class="card" style="margin-bottom:10px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                    ${U.statusPill(slip.slip_type)}${U.statusPill(slip.status)}
                    <strong style="font-size:13px">${U.escHTML(slip.wallet_name)}</strong>
                    <span class="pill ${slip.wallet_type==='credit'?'pill-purple':'pill-green'}" style="font-size:10px">${slip.wallet_type==='credit'?'💳 Credit':'💵 Cash'}</span>
                  </div>
                  <div class="text-muted text-small">${U.fmt.datetime(slip.created_at)}</div>
                </div>
                <div style="text-align:right">
                  <div class="text-muted text-small">Stake / Potential / Return</div>
                  <div class="mono" style="font-size:14px">
                    ${U.fmt.money(slip.total_stake)}
                    <span style="color:var(--text-muted)"> / </span>
                    <span style="color:var(--gold-bright)">${U.fmt.money(slip.potential_return)}</span>
                    <span style="color:var(--text-muted)"> / </span>
                    <span class="${(slip.actual_return>0||slip.cashout_value>0)?'money-pos':'text-muted'}">
                      ${slip.actual_return>0 ? U.fmt.money(slip.actual_return) : isCashedOut ? U.fmt.money(slip.cashout_value)+' (cash out)' : '—'}
                    </span>
                  </div>
                  ${isPending ? `<button class="btn btn-xs btn-warning" style="margin-top:6px" onclick="Pages.showCashoutModal('${slip.id}')">💸 Cash Out</button>` : ''}
                </div>
              </div>
              <hr class="divider" style="margin:10px 0">
              ${slip.legs.map(l => `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-raised);border-radius:7px;margin-bottom:4px;flex-wrap:wrap">
                  <span>${l.sport_icon}</span>
                  ${U.statusPill(l.result)}
                  <span class="pill ${l.bet_type==='place'?'pill-blue':'pill-gold'}" style="font-size:10px">${l.bet_type==='place'?'PLACE':'WIN'}</span>
                  <div style="flex:1;min-width:100px"><strong>${U.escHTML(l.selection_name)}</strong> <span class="text-muted text-small">— ${U.escHTML(l.event_name)}</span></div>
                  <div class="mono" style="color:var(--gold-bright)">${U.fmt.odds(l.odds_at_time)}</div>
                </div>
              `).join('')}
            </div>`;
          }).join('')
        }
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async showCashoutModal(slipId) {
    U.modal.show('💸 Cash Out Bet', '<div class="loading"><div class="spinner"></div> Calculating...</div>');
    try {
      const data = await API.getCashoutValue(slipId);
      if (!data.available) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-warning">${data.reason}</div>`; return; }
      document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div class="stat-card gold" style="padding:14px;text-align:center">
            <div class="stat-label">Original Stake</div>
            <div class="stat-value" style="font-size:20px">${U.fmt.money(data.original_stake)}</div>
          </div>
          <div class="stat-card green" style="padding:14px;text-align:center">
            <div class="stat-label">Cash Out Value</div>
            <div class="stat-value" style="font-size:20px">${U.fmt.money(data.cashout_value)}</div>
          </div>
        </div>
        <div class="alert alert-info" style="margin-bottom:8px">Potential if you keep the bet: <strong>${U.fmt.money(data.potential_return)}</strong></div>
        <div class="alert alert-warning">⚠️ Cashing out is final and cannot be undone.</div>
        <div class="modal-actions" style="margin-top:12px">
          <button class="btn btn-ghost" onclick="U.modal.close()">Keep Bet</button>
          <button class="btn btn-warning" onclick="Pages.confirmCashout('${slipId}')">Accept ${U.fmt.money(data.cashout_value)}</button>
        </div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async confirmCashout(slipId) {
    try {
      const res = await API.cashoutBet(slipId);
      U.modal.close();
      U.toast(`💸 Cashed out: ${U.fmt.money(res.cashout_value)}`,'success',5000);
      await WalletSelector.load();
      this.renderBetHistory();
    } catch(err) { U.toast(err.message,'error'); }
  },


  async renderOperators() {
    const page = U.el('page-operators');
    U.loading(page);
    try {
      const ops = await API.getOperators();
      page.innerHTML = `
        <div class="page-header"><div class="page-header-title">Operators</div>
          <button class="btn btn-primary" onclick="Pages.showCreateOperatorModal()">+ New Operator</button>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>${ops.map(op=>`<tr>
            <td><strong>${U.escHTML(op.username)}</strong></td>
            <td class="text-muted">${U.escHTML(op.email)}</td>
            <td>${U.statusPill(op.role)}</td>
            <td>${op.is_active?'<span class="pill pill-green">Active</span>':'<span class="pill pill-red">Inactive</span>'}</td>
            <td class="text-muted text-small">${U.fmt.date(op.created_at)}</td>
            <td><div class="flex gap-8">
              <button class="btn btn-xs btn-info" onclick="Pages.showEditOperatorModal('${op.id}','${U.escHTML(op.username)}','${op.role}')">Edit</button>
              ${op.role!=='super_admin'?`<button class="btn btn-xs btn-danger" onclick="Pages.deleteOperator('${op.id}')">Deactivate</button>`:''}
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div></div>
        <div class="card" style="margin-top:16px">
          <div class="card-title">🔐 Role Permissions</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Permission</th><th>Super Admin</th><th>Bookmaker</th><th>Clerk</th></tr></thead>
            <tbody>
              ${[
                ['View dashboard','✅','✅','✅'],
                ['Place bets','✅','✅','✅'],
                ['Manage wallets','✅','✅','❌'],
                ['Create/edit events','✅','✅','❌'],
                ['Change event dates/times','✅','❌','❌'],
                ['Settle events','✅','✅','❌'],
                ['Scratch selections','✅','✅','❌'],
                ['Manage operators','✅','❌','❌'],
                ['Countries & courses','✅','❌','❌'],
              ].map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
            </tbody>
          </table></div>
        </div>
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showCreateOperatorModal() {
    U.modal.show('Create Operator', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Username</label><input type="text" id="op-username" /></div>
        <div class="form-group"><label>Role</label>
          <select id="op-role">
            <option value="bookmaker">Bookmaker</option>
            <option value="clerk">Clerk</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
      </div>
      <div class="form-group"><label>Email</label><input type="email" id="op-email" /></div>
      <div class="form-group"><label>Password (min 8 chars)</label><input type="password" id="op-pass" /></div>
      <div id="op-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createOperator()">Create</button>
      </div>
    `);
  },

  async createOperator() {
    U.clearError('op-error');
    const username=U.el('op-username').value.trim(), email=U.el('op-email').value.trim(), password=U.el('op-pass').value, role=U.el('op-role').value;
    if (!username||!email||!password) { U.setError('op-error','All fields required'); return; }
    try { await API.createOperator({username,email,password,role}); U.modal.close(); U.toast('Operator created'); this.renderOperators(); }
    catch(err) { U.setError('op-error',err.message); }
  },

  showEditOperatorModal(id, username, role) {
    U.modal.show('Edit Operator', `
      <div class="form-group"><label>Username</label><input type="text" id="eo-username" value="${U.escHTML(username)}" /></div>
      <div class="form-group"><label>Role</label>
        <select id="eo-role">
          ${['bookmaker','clerk','super_admin'].map(r=>`<option value="${r}" ${r===role?'selected':''}>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>New Password (optional)</label><input type="password" id="eo-pass" placeholder="Leave blank to keep current" /></div>
      <div id="eo-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateOperator('${id}')">Save</button>
      </div>
    `);
  },

  async updateOperator(id) {
    const data = { username:U.el('eo-username').value.trim(), role:U.el('eo-role').value };
    const pass = U.el('eo-pass').value;
    if (pass) data.password = pass;
    try { await API.updateOperator(id,data); U.modal.close(); U.toast('Updated'); this.renderOperators(); }
    catch(err) { U.setError('eo-error',err.message); }
  },

  async deleteOperator(id) {
    if (!U.confirm('Deactivate this operator?')) return;
    try { await API.deleteOperator(id); U.toast('Deactivated'); this.renderOperators(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ─── REPORTS ────────────────────────────────────────────────────
  async renderReports() {
    const page = U.el('page-reports');
    U.loading(page);
    try {
      const sports = await API.getSports();

      page.innerHTML = `
        <!-- Filter Bar -->
        <div class="page-header">
          <div class="page-header-title">Reports & Analytics</div>
        </div>
        <div class="card" style="margin-bottom:18px">
          <div class="card-title" style="margin-bottom:12px">🔍 Filters</div>
          <div class="form-row form-row-3" style="align-items:flex-end;gap:12px">
            <div class="form-group">
              <label>Sport</label>
              <select id="rpt-sport">
                <option value="">All Sports</option>
                ${sports.map(s=>`<option value="${s.id}">${s.icon} ${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Date From</label>
              <input type="date" id="rpt-from" />
            </div>
            <div class="form-group">
              <label>Date To</label>
              <input type="date" id="rpt-to" />
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="Pages.loadReportData()">Apply Filters</button>
            <button class="btn btn-ghost" onclick="Pages.clearReportFilters()">Clear</button>
          </div>
        </div>

        <!-- Report Tabs -->
        <div class="tabs" id="report-tabs">
          <div class="tab active" onclick="Pages.switchReportTab('summary')">Summary</div>
          <div class="tab" onclick="Pages.switchReportTab('event')">Per Race / Event</div>
          <div class="tab" onclick="Pages.switchReportTab('meeting')">Per Meeting</div>
          <div class="tab" onclick="Pages.switchReportTab('wallet')">Per Customer</div>
        </div>

        <div id="report-content"></div>
      `;

      // Set default date range — last 30 days
      const today = new Date();
      const past  = new Date(); past.setDate(past.getDate() - 30);
      U.el('rpt-to').value   = today.toISOString().split('T')[0];
      U.el('rpt-from').value = past.toISOString().split('T')[0];

      Pages._reportTab = 'summary';
      await Pages.loadReportData();
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  clearReportFilters() {
    U.el('rpt-sport').value = '';
    U.el('rpt-from').value  = '';
    U.el('rpt-to').value    = '';
    this.loadReportData();
  },

  switchReportTab(tab) {
    document.querySelectorAll('#report-tabs .tab').forEach((el,i) => {
      const tabs = ['summary','event','meeting','wallet'];
      el.classList.toggle('active', tabs[i] === tab);
    });
    Pages._reportTab = tab;
    this.loadReportData();
  },

  async loadReportData() {
    const c      = U.el('report-content');
    const tab    = Pages._reportTab || 'summary';
    const sport  = U.el('rpt-sport')?.value || '';
    const dfrom  = U.el('rpt-from')?.value  || '';
    const dto    = U.el('rpt-to')?.value    || '';
    const params = {};
    if (sport) params.sport_id  = sport;
    if (dfrom) params.date_from = dfrom;
    if (dto)   params.date_to   = dto;

    U.loading(c);
    try {
      if (tab === 'summary')  await Pages.renderReportSummary(c, params);
      if (tab === 'event')    await Pages.renderReportByEvent(c, params);
      if (tab === 'meeting')  await Pages.renderReportByMeeting(c, params);
      if (tab === 'wallet')   await Pages.renderReportByWallet(c, params);
    } catch(err) { c.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  async renderReportSummary(c, params) {
    const s = await API.reportSummary(params);
    c.innerHTML = `
      <!-- KPI Cards -->
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card gold"><div class="stat-icon">💰</div><div class="stat-label">Total Turnover</div><div class="stat-value money">${U.fmt.money(s.total_staked)}</div></div>
        <div class="stat-card red"><div class="stat-icon">💸</div><div class="stat-label">Total Paid Out</div><div class="stat-value money">${U.fmt.money(s.total_paid)}</div></div>
        <div class="stat-card ${s.house_profit>=0?'green':'red'}"><div class="stat-icon">${s.house_profit>=0?'📈':'📉'}</div><div class="stat-label">House Profit</div><div class="stat-value money">${U.fmt.money(s.house_profit)}</div></div>
        <div class="stat-card blue"><div class="stat-icon">%</div><div class="stat-label">House Margin</div><div class="stat-value">${U.fmt.pct(s.margin_pct)}</div></div>
        <div class="stat-card yellow"><div class="stat-icon">⚡</div><div class="stat-label">Live Liability</div><div class="stat-value money">${U.fmt.money(s.total_liability)}</div></div>
        <div class="stat-card purple"><div class="stat-icon">🎟️</div><div class="stat-label">Total Bets</div><div class="stat-value">${s.total_bets}</div></div>
      </div>

      <!-- Win/Loss Bar -->
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">📊 Bet Outcomes</div>
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:12px">
          <div><span class="pill pill-green" style="font-size:13px">Won: ${s.won_bets}</span></div>
          <div><span class="pill pill-red" style="font-size:13px">Lost: ${s.lost_bets}</span></div>
          <div><span class="pill pill-yellow" style="font-size:13px">Pending: ${s.pending_bets}</span></div>
        </div>
        ${(s.won_bets+s.lost_bets) > 0 ? `
        <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;gap:2px">
          <div style="background:var(--green);flex:${s.won_bets}" title="Won"></div>
          <div style="background:var(--red);flex:${s.lost_bets}" title="Lost"></div>
          ${s.pending_bets > 0 ? `<div style="background:var(--yellow);opacity:0.6;flex:${s.pending_bets}" title="Pending"></div>` : ''}
        </div>` : '<p class="text-muted text-small">No settled bets yet</p>'}
      </div>

      <!-- By Sport -->
      <div class="card">
        <div class="card-title">🏆 Performance by Sport</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Sport</th><th>Bets</th><th>Staked</th><th>Paid Out</th><th>House Profit</th><th>Liability</th><th>Margin</th></tr></thead>
            <tbody>
              ${s.by_sport.map(sp => {
                const profit = sp.staked - sp.paid;
                const margin = sp.staked > 0 ? (profit/sp.staked*100).toFixed(1) : 0;
                return `<tr>
                  <td><span style="font-size:18px">${sp.icon}</span> <strong>${sp.name}</strong></td>
                  <td class="mono">${sp.bet_count}</td>
                  <td class="mono">${U.fmt.money(sp.staked)}</td>
                  <td class="mono">${U.fmt.money(sp.paid)}</td>
                  <td>${U.plBadge(profit)}</td>
                  <td class="mono" style="color:var(--yellow)">${U.fmt.money(sp.liability)}</td>
                  <td class="mono" style="color:${profit>=0?'var(--green)':'var(--red)'}">${margin}%</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td>TOTAL</td>
                <td class="mono">${s.total_bets}</td>
                <td class="mono">${U.fmt.money(s.total_staked)}</td>
                <td class="mono">${U.fmt.money(s.total_paid)}</td>
                <td>${U.plBadge(s.house_profit)}</td>
                <td class="mono" style="color:var(--yellow)">${U.fmt.money(s.total_liability)}</td>
                <td class="mono">${U.fmt.pct(s.margin_pct)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  async renderReportByEvent(c, params) {
    const events = await API.reportByEvent(params);
    if (!events.length) { U.empty(c, 'No events match your filters'); return; }
    c.innerHTML = `
      <div class="card">
        <div class="card-title">🏁 Results by Race / Event</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Sport</th><th>Event</th><th>Date</th><th>Status</th>
              <th style="text-align:right">Bets</th>
              <th style="text-align:right">Bettors</th>
              <th style="text-align:right">Staked</th>
              <th style="text-align:right">Paid Out</th>
              <th style="text-align:right">House P&L</th>
              <th style="text-align:right">Liability</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${events.map(ev=>`<tr>
                <td><span style="font-size:16px">${ev.sport_icon}</span></td>
                <td><strong>${U.escHTML(ev.event_name)}</strong><div class="text-muted text-small">${ev.flag} ${ev.country_name} ${ev.course_name?'· '+ev.course_name:''}</div></td>
                <td class="text-muted text-small">${U.fmt.date(ev.event_date)} ${ev.event_time}</td>
                <td>${U.statusPill(ev.status)}</td>
                <td class="mono" style="text-align:right">${ev.total_bets}</td>
                <td class="mono" style="text-align:right">${ev.unique_bettors}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(ev.total_staked)}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(ev.total_paid)}</td>
                <td style="text-align:right">${U.plBadge(ev.house_profit)}</td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(ev.total_liability)}</td>
                <td><button class="btn btn-xs btn-info" onclick="Pages.showEventBetsModal('${ev.id}','${U.escHTML(ev.event_name)}')">Detail</button></td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td colspan="4">TOTALS (${events.length} events)</td>
                <td class="mono" style="text-align:right">${events.reduce((s,e)=>s+e.total_bets,0)}</td>
                <td></td>
                <td class="mono" style="text-align:right">${U.fmt.money(events.reduce((s,e)=>s+e.total_staked,0))}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(events.reduce((s,e)=>s+e.total_paid,0))}</td>
                <td style="text-align:right">${U.plBadge(events.reduce((s,e)=>s+e.house_profit,0))}</td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(events.reduce((s,e)=>s+e.total_liability,0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  async renderReportByMeeting(c, params) {
    const meetings = await API.reportByMeeting(params);
    if (!meetings.length) { U.empty(c, 'No meetings match your filters'); return; }
    c.innerHTML = `
      <div class="card">
        <div class="card-title">📅 Results by Race Meeting</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Date</th><th>Venue</th><th>Races</th>
              <th style="text-align:right">Bets</th>
              <th style="text-align:right">Bettors</th>
              <th style="text-align:right">Staked</th>
              <th style="text-align:right">Paid Out</th>
              <th style="text-align:right">House P&L</th>
              <th style="text-align:right">Liability</th>
              <th style="text-align:right">Margin</th>
            </tr></thead>
            <tbody>
              ${meetings.map(m=>`<tr>
                <td class="mono">${U.fmt.date(m.event_date)}</td>
                <td><strong>${m.flag} ${U.escHTML(m.venue)}</strong><div class="text-muted text-small">${m.country_name}</div></td>
                <td><span class="pill pill-blue">${m.race_count}</span></td>
                <td class="mono" style="text-align:right">${m.total_bets}</td>
                <td class="mono" style="text-align:right">${m.unique_bettors}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(m.total_staked)}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(m.total_paid)}</td>
                <td style="text-align:right">${U.plBadge(m.house_profit)}</td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(m.total_liability)}</td>
                <td class="mono" style="text-align:right;color:${m.house_profit>=0?'var(--green)':'var(--red)'}">${U.fmt.pct(m.margin_pct)}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td colspan="3">TOTALS</td>
                <td class="mono" style="text-align:right">${meetings.reduce((s,m)=>s+m.total_bets,0)}</td>
                <td></td>
                <td class="mono" style="text-align:right">${U.fmt.money(meetings.reduce((s,m)=>s+m.total_staked,0))}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(meetings.reduce((s,m)=>s+m.total_paid,0))}</td>
                <td style="text-align:right">${U.plBadge(meetings.reduce((s,m)=>s+m.house_profit,0))}</td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(meetings.reduce((s,m)=>s+m.total_liability,0))}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  async renderReportByWallet(c, params) {
    const wallets = await API.reportByWallet(params);
    if (!wallets.length) { U.empty(c, 'No customer data'); return; }
    c.innerHTML = `
      <div class="card">
        <div class="card-title">👛 Results by Customer Wallet</div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Customer</th><th>Phone</th>
              <th style="text-align:right">Bets</th>
              <th style="text-align:right">Events</th>
              <th style="text-align:right">Staked</th>
              <th style="text-align:right">Won</th>
              <th style="text-align:right">Net P&L</th>
              <th style="text-align:right">Pending</th>
              <th style="text-align:right">Liability</th>
              <th style="text-align:right">Win Rate</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${wallets.map(w=>`<tr>
                <td><strong>${U.escHTML(w.name)}</strong><div class="text-muted text-small">Bal: ${U.fmt.money(w.balance)}</div></td>
                <td class="text-muted text-small">${w.phone||'—'}</td>
                <td class="mono" style="text-align:right">${w.total_bets}</td>
                <td class="mono" style="text-align:right">${w.events_bet}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(w.total_staked)}</td>
                <td class="mono money-pos" style="text-align:right">${U.fmt.money(w.total_won)}</td>
                <td style="text-align:right">${U.plBadge(w.net_pl)}</td>
                <td class="mono" style="text-align:right">${w.pending_bets}</td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(w.total_liability)}</td>
                <td class="mono" style="text-align:right;color:${w.win_rate>=50?'var(--green)':'var(--text-muted)'}">${w.win_rate}%</td>
                <td><button class="btn btn-xs btn-info" onclick="Pages.showWalletBets('${w.id}','${U.escHTML(w.name)}')">Bets</button></td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td colspan="4">TOTALS</td>
                <td class="mono" style="text-align:right">${U.fmt.money(wallets.reduce((s,w)=>s+w.total_staked,0))}</td>
                <td class="mono" style="text-align:right">${U.fmt.money(wallets.reduce((s,w)=>s+w.total_won,0))}</td>
                <td style="text-align:right">${U.plBadge(wallets.reduce((s,w)=>s+w.net_pl,0))}</td>
                <td></td>
                <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(wallets.reduce((s,w)=>s+w.total_liability,0))}</td>
                <td></td><td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  },

  async showEventBetsModal(evId, evName) {
    U.modal.show(`📋 ${evName}`, '<div class="loading"><div class="spinner"></div> Loading...</div>', true);
    try {
      const res = await API.reportEventBets(evId);
      const { summary: s, bets, by_selection } = res;
      document.getElementById('modal-body').innerHTML = `
        <!-- Summary row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">
          <div class="stat-card gold" style="padding:12px"><div class="stat-label">Staked</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.total_staked)}</div></div>
          <div class="stat-card red" style="padding:12px"><div class="stat-label">Paid Out</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.total_paid)}</div></div>
          <div class="stat-card ${s.house_profit>=0?'green':'red'}" style="padding:12px"><div class="stat-label">House P&L</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.house_profit)}</div></div>
          <div class="stat-card yellow" style="padding:12px"><div class="stat-label">Liability</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.total_liability)}</div></div>
        </div>

        <!-- By Selection -->
        <div class="card" style="margin-bottom:14px">
          <div class="card-title" style="font-size:14px">Per Selection</div>
          <div class="table-wrap"><table>
            <thead><tr><th>No.</th><th>Selection</th><th>Odds</th><th>Bets</th><th>Staked</th><th>Paid</th><th>Liability</th><th></th></tr></thead>
            <tbody>
              ${by_selection.map(sel=>`<tr>
                <td class="mono text-muted">${sel.barrier_number||'—'}</td>
                <td><strong>${U.escHTML(sel.name)}</strong> ${sel.is_winner?'🏆':''}</td>
                <td class="mono" style="color:var(--gold-bright)">${U.fmt.odds(sel.odds)}</td>
                <td class="mono">${sel.bet_count}</td>
                <td class="mono">${U.fmt.money(sel.staked)}</td>
                <td class="mono money-pos">${U.fmt.money(sel.paid)}</td>
                <td class="mono" style="color:var(--yellow)">${U.fmt.money(sel.liability)}</td>
                <td>${U.statusPill(sel.sel_status)}</td>
              </tr>`).join('')}
            </tbody>
          </table></div>
        </div>

        <!-- Individual bets -->
        <div class="card">
          <div class="card-title" style="font-size:14px">All Bets (${bets.length})</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Customer</th><th>Selection</th><th>Stake</th><th>Odds</th><th>Potential</th><th>Return</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              ${bets.length ? bets.map(b=>`<tr>
                <td><strong>${U.escHTML(b.wallet_name)}</strong>${b.wallet_phone?`<div class="text-muted text-small">${b.wallet_phone}</div>`:''}</td>
                <td>${U.escHTML(b.selection_name)}</td>
                <td class="mono">${U.fmt.money(b.stake)}</td>
                <td class="mono" style="color:var(--gold-bright)">${U.fmt.odds(b.odds_at_time)}</td>
                <td class="mono money-pos">${U.fmt.money(b.potential_return)}</td>
                <td class="${b.actual_return>0?'money-pos mono':'text-muted'}">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
                <td>${U.statusPill(b.status)}</td>
                <td class="text-muted text-small">${U.fmt.datetime(b.created_at)}</td>
              </tr>`).join('') : '<tr><td colspan="8" class="text-muted">No bets on this event</td></tr>'}
            </tbody>
          </table></div>
        </div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },


  async renderCountries() {
    const page = U.el('page-countries');
    U.loading(page);
    try {
      const countries = await API.getCountries();
      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Countries & Courses</div>
          <div style="display:flex;gap:10px">
            <button class="btn btn-ghost" onclick="Pages.showAddCourseModal()">+ Add Course</button>
            <button class="btn btn-primary" onclick="Pages.showAddCountryModal()">+ Add Country</button>
          </div>
        </div>
        <div class="countries-grid">
          ${countries.length === 0 ? '<div class="empty-state"><div class="empty-icon">🌍</div><p>No countries yet</p></div>' :
            countries.map(c => `
              <div class="country-card">
                <div class="country-card-header">
                  <span class="country-flag">${c.flag}</span>
                  <div class="country-info">
                    <div class="country-name">${U.escHTML(c.name)}</div>
                    <div class="country-code">${c.code} · ${c.course_count} course(s)</div>
                  </div>
                  <div style="display:flex;gap:6px;margin-left:auto">
                    <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCountryModal('${c.id}','${U.escHTML(c.name)}','${c.code}','${c.flag}')">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="Pages.deleteCountry('${c.id}')">✕</button>
                  </div>
                </div>
                <div class="country-courses" id="courses-${c.id}">
                  <div class="loading" style="padding:10px"><div class="spinner"></div></div>
                </div>
                <div style="padding:8px 14px 12px">
                  <button class="btn btn-xs btn-ghost" onclick="Pages.showAddCourseModal('${c.id}')">+ Add Course</button>
                </div>
              </div>
            `).join('')}
        </div>
      `;
      for (const c of countries) this.loadCountryCourses(c.id);
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async loadCountryCourses(countryId) {
    const container = U.el(`courses-${countryId}`);
    if (!container) return;
    try {
      const courses = await API.getCountryCourses(countryId);
      if (!courses.length) { container.innerHTML='<p class="text-muted text-small" style="padding:8px 14px">No courses yet</p>'; return; }
      container.innerHTML = courses.map(co => `
        <div class="course-item">
          <div class="course-item-info">
            <div class="course-item-name">${U.escHTML(co.name)}</div>
            <div class="course-item-meta">${co.location||''} · ${co.surface||'Turf'} · ${co.meeting_count||0} events</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCourseModal('${co.id}','${U.escHTML(co.name)}','${U.escHTML(co.location||'')}','${co.surface||'Turf'}')">✏️</button>
            <button class="btn btn-xs btn-danger" onclick="Pages.deleteCourse('${co.id}','${countryId}')">✕</button>
          </div>
        </div>
      `).join('');
    } catch { container.innerHTML='<p class="text-muted text-small" style="padding:8px 14px">Error loading</p>'; }
  },

  showAddCountryModal() {
    U.modal.show('Add Country', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Country Name</label><input type="text" id="cn-name" placeholder="e.g. South Africa"/></div>
        <div class="form-group"><label>Code (2 letters)</label><input type="text" id="cn-code" placeholder="ZA" maxlength="2" style="text-transform:uppercase"/></div>
      </div>
      <div class="form-group">
        <label>Flag Emoji</label>
        <input type="text" id="cn-flag" placeholder="🇿🇦 — paste flag emoji"/>
        <span class="text-muted text-small">Get flags from <a href="https://emojipedia.org/flags" target="_blank" style="color:var(--gold)">emojipedia.org/flags</a></span>
      </div>
      <div id="cn-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveCountry()">Add Country</button>
      </div>
    `);
  },

  async saveCountry() {
    U.clearError('cn-error');
    const name=U.el('cn-name').value.trim(), code=U.el('cn-code').value.trim().toUpperCase(), flag=U.el('cn-flag').value.trim();
    if (!name||!code||!flag) { U.setError('cn-error','All fields required'); return; }
    if (code.length!==2) { U.setError('cn-error','Code must be 2 letters'); return; }
    try { await API.createCountry({name,code,flag}); U.modal.close(); U.toast('Country added'); this.renderCountries(); }
    catch(err) { U.setError('cn-error',err.message); }
  },

  showEditCountryModal(id, name, code, flag) {
    U.modal.show('Edit Country', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Name</label><input type="text" id="ec-name" value="${U.escHTML(name)}"/></div>
        <div class="form-group"><label>Code</label><input type="text" id="ec-code" value="${code}" maxlength="2"/></div>
      </div>
      <div class="form-group"><label>Flag Emoji</label><input type="text" id="ec-flag" value="${flag}"/></div>
      <div id="ec-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCountry('${id}')">Save</button>
      </div>
    `);
  },

  async updateCountry(id) {
    const name=U.el('ec-name').value.trim(), code=U.el('ec-code').value.trim().toUpperCase(), flag=U.el('ec-flag').value.trim();
    try { await API.updateCountry(id,{name,code,flag}); U.modal.close(); U.toast('Updated'); this.renderCountries(); }
    catch(err) { U.setError('ec-error',err.message); }
  },

  async deleteCountry(id) {
    if (!U.confirm('Delete this country and all its courses?')) return;
    try { await API.deleteCountry(id); U.toast('Deleted'); this.renderCountries(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  async showAddCourseModal(preselectedCountryId) {
    const countries = await API.getCountries();
    U.modal.show('Add Course', `
      <div class="form-group"><label>Country</label>
        <select id="co-country">
          ${countries.map(c=>`<option value="${c.id}" ${c.id===preselectedCountryId?'selected':''}>${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Course Name</label><input type="text" id="co-name" placeholder="e.g. Kenilworth Racecourse"/></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="co-loc" placeholder="e.g. Cape Town"/></div>
        <div class="form-group"><label>Surface</label>
          <select id="co-surf">
            <option>Turf</option><option>Dirt</option><option>Synthetic</option><option>Dirt / Turf</option><option>All Weather</option>
          </select>
        </div>
      </div>
      <div id="co-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveCourse()">Add Course</button>
      </div>
    `);
  },

  async saveCourse() {
    U.clearError('co-error');
    const country_id=U.el('co-country').value, name=U.el('co-name').value.trim(), location=U.el('co-loc').value.trim(), surface=U.el('co-surf').value;
    if (!country_id||!name) { U.setError('co-error','Country and name required'); return; }
    try { await API.createCourse({country_id,name,location,surface}); U.modal.close(); U.toast('Course added'); this.renderCountries(); }
    catch(err) { U.setError('co-error',err.message); }
  },

  showEditCourseModal(id, name, location, surface) {
    U.modal.show('Edit Course', `
      <div class="form-group"><label>Course Name</label><input type="text" id="eco-name" value="${U.escHTML(name)}"/></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="eco-loc" value="${U.escHTML(location)}"/></div>
        <div class="form-group"><label>Surface</label>
          <select id="eco-surf">
            ${['Turf','Dirt','Synthetic','Dirt / Turf','All Weather'].map(s=>`<option ${s===surface?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="eco-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCourse('${id}')">Save</button>
      </div>
    `);
  },

  async updateCourse(id) {
    const name=U.el('eco-name').value.trim(), location=U.el('eco-loc').value.trim(), surface=U.el('eco-surf').value;
    try { await API.updateCourse(id,{name,location,surface}); U.modal.close(); U.toast('Updated'); this.renderCountries(); }
    catch(err) { U.setError('eco-error',err.message); }
  },

  async deleteCourse(id, countryId) {
    if (!U.confirm('Delete this course?')) return;
    try { await API.deleteCourse(id); U.toast('Deleted'); this.loadCountryCourses(countryId); }
    catch(err) { U.toast(err.message,'error'); }
  },
};
