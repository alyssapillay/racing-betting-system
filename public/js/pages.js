const Pages = {
  // ── Back button HTML ─────────────────────────────────────────────
  _backBtn(label='← Back') {
    return App._stack.length > 0
      ? `<button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">${label}</button>`
      : '';
  },


  // ── Screen router ───────────────────────────────────────────────
  renderScreen(screen, params) {
    const map = {
      'dashboard':      () => this.renderDashboard(),
      'betslip':        () => this.renderBetslipPage(),
      'bets':           () => this.renderBetHistory(),
      'wallets':        () => this.renderWallets(),
      'events:sports':  () => this.renderSportSelector(),
      'events:meetings':() => this.renderMeetings(params),
      'events:races':   () => this.renderRaces(params),
      'operators':      () => this.renderOperators(),
      'countries':      () => this.renderCountries(),
      'reports':        () => this.renderReports(),
    };
    const fn = map[screen];
    if (fn) fn(); else console.warn('Unknown screen:', screen);
  },

  // ── DASHBOARD ──────────────────────────────────────────────────
  async renderDashboard() {
    const page = document.getElementById('page-dashboard');
    U.loading(page);
    try {
      const s = await API.dashStats();
      page.innerHTML = `
        <div class="page-header" style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div class="page-header-title">Dashboard</div>
          </div>
        </div>
        <div class="stats-grid">
          <div class="stat-card gold"><div class="stat-icon">💰</div><div class="stat-label">Total Staked</div><div class="stat-value money">${U.fmt.money(s.total_staked)}</div></div>
          <div class="stat-card green"><div class="stat-icon">📈</div><div class="stat-label">House Profit</div><div class="stat-value money">${U.fmt.money(s.house_profit)}</div></div>
          <div class="stat-card red"><div class="stat-icon">⚡</div><div class="stat-label">Liability</div><div class="stat-value money">${U.fmt.money(s.total_liability)}</div></div>
          <div class="stat-card blue"><div class="stat-icon">🎟️</div><div class="stat-label">Pending Bets</div><div class="stat-value">${s.pending_bets}</div></div>
          <div class="stat-card purple"><div class="stat-icon">🎯</div><div class="stat-label">Open Events</div><div class="stat-value">${s.open_events}</div></div>
          <div class="stat-card yellow"><div class="stat-icon">👛</div><div class="stat-label">Wallets</div><div class="stat-value">${s.total_wallets}</div></div>
        </div>

        <div class="card">
          <div class="card-title">📊 Sport Breakdown</div>
          <div class="table-wrap"><table>
            <thead><tr><th>Sport</th><th>Bets</th><th style="text-align:right">Staked</th><th style="text-align:right">Paid</th><th style="text-align:right">Profit</th></tr></thead>
            <tbody>${s.sports_breakdown.map(sp=>`<tr>
              <td>${sp.icon} <strong>${sp.name}</strong></td>
              <td class="mono">${sp.bet_count}</td>
              <td class="mono" style="text-align:right">${U.fmt.money(sp.staked)}</td>
              <td class="mono" style="text-align:right">${U.fmt.money(sp.paid)}</td>
              <td style="text-align:right">${U.plBadge(sp.staked-sp.paid)}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>

        ${s.recent_bets.length ? `
        <div class="card" style="margin-top:14px">
          <div class="card-title">🕐 Recent Bets</div>
          ${s.recent_bets.slice(0,8).map(b=>`
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>${b.sport_icon}</span>
              ${U.statusPill(b.status)}
              <div style="flex:1;min-width:0"><strong>${U.escHTML(b.wallet_name)}</strong> — ${U.escHTML(b.selection_name)}</div>
              <div class="mono">${U.fmt.money(b.stake)}</div>
              <div class="mono" style="color:var(--gold-bright)">${U.fmt.odds(b.odds_at_time)}</div>
            </div>
          `).join('')}
        </div>` : ''}
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  // ════════════════════════════════════════════════════════════
  // SCREEN 1: SPORTS
  // ════════════════════════════════════════════════════════════
  async renderSportSelector() {
    const page = document.getElementById('page-events');
    U.loading(page);
    try {
      const sports = await API.getSports();
      const isSA = API.getOp()?.role === 'super_admin';
      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Select Sport</div>
          ${isSA ? '<button class="btn btn-sm btn-primary" onclick="Pages.showCreateMeetingModal()">+ New Event</button>' : ''}
        </div>
        <div class="sports-grid">
          ${sports.map(s => `
            <div class="sport-card" onclick="Pages._onSportClick('${s.id}','${U.escHTML(s.name)}','${s.icon}')">
              <div class="sport-card-icon">${s.icon}</div>
              <div class="sport-card-name">${s.name}</div>
              <div class="sport-card-count">${s.event_count||0} open</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  _onSportClick(sportId, sportName, sportIcon) {
    if (sportId === 'sport_hr') {
      // Horse racing: go to courses screen
      App.drillTo('courses', `${sportIcon} ${sportName}`, { sportId, sportName, sportIcon });
    } else {
      // Other sports: go straight to meetings/events
      App.drillTo('meetings', `${sportIcon} ${sportName}`, { sportId, sportName, sportIcon });
    }
  },

  renderSportsScreen() { return this.renderSportSelector(); },

  // ════════════════════════════════════════════════════════════
  // SCREEN 2a: COURSES (horse racing only)
  // ════════════════════════════════════════════════════════════
  async renderCoursesScreen({ sportId, sportName, sportIcon }={}) {
    const page = document.getElementById('page-courses');
    U.loading(page);
    try {
      const courses = await API.getHorseCourses();
      const isSA = API.getOp()?.role === 'super_admin';
      if (!courses.length) {
        page.innerHTML = `
          <div class="page-header">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
              <div class="page-header-title">🏇 Race Courses</div>
            </div>
          </div>
          <div class="empty-state"><div class="empty-icon">🏇</div><p>No courses yet</p>
            ${isSA?'<button class="btn btn-primary" style="margin-top:12px" onclick="Pages.showCreateMeetingModal()">+ Create Meeting</button>':''}
          </div>`;
        return;
      }
      page.innerHTML = `
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div class="page-header-title">🏇 Race Courses</div>
          </div>
          ${isSA ? '<button class="btn btn-sm btn-primary" onclick="Pages.showCreateMeetingModal()">+ New Meeting</button>' : ''}
        </div>
        <div class="courses-list">
          ${courses.map(c => `
            <div class="course-list-item" onclick="App.drillTo('named-events','${U.escHTML(c.flag)} ${U.escHTML(c.course_name)}',${JSON.stringify({course_id:c.course_id,course_name:c.course_name,flag:c.flag,country_name:c.country_name}).replace(/"/g,'&quot;')})">
              <div class="cli-flag">${c.flag}</div>
              <div class="cli-info">
                <div class="cli-name">${U.escHTML(c.course_name)}</div>
                <div class="cli-meta">${c.country_name}</div>
              </div>
              <div class="cli-right">
                <span class="pill pill-blue">${c.event_count} event${c.event_count!==1?'s':''}</span>
                <span class="pill ${c.open_races>0?'pill-green':'pill-gray'}" style="margin-top:4px">${c.open_races} races open</span>
              </div>
              <div class="cli-arrow">›</div>
            </div>
          `).join('')}
        </div>
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  // ════════════════════════════════════════════════════════════
  // SCREEN 2b: NAMED EVENTS for a course
  // ════════════════════════════════════════════════════════════
  async renderNamedEventsScreen({ course_id, course_name, flag, country_name }={}) {
    const page = document.getElementById('page-named-events');
    U.loading(page);
    try {
      const events = await API.getNamedEvents(course_id);
      const isSA = API.getOp()?.role === 'super_admin';
      page.innerHTML = `
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div>
              <div class="page-header-title">${flag||'🏇'} ${U.escHTML(course_name||'Course')}</div>
              <div style="font-size:11px;color:var(--text-muted)">${country_name||''}</div>
            </div>
          </div>
          ${isSA ? `<button class="btn btn-sm btn-primary" onclick="Pages.showCreateMeetingModal('sport_hr','${course_id}')">+ New Event</button>` : ''}
        </div>
        ${!events.length
          ? `<div class="empty-state"><div class="empty-icon">📭</div><p>No events at this course yet</p>
              ${isSA?`<button class="btn btn-primary" style="margin-top:12px" onclick="Pages.showCreateMeetingModal('sport_hr','${course_id}')">+ Create Event</button>`:''}
             </div>`
          : `<div class="named-events-list">
              ${events.map(ev => `
                <div class="named-event-card" onclick="Pages.goToRaces('${ev.meeting_key}','${U.escHTML(ev.meeting_name||ev.course_name)}','${ev.event_date}','sport_hr','🏇')">
                  <div class="nec-left">
                    <div class="nec-name">${U.escHTML(ev.meeting_name||'Race Meeting')}</div>
                    <div class="nec-meta">${U.fmt.date(ev.event_date)} · ${ev.first_race} – ${ev.last_race}</div>
                  </div>
                  <div class="nec-right">
                    <span class="pill pill-blue">${ev.race_count} race${ev.race_count!==1?'s':''}</span>
                    <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                      ${ev.open_races>0?`<span class="pill pill-green">${ev.open_races} open</span>`:''}
                      ${ev.settled_races>0?`<span class="pill pill-gray">${ev.settled_races} settled</span>`:''}
                    </div>
                  </div>
                  <div class="nec-arrow">›</div>
                </div>
              `).join('')}
            </div>`
        }
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  // ════════════════════════════════════════════════════════════
  // SCREEN 2c: MEETINGS for non-horse sports
  // ════════════════════════════════════════════════════════════
  async renderMeetings({ sportId, sportName, sportIcon }={}) {
    const page = document.getElementById('page-meetings');
    U.loading(page);
    try {
      const isSA = API.getOp()?.role === 'super_admin';
      const events = await API.getEvents(sportId);
      page.innerHTML = `
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div class="page-header-title">${sportIcon} ${sportName}</div>
          </div>
          ${isSA ? `<button class="btn btn-primary btn-sm" onclick="Pages.showCreateMeetingModal('${sportId}')">+ New Event</button>` : ''}
        </div>
        ${!events.length
          ? '<div class="empty-state"><div class="empty-icon">📭</div><p>No events yet</p></div>'
          : events.map(ev => `
            <div class="meeting-list-card" onclick="Pages.goToRaces('${ev.id}','${U.escHTML(ev.event_name)}','${ev.event_date}','${sportId}','${sportIcon}','single')">
              <div class="mlc-flag">${ev.flag||sportIcon}</div>
              <div class="mlc-info">
                <div class="mlc-course">${U.escHTML(ev.event_name)}</div>
                <div class="mlc-meta">${U.fmt.date(ev.event_date)} · ${ev.event_time}</div>
              </div>
              <div class="mlc-right">
                ${U.statusPill(ev.status)}
                ${ev.closes_at?`<span class="race-countdown" data-closes="${ev.closes_at}">...</span>`:''}
              </div>
              <div class="mlc-arrow">›</div>
            </div>
          `).join('')
        }
      `;
      startCountdowns();
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  renderMeetingsScreen(p={}) {
    const mapped = { sportId: p.sport_id||p.sportId||'', sportName: p.sport_name||p.sportName||'', sportIcon: p.sport_icon||p.sportIcon||'🎯' };
    return this.renderMeetings(mapped);
  },
  renderRacesScreen(p={}) { Pages._currentRaceParams = p; return this.renderRaces(p); },

  goToRaces(meetingKey, name, date, sportId, sportIcon, mode='meeting') {
    Pages._currentRaceParams = { meetingKey, course: name, date, sportId, sportIcon, mode };
    App.drillTo('races', `${sportIcon} ${name}`, { meetingKey, course: name, date, sportId, sportIcon, mode });
  },



  // ── RACES (Screen 3 of Events) ──────────────────────────────────
    async renderRaces({ meetingKey, course, date, sportId, sportIcon, mode }) {
    const page = document.getElementById('page-races');
    U.loading(page);
    Pages._currentRaceParams = { meetingKey, course, date, sportId, sportIcon, mode };
    try {
      const isSuperAdmin = API.getOp()?.role === 'super_admin';
      const isBookmaker  = ['super_admin','bookmaker'].includes(API.getOp()?.role);

      // Use server-side meeting_key lookup for horse racing, fallback to single event
      let races;
      if (mode === 'single') {
        const ev = await API.getEvent(meetingKey);
        races = ev ? [ev] : [];
      } else {
        // Query by meeting_key directly — much more reliable than client-side filter
        races = await API.getMeetingRaces(meetingKey);
        // If no results, try fetching all events and filter — handles legacy data
        if (!races.length) {
          const all = await API.getEvents(sportId);
          races = all.filter(e =>
            e.meeting_key === meetingKey ||
            (e.course_id && e.course_id + '__' + e.event_date === meetingKey) ||
            ((e.course_name||'') + '__' + e.event_date === meetingKey)
          );
        }
        races.sort((a,b) => (a.race_number||1) - (b.race_number||1));
      }

      if (!races.length) {
        page.innerHTML = `
          <div class="page-header">
            <div style="display:flex;align-items:center;gap:8px">
              <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
              <div class="page-header-title">${U.escHTML(course||'Meeting')}</div>
            </div>
            ${isSuperAdmin ? `<button class="btn btn-sm btn-primary" onclick="Pages.showAddRaceModal('${meetingKey}','${U.escHTML(course)}','${date}','${sportId||'sport_hr'}')">+ Add Race</button>` : ''}
          </div>
          <div class="empty-state"><div class="empty-icon">🏁</div><p>No races found for this meeting</p><p class="text-small text-muted">Meeting key: ${meetingKey}</p></div>
        `;
        return;
      }

      Pages._raceList = races;
      Pages._activeRaceIdx = 0;

      page.innerHTML = `
        <div class="meeting-header">
          <div class="meeting-header-left">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div>
              <div class="meeting-title">${U.escHTML(course||races[0]?.course_name||'Meeting')}</div>
              <div class="meeting-date">${U.fmt.date(date||races[0]?.event_date)}</div>
            </div>
          </div>
          <div class="meeting-header-right">
            ${isSuperAdmin ? `<button class="btn btn-sm btn-primary" onclick="Pages.showAddRaceModal('${meetingKey}','${U.escHTML(course)}','${date}','${sportId||'sport_hr'}')">+ Race</button>` : ''}
          </div>
        </div>

        <div class="race-tab-bar" id="race-tab-bar">
          ${races.map((r,i) => `
            <div class="race-tab-item ${i===0?'active':''}" id="rtab-${i}" onclick="Pages.switchRace(${i})">
              <div class="rti-label">RACE ${r.race_number||i+1}</div>
              <div class="rti-time">${r.event_time||''}</div>
              ${r.status==='settled' ? '<div class="rti-settled">✓</div>' : ''}
              ${r.status==='closed'  ? '<div class="rti-closed">🔒</div>' : ''}
              ${r.closes_at && r.status==='open' ? `<div class="rti-countdown" data-closes="${r.closes_at}">...</div>` : ''}
            </div>
          `).join('')}
        </div>

        <div id="race-panels-wrap">
          ${races.map((r,i) => `
            <div class="race-panel-wrap ${i===0?'active':''}" id="rpanel-${i}">
              <div class="race-info-bar">
                <div class="rib-left">
                  <span class="rib-flag">${r.flag||'🏇'}</span>
                  <span class="rib-course">${U.escHTML(r.course_name||course||'')}</span>
                  <span class="rib-detail">RACE ${r.race_number||i+1}${r.distance?' · '+r.distance:''} · ${r.event_time||''}</span>
                  ${r.closes_at ? `<span class="race-countdown rib-countdown" data-closes="${r.closes_at}">...</span>` : ''}
                  ${U.statusPill(r.status)}
                </div>
                <div class="rib-right">
                  ${isBookmaker && r.status==='open' ? `
                    <button class="btn btn-xs btn-warning" onclick="Pages.showSettleModal('${r.id}')">🏆 Result</button>
                    <button class="btn btn-xs btn-info" onclick="Pages.showAddSelectionModal('${r.id}','${U.escHTML(r.event_name||'')}')">+ Runner</button>
                  ` : ''}
                  <button class="btn btn-xs btn-ghost" onclick="Pages.showEventPL('${r.id}')">P&L</button>
                  ${isBookmaker ? `<button class="btn btn-xs btn-ghost" onclick="Pages.showEditRaceModal('${r.id}',${JSON.stringify(r).replace(/"/g,'&quot;')})">✏️ Edit</button>` : ''}
                </div>
              </div>
              <div id="runners-${r.id}" class="runners-table-wrap">
                <div class="loading"><div class="spinner"></div></div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      await Pages.loadRunners(races[0].id);
      startCountdowns();
    } catch(err) {
      page.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  },


  async switchRace(idx) {
    Pages._activeRaceIdx = idx;
    // Update tabs
    document.querySelectorAll('.race-tab-item').forEach((el,i) => el.classList.toggle('active', i===idx));
    // Show/hide panels
    document.querySelectorAll('.race-panel-wrap').forEach((el,i) => el.classList.toggle('active', i===idx));
    // Load runners if not already loaded
    const race = Pages._raceList[idx];
    if (race) {
      const el = document.getElementById(`runners-${race.id}`);
      if (el && el.querySelector('.spinner')) await Pages.loadRunners(race.id);
    }
    startCountdowns();
  },

  async loadRunners(eventId) {
    const container = document.getElementById(`runners-${eventId}`);
    if (!container) return;
    try {
      const ev = await API.getEvent(eventId);
      const sels = ev.selections || [];
      const isBookmaker = ['super_admin','bookmaker'].includes(API.getOp()?.role);

      if (!sels.length) {
        container.innerHTML = `<div class="empty-state" style="padding:24px">
          <div class="empty-icon">🐎</div><p>No runners yet</p>
          ${isBookmaker ? `<button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="Pages.showAddRunnerModal('${eventId}','')">+ Add Runner</button>` : ''}
        </div>`;
        return;
      }

      container.innerHTML = `
        <table class="runners-table">
          <thead>
            <tr>
              <th class="rt-num">#</th>
              <th class="rt-silk">Silk</th>
              <th class="rt-horse">Horse</th>
              <th class="rt-wt">Weight /<br>Age/Sex</th>
              <th class="rt-prev">Opening /<br>Previous</th>
              <th class="rt-win">
                <span class="rt-odds-arrow up">▲</span> Win
              </th>
              <th class="rt-place">Place<br>(3)</th>
            </tr>
          </thead>
          <tbody>
            ${sels.map(s => {
              const isScratched  = s.status === 'scratched';
              const winSelected  = BetSlip.selections.find(x => x.selection_id===s.id && x.bet_on==='win');
              const placeSelected= BetSlip.selections.find(x => x.selection_id===s.id && x.bet_on==='place');

              // Price movement vs opening
              const winOdds   = parseFloat(s.win_odds   || s.odds || 0);
              const openOdds  = parseFloat(s.opening_win_odds || winOdds);
              const winMove   = winOdds < openOdds ? 'up' : winOdds > openOdds ? 'down' : 'same';
              // Place odds: use stored value or calculate standard dividend
              const placeOdds = s.place_odds ? parseFloat(s.place_odds) : (winOdds > 1 ? parseFloat(((winOdds - 1) * 0.25 + 1).toFixed(2)) : null);

              // Last price from history
              const lastPrice = s.price_history?.length
                ? s.price_history[s.price_history.length-2]?.old_price ?? openOdds
                : openOdds;

              return `<tr class="runner-row ${isScratched?'scratched':''}">
                <td class="rt-num">
                  <div class="runner-num">${s.barrier_number||'—'}</div>
                </td>
                <td class="rt-silk">
                  <div class="silk-icon" style="background:${Pages._silkColor(s.barrier_number||1)}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><ellipse cx="12" cy="8" rx="5" ry="6"/><path d="M7 14c0 4 2 7 5 7s5-3 5-7"/></svg>
                  </div>
                </td>
                <td class="rt-horse">
                  <div class="runner-name">${U.escHTML(s.name)}${s.status==='scratched'?' <span class="pill pill-red" style="font-size:9px">SCR</span>':''}</div>
                  <div class="runner-detail">${[s.jockey,s.trainer].filter(Boolean).join(' / ')}</div>
                  ${isBookmaker && !isScratched ? `
                  <div class="runner-actions">
                    <button class="btn btn-xs btn-ghost" onclick="Pages.showEditRunnerModal('${s.id}','${U.escHTML(s.name)}',${JSON.stringify(s).replace(/"/g,'&quot;')})">✏️</button>
                    <button class="btn btn-xs btn-danger" onclick="Pages.showScratchModal('${s.id}','${U.escHTML(s.name)}')">Scratch</button>
                  </div>` : ''}
                </td>
                <td class="rt-wt">
                  <div>${s.weight||'—'}</div>
                  <div class="rt-sub">${s.age?s.age+'yo':''} ${s.colour||''}</div>
                </td>
                <td class="rt-prev">
                  <div class="rt-opening">${U.fmt.odds(openOdds)}</div>
                  <div class="rt-last">${U.fmt.odds(lastPrice)}</div>
                </td>
                <td class="rt-win">
                  ${!isScratched ? `
                  <button class="odds-pill ${winSelected?'selected':''} ${winMove}"
                    onclick="Pages.addToSlip('${s.id}','${U.escHTML(s.name)}','${eventId}','${U.escHTML(ev.event_name)}','${ev.sport_icon||'🏇'}',${winOdds},'win')">
                    <span class="odds-arrow">${winMove==='up'?'▲':winMove==='down'?'▼':'—'}</span>
                    <span class="odds-val">${U.fmt.odds(winOdds)}</span>
                  </button>` : '<span class="text-muted">—</span>'}
                </td>
                <td class="rt-place">
                  ${!isScratched && placeOdds ? `
                  <button class="odds-pill place ${placeSelected?'selected':''}"
                    onclick="Pages.addToSlip('${s.id}','${U.escHTML(s.name)}','${eventId}','${U.escHTML(ev.event_name)}','${ev.sport_icon||'🏇'}',${placeOdds},'place')">
                    <span class="odds-val">${U.fmt.odds(placeOdds)}</span>
                  </button>` : `<span class="text-muted" style="font-size:13px">${isScratched?'SCR':'—'}</span>`}
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch(err) {
      if (container) container.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    }
  },

  addToSlip(selId, name, evId, evName, sportIcon, odds, betOn) {
    BetSlip.add({ selection_id:selId, name, event_id:evId, event_name:evName, sport_icon:sportIcon, odds, bet_on:betOn });
    // Refresh runners to update selected state
    Pages.loadRunners(evId);
  },

  // Generate a silk color from barrier number
  _silkColor(num) {
    const colors = [
      '#E63946','#457B9D','#2D6A4F','#FCA311','#7B2D8B',
      '#E76F51','#2A9D8F','#264653','#A8DADC','#F4A261',
      '#6A0572','#1A535C',
    ];
    return colors[(num-1) % colors.length];
  },

  showAddRunnerModal(evId, evName) { Pages.showAddSelectionModal(evId, evName); },

  showEditRunnerModal(id, name, s) {
    U.modal.show(`✏️ Edit Runner — ${name}`, `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Barrier No.</label><input type="number" id="er-num" value="${s.barrier_number||''}"/></div>
        <div class="form-group"><label>Horse Name</label><input type="text" id="er-name" value="${U.escHTML(s.name)}"/></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="er-jockey" value="${U.escHTML(s.jockey||'')}"/></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="er-trainer" value="${U.escHTML(s.trainer||'')}"/></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="er-weight" value="${U.escHTML(s.weight||'')}"/></div>
        <div class="form-group"><label>Age</label><input type="number" id="er-age" value="${s.age||''}"/></div>
        <div class="form-group"><label>Colour</label><input type="text" id="er-colour" value="${U.escHTML(s.colour||'')}"/></div>
      </div>
      <div class="form-group"><label>Form</label><input type="text" id="er-form" value="${U.escHTML(s.form||'')}"/></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Win Odds</label><input type="number" id="er-win" step="0.05" value="${s.win_odds}"/></div>
        <div class="form-group"><label>Place Odds</label><input type="number" id="er-place" step="0.05" value="${s.place_odds||''}"/></div>
      </div>
      <div id="er-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveEditRunner('${id}','${s.event_id}')">Save</button>
      </div>
    `);
  },

  async saveEditRunner(id, evId) {
    U.clearError('er-error');
    try {
      await API.updateSelection(id, {
        barrier_number: parseInt(U.el('er-num').value)||null,
        name:    U.el('er-name').value.trim(),
        jockey:  U.el('er-jockey').value||null,
        trainer: U.el('er-trainer').value||null,
        weight:  U.el('er-weight').value||null,
        age:     parseInt(U.el('er-age').value)||null,
        colour:  U.el('er-colour').value||null,
        form:    U.el('er-form').value||null,
        win_odds:   parseFloat(U.el('er-win').value),
        place_odds: parseFloat(U.el('er-place').value)||null,
      });
      U.modal.close(); U.toast('Runner updated');
      Pages.loadRunners(evId);
    } catch(err) { U.setError('er-error', err.message); }
  },

  showEditRaceModal(id, ev) {
    const isSA = App._isSuperAdmin;
    let closesVal = '';
    if (ev.closes_at) { try { closesVal = new Date(ev.closes_at).toISOString().slice(0,16); } catch(e){} }
    U.modal.show(`✏️ Edit Race ${ev.race_number||''}`, `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Race Number</label><input type="number" id="erc-num" value="${ev.race_number||1}" min="1"/></div>
        <div class="form-group"><label>Status</label>
          <select id="erc-status">${['open','closed','settled'].map(s=>`<option value="${s}" ${ev.status===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
      </div>
      <div class="form-group"><label>Race Name</label><input type="text" id="erc-name" value="${U.escHTML(ev.event_name)}"/></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Distance</label><input type="text" id="erc-dist" value="${U.escHTML(ev.distance||'')}" placeholder="1600m"/></div>
        <div class="form-group"><label>Prize Money</label><input type="text" id="erc-prize" value="${U.escHTML(ev.prize_money||'')}"/></div>
      </div>
      ${isSA ? `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Date</label><input type="date" id="erc-date" value="${ev.event_date||''}"/></div>
        <div class="form-group"><label>Time</label><input type="time" id="erc-time" value="${ev.event_time||''}"/></div>
      </div>
      <div class="form-group"><label>Betting Closes At</label><input type="datetime-local" id="erc-closes" value="${closesVal}"/></div>
      ` : '<div class="alert alert-info">Date/time editing: Super Admin only</div>'}
      <div id="erc-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.saveEditRace('${id}')">Save Race</button>
      </div>
    `);
  },

  async saveEditRace(id) {
    const isSA = App._isSuperAdmin;
    const data = {
      event_name:  U.el('erc-name')?.value?.trim(),
      race_number: parseInt(U.el('erc-num')?.value)||undefined,
      distance:    U.el('erc-dist')?.value?.trim()||undefined,
      prize_money: U.el('erc-prize')?.value?.trim()||undefined,
      status:      U.el('erc-status')?.value||undefined,
    };
    if (isSA) {
      data.event_date = U.el('erc-date')?.value||undefined;
      data.event_time = U.el('erc-time')?.value||undefined;
      const cr = U.el('erc-closes')?.value;
      if (cr) data.closes_at = new Date(cr).toISOString();
    }
    Object.keys(data).forEach(k => data[k]===undefined && delete data[k]);
    try {
      await API.updateEvent(id, data);
      U.modal.close(); U.toast('Race updated');
      Pages.renderRacesScreen(Pages._currentRaceParams||{});
    } catch(err) { U.setError('erc-error', err.message); }
  },

  showAddRaceModal(meetingKey, course, date, sportId) {
    U.modal.show('+ Add Race to Meeting', `
      <div class="alert alert-info" style="margin-bottom:10px">
        A new race will be added after the last race in this meeting, 30 minutes later.
      </div>
      <div class="form-group"><label>Race Name (optional)</label>
        <input type="text" id="nar-name" placeholder="e.g. Sprint Handicap"/>
      </div>
      <div id="nar-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.doAddRace('${meetingKey}','${sportId}','${date}')">Add Race</button>
      </div>
    `);
  },

  async doAddRace(meetingKey, sportId, date) {
    try {
      const r = await API.addRaceToMeeting({ meeting_key: meetingKey, sport_id: sportId, event_date: date });
      // Rename if custom name given
      const name = U.el('nar-name')?.value?.trim();
      if (name && r.id) await API.updateEvent(r.id, { event_name: name });
      U.modal.close();
      U.toast(`Race ${r.race_number} added at ${r.event_time}`, 'success');
      Pages.renderRacesScreen(Pages._currentRaceParams||{});
    } catch(err) { U.setError('nar-error', err.message); }
  },


  async renderBetHistory() {
    const page = document.getElementById('page-bets');
    U.loading(page);
    try {
      const slips = await API.getBetslips();
      page.innerHTML = `
        <div class="page-header"><div style="display:flex;align-items:center;gap:8px"><button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button><div class="page-header-title">Bet History</div></div><div class="text-muted text-small">${slips.length} slips</div></div>
        ${slips.length===0 ? '<div class="empty-state"><div class="empty-icon">🎟️</div><p>No bets yet</p></div>' :
          slips.map(slip => {
            const isPending = slip.status==='pending';
            const isCO = slip.status==='cashed_out';
            return `<div class="card" style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
                <div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px">
                    ${U.statusPill(slip.slip_type)}${U.statusPill(slip.status)}
                    <span class="pill ${slip.payment_type==='credit'?'pill-purple':'pill-green'}" style="font-size:10px">${slip.payment_type==='credit'?'💳 Credit':'💵 Cash'}</span>
                    <strong style="font-size:13px">${U.escHTML(slip.wallet_name)}</strong>
                  </div>
                  <div class="text-muted text-small">${U.fmt.datetime(slip.created_at)}</div>
                </div>
                <div style="text-align:right">
                  <div style="font-size:11px;color:var(--text-muted)">Stake / Potential / Return</div>
                  <div class="mono" style="font-size:13px">
                    ${U.fmt.money(slip.total_stake)} <span style="color:var(--text-muted)">/</span>
                    <span style="color:var(--gold-bright)">${U.fmt.money(slip.potential_return)}</span>
                    <span style="color:var(--text-muted)">/</span>
                    <span class="${(slip.actual_return>0||slip.cashout_value>0)?'money-pos':'text-muted'}">
                      ${slip.actual_return>0?U.fmt.money(slip.actual_return):isCO?U.fmt.money(slip.cashout_value)+' (CO)':'—'}
                    </span>
                  </div>
                  ${isPending?`<button class="btn btn-xs btn-warning" style="margin-top:6px" onclick="Pages.showCashoutModal('${slip.id}')">💸 Cash Out</button>`:''}
                </div>
              </div>
              <hr class="divider" style="margin:8px 0">
              ${slip.legs.map(l=>`
                <div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg-raised);border-radius:6px;margin-bottom:4px;flex-wrap:wrap">
                  <span>${l.sport_icon}</span>
                  ${U.statusPill(l.result)}
                  <span class="pill ${(l.bet_on||l.bet_type||'win')==='place'?'pill-blue':'pill-gold'}" style="font-size:9px;padding:1px 6px">${(l.bet_on||l.bet_type||"win").toUpperCase()}</span>
                  <div style="flex:1"><strong>${U.escHTML(l.selection_name)}</strong> <span class="text-muted text-small">— ${U.escHTML(l.event_name)}</span></div>
                  <div class="mono" style="color:var(--gold-bright)">${U.fmt.odds(l.odds_at_time)}</div>
                </div>
              `).join('')}
            </div>`;
          }).join('')}
      `;
    } catch(err) { page.innerHTML = `<div class="alert alert-error">${err.message}</div>`; }
  },

  async showCashoutModal(slipId) {
    U.modal.show('💸 Cash Out', '<div class="loading"><div class="spinner"></div></div>');
    try {
      const d = await API.getCashoutValue(slipId);
      if (!d.available) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-warning">${d.reason}</div>`; return; }
      document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="stat-card gold" style="padding:12px"><div class="stat-label">Stake</div><div class="stat-value" style="font-size:18px">${U.fmt.money(d.original_stake)}</div></div>
          <div class="stat-card green" style="padding:12px"><div class="stat-label">Cash Out Value</div><div class="stat-value" style="font-size:18px">${U.fmt.money(d.cashout_value)}</div></div>
        </div>
        <div class="alert alert-info">Potential if you keep the bet: <strong>${U.fmt.money(d.potential_return)}</strong></div>
        <div class="modal-actions" style="margin-top:12px">
          <button class="btn btn-ghost" onclick="U.modal.close()">Keep Bet</button>
          <button class="btn btn-warning" onclick="Pages.confirmCashout('${slipId}')">Accept ${U.fmt.money(d.cashout_value)}</button>
        </div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async confirmCashout(slipId) {
    try {
      const res = await API.cashoutBet(slipId);
      U.modal.close(); U.toast(`💸 Cashed out: ${U.fmt.money(res.cashout_value)}`,'success',4000);
      await WalletSelector.load();
      this.renderBetHistory();
    } catch(err) { U.toast(err.message,'error'); }
  },

  // ── WALLETS ──────────────────────────────────────────────────────
  async renderWallets() {
    const page = document.getElementById('page-wallets');
    U.loading(page);
    try {
      const wallets = await API.getWallets();
      page.innerHTML = `
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:8px">
            <button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button>
            <div class="page-header-title">Customer Wallets</div>
          </div>
          <button class="btn btn-primary" onclick="Pages.showCreateWalletModal()">+ New Customer</button>
        </div>
        <div class="wallets-grid">
          ${wallets.map(w => `
            <div class="customer-wallet-card">
              <div class="cwc-header">
                <div class="cwc-avatar">${(w.name||"?")[0].toUpperCase()}</div>
                <div class="cwc-identity">
                  <div class="cwc-name">${U.escHTML(w.name)}</div>
                  ${w.phone?`<div class="cwc-phone">📞 ${U.escHTML(w.phone)}</div>`:''}
                </div>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-xs btn-ghost" onclick="Pages.showEditWalletModal('${w.id}')">✏️</button>
                </div>
              </div>
              <div class="cwc-balances">
                <div class="cwc-balance-col cwc-cash">
                  <div class="cwc-bal-label">💵 Cash</div>
                  <div class="cwc-bal-amount">${U.fmt.money(w.cash_balance||0)}</div>
                  <div class="cwc-bal-stats">
                    <span>${w.total_bets||0} bets</span>
                    <span class="${(w.total_won||0)-(w.total_staked||0)>=0?'money-pos':'money-neg'}">${U.fmt.money((w.total_won||0)-(w.total_staked||0))} P&L</span>
                  </div>
                  <div class="cwc-bal-actions">
                    <button class="btn btn-xs btn-success" onclick="Pages.showFundsModal('${w.id}','${U.escHTML(w.name)}','deposit')">+ Deposit</button>
                    <button class="btn btn-xs btn-warning" onclick="Pages.showFundsModal('${w.id}','${U.escHTML(w.name)}','withdraw')">- Withdraw</button>
                  </div>
                </div>
                <div class="cwc-divider"></div>
                <div class="cwc-balance-col cwc-credit">
                  <div class="cwc-bal-label">💳 Credit</div>
                  <div class="cwc-bal-amount" style="color:var(--purple)">${U.fmt.money(Math.max(0,(w.credit_limit||0)-(w.credit_used||0)))}</div>
                  <div class="cwc-bal-stats">
                    <span>Limit: ${U.fmt.money(w.credit_limit||0)}</span>
                    <span>Used: ${U.fmt.money(w.credit_used||0)}</span>
                  </div>
                  <div class="cwc-bal-actions">
                    <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCreditModal('${w.id}','${U.escHTML(w.name)}',${w.credit_limit||0})">Edit Limit</button>
                  </div>
                </div>
              </div>
              <div class="cwc-footer">
                <button class="btn btn-xs btn-info" onclick="Pages.showWalletTxns('${w.id}','${U.escHTML(w.name)}')">Transactions</button>
                <button class="btn btn-xs btn-ghost" onclick="Pages.showWalletBets('${w.id}','${U.escHTML(w.name)}')">Bet History</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showCreateWalletModal() {
    U.modal.show('New Customer Wallet', `
      <div class="form-group"><label>Customer Name *</label><input type="text" id="wn-name" placeholder="e.g. John Smith" /></div>
      <div class="form-group"><label>Phone</label><input type="text" id="wn-phone" placeholder="e.g. 082-111-2222" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Opening Cash Balance (R)</label><input type="number" id="wn-cash" value="0" min="0" step="100" /></div>
        <div class="form-group"><label>Credit Limit (R)</label><input type="number" id="wn-credit" value="0" min="0" step="100" />
          <span class="text-muted text-small">Set 0 for no credit</span>
        </div>
      </div>
      <div id="wn-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createWallet()">Create</button>
      </div>
    `);
  },

  async createWallet() {
    U.clearError('wn-error');
    const name         = document.getElementById('wn-name')?.value.trim();
    const phone        = document.getElementById('wn-phone')?.value.trim()||null;
    const cash_balance = parseFloat(document.getElementById('wn-cash')?.value)||0;
    const credit_limit = parseFloat(document.getElementById('wn-credit')?.value)||0;
    if (!name) { U.setError('wn-error','Name required'); return; }
    try {
      await API.createWallet({name, phone, cash_balance, credit_limit});
      U.modal.close(); U.toast(`${name} created`);
      await WalletSelector.load();
      this.renderWallets();
    } catch(err) { U.setError('wn-error', err.message); }
  },

  async showEditWalletModal(id) {
    const w = await API.getWallet(id);
    U.modal.show(`Edit — ${w.name}`, `
      <div class="form-group"><label>Name</label><input type="text" id="ew-name" value="${U.escHTML(w.name)}" /></div>
      <div class="form-group"><label>Phone</label><input type="text" id="ew-phone" value="${U.escHTML(w.phone||'')}" /></div>
      <div id="ew-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateWallet('${id}')">Save</button>
      </div>
    `);
  },

  async updateWallet(id) {
    const name = document.getElementById('ew-name')?.value.trim();
    const phone = document.getElementById('ew-phone')?.value.trim()||null;
    try {
      await API.updateWallet(id, {name, phone});
      U.modal.close(); U.toast('Updated');
      await WalletSelector.load(); this.renderWallets();
    } catch(err) { U.setError('ew-error', err.message); }
  },

  showEditCreditModal(id, name, currentLimit) {
    U.modal.show(`Credit Limit — ${name}`, `
      <div class="form-group"><label>Credit Limit (R)</label>
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
    const limit = parseFloat(document.getElementById('ecl-limit')?.value);
    if (isNaN(limit)||limit<0) { U.setError('ecl-error','Enter valid amount'); return; }
    try {
      await API.updateWallet(id, {credit_limit: limit});
      U.modal.close(); U.toast('Credit limit updated');
      await WalletSelector.load(); this.renderWallets();
    } catch(err) { U.setError('ecl-error', err.message); }
  },

  showFundsModal(id, name, type) {
    U.modal.show(`${type==='deposit'?'Deposit':'Withdraw'} — ${name}`, `
      <div class="form-group"><label>Amount (R)</label><input type="number" id="fn-amount" min="1" step="50" placeholder="Enter amount" /></div>
      <div id="fn-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn ${type==='deposit'?'btn-success':'btn-warning'}" onclick="Pages.doFunds('${id}','${type}')">Confirm</button>
      </div>
    `);
  },

  async doFunds(id, type) {
    const amount = parseFloat(document.getElementById('fn-amount')?.value);
    if (!amount||amount<=0) { U.setError('fn-error','Enter valid amount'); return; }
    try {
      if (type==='deposit') await API.depositWallet(id,{amount});
      else await API.withdrawWallet(id,{amount});
      U.modal.close(); U.toast(`${type==='deposit'?'Deposited':'Withdrawn'}: ${U.fmt.money(amount)}`);
      await WalletSelector.load(); this.renderWallets();
    } catch(err) { U.setError('fn-error', err.message); }
  },

  async showWalletTxns(id, name) {
    U.modal.show(`Transactions — ${name}`, '<div class="loading"><div class="spinner"></div></div>', true);
    try {
      const txns = await API.getWalletTxns(id);
      document.getElementById('modal-body').innerHTML = `
        <div class="table-wrap"><table>
          <thead><tr><th>Time</th><th>Type</th><th>Payment</th><th style="text-align:right">Amount</th><th style="text-align:right">Balance After</th><th>Description</th></tr></thead>
          <tbody>${txns.map(t=>`<tr>
            <td class="text-muted text-small">${U.fmt.datetime(t.created_at)}</td>
            <td>${U.statusPill(t.type)}</td>
            <td><span class="pill ${t.payment_type==='credit'?'pill-purple':'pill-green'}" style="font-size:9px">${t.payment_type||'cash'}</span></td>
            <td class="mono ${t.type==='deposit'||t.type==='winnings'||t.type==='cashout'?'money-pos':'money-neg'}" style="text-align:right">${U.fmt.money(t.amount)}</td>
            <td class="mono" style="text-align:right">${U.fmt.money(t.balance_after)}</td>
            <td class="text-muted text-small">${t.description||''}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async showWalletBets(id, name) {
    U.modal.show(`Bet History — ${name}`, '<div class="loading"><div class="spinner"></div></div>', true);
    try {
      const bets = await API.getWalletBets(id);
      document.getElementById('modal-body').innerHTML = bets.length===0 ? '<div class="empty-state"><p>No bets</p></div>' : `
        <div class="table-wrap"><table>
          <thead><tr><th>Event</th><th>Selection</th><th>Type</th><th>Stake</th><th>Odds</th><th>Return</th><th>Status</th></tr></thead>
          <tbody>${bets.map(b=>`<tr>
            <td><span>${b.sport_icon}</span> ${U.escHTML(b.event_name)}</td>
            <td>${U.escHTML(b.selection_name)}</td>
            <td><span class="pill ${b.bet_on==='place'?'pill-blue':'pill-gold'}" style="font-size:9px">${(b.bet_on||'win').toUpperCase()}</span></td>
            <td class="mono">${U.fmt.money(b.stake)}</td>
            <td class="mono">${U.fmt.odds(b.odds_at_time)}</td>
            <td class="mono ${b.actual_return>0?'money-pos':''}">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
            <td>${U.statusPill(b.status)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  // ── OPERATORS ────────────────────────────────────────────────────
  async renderOperators() {
    const page = document.getElementById('page-operators');
    U.loading(page);
    try {
      const ops = await API.getOperators();
      page.innerHTML = `
        <div class="page-header">
          <div class="page-header-title">Operators</div>
          <button class="btn btn-primary" onclick="Pages.showCreateOperatorModal()">+ New Operator</button>
        </div>
        <div class="card">
          <div class="table-wrap"><table>
            <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>${ops.map(op=>`<tr>
              <td><strong>${U.escHTML(op.username)}</strong></td>
              <td class="text-muted">${U.escHTML(op.email)}</td>
              <td>${U.statusPill(op.role)}</td>
              <td>${U.statusPill(op.is_active?'active':'inactive')}</td>
              <td><button class="btn btn-xs btn-ghost" onclick="Pages.showEditOperatorModal('${op.id}','${U.escHTML(op.username)}','${op.role}',${op.is_active})">Edit</button></td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showCreateOperatorModal() {
    U.modal.show('New Operator', `
      <div class="form-group"><label>Username</label><input type="text" id="op-user" /></div>
      <div class="form-group"><label>Email</label><input type="email" id="op-email" /></div>
      <div class="form-group"><label>Password</label><input type="password" id="op-pass" /></div>
      <div class="form-group"><label>Role</label>
        <select id="op-role">
          <option value="bookmaker">Bookmaker</option>
          <option value="clerk">Clerk</option>
          <option value="super_admin">Super Admin</option>
        </select>
      </div>
      <div id="op-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createOperator()">Create</button>
      </div>
    `);
  },

  async createOperator() {
    const d = {username:document.getElementById('op-user').value.trim(), email:document.getElementById('op-email').value.trim(), password:document.getElementById('op-pass').value, role:document.getElementById('op-role').value};
    if (!d.username||!d.email||!d.password) { U.setError('op-error','All fields required'); return; }
    try { await API.createOperator(d); U.modal.close(); U.toast('Operator created'); this.renderOperators(); }
    catch(err) { U.setError('op-error', err.message); }
  },

  showEditOperatorModal(id, username, role, isActive) {
    U.modal.show(`Edit — ${username}`, `
      <div class="form-group"><label>Role</label>
        <select id="eop-role">
          <option value="bookmaker" ${role==='bookmaker'?'selected':''}>Bookmaker</option>
          <option value="clerk" ${role==='clerk'?'selected':''}>Clerk</option>
          <option value="super_admin" ${role==='super_admin'?'selected':''}>Super Admin</option>
        </select>
      </div>
      <div class="form-group"><label>Status</label>
        <select id="eop-active">
          <option value="1" ${isActive?'selected':''}>Active</option>
          <option value="0" ${!isActive?'selected':''}>Inactive</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateOperator('${id}')">Save</button>
      </div>
    `);
  },

  async updateOperator(id) {
    try {
      await API.updateOperator(id, {role:document.getElementById('eop-role').value, is_active:document.getElementById('eop-active').value==='1'});
      U.modal.close(); U.toast('Updated'); this.renderOperators();
    } catch(err) { U.toast(err.message,'error'); }
  },

  // ── COUNTRIES ────────────────────────────────────────────────────
  async renderCountries() {
    const page = document.getElementById('page-countries');
    U.loading(page);
    try {
      const [countries, courses] = await Promise.all([API.getCountries(), API.getAllCourses()]);
      page.innerHTML = `
        <div class="page-header">
          <div style="display:flex;align-items:center;gap:8px"><button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button><div class="page-header-title">Countries & Courses</div></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-ghost" onclick="Pages.showCreateCountryModal()">+ Country</button>
            <button class="btn btn-primary" onclick="Pages.showCreateCourseModal()">+ Course</button>
          </div>
        </div>
        <div class="countries-grid">
          ${countries.map(c => {
            const cCourses = courses.filter(co => co.country_id===c.id);
            return `
            <div class="country-card">
              <div class="country-card-header">
                <span class="country-flag">${c.flag}</span>
                <div class="country-info"><div class="country-name">${U.escHTML(c.name)}</div><div class="country-code">${c.code}</div></div>
                <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCountryModal('${c.id}','${U.escHTML(c.name)}','${c.code}','${c.flag}')">✏️</button>
              </div>
              <div class="country-courses">
                ${cCourses.map(co=>`
                  <div class="course-item">
                    <div><div class="course-item-name">${U.escHTML(co.name)}</div><div class="course-item-meta">${co.location||''} · ${co.surface||'Turf'}</div></div>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-xs btn-ghost" onclick="Pages.showEditCourseModal('${co.id}','${U.escHTML(co.name)}','${U.escHTML(co.location||'')}','${U.escHTML(co.surface||'')}')">✏️</button>
                      <button class="btn btn-xs btn-danger" onclick="Pages.deleteCourse('${co.id}')">✕</button>
                    </div>
                  </div>
                `).join('')}
                <button class="course-add-btn" onclick="Pages.showCreateCourseModal('${c.id}')">+ Add Course</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      `;
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  showCreateCountryModal() {
    U.modal.show('Add Country', `
      <div class="form-row form-row-3">
        <div class="form-group"><label>Name</label><input type="text" id="nc-name" placeholder="South Africa" /></div>
        <div class="form-group"><label>Code</label><input type="text" id="nc-code" maxlength="3" placeholder="ZA" /></div>
        <div class="form-group"><label>Flag Emoji</label><input type="text" id="nc-flag" placeholder="🇿🇦" /></div>
      </div>
      <div id="nc-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createCountry()">Add</button>
      </div>
    `);
  },

  async createCountry() {
    const name=document.getElementById('nc-name').value.trim(), code=document.getElementById('nc-code').value.trim(), flag=document.getElementById('nc-flag').value.trim();
    if (!name||!code||!flag) { U.setError('nc-error','All fields required'); return; }
    try { await API.createCountry({name,code,flag}); U.modal.close(); U.toast('Country added'); this.renderCountries(); }
    catch(err) { U.setError('nc-error',err.message); }
  },

  showEditCountryModal(id, name, code, flag) {
    U.modal.show('Edit Country', `
      <div class="form-row form-row-3">
        <div class="form-group"><label>Name</label><input type="text" id="ec-name" value="${name}" /></div>
        <div class="form-group"><label>Code</label><input type="text" id="ec-code" value="${code}" /></div>
        <div class="form-group"><label>Flag</label><input type="text" id="ec-flag" value="${flag}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCountry('${id}')">Save</button>
      </div>
    `);
  },
  async updateCountry(id) {
    try { await API.updateCountry(id,{name:document.getElementById('ec-name').value,code:document.getElementById('ec-code').value,flag:document.getElementById('ec-flag').value}); U.modal.close(); U.toast('Updated'); this.renderCountries(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  async showCreateCourseModal(countryId) {
    const countries = await API.getCountries();
    U.modal.show('Add Racecourse', `
      <div class="form-group"><label>Country</label>
        <select id="nco-country">
          ${countries.map(c=>`<option value="${c.id}" ${c.id===countryId?'selected':''}>${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Course Name</label><input type="text" id="nco-name" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="nco-loc" /></div>
        <div class="form-group"><label>Surface</label>
          <select id="nco-surf"><option>Turf</option><option>Dirt</option><option>Synthetic</option><option>Dirt/Turf</option></select>
        </div>
      </div>
      <div id="nco-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.createCourse()">Add Course</button>
      </div>
    `);
  },

  async createCourse() {
    const country_id=document.getElementById('nco-country').value, name=document.getElementById('nco-name').value.trim(), location=document.getElementById('nco-loc').value.trim(), surface=document.getElementById('nco-surf').value;
    if (!country_id||!name) { U.setError('nco-error','Country and name required'); return; }
    try { await API.createCourse({country_id,name,location,surface}); U.modal.close(); U.toast('Course added'); this.renderCountries(); }
    catch(err) { U.setError('nco-error',err.message); }
  },

  showEditCourseModal(id, name, location, surface) {
    U.modal.show('Edit Course', `
      <div class="form-group"><label>Name</label><input type="text" id="eco-name" value="${name}" /></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Location</label><input type="text" id="eco-loc" value="${location}" /></div>
        <div class="form-group"><label>Surface</label><input type="text" id="eco-surf" value="${surface}" /></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages.updateCourse('${id}')">Save</button>
      </div>
    `);
  },
  async updateCourse(id) {
    try { await API.updateCourse(id,{name:document.getElementById('eco-name').value,location:document.getElementById('eco-loc').value,surface:document.getElementById('eco-surf').value}); U.modal.close(); U.toast('Updated'); this.renderCountries(); }
    catch(err) { U.toast(err.message,'error'); }
  },
  async deleteCourse(id) {
    if (!U.confirm('Delete this course?')) return;
    try { await API.deleteCourse(id); U.toast('Deleted'); this.renderCountries(); }
    catch(err) { U.toast(err.message,'error'); }
  },

  // ── REPORTS ──────────────────────────────────────────────────────
  async renderReports() {
    const page = document.getElementById('page-reports');
    U.loading(page);
    try {
      const sports = await API.getSports();
      page.innerHTML = `
        <div class="page-header"><div style="display:flex;align-items:center;gap:8px"><button class="btn btn-ghost btn-sm back-btn" onclick="App.goBack()">← Back</button><div class="page-header-title">Reports</div></div></div>
        <div class="card" style="margin-bottom:16px">
          <div class="card-title" style="margin-bottom:10px">🔍 Filters</div>
          <div class="form-row form-row-3" style="align-items:flex-end">
            <div class="form-group"><label>Sport</label>
              <select id="rpt-sport">
                <option value="">All Sports</option>
                ${sports.map(s=>`<option value="${s.id}">${s.icon} ${s.name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>From</label><input type="date" id="rpt-from" /></div>
            <div class="form-group"><label>To</label><input type="date" id="rpt-to" /></div>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-primary" onclick="Pages.loadReportData()">Apply</button>
            <button class="btn btn-ghost" onclick="Pages.clearReportFilters()">Clear</button>
          </div>
        </div>
        <div class="tabs" id="report-tabs">
          <div class="tab active" onclick="Pages.switchReportTab('summary')">Summary</div>
          <div class="tab" onclick="Pages.switchReportTab('event')">Per Race</div>
          <div class="tab" onclick="Pages.switchReportTab('meeting')">Per Meeting</div>
          <div class="tab" onclick="Pages.switchReportTab('wallet')">Per Customer</div>
        </div>
        <div id="report-content"></div>
      `;
      const today = new Date().toISOString().split('T')[0];
      const past  = new Date(); past.setDate(past.getDate()-30);
      document.getElementById('rpt-to').value   = today;
      document.getElementById('rpt-from').value = past.toISOString().split('T')[0];
      this._reportTab = 'summary';
      await this.loadReportData();
    } catch(err) { page.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  clearReportFilters() { document.getElementById('rpt-sport').value=''; document.getElementById('rpt-from').value=''; document.getElementById('rpt-to').value=''; this.loadReportData(); },

  switchReportTab(tab) {
    document.querySelectorAll('#report-tabs .tab').forEach((el,i) => el.classList.toggle('active',['summary','event','meeting','wallet'][i]===tab));
    this._reportTab = tab; this.loadReportData();
  },

  async loadReportData() {
    const c=document.getElementById('report-content'), tab=this._reportTab||'summary';
    const params={};
    const sport=document.getElementById('rpt-sport')?.value; if(sport) params.sport_id=sport;
    const dfrom=document.getElementById('rpt-from')?.value; if(dfrom) params.date_from=dfrom;
    const dto=document.getElementById('rpt-to')?.value;     if(dto)   params.date_to=dto;
    U.loading(c);
    try {
      if (tab==='summary')  await this.renderReportSummary(c,params);
      if (tab==='event')    await this.renderReportByEvent(c,params);
      if (tab==='meeting')  await this.renderReportByMeeting(c,params);
      if (tab==='wallet')   await this.renderReportByWallet(c,params);
    } catch(err) { c.innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  async renderReportSummary(c, params) {
    const s = await API.reportSummary(params);
    c.innerHTML = `
      <div class="stats-grid" style="margin-bottom:16px">
        <div class="stat-card gold"><div class="stat-icon">💰</div><div class="stat-label">Total Turnover</div><div class="stat-value money">${U.fmt.money(s.total_staked)}</div></div>
        <div class="stat-card red"><div class="stat-icon">💸</div><div class="stat-label">Total Paid Out</div><div class="stat-value money">${U.fmt.money(s.total_paid)}</div></div>
        <div class="stat-card ${s.house_profit>=0?'green':'red'}"><div class="stat-icon">${s.house_profit>=0?'📈':'📉'}</div><div class="stat-label">House Profit</div><div class="stat-value money">${U.fmt.money(s.house_profit)}</div></div>
        <div class="stat-card blue"><div class="stat-icon">%</div><div class="stat-label">Margin</div><div class="stat-value">${U.fmt.pct(s.margin_pct)}</div></div>
        <div class="stat-card yellow"><div class="stat-icon">⚡</div><div class="stat-label">Liability</div><div class="stat-value money">${U.fmt.money(s.total_liability)}</div></div>
        <div class="stat-card purple"><div class="stat-icon">🎟️</div><div class="stat-label">Total Bets</div><div class="stat-value">${s.total_bets}</div></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="card-title">📊 By Sport</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Sport</th><th>Bets</th><th style="text-align:right">Staked</th><th style="text-align:right">Paid</th><th style="text-align:right">Profit</th><th style="text-align:right">Liability</th></tr></thead>
          <tbody>${(s.by_sport||[]).map(sp=>`<tr>
            <td>${sp.icon} <strong>${sp.name}</strong></td>
            <td class="mono">${sp.bet_count}</td>
            <td class="mono" style="text-align:right">${U.fmt.money(sp.staked)}</td>
            <td class="mono" style="text-align:right">${U.fmt.money(sp.paid)}</td>
            <td style="text-align:right">${U.plBadge(sp.staked-sp.paid)}</td>
            <td class="mono" style="text-align:right;color:var(--yellow)">${U.fmt.money(sp.liability)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>
      ${(s.cash_per_meeting||[]).length ? `
      <div class="card">
        <div class="card-title">🏇 Cash Per Race Meeting</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Date</th><th>Course</th><th>Races</th><th>Bets</th><th style="text-align:right">Cash In</th><th style="text-align:right">Paid Out</th><th style="text-align:right">Profit</th></tr></thead>
          <tbody>${s.cash_per_meeting.map(m=>`<tr>
            <td class="mono">${U.fmt.shortDate(m.event_date)}</td>
            <td>${m.flag} <strong>${U.escHTML(m.course_name)}</strong></td>
            <td><span class="pill pill-blue">${m.race_count}</span></td>
            <td class="mono">${m.bet_count}</td>
            <td class="mono money-pos" style="text-align:right">${U.fmt.money(m.cash_taken)}</td>
            <td class="mono" style="text-align:right">${U.fmt.money(m.cash_paid)}</td>
            <td style="text-align:right">${U.plBadge(m.house_profit)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}
    `;
  },

  async renderReportByEvent(c, params) {
    const events = await API.reportByEvent(params);
    if (!events.length) { U.empty(c,'No events found'); return; }
    c.innerHTML = `<div class="card"><div class="card-title">🏁 Per Race</div><div class="table-wrap"><table>
      <thead><tr><th>Sport</th><th>Event</th><th>Date</th><th>Status</th><th style="text-align:right">Bets</th><th style="text-align:right">Staked</th><th style="text-align:right">Profit</th><th></th></tr></thead>
      <tbody>${events.map(ev=>`<tr>
        <td>${ev.sport_icon}</td>
        <td><strong>${U.escHTML(ev.event_name)}</strong><div class="text-muted text-small">${ev.flag} ${ev.country_name}</div></td>
        <td class="text-muted text-small">${U.fmt.shortDate(ev.event_date)}</td>
        <td>${U.statusPill(ev.status)}</td>
        <td class="mono" style="text-align:right">${ev.total_bets}</td>
        <td class="mono" style="text-align:right">${U.fmt.money(ev.total_staked)}</td>
        <td style="text-align:right">${U.plBadge(ev.house_profit)}</td>
        <td><button class="btn btn-xs btn-info" onclick="Pages.showEventBetsModal('${ev.id}','${U.escHTML(ev.event_name)}')">Detail</button></td>
      </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4"><strong>TOTAL (${events.length})</strong></td>
        <td class="mono" style="text-align:right"><strong>${events.reduce((s,e)=>s+e.total_bets,0)}</strong></td>
        <td class="mono" style="text-align:right"><strong>${U.fmt.money(events.reduce((s,e)=>s+e.total_staked,0))}</strong></td>
        <td style="text-align:right"><strong>${U.plBadge(events.reduce((s,e)=>s+e.house_profit,0))}</strong></td>
        <td></td>
      </tr></tfoot>
    </table></div></div>`;
  },

  async renderReportByMeeting(c, params) {
    const meetings = await API.reportByMeeting(params);
    if (!meetings.length) { U.empty(c,'No meetings found'); return; }
    c.innerHTML = `<div class="card"><div class="card-title">📅 Per Meeting</div><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Venue</th><th>Races</th><th style="text-align:right">Bets</th><th style="text-align:right">Cash In</th><th style="text-align:right">Paid Out</th><th style="text-align:right">Profit</th><th style="text-align:right">Margin</th></tr></thead>
      <tbody>${meetings.map(m=>`<tr>
        <td class="mono">${U.fmt.shortDate(m.event_date)}</td>
        <td><strong>${m.flag} ${U.escHTML(m.venue)}</strong><div class="text-muted text-small">${m.country_name}</div></td>
        <td><span class="pill pill-blue">${m.race_count}</span></td>
        <td class="mono" style="text-align:right">${m.total_bets}</td>
        <td class="mono money-pos" style="text-align:right">${U.fmt.money(m.total_staked)}</td>
        <td class="mono" style="text-align:right">${U.fmt.money(m.total_paid)}</td>
        <td style="text-align:right">${U.plBadge(m.house_profit)}</td>
        <td class="mono" style="text-align:right">${U.fmt.pct(m.margin_pct)}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  },

  async renderReportByWallet(c, params) {
    const wallets = await API.reportByWallet(params);
    if (!wallets.length) { U.empty(c,'No customer data'); return; }
    c.innerHTML = `<div class="card"><div class="card-title">👛 Per Customer</div><div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th style="text-align:right">Bets</th><th style="text-align:right">Staked</th><th style="text-align:right">Won</th><th style="text-align:right">Net P&L</th><th style="text-align:right">Win Rate</th><th></th></tr></thead>
      <tbody>${wallets.map(w=>`<tr>
        <td><strong>${U.escHTML(w.name)}</strong><div class="text-muted text-small">Cash: ${U.fmt.money(w.cash_balance||0)} | Credit Used: ${U.fmt.money(w.credit_used||0)}</div></td>
        <td class="mono" style="text-align:right">${w.total_bets}</td>
        <td class="mono" style="text-align:right">${U.fmt.money(w.total_staked)}</td>
        <td class="mono money-pos" style="text-align:right">${U.fmt.money(w.total_won)}</td>
        <td style="text-align:right">${U.plBadge(w.net_pl)}</td>
        <td class="mono" style="text-align:right">${w.win_rate}%</td>
        <td><button class="btn btn-xs btn-ghost" onclick="Pages.showWalletBets('${w.id}','${U.escHTML(w.name)}')">Bets</button></td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  },

  async showEventBetsModal(evId, evName) {
    U.modal.show(`📋 ${evName}`, '<div class="loading"><div class="spinner"></div></div>', true);
    try {
      const res = await API.reportEventBets(evId);
      const s = res.summary;
      document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">
          <div class="stat-card gold" style="padding:10px"><div class="stat-label">Staked</div><div class="stat-value" style="font-size:16px">${U.fmt.money(s.total_staked)}</div></div>
          <div class="stat-card red" style="padding:10px"><div class="stat-label">Paid</div><div class="stat-value" style="font-size:16px">${U.fmt.money(s.total_paid)}</div></div>
          <div class="stat-card ${s.house_profit>=0?'green':'red'}" style="padding:10px"><div class="stat-label">Profit</div><div class="stat-value" style="font-size:16px">${U.fmt.money(s.house_profit)}</div></div>
          <div class="stat-card yellow" style="padding:10px"><div class="stat-label">Liability</div><div class="stat-value" style="font-size:16px">${U.fmt.money(s.total_liability)}</div></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Selection</th><th>Bets</th><th>Staked</th><th>Paid</th><th>Status</th></tr></thead>
          <tbody>${res.by_selection.map(s=>`<tr>
            <td>${s.barrier_number?`No.${s.barrier_number} `:''}<strong>${U.escHTML(s.name)}</strong> ${s.is_winner?'🏆':''}</td>
            <td class="mono">${s.bet_count}</td>
            <td class="mono">${U.fmt.money(s.staked)}</td>
            <td class="mono money-pos">${U.fmt.money(s.paid)}</td>
            <td>${U.statusPill(s.sel_status)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },
  // ── Method aliases for app.js compatibility ─────────────────────
  renderSportsScreen() { return this.renderSportSelector(); },

  renderMeetingsScreen(p={}) {
    // Normalize param keys from drillTo format to renderMeetings format
    const mapped = {
      sportId:   p.sport_id   || p.sportId   || '',
      sportName: p.sport_name || p.sportName || '',
      sportIcon: p.sport_icon || p.sportIcon || '🏆',
    };
    return this.renderMeetings(mapped);
  },

  renderRacesScreen(p={}) {
    // Store for refreshes
    Pages._currentRaceParams = p;
    return this.renderRaces(p);
  },


};

function startCountdowns() {
  clearInterval(window._cdInterval);
  function tick() {
    document.querySelectorAll('[data-closes]').forEach(el => {
      const cd = U.countdown(el.dataset.closes);
      if (!cd) return;
      el.textContent = cd.label;
      el.className   = el.className.replace(/countdown-\w+/g,'') + ' ' + cd.cls;
    });
  }
  tick();
  window._cdInterval = setInterval(tick, 1000);
}

// ── PATCH: inject missing methods ────────────────────────────────
Object.assign(Pages, {

  // ── BET SLIP ──────────────────────────────────────────────────
  renderBetslipPage() {
    const page = document.getElementById('page-betslip');
    if (!page) return;
    const slip    = BetSlip;
    const wallet  = WalletSelector.current;
    const odds    = slip.getCombinedOdds();
    const ret     = slip.getPotentialReturn();
    const cashAvail   = wallet ? (wallet.cash_balance  || 0) : 0;
    const creditAvail = wallet ? Math.max(0, (wallet.credit_limit||0) - (wallet.credit_used||0)) : 0;
    const available   = slip.paymentType === 'credit' ? creditAvail : cashAvail;

    page.innerHTML = `
      <div class="betslip-layout">
        <div>
          <div class="card" style="margin-bottom:10px;padding:12px 16px">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);margin-bottom:8px">Select Customer Wallet</div>
            <div id="wallet-selector-bar"></div>
          </div>

          ${wallet ? `
          <div class="payment-toggle-bar">
            <span class="text-muted text-small" style="flex-shrink:0">Account type:</span>
            <button class="ptoggle ${slip.paymentType==='credit'?'active':''}"
              onclick="BetSlip.setPaymentType('credit')"
              ${creditAvail<=0?'disabled title="No credit available"':''}>
              💳 Account <span class="ptoggle-bal">${U.fmt.money(creditAvail)}</span>
            </button>
            <button class="ptoggle ${slip.paymentType==='cash'?'active':''}" onclick="BetSlip.setPaymentType('cash')">
              💵 Cash <span class="ptoggle-bal">${U.fmt.money(cashAvail)}</span>
            </button>
          </div>` : ''}

          <div class="card">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div class="card-title" style="margin:0">🎯 Selections</div>
              <button class="btn btn-xs btn-ghost" onclick="App.navigateTo('events')">Browse Events →</button>
            </div>
            ${slip.selections.length===0
              ? '<div class="empty-state" style="padding:16px"><div class="empty-icon">🏇</div><p>Go to Events → tap a race → tap WIN or PLACE</p></div>'
              : ''
            }
          </div>
        </div>

        <div class="betslip-panel">
          <div class="betslip-header">
            <h3>📋 Bet Slip</h3>
            ${slip.selections.length ? '<button class="btn btn-xs btn-danger" onclick="BetSlip.clear()">Clear All</button>' : ''}
          </div>

          <div class="betslip-tabs">
            <div class="betslip-tab ${slip.mode==='single'?'active':''}" onclick="BetSlip.setMode('single')">Single</div>
            <div class="betslip-tab ${slip.mode==='multi'?'active':''}" onclick="BetSlip.setMode('multi')">Multi</div>
          </div>

          <div class="betslip-selections">
            ${slip.selections.length === 0
              ? '<div class="betslip-empty">No selections yet</div>'
              : slip.selections.map(s => `
                <div class="betslip-selection">
                  <div class="sel-info">
                    <div class="sel-horse">${U.escHTML(s.name||'')}</div>
                    <div class="sel-race">${U.escHTML(s.event_name||'')}
                      <span class="pill ${(s.bet_on||'win')==='place'?'pill-blue':'pill-gold'}" style="font-size:9px;padding:1px 5px">
                        ${(s.bet_on||'win').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div class="sel-odds">${U.fmt.odds(s.odds||0)}</div>
                  <button class="sel-remove" onclick="BetSlip.remove('${s.selection_id}')">✕</button>
                </div>
              `).join('')
            }
          </div>

          <div class="betslip-footer">
            ${slip.mode==='multi' && slip.selections.length > 1 ? `
            <div class="betslip-calc-row">
              <span class="calc-label">Combined Odds</span>
              <span class="calc-value odds">${U.fmt.odds(odds)}</span>
            </div>` : ''}

            <div class="form-group">
              <label>Stake (R)</label>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px">
                ${[10,20,50,100,200,500].map(v=>`<button class="btn btn-xs btn-ghost" onclick="BetSlip.setStake(${v})">${v}</button>`).join('')}
              </div>
              <input type="number" id="stake-input" value="${slip.stakeValue||''}" min="1" step="1"
                placeholder="Enter amount (R)"
                oninput="BetSlip.stakeValue=parseFloat(this.value)||0; const el=document.getElementById('calc-return'); if(el) el.textContent=U.fmt.money(BetSlip.getPotentialReturn());"/>
            </div>

            <div class="betslip-calc-row">
              <span class="calc-label">Potential Return</span>
              <span class="calc-value return" id="calc-return">${U.fmt.money(ret)}</span>
            </div>

            ${wallet ? `
            <div style="font-size:11px;color:var(--text-muted);margin:4px 0 8px">
              ${slip.paymentType==='credit'?'💳 Account':'💵 Cash'} available:
              <strong style="color:${slip.paymentType==='credit'?'var(--purple)':'var(--green)'}">${U.fmt.money(available)}</strong>
            </div>` : '<div class="alert alert-warning" style="margin-bottom:8px;font-size:12px">⬆ Select a wallet above</div>'}

            <hr class="betslip-divider">
            <button class="btn btn-primary btn-full" onclick="BetSlip.submit()"
              ${!wallet || !slip.selections.length ? 'disabled' : ''}>
              Place ${slip.mode==='multi'?'Multi':'Single'} Bet
              ${slip.stakeValue > 0 ? ' · ' + U.fmt.money(slip.stakeValue) : ''}
            </button>
          </div>
        </div>
      </div>
    `;
    WalletSelector.render();
  },


  // ── CREATE MEETING / EVENT ─────────────────────────────────────
  async showCreateMeetingModal(sportId) {
    const [sports, countries, courses] = await Promise.all([API.getSports(), API.getCountries(), API.getAllCourses()]);
    const defaultSport = sportId || 'sport_hr';
    U.modal.show('Create New Meeting / Event', `
      <div class="form-group"><label>Sport</label>
        <select id="cm-sport" onchange="Pages._onCmSportChange()">
          ${sports.map(s=>`<option value="${s.id}" ${s.id===defaultSport?'selected':''}>${s.icon} ${s.name}</option>`).join('')}
        </select>
      </div>
      <div id="cm-horse">
        <div class="form-row form-row-2">
          <div class="form-group"><label>Country</label>
            <select id="cm-country">
              <option value="">— None —</option>
              ${countries.map(c=>`<option value="${c.id}">${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label>Racecourse</label>
            <select id="cm-course">
              <option value="">— None —</option>
              ${courses.map(c=>`<option value="${c.id}">${c.flag} ${U.escHTML(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group"><label>Number of Races</label>
          <select id="cm-numraces">
            ${[5,6,7,8,9,10].map(n=>`<option value="${n}" ${n===5?'selected':''}>${n} races</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="cm-other" style="display:none">
        <div class="form-group"><label>Event Name</label><input type="text" id="cm-name" placeholder="e.g. Arsenal vs Man City"/></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Date</label><input type="date" id="cm-date"/></div>
        <div class="form-group"><label>First Race Time</label><input type="time" id="cm-time" value="12:30"/></div>
      </div>
      <div id="cm-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages._doCreateMeeting()">Create</button>
      </div>
    `);
    // Default date = 7 days from now
    const d = new Date(); d.setDate(d.getDate()+7);
    const dateEl = document.getElementById('cm-date');
    if (dateEl) dateEl.value = d.toISOString().split('T')[0];
    Pages._onCmSportChange();
  },

  _onCmSportChange() {
    const isHorse = document.getElementById('cm-sport')?.value === 'sport_hr';
    const h = document.getElementById('cm-horse'), o = document.getElementById('cm-other');
    if (h) h.style.display = isHorse ? '' : 'none';
    if (o) o.style.display = isHorse ? 'none' : '';
  },

  async _doCreateMeeting() {
    U.clearError('cm-error');
    const sport_id   = document.getElementById('cm-sport')?.value;
    const event_date = document.getElementById('cm-date')?.value;
    const event_time = document.getElementById('cm-time')?.value || '12:30';
    if (!sport_id || !event_date) { U.setError('cm-error','Sport and date required'); return; }
    try {
      if (sport_id === 'sport_hr') {
        const num_races  = parseInt(document.getElementById('cm-numraces')?.value) || 5;
        const country_id = document.getElementById('cm-country')?.value || null;
        const course_id  = document.getElementById('cm-course')?.value  || null;
        await API.createEvent({sport_id, country_id, course_id, event_name:'Race', event_date, event_time, num_races});
        U.modal.close();
        U.toast(`Meeting created: ${num_races} races`, 'success');
      } else {
        const event_name = document.getElementById('cm-name')?.value?.trim();
        if (!event_name) { U.setError('cm-error','Event name required'); return; }
        await API.createEvent({sport_id, event_name, event_date, event_time});
        U.modal.close();
        U.toast('Event created');
      }
      Pages.renderSportSelector();
    } catch(err) { U.setError('cm-error', err.message); }
  },

  // ── SETTLE ──────────────────────────────────────────────────────
  async showSettleModal(evId) {
    const ev = await API.getEvent(evId);
    const active = (ev.selections||[]).filter(s => s.status !== 'scratched');
    if (!active.length) { U.toast('No active runners to settle','warning'); return; }
    U.modal.show(`🏆 Declare Winner — ${ev.event_name}`, `
      <p class="text-muted text-small" style="margin-bottom:12px">Tap the winning runner:</p>
      ${active.map(s=>`
        <div onclick="Pages._doSettle('${evId}','${s.id}')"
          style="display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer"
          onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--border)'">
          <div class="runner-num" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:var(--bg-raised);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:12px;font-weight:700">${s.barrier_number||'—'}</div>
          <div style="flex:1"><strong>${U.escHTML(s.name)}</strong>${s.jockey?` · <span style="color:var(--text-muted);font-size:12px">${U.escHTML(s.jockey)}</span>`:''}</div>
          <div style="font-family:var(--font-display);font-size:20px;color:var(--gold-bright)">${U.fmt.odds(s.win_odds||s.odds||0)}</div>
        </div>
      `).join('')}
      <button class="btn btn-ghost btn-full" style="margin-top:4px" onclick="U.modal.close()">Cancel</button>
    `);
  },

  async _doSettle(evId, winId) {
    try {
      const r = await API.settleEvent(evId, {winner_selection_id: winId});
      U.modal.close();
      U.toast(`🏆 ${r.winner} wins! ${r.winners||0} bet(s) paid`, 'success', 5000);
      Pages.loadRunners(evId);
    } catch(err) { U.toast(err.message, 'error'); }
  },

  // ── EVENT P&L ────────────────────────────────────────────────────
  async showEventPL(evId) {
    U.modal.show('P&L Report', '<div class="loading"><div class="spinner"></div></div>', true);
    try {
      const r = await API.getEventResults(evId);
      const {event, summary:s, bets} = r;
      document.getElementById('modal-body').innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
          <div class="stat-card gold" style="padding:12px"><div class="stat-label">Staked</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.total_staked)}</div></div>
          <div class="stat-card red" style="padding:12px"><div class="stat-label">Paid Out</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.total_paid)}</div></div>
          <div class="stat-card ${s.house_profit>=0?'green':'red'}" style="padding:12px"><div class="stat-label">House P&L</div><div class="stat-value" style="font-size:18px">${U.fmt.money(s.house_profit||0)}</div></div>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Customer</th><th>Selection</th><th>Type</th><th>Stake</th><th>Odds</th><th>Return</th><th>Status</th></tr></thead>
          <tbody>${bets.length ? bets.map(b=>`<tr>
            <td>${U.escHTML(b.wallet_name)}</td>
            <td>${U.escHTML(b.selection_name)}</td>
            <td>${U.statusPill(b.bet_on||'win')}</td>
            <td class="mono">${U.fmt.money(b.stake)}</td>
            <td class="mono" style="color:var(--gold-bright)">${U.fmt.odds(b.odds_at_time)}</td>
            <td class="${b.actual_return>0?'mono money-pos':'text-muted'}">${b.actual_return>0?U.fmt.money(b.actual_return):'—'}</td>
            <td>${U.statusPill(b.status)}</td>
          </tr>`).join('') : '<tr><td colspan="7" class="text-muted">No bets on this event</td></tr>'}</tbody>
        </table></div>
      `;
    } catch(err) { document.getElementById('modal-body').innerHTML=`<div class="alert alert-error">${err.message}</div>`; }
  },

  // ── ADD RUNNER (alias) ────────────────────────────────────────────
  async showAddSelectionModal(evId, evName) {
    U.modal.show(`+ Add Runner — ${U.escHTML(evName)}`, `
      <div class="form-row form-row-2">
        <div class="form-group"><label>Barrier No.</label><input type="number" id="as-num" min="1" max="30"/></div>
        <div class="form-group"><label>Horse Name *</label><input type="text" id="as-name" placeholder="e.g. Sparkling Water"/></div>
      </div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Jockey</label><input type="text" id="as-jockey"/></div>
        <div class="form-group"><label>Trainer</label><input type="text" id="as-trainer"/></div>
      </div>
      <div class="form-row form-row-3">
        <div class="form-group"><label>Weight</label><input type="text" id="as-weight" placeholder="58kg"/></div>
        <div class="form-group"><label>Age</label><input type="number" id="as-age" min="2" max="20"/></div>
        <div class="form-group"><label>Colour</label><input type="text" id="as-colour" placeholder="Bay"/></div>
      </div>
      <div class="form-group"><label>Form</label><input type="text" id="as-form" placeholder="1-2-3-1"/></div>
      <div class="form-row form-row-2">
        <div class="form-group"><label>Win Odds *</label><input type="number" id="as-win" step="0.05" min="1.01" placeholder="3.50"/></div>
        <div class="form-group"><label>Place Odds</label><input type="number" id="as-place" step="0.05" min="1.01" placeholder="1.30"/></div>
      </div>
      <div id="as-error" class="alert alert-error hidden"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-primary" onclick="Pages._doAddRunner('${evId}')">Add Runner</button>
      </div>
    `);
  },

  async _doAddRunner(evId) {
    U.clearError('as-error');
    const name = document.getElementById('as-name')?.value?.trim();
    const win  = parseFloat(document.getElementById('as-win')?.value);
    if (!name || !win || win <= 1) { U.setError('as-error','Name and valid win odds required'); return; }
    try {
      await API.addSelection(evId, {
        barrier_number: parseInt(document.getElementById('as-num')?.value)||null,
        name,
        jockey:   document.getElementById('as-jockey')?.value||null,
        trainer:  document.getElementById('as-trainer')?.value||null,
        weight:   document.getElementById('as-weight')?.value||null,
        age:      parseInt(document.getElementById('as-age')?.value)||null,
        colour:   document.getElementById('as-colour')?.value||null,
        form:     document.getElementById('as-form')?.value||null,
        win_odds:   win,
        place_odds: parseFloat(document.getElementById('as-place')?.value)||null,
      });
      U.modal.close();
      U.toast(`${name} added`);
      Pages.loadRunners(evId);
    } catch(err) { U.setError('as-error', err.message); }
  },

  showScratchModal(id, name) {
    U.modal.show(`Scratch — ${name}`, `
      <div class="alert alert-warning" style="margin-bottom:12px">All pending bets on ${U.escHTML(name)} will be refunded.</div>
      <div class="form-group"><label>Deduction % for remaining runners</label>
        <input type="number" id="sc-ded" value="0" min="0" max="50" step="0.5"/>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="U.modal.close()">Cancel</button>
        <button class="btn btn-danger" onclick="Pages._doScratch('${id}')">Confirm Scratch</button>
      </div>
    `);
  },

  async _doScratch(id) {
    try {
      const ded = parseFloat(document.getElementById('sc-ded')?.value)||0;
      const r   = await API.scratchSelection(id, {deduction_percent: ded});
      U.modal.close();
      U.toast(r.message, 'success');
      // Reload the runners for the active race
      const race = Pages._raceList?.[Pages._activeRaceIdx||0];
      if (race) Pages.loadRunners(race.id);
    } catch(err) { U.toast(err.message, 'error'); }
  },

});
