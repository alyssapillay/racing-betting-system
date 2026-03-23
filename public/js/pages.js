// ─── Global countdown ticker ──────────────────────────────────────
let countdownInterval = null;
function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    document.querySelectorAll('[data-closes]').forEach(el => {
      const iso = el.dataset.closes;
      const cd = U.countdown(iso);
      if (!cd) return;
      el.textContent = cd.label;
      el.className = `race-countdown ${cd.cls}`;
      if (cd.expired) el.closest('.race-block')?.classList.add('race-closed');
    });
  }, 1000);
}

const Pages = {

  // ─── DASHBOARD ─────────────────────────────────────────────────
  async renderDashboard() {
    const page = U.el('page-dashboard');
    U.loading(page);
    try {
      const stats = await API.dashStats();
      const isAdmin = API.getUser().role === 'admin';
      if (isAdmin) {
        page.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card gold"><div class="stat-icon">👥</div><div class="stat-label">Total Users</div><div class="stat-value">${stats.total_users}</div></div>
            <div class="stat-card blue"><div class="stat-icon">📅</div><div class="stat-label">Meetings</div><div class="stat-value">${stats.active_meetings}</div></div>
            <div class="stat-card green"><div class="stat-icon">🏁</div><div class="stat-label">Open Races</div><div class="stat-value">${stats.open_races}</div></div>
            <div class="stat-card purple"><div class="stat-icon">🎟️</div><div class="stat-label">Pending Bets</div><div class="stat-value">${stats.pending_bets}</div></div>
            <div class="stat-card green"><div class="stat-icon">💰</div><div class="stat-label">Total Staked</div><div class="stat-value money">${U.fmt.money(stats.total_staked)}</div></div>
            <div class="stat-card ${stats.house_profit>=0?'gold':'red'}"><div class="stat-icon">${stats.house_profit>=0?'📈':'📉'}</div><div class="stat-label">House P&L</div><div class="stat-value money">${U.fmt.money(stats.house_profit)}</div></div>
          </div>
          <div class="card">
            <div class="card-title">🎟️ Recent Bets</div>
            ${stats.recent_bets.length ? `<div class="table-wrap"><table>
              <thead><tr><th>User</th><th>Horse</th><th>Race</th><th>Course</th><th>Stake</th><th>Potential</th><th>Status</th></tr></thead>
              <tbody>${stats.recent_bets.map(b=>`<tr>
                <td><strong>${U.escHTML(b.username)}</strong></td>
                <td>${U.escHTML(b.horse_name)}</td>
                <td>${U.escHTML(b.race_name)}</td>
                <td>${b.flag} ${U.escHTML(b.course_name)}</td>
                <td class="mono">${U.fmt.money(b.stake)}</td>
                <td class="money-pos">${U.fmt.money(b.potential_return)}</td>
                <td>${U.statusPill(b.status)}</td>
              </tr>`).join('')}</tbody>
            </table></div>` : '<div class="empty-state"><div class="empty-icon">🎟️</div><p>No bets yet</p></div>'}
          </div>`;
      } else {
        page.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card gold"><div class="stat-icon">💰</div><div class="stat-label">Wallet Balance</div><div class="stat-value money">${U.fmt.money(stats.wallet_balance)}</div></div>
            <div class="stat-card blue"><div class="stat-icon">🎟️</div><div class="stat-label">Total Bets</div><div class="stat-value">${stats.my_bets}</div></div>
            <div class="stat-card yellow"><div class="stat-icon">⏳</div><div class="stat-label">Pending</div><div class="stat-value">${stats.pending_bets}</div></div>
            <div class="stat-card green"><div class="stat-icon">🏆</div><div class="stat-label">Total Winnings</div><div class="stat-value money">${U.fmt.money(stats.total_won)}</div></div>
            <div class="stat-card ${stats.total_won-stats.total_staked>=0?'green':'red'}"><div class="stat-icon">📊</div><div class="stat-label">Net P&L</div><div class="stat-value money">${U.fmt.money(stats.total_won-stats.total_staked)}</div></div>
          </div>
          <div class="card">
            <div class="card-title">🎟️ My Recent Bets</div>
            ${stats.recent_bets.length ? `<div class="table-wrap"><table>
              <thead><tr><th>Horse</th><th>Race</th><th>Course</th><th>Stake</th><th>Potential</th><th>Return</th><th>Status</th></tr></thead>
              <tbody>${stats.recent_bets.map(b=>`<tr>
                <td><strong>${U.escHTML(b.horse_name)}</strong></td>
                <td>${U.escHTML(b.race_name)}</td>
                <td>${b.flag} ${U.escHTML(b.course_name)}</td>
                <td class="mono">${U.fmt.money(b.stake)}</td>
                <td class="money-pos">${U.fmt.money(b.potential_return)}</td>
                <td class="${b.actual_return>0?'money-pos':'text-muted'}">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
                <td>${U.statusPill(b.status)}</td>
              </tr>`).join('')}</tbody>
            </table></div>` : '<div class="empty-state"><div class="empty-icon">🎟️</div><p>No bets yet. Head to Bet Slip!</p></div>'}
          </div>`;
      }
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  // ─── COUNTRIES & COURSES ──────────────────────────────────────
  async renderCountries() {
    const page = U.el('page-countries');
    U.loading(page);
    try {
      const countries = await API.getCountries();
      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Countries & Courses</div>
          <div style="display:flex;gap:10px;">
            <button class="btn btn-ghost" onclick="Pages.showAddCourseModal()">+ Add Course</button>
            <button class="btn btn-primary" onclick="Pages.showAddCountryModal()">+ Add Country</button>
          </div>
        </div>
        <div class="countries-grid">
          ${countries.map(c => `
            <div class="country-card">
              <div class="country-card-header">
                <span class="country-flag">${c.flag}</span>
                <div class="country-info">
                  <div class="country-name">${U.escHTML(c.name)}</div>
                  <div class="country-code">${c.code}</div>
                </div>
                <div style="display:flex;gap:6px;margin-left:auto;">
                  <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCountryModal('${c.id}','${U.escHTML(c.name)}','${c.code}','${c.flag}')">✏️</button>
                  <button class="btn btn-xs btn-danger" onclick="Pages.deleteCountry('${c.id}')">✕</button>
                </div>
              </div>
              <div class="country-courses" id="courses-${c.id}">
                <div class="loading" style="padding:10px"><div class="spinner"></div></div>
              </div>
              <button class="btn btn-xs btn-ghost" style="margin:8px 14px 12px;" onclick="Pages.showAddCourseModal('${c.id}')">+ Add Course</button>
            </div>
          `).join('')}
        </div>
      `;
      // Load courses for each country
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
            <div class="course-item-meta">${co.location||''} · ${co.surface||'Turf'} · ${co.meeting_count} meetings</div>
          </div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCourseModal('${co.id}','${U.escHTML(co.name)}','${U.escHTML(co.location||'')}','${co.surface||'Turf'}')">✏️</button>
            <button class="btn btn-xs btn-danger" onclick="Pages.deleteCourse('${co.id}','${countryId}')">✕</button>
          </div>
        </div>
      `).join('');
    } catch(err) { container.innerHTML='<p class="text-muted text-small" style="padding:8px 14px">Error loading courses</p>'; }
  },

  showAddCountryModal() {
    U.modal.show('Add Country', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Country Name</label><input type="text" id="cn-name" placeholder="e.g. South Africa" /></div>
        <div class="form-group"><label>Country Code (2 letters)</label><input type="text" id="cn-code" placeholder="ZA" maxlength="2" style="text-transform:uppercase" /></div>
      </div>
      <div class="form-group">
        <label>Flag Emoji</label>
        <input type="text" id="cn-flag" placeholder="🇿🇦 — paste flag emoji" />
        <span class="text-muted text-small">Go to <a href="https://emojipedia.org/flags" target="_blank" style="color:var(--gold)">emojipedia.org/flags</a> and paste the flag emoji</span>
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
        <div class="form-group"><label>Name</label><input type="text" id="ec-name" value="${U.escHTML(name)}" /></div>
        <div class="form-group"><label>Code</label><input type="text" id="ec-code" value="${code}" maxlength="2" /></div>
      </div>
      <div class="form-group"><label>Flag Emoji</label><input type="text" id="ec-flag" value="${flag}" /></div>
      <div id="ec-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCountry('${id}')">Save</button>
      </div>
    `);
  },

  async updateCountry(id) {
    const name=U.el('ec-name').value.trim(), code=U.el('ec-code').value.trim().toUpperCase(), flag=U.el('ec-flag').value.trim();
    try { await API.updateCountry(id,{name,code,flag}); U.modal.close(); U.toast('Country updated'); this.renderCountries(); }
    catch(err) { U.setError('ec-error',err.message); }
  },

  async deleteCountry(id) {
    if (!U.confirm('Delete this country and all its courses?')) return;
    try { await API.deleteCountry(id); U.toast('Country deleted'); this.renderCountries(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  async showAddCourseModal(preselectedCountryId) {
    const countries = await API.getCountries();
    U.modal.show('Add Course', `
      <div class="form-group">
        <label>Country</label>
        <select id="co-country">
          ${countries.map(c=>`<option value="${c.id}" ${c.id===preselectedCountryId?'selected':''}>${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Course Name</label><input type="text" id="co-name" placeholder="e.g. Kenilworth Racecourse" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="co-loc" placeholder="e.g. Cape Town" /></div>
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

  showEditCourseModal(id,name,location,surface) {
    U.modal.show('Edit Course', `
      <div class="form-group"><label>Course Name</label><input type="text" id="eco-name" value="${U.escHTML(name)}" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="eco-loc" value="${U.escHTML(location)}" /></div>
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
    try { await API.updateCourse(id,{name,location,surface}); U.modal.close(); U.toast('Course updated'); this.renderCountries(); }
    catch(err) { U.setError('eco-error',err.message); }
  },

  async deleteCourse(id, countryId) {
    if (!U.confirm('Delete this course?')) return;
    try { await API.deleteCourse(id); U.toast('Course deleted'); this.loadCountryCourses(countryId); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ─── MEETINGS ──────────────────────────────────────────────────
  async renderMeetings() {
    const page = U.el('page-meetings');
    U.loading(page);
    try {
      const [meetings, courses] = await Promise.all([API.getMeetings(), API.getAllCourses()]);

      // Group meetings by country
      const byCountry = {};
      for (const m of meetings) {
        const key = m.country_name;
        if (!byCountry[key]) byCountry[key] = { flag: m.flag, meetings: [] };
        byCountry[key].meetings.push(m);
      }

      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Race Meetings</div>
          <button class="btn btn-primary" onclick="Pages.showMeetingModal(null, ${JSON.stringify(courses).replace(/"/g,'&quot;')})">+ New Meeting</button>
        </div>
        ${Object.keys(byCountry).length === 0 ? '<div class="empty-state"><div class="empty-icon">📅</div><p>No meetings yet</p></div>' :
          Object.entries(byCountry).map(([country, data]) => `
            <div style="margin-bottom:28px">
              <div class="country-section-header">
                <span style="font-size:28px">${data.flag}</span>
                <span style="font-family:var(--font-display);font-size:22px;letter-spacing:1.5px;">${U.escHTML(country)}</span>
                <span class="pill pill-gray">${data.meetings.length} meeting(s)</span>
              </div>
              <div class="card" style="padding:0;overflow:hidden;">
                <div class="table-wrap">
                  <table>
                    <thead><tr><th>Course</th><th>Surface</th><th>Date</th><th>Time</th><th>Races</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      ${data.meetings.map(m=>`<tr>
                        <td><strong>${U.escHTML(m.course_name)}</strong><div class="text-muted text-small">${m.location||''}</div></td>
                        <td><span class="pill pill-gray">${m.surface||'Turf'}</span></td>
                        <td>${U.fmt.date(m.meeting_date)}</td>
                        <td class="mono">${m.meeting_time}</td>
                        <td><span class="pill pill-blue">${m.race_count}</span></td>
                        <td>${U.statusPill(m.status)}</td>
                        <td><div class="flex gap-8">
                          <button class="btn btn-xs btn-info" onclick="Pages.showMeetingModal('${m.id}',${JSON.stringify(courses).replace(/"/g,'&quot;')},${JSON.stringify(m).replace(/"/g,'&quot;')})">Edit</button>
                          <button class="btn btn-xs btn-danger" onclick="Pages.deleteMeeting('${m.id}')">Delete</button>
                        </div></td>
                      </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          `).join('')
        }
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showMeetingModal(id, courses, data) {
    const isEdit = !!id;
    U.modal.show(isEdit?'Edit Meeting':'New Meeting', `
      <div class="form-group">
        <label>Course</label>
        <select id="m-course">
          ${courses.map(c=>`<option value="${c.id}" ${data&&data.course_id===c.id?'selected':''}>${c.flag} ${U.escHTML(c.name)} (${U.escHTML(c.country_name)})</option>`).join('')}
        </select>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Date</label><input type="date" id="m-date" value="${data?.meeting_date||''}" /></div>
        <div class="form-group"><label>Time</label><input type="time" id="m-time" value="${data?.meeting_time||''}" /></div>
      </div>
      ${isEdit?`<div class="form-group"><label>Status</label><select id="m-status">${['upcoming','active','finished'].map(s=>`<option value="${s}" ${data?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>`:''}
      <div id="m-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveMeeting('${id||''}')">Save</button>
      </div>
    `);
  },

  async saveMeeting(id) {
    U.clearError('m-error');
    const course_id=U.el('m-course').value, meeting_date=U.el('m-date').value, meeting_time=U.el('m-time').value, status=U.el('m-status')?.value;
    if (!course_id||!meeting_date||!meeting_time) { U.setError('m-error','All fields required'); return; }
    try {
      if (id) await API.updateMeeting(id,{course_id,meeting_date,meeting_time,status});
      else await API.createMeeting({course_id,meeting_date,meeting_time});
      U.modal.close(); U.toast(id?'Meeting updated':'Meeting created'); this.renderMeetings();
    } catch(err) { U.setError('m-error',err.message); }
  },

  async deleteMeeting(id) {
    if (!U.confirm('Delete this meeting?')) return;
    try { await API.deleteMeeting(id); U.toast('Deleted'); this.renderMeetings(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ─── RACES & HORSES ───────────────────────────────────────────
  async renderRaces() {
    const page = U.el('page-races');
    U.loading(page);
    try {
      const [races, meetings, courses] = await Promise.all([API.getRaces(), API.getMeetings(), API.getAllCourses()]);

      // Group by country → course → meeting → races
      const tree = {};
      for (const r of races) {
        const country = r.country_name || 'Other';
        const course  = r.course_name  || 'Unknown';
        if (!tree[country]) tree[country] = { flag: r.flag||'🏁', courses: {} };
        if (!tree[country].courses[course]) tree[country].courses[course] = { surface: r.surface, races: [] };
        tree[country].courses[course].races.push(r);
      }

      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Races & Horses</div>
          <button class="btn btn-primary" onclick="Pages.showRaceModal(${JSON.stringify(meetings).replace(/"/g,'&quot;')})">+ New Race</button>
        </div>
        ${Object.entries(tree).map(([country, cdata]) => `
          <div style="margin-bottom:28px">
            <div class="country-section-header">
              <span style="font-size:28px">${cdata.flag}</span>
              <span style="font-family:var(--font-display);font-size:22px;letter-spacing:1.5px;">${U.escHTML(country)}</span>
            </div>
            ${Object.entries(cdata.courses).map(([course, coursedata]) => `
              <div style="margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding-left:4px;">
                  <span style="font-size:16px;font-weight:700;color:var(--text-primary)">🏟️ ${U.escHTML(course)}</span>
                  <span class="pill pill-gray">${coursedata.surface||'Turf'}</span>
                </div>
                ${coursedata.races.map(r => `
                  <div class="race-block" id="race-block-${r.id}">
                    <div class="race-block-header" onclick="Pages.toggleRaceBlock('${r.id}')">
                      <div class="race-number-badge">R${r.race_number}</div>
                      <div class="race-block-info">
                        <div class="race-block-name">${U.escHTML(r.race_name)}</div>
                        <div class="race-block-meta">
                          ${r.distance||'Dist TBA'} · ${r.race_class||''} · ${r.prize_money||''} · ${r.horse_count} runner(s)
                          ${r.winner_name?` · 🏆 ${r.winner_name}`:''}
                        </div>
                      </div>
                      ${r.closes_at ? `<span class="race-countdown" data-closes="${r.closes_at}">...</span>` : ''}
                      ${U.statusPill(r.status)}
                      <div class="flex gap-8" onclick="event.stopPropagation()">
                        <button class="btn btn-xs btn-info" onclick="Pages.showAddHorseModal('${r.id}')">+ Horse</button>
                        ${r.status==='open'?`<button class="btn btn-xs btn-warning" onclick="Pages.showResultModal('${r.id}')">🏆 Result</button>`:''}
                        <button class="btn btn-xs btn-ghost" onclick="Pages.showRaceResultsModal('${r.id}')">P&L</button>
                        <button class="btn btn-xs btn-danger" onclick="Pages.deleteRace('${r.id}')">✕</button>
                      </div>
                    </div>
                    <div class="race-block-body hidden" id="race-body-${r.id}">
                      <div id="horses-${r.id}" style="margin-top:12px"></div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        `).join('')}
      `;
      startCountdowns();
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async toggleRaceBlock(raceId) {
    const body = U.el(`race-body-${raceId}`);
    body.classList.toggle('hidden');
    if (!body.classList.contains('hidden')) await this.renderHorses(raceId);
  },

  async renderHorses(raceId) {
    const c = U.el(`horses-${raceId}`);
    try {
      const horses = await API.getHorses(raceId);
      if (!horses.length) { c.innerHTML='<p class="text-muted text-small">No runners. Click "+ Horse" to add.</p>'; return; }
      c.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>No.</th><th>Horse</th><th>Colour/Age</th><th>Jockey</th><th>Trainer</th><th>Wt</th><th>Form</th><th>Odds</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${horses.map(h=>`<tr>
          <td class="mono text-muted">${h.barrier_number||'—'}</td>
          <td><strong>${U.escHTML(h.horse_name)}</strong></td>
          <td><span class="text-muted text-small">${U.escHTML(h.colour||'')} ${h.age?h.age+'y':''}</span></td>
          <td>${U.escHTML(h.jockey||'—')}</td>
          <td>${U.escHTML(h.trainer||'—')}</td>
          <td class="mono">${U.escHTML(h.weight||'—')}</td>
          <td class="mono text-muted">${U.escHTML(h.form||'—')}</td>
          <td><span style="font-family:var(--font-display);font-size:18px;color:var(--gold-bright)">${U.fmt.odds(h.odds)}</span></td>
          <td>${U.statusPill(h.status)}</td>
          <td><div class="flex gap-8">
            <button class="btn btn-xs btn-ghost" onclick="Pages.showEditHorseModal('${h.id}',${JSON.stringify(h).replace(/"/g,'&quot;')})">Edit</button>
            ${h.status==='active'?`<button class="btn btn-xs btn-warning" onclick="Pages.showScratchModal('${h.id}','${U.escHTML(h.horse_name)}','${raceId}')">Scratch</button>`:''}
            <button class="btn btn-xs btn-danger" onclick="Pages.deleteHorse('${h.id}','${raceId}')">✕</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    } catch(err) { c.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showRaceModal(meetings) {
    U.modal.show('Add New Race', `
      <div class="form-group"><label>Meeting</label>
        <select id="r-meeting">${meetings.map(m=>`<option value="${m.id}">${m.flag} ${U.escHTML(m.course_name)} — ${U.fmt.date(m.meeting_date)}</option>`).join('')}</select>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Race Number</label><input type="number" id="r-num" min="1" /></div>
        <div class="form-group"><label>Distance</label><input type="text" id="r-dist" placeholder="e.g. 1200m" /></div>
      </div>
      <div class="form-group"><label>Race Name</label><input type="text" id="r-name" placeholder="e.g. The Winter Stakes" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Class</label><input type="text" id="r-class" placeholder="e.g. Grade 1" /></div>
        <div class="form-group"><label>Prize Money</label><input type="text" id="r-prize" placeholder="e.g. R500,000" /></div>
      </div>
      <div class="form-group"><label>Race Closes At (date & time)</label><input type="datetime-local" id="r-closes" /></div>
      <div id="r-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveRace()">Create Race</button>
      </div>
    `);
  },

  async saveRace() {
    U.clearError('r-error');
    const meeting_id=U.el('r-meeting').value, race_number=parseInt(U.el('r-num').value), race_name=U.el('r-name').value.trim();
    const distance=U.el('r-dist').value.trim(), race_class=U.el('r-class').value.trim(), prize_money=U.el('r-prize').value.trim();
    const closesRaw=U.el('r-closes').value;
    const closes_at = closesRaw ? new Date(closesRaw).toISOString() : null;
    if (!meeting_id||!race_number||!race_name) { U.setError('r-error','Meeting, number and name required'); return; }
    try {
      await API.createRace({meeting_id,race_number,race_name,distance,race_class,prize_money,closes_at});
      U.modal.close(); U.toast('Race created'); this.renderRaces();
    } catch(err) { U.setError('r-error',err.message); }
  },

  async deleteRace(id) {
    if (!U.confirm('Delete this race?')) return;
    try { await API.deleteRace(id); U.toast('Deleted'); this.renderRaces(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  showAddHorseModal(raceId) {
    U.modal.show('Add Runner', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Horse Name</label><input type="text" id="h-name" /></div>
        <div class="form-group"><label>Barrier No.</label><input type="number" id="h-barrier" min="1" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="h-jockey" /></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="h-trainer" /></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="h-weight" placeholder="58kg" /></div>
        <div class="form-group"><label>Age (yrs)</label><input type="number" id="h-age" min="2" max="20" /></div>
        <div class="form-group"><label>Colour</label><input type="text" id="h-colour" placeholder="Bay" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Form (last 5)</label><input type="text" id="h-form" placeholder="1-2-1-3" /></div>
        <div class="form-group"><label>Win Odds</label><input type="number" id="h-odds" step="0.01" min="1.01" /></div>
      </div>
      <div id="h-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveHorse('${raceId}')">Add Runner</button>
      </div>
    `);
  },

  async saveHorse(raceId) {
    U.clearError('h-error');
    const horse_name=U.el('h-name').value.trim(), barrier_number=parseInt(U.el('h-barrier').value)||null;
    const jockey=U.el('h-jockey').value.trim()||null, trainer=U.el('h-trainer').value.trim()||null;
    const weight=U.el('h-weight').value.trim()||null, age=parseInt(U.el('h-age').value)||null;
    const colour=U.el('h-colour').value.trim()||null, form=U.el('h-form').value.trim()||null;
    const odds=parseFloat(U.el('h-odds').value);
    if (!horse_name||!odds) { U.setError('h-error','Name and odds required'); return; }
    try {
      await API.addHorse(raceId,{horse_name,barrier_number,jockey,trainer,weight,age,colour,form,odds});
      U.modal.close(); U.toast(`${horse_name} added`); this.renderHorses(raceId);
    } catch(err) { U.setError('h-error',err.message); }
  },

  showEditHorseModal(id, h) {
    U.modal.show('Edit Runner', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Horse Name</label><input type="text" id="eh-name" value="${U.escHTML(h.horse_name)}" /></div>
        <div class="form-group"><label>Barrier</label><input type="number" id="eh-barrier" value="${h.barrier_number||''}" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="eh-jockey" value="${U.escHTML(h.jockey||'')}" /></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="eh-trainer" value="${U.escHTML(h.trainer||'')}" /></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="eh-weight" value="${U.escHTML(h.weight||'')}" /></div>
        <div class="form-group"><label>Age</label><input type="number" id="eh-age" value="${h.age||''}" /></div>
        <div class="form-group"><label>Colour</label><input type="text" id="eh-colour" value="${U.escHTML(h.colour||'')}" /></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Form</label><input type="text" id="eh-form" value="${U.escHTML(h.form||'')}" /></div>
        <div class="form-group"><label>Odds</label><input type="number" id="eh-odds" value="${h.odds}" step="0.01" /></div>
      </div>
      <div id="eh-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateHorse('${id}','${h.race_id}')">Save</button>
      </div>
    `);
  },

  async updateHorse(id, raceId) {
    const data = { horse_name:U.el('eh-name').value.trim(), barrier_number:parseInt(U.el('eh-barrier').value)||null, jockey:U.el('eh-jockey').value.trim()||null, trainer:U.el('eh-trainer').value.trim()||null, weight:U.el('eh-weight').value.trim()||null, age:parseInt(U.el('eh-age').value)||null, colour:U.el('eh-colour').value.trim()||null, form:U.el('eh-form').value.trim()||null, odds:parseFloat(U.el('eh-odds').value)||null };
    try { await API.updateHorse(id,data); U.modal.close(); U.toast('Updated'); this.renderHorses(raceId); }
    catch(err) { U.setError('eh-error',err.message); }
  },

  showScratchModal(horseId, horseName, raceId) {
    U.modal.show(`Scratch — ${horseName}`, `
      <div class="alert alert-warning">⚠️ All pending bets on this horse will be refunded. A deduction will be applied to other runners' winnings.</div>
      <div class="form-group">
        <label>Deduction % applied to other runners' returns</label>
        <input type="number" id="s-ded" value="0" min="0" max="100" step="0.5" />
      </div>
      <div id="s-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="Pages.scratchHorse('${horseId}','${raceId}')">Confirm Scratch</button>
      </div>
    `);
  },

  async scratchHorse(horseId, raceId) {
    const d = parseFloat(U.el('s-ded').value);
    if (isNaN(d)||d<0||d>100) { U.setError('s-error','Enter 0–100'); return; }
    try {
      const res = await API.scratchHorse(horseId,{deduction_percent:d});
      U.modal.close(); U.toast(res.message); this.renderHorses(raceId);
    } catch(err) { U.setError('s-error',err.message); }
  },

  async deleteHorse(id, raceId) {
    if (!U.confirm('Remove this runner?')) return;
    try { await API.deleteHorse(id); U.toast('Removed'); this.renderHorses(raceId); }
    catch(err) { U.toast(err.message,'error'); }
  },

  async showResultModal(raceId) {
    const horses = (await API.getHorses(raceId)).filter(h=>h.status==='active');
    U.modal.show('Declare Race Winner', `
      <div class="form-group"><label>Winning Horse</label>
        <select id="res-horse">
          <option value="">Select winner...</option>
          ${horses.map(h=>`<option value="${h.id}">${h.barrier_number?h.barrier_number+'. ':''}${U.escHTML(h.horse_name)} (${U.fmt.odds(h.odds)})</option>`).join('')}
        </select>
      </div>
      <div id="res-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-success" onclick="Pages.setResult('${raceId}')">Settle Race & Pay Out</button>
      </div>
    `);
  },

  async setResult(raceId) {
    const winner_horse_id = U.el('res-horse').value;
    if (!winner_horse_id) { U.setError('res-error','Select a winner'); return; }
    try {
      const res = await API.setRaceResult(raceId,{winner_horse_id});
      U.modal.close(); U.toast(`🏆 ${res.winner} wins! ${res.winners} bet(s) paid out.`,'success',5000);
      this.renderRaces();
    } catch(err) { U.setError('res-error',err.message); }
  },

  async showRaceResultsModal(raceId) {
    const res = await API.getRaceResults(raceId);
    U.modal.show(`P&L — ${res.race.race_name}`, `
      <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
        <div class="stat-card green" style="padding:12px 14px"><div class="stat-label">Staked</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.total_staked)}</div></div>
        <div class="stat-card red" style="padding:12px 14px"><div class="stat-label">Paid Out</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.total_paid)}</div></div>
        <div class="stat-card ${res.summary.house_profit>=0?'gold':'red'}" style="padding:12px 14px"><div class="stat-label">House P&L</div><div class="stat-value" style="font-size:20px">${U.fmt.money(res.summary.house_profit)}</div></div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>User</th><th>Horse</th><th>Stake</th><th>Potential</th><th>Return</th><th>Status</th></tr></thead>
        <tbody>${res.bets.length ? res.bets.map(b=>`<tr>
          <td>${U.escHTML(b.username)}</td><td>${U.escHTML(b.horse_name)}</td>
          <td class="mono">${U.fmt.money(b.stake)}</td><td class="mono">${U.fmt.money(b.potential_return)}</td>
          <td class="${b.actual_return>0?'money-pos':'text-muted'}">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
          <td>${U.statusPill(b.status)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="text-muted">No bets</td></tr>'}</tbody>
      </table></div>
    `, true);
  },

  // ─── BET SLIP PAGE ────────────────────────────────────────────
  async renderBetslipPage() {
    const page = U.el('page-betslip');
    try {
      const races = await API.getRaces();
      const openRaces = races.filter(r=>r.status==='open');

      // Group by country → course
      const tree = {};
      for (const r of openRaces) {
        const country = r.country_name||'Other';
        const course  = r.course_name||'Unknown';
        if (!tree[country]) tree[country] = { flag: r.flag||'🏁', courses: {} };
        if (!tree[country].courses[course]) tree[country].courses[course] = [];
        tree[country].courses[course].push(r);
      }

      const slip = BetSlip;
      const odds = slip.getCombinedOdds();
      const ret  = slip.getPotentialReturn();

      page.innerHTML = `
        <div class="betslip-layout">
          <div>
            <div class="page-header"><div class="page-header-title">Place a Bet</div></div>
            ${Object.keys(tree).length===0 ? '<div class="empty-state"><div class="empty-icon">🏁</div><p>No open races available</p></div>' :
              Object.entries(tree).map(([country, cdata]) => `
                <div style="margin-bottom:24px">
                  <div class="country-section-header">
                    <span style="font-size:26px">${cdata.flag}</span>
                    <span style="font-family:var(--font-display);font-size:20px;letter-spacing:1.5px;">${U.escHTML(country)}</span>
                  </div>
                  ${Object.entries(cdata.courses).map(([course, courseRaces]) => `
                    <div style="margin-bottom:12px">
                      <div style="font-size:13px;color:var(--text-muted);padding-left:4px;margin-bottom:6px;">🏟️ ${U.escHTML(course)}</div>
                      ${courseRaces.map(r => `
                        <div class="race-block" style="margin-bottom:8px">
                          <div class="race-block-header" onclick="Pages.toggleBetRace('${r.id}')">
                            <div class="race-number-badge">R${r.race_number}</div>
                            <div class="race-block-info">
                              <div class="race-block-name">${U.escHTML(r.race_name)}</div>
                              <div class="race-block-meta">${r.distance||''} · ${r.race_class||''} · ${r.prize_money||''} · ${r.horse_count} runners</div>
                            </div>
                            ${r.closes_at ? `<span class="race-countdown" data-closes="${r.closes_at}">...</span>` : ''}
                            <span style="color:var(--text-muted);font-size:12px">▼</span>
                          </div>
                          <div class="race-block-body hidden" id="bet-race-body-${r.id}">
                            <div id="bet-horses-${r.id}" class="horse-grid" style="margin-top:12px">
                              <div class="loading"><div class="spinner"></div></div>
                            </div>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  `).join('')}
                </div>
              `).join('')
            }
          </div>

          <!-- BETSLIP PANEL -->
          <div class="betslip-panel">
            <div class="betslip-header">
              <h3>🎟️ Bet Slip</h3>
              ${slip.getCount()>0?`<button class="btn btn-xs btn-danger" onclick="BetSlip.clear()">Clear</button>`:''}
            </div>
            <div class="betslip-tabs">
              <div class="betslip-tab ${slip.mode==='single'?'active':''}" onclick="BetSlip.setMode('single')">Single</div>
              <div class="betslip-tab ${slip.mode==='multi'?'active':''}" onclick="BetSlip.setMode('multi')">Multi / Acca</div>
            </div>
            ${slip.getCount()===0 ? `<div class="betslip-empty"><div style="font-size:32px;margin-bottom:8px">🎫</div><p>Click a horse card to add</p></div>` : `
              <div class="betslip-selections">
                ${slip.selections.map(s=>`
                  <div class="betslip-selection">
                    <div class="sel-info">
                      <div class="sel-horse">${U.escHTML(s.horse_name)}</div>
                      <div class="sel-race">${U.escHTML(s.race_name)} · ${U.escHTML(s.course_name)}</div>
                      ${s.jockey?`<div class="sel-race">J: ${U.escHTML(s.jockey)}</div>`:''}
                    </div>
                    <div class="sel-odds">${U.fmt.odds(s.odds)}</div>
                    <button class="sel-remove" onclick="BetSlip.remove('${s.horse_id}')">✕</button>
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
      startCountdowns();
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  updateCalc() {
    const calc = U.el('return-calc');
    if (calc) calc.innerHTML = `<div class="betslip-calc-row"><span class="calc-label">Potential Return</span><span class="calc-value return">${U.fmt.money(BetSlip.getPotentialReturn())}</span></div>`;
  },

  async toggleBetRace(raceId) {
    const body = U.el(`bet-race-body-${raceId}`);
    body.classList.toggle('hidden');
    if (!body.classList.contains('hidden')) await this.renderBetHorses(raceId);
  },

  async renderBetHorses(raceId) {
    const c = U.el(`bet-horses-${raceId}`);
    try {
      const race = await API.getRace(raceId);
      c.innerHTML = race.horses.map(h => `
        <div class="horse-card ${h.status==='scratched'?'scratched':''} ${BetSlip.selections.find(s=>s.horse_id===h.id)?'selected':''}"
          onclick="${h.status!=='scratched'?`Pages.addToSlip('${h.id}','${U.escHTML(h.horse_name)}','${raceId}','${U.escHTML(race.race_name)}','${U.escHTML(race.course_name)}',${h.odds},'${U.escHTML(h.jockey||'')}')`:''}" >
          <div class="horse-barrier">No. ${h.barrier_number||'?'}</div>
          <div class="horse-name">${U.escHTML(h.horse_name)}</div>
          ${h.jockey?`<div class="horse-detail">🎽 ${U.escHTML(h.jockey)}</div>`:''}
          ${h.trainer?`<div class="horse-detail">🎩 ${U.escHTML(h.trainer)}</div>`:''}
          ${h.colour||h.age?`<div class="horse-detail">${U.escHTML(h.colour||'')} ${h.age?h.age+'yo':''}</div>`:''}
          ${h.form?`<div class="horse-form">Form: ${U.escHTML(h.form)}</div>`:''}
          <div class="horse-odds-display">${U.fmt.odds(h.odds)}</div>
          <div class="horse-odds-label">WIN ODDS</div>
          ${h.scratch_deduction>0?`<div style="color:var(--red);font-size:10px;margin-top:4px">Ded: ${h.scratch_deduction}%</div>`:''}
        </div>
      `).join('');
    } catch(err) { c.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  addToSlip(horseId, horseName, raceId, raceName, courseName, odds, jockey) {
    BetSlip.add({ horse_id:horseId, horse_name:horseName, race_id:raceId, race_name:raceName, course_name:courseName, odds, jockey });
    this.renderBetHorses(raceId);
  },

  // ─── MY BETS ─────────────────────────────────────────────────
  async renderMyBets() {
    const page = U.el('page-mybets');
    U.loading(page);
    try {
      const slips = await API.getBetslips();
      const isAdmin = API.getUser().role==='admin';
      page.innerHTML = `
        <div class="page-header"><div class="page-header-title">${isAdmin?'All Betslips':'My Bets'}</div><div class="text-muted text-small">${slips.length} slip(s)</div></div>
        ${slips.length===0?'<div class="empty-state"><div class="empty-icon">🎟️</div><p>No bets yet</p></div>':
          slips.map(slip=>`
            <div class="card" style="margin-bottom:12px">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    ${U.statusPill(slip.slip_type)}${U.statusPill(slip.status)}
                    ${isAdmin?`<span class="text-muted text-small">by ${U.escHTML(slip.username)}</span>`:''}
                  </div>
                  <div class="text-muted text-small">${U.fmt.datetime(slip.created_at)}</div>
                </div>
                <div style="text-align:right">
                  <div class="text-muted text-small">Stake / Potential / Return</div>
                  <div class="mono" style="font-size:15px">
                    <span>${U.fmt.money(slip.total_stake)}</span>
                    <span style="color:var(--text-muted)"> / </span>
                    <span style="color:var(--gold-bright)">${U.fmt.money(slip.potential_return)}</span>
                    <span style="color:var(--text-muted)"> / </span>
                    <span class="${slip.actual_return>0?'money-pos':'text-muted'}">${slip.actual_return>0?U.fmt.money(slip.actual_return):'—'}</span>
                  </div>
                </div>
              </div>
              <hr class="divider" style="margin:12px 0">
              ${slip.selections.map(s=>`
                <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-raised);border-radius:7px;margin-bottom:6px">
                  ${U.statusPill(s.result)}
                  <div style="flex:1"><strong>${U.escHTML(s.horse_name)}</strong> <span class="text-muted">— ${s.flag||''} ${U.escHTML(s.race_name)}, ${U.escHTML(s.course_name)}</span></div>
                  <div class="mono" style="color:var(--gold-bright)">${U.fmt.odds(s.odds_at_time)}</div>
                </div>
              `).join('')}
            </div>
          `).join('')
        }`;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  // ─── USERS ───────────────────────────────────────────────────
  async renderUsers() {
    const page = U.el('page-users');
    U.loading(page);
    try {
      const users = await API.getUsers();
      page.innerHTML = `
        <div class="page-header"><div class="page-header-title">User Management</div>
          <button class="btn btn-primary" onclick="Pages.showCreateUserModal()">+ New User</button>
        </div>
        <div class="card"><div class="table-wrap"><table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Wallet</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>${users.map(u=>`<tr>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="user-avatar" style="width:28px;height:28px;font-size:11px">${u.username[0].toUpperCase()}</div><strong>${U.escHTML(u.username)}</strong></div></td>
            <td class="text-muted">${U.escHTML(u.email)}</td>
            <td>${U.statusPill(u.role)}</td>
            <td class="money-pos">${U.fmt.money(u.wallet_balance)}</td>
            <td>${u.is_active?'<span class="pill pill-green">Active</span>':'<span class="pill pill-red">Inactive</span>'}</td>
            <td class="text-muted text-small">${U.fmt.date(u.created_at)}</td>
            <td><div class="flex gap-8">
              <button class="btn btn-xs btn-success" onclick="Pages.showWalletModal('${u.id}','${U.escHTML(u.username)}','deposit')">Deposit</button>
              <button class="btn btn-xs btn-warning" onclick="Pages.showWalletModal('${u.id}','${U.escHTML(u.username)}','withdraw')">Withdraw</button>
              <button class="btn btn-xs btn-info" onclick="Pages.showUserTxns('${u.id}','${U.escHTML(u.username)}')">Txns</button>
              ${u.role!=='admin'?`<button class="btn btn-xs btn-danger" onclick="Pages.deactivateUser('${u.id}')">Deactivate</button>`:''}
            </div></td>
          </tr>`).join('')}</tbody>
        </table></div></div>`;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showCreateUserModal() {
    U.modal.show('Create New User', `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Username</label><input type="text" id="u-username" /></div>
        <div class="form-group"><label>Role</label><select id="u-role"><option value="punter">Punter</option><option value="clerk">Clerk</option><option value="admin">Admin</option></select></div>
      </div>
      <div class="form-group"><label>Email</label><input type="email" id="u-email" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="u-pass" placeholder="Min. 8 characters" /></div>
      <div class="form-group"><label>Initial Wallet Balance (R)</label><input type="number" id="u-wallet" value="0" min="0" step="100" /></div>
      <div id="u-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createUser()">Create</button>
      </div>
    `);
  },

  async createUser() {
    U.clearError('u-error');
    const username=U.el('u-username').value.trim(), email=U.el('u-email').value.trim(), password=U.el('u-pass').value, role=U.el('u-role').value, wallet_balance=parseFloat(U.el('u-wallet').value)||0;
    if (!username||!email||!password) { U.setError('u-error','All fields required'); return; }
    try { await API.createUser({username,email,password,role,wallet_balance}); U.modal.close(); U.toast('User created'); this.renderUsers(); }
    catch(err) { U.setError('u-error',err.message); }
  },

  showWalletModal(userId, username, type) {
    const isD = type==='deposit';
    U.modal.show(`${isD?'💰 Deposit':'💸 Withdraw'} — ${username}`, `
      <div class="form-group"><label>Amount (R)</label><input type="number" id="w-amount" min="0.01" step="50" /></div>
      <div class="form-group"><label>Description</label><input type="text" id="w-desc" placeholder="${isD?'Deposit':'Withdrawal'}" /></div>
      <div id="w-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn ${isD?'btn-success':'btn-warning'}" onclick="Pages.walletAction('${userId}','${type}')">Confirm</button>
      </div>
    `);
  },

  async walletAction(userId, type) {
    U.clearError('w-error');
    const amount=parseFloat(U.el('w-amount').value), description=U.el('w-desc').value.trim()||undefined;
    if (!amount||amount<=0) { U.setError('w-error','Enter valid amount'); return; }
    try {
      const fn = type==='deposit' ? API.depositUser(userId,{amount,description}) : API.withdrawUser(userId,{amount,description});
      const res = await fn;
      U.modal.close(); U.toast(`Done. New balance: ${U.fmt.money(res.new_balance)}`); this.renderUsers();
    } catch(err) { U.setError('w-error',err.message); }
  },

  async showUserTxns(userId, username) {
    const txns = await API.getUserTxns(userId);
    U.modal.show(`Transactions — ${username}`, `
      <div class="table-wrap"><table>
        <thead><tr><th>Type</th><th>Amount</th><th>Balance After</th><th>Description</th><th>Date</th></tr></thead>
        <tbody>${txns.length?txns.map(t=>`<tr>
          <td>${U.statusPill(t.type)}</td>
          <td class="mono ${t.type==='bet'?'money-neg':'money-pos'}">${t.type==='bet'?'-':'+'} ${U.fmt.money(t.amount)}</td>
          <td class="mono">${U.fmt.money(t.balance_after)}</td>
          <td class="text-muted text-small">${U.escHTML(t.description||'')}</td>
          <td class="text-muted text-small">${U.fmt.datetime(t.created_at)}</td>
        </tr>`).join(''):'<tr><td colspan="5" class="text-muted">No transactions</td></tr>'}</tbody>
      </table></div>
    `, true);
  },

  async deactivateUser(id) {
    if (!U.confirm('Deactivate this user?')) return;
    try { await API.deleteUser(id); U.toast('Deactivated'); this.renderUsers(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ─── REPORTS ─────────────────────────────────────────────────
  async renderReports() {
    const page = U.el('page-reports');
    U.loading(page);
    try {
      const [stats, slips] = await Promise.all([API.dashStats(), API.getBetslips()]);
      const won=slips.filter(b=>b.status==='won').length, lost=slips.filter(b=>b.status==='lost').length, pending=slips.filter(b=>b.status==='active').length;
      const margin = stats.total_staked>0?(stats.house_profit/stats.total_staked*100):0;
      page.innerHTML = `
        <div class="page-header"><div class="page-header-title">Reports & Analytics</div></div>
        <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
          <div class="stat-card gold"><div class="stat-label">Total Turnover</div><div class="stat-value money">${U.fmt.money(stats.total_staked)}</div></div>
          <div class="stat-card red"><div class="stat-label">Total Paid Out</div><div class="stat-value money">${U.fmt.money(stats.total_paid)}</div></div>
          <div class="stat-card ${stats.house_profit>=0?'green':'red'}"><div class="stat-label">House Profit</div><div class="stat-value money">${U.fmt.money(stats.house_profit)}</div></div>
          <div class="stat-card blue"><div class="stat-label">Margin</div><div class="stat-value">${U.fmt.pct(margin)}</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div class="card"><div class="card-title">🎟️ Betslip Breakdown</div>
            ${[{l:'Won',v:won,c:'var(--green)'},{l:'Lost',v:lost,c:'var(--red)'},{l:'Pending',v:pending,c:'var(--yellow)'}].map(r=>`
              <div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span class="text-muted text-small">${r.l}</span><span class="mono" style="color:${r.c}">${r.v}</span></div>
                <div class="profit-bar"><div class="profit-bar-fill" style="width:${slips.length>0?(r.v/slips.length*100):0}%;background:${r.c}80"></div></div>
              </div>`).join('')}
          </div>
          <div class="card"><div class="card-title">📊 House Metrics</div>
            <div style="display:flex;flex-direction:column;gap:12px">
              <div class="betslip-calc-row"><span class="calc-label">Total Bets</span><span class="mono">${stats.total_bets}</span></div>
              <div class="betslip-calc-row"><span class="calc-label">Pending Bets</span><span class="mono">${stats.pending_bets}</span></div>
              <div class="betslip-calc-row"><span class="calc-label">Avg Stake</span><span class="mono">${U.fmt.money(stats.total_bets>0?stats.total_staked/stats.total_bets:0)}</span></div>
              <div class="betslip-calc-row"><span class="calc-label">Win Rate</span><span class="mono">${U.fmt.pct(slips.length>0?won/slips.length*100:0)}</span></div>
              <div class="betslip-calc-row"><span class="calc-label">House Edge</span><span class="mono" style="color:${margin>=0?'var(--green)':'var(--red)'}">${U.fmt.pct(margin)}</span></div>
            </div>
          </div>
        </div>`;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  }
};
