const API = {
  base: '/api',
  getToken()  { return localStorage.getItem('rv_token'); },
  setToken(t) { localStorage.setItem('rv_token', t); },
  clearToken(){ localStorage.removeItem('rv_token'); localStorage.removeItem('rv_op'); },
  getOp()     { try { return JSON.parse(localStorage.getItem('rv_op')); } catch { return null; } },
  setOp(o)    { localStorage.setItem('rv_op', JSON.stringify(o)); },

  async request(method, path, body=null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = this.getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body)  opts.body = JSON.stringify(body);
    const res  = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  get(p)     { return this.request('GET', p); },
  post(p, b) { return this.request('POST', p, b); },
  put(p, b)  { return this.request('PUT', p, b); },
  delete(p)  { return this.request('DELETE', p); },

  login(e,p)             { return this.post('/auth/login',{email:e,password:p}); },
  me()                   { return this.get('/auth/me'); },

  getOperators()         { return this.get('/operators'); },
  createOperator(d)      { return this.post('/operators', d); },
  updateOperator(id,d)   { return this.put(`/operators/${id}`, d); },
  deleteOperator(id)     { return this.delete(`/operators/${id}`); },

  getWallets()           { return this.get('/wallets'); },
  getWallet(id)          { return this.get(`/wallets/${id}`); },
  createWallet(d)        { return this.post('/wallets', d); },
  updateWallet(id,d)     { return this.put(`/wallets/${id}`, d); },
  deleteWallet(id)       { return this.delete(`/wallets/${id}`); },
  depositWallet(id,d)    { return this.post(`/wallets/${id}/deposit`, d); },
  withdrawWallet(id,d)   { return this.post(`/wallets/${id}/withdraw`, d); },
  getWalletTxns(id)      { return this.get(`/wallets/${id}/transactions`); },
  getWalletBets(id)      { return this.get(`/wallets/${id}/bets`); },

  getSports()            { return this.get('/events/sports'); },
  getEvents(sid,s)       { let q=''; if(sid)q+=`?sport_id=${sid}`; if(s)q+=(q?'&':'?')+`status=${s}`; return this.get(`/events${q}`); },
  getEvent(id)           { return this.get(`/events/${id}`); },
  createEvent(d)         { return this.post('/events', d); },
  updateEvent(id,d)      { return this.put(`/events/${id}`, d); },
  deleteEvent(id)        { return this.delete(`/events/${id}`); },
  settleEvent(id,d)      { return this.post(`/events/${id}/result`, d); },
  getEventResults(id)    { return this.get(`/events/${id}/results`); },
  getSelections(eid)     { return this.get(`/events/${eid}/selections`); },
  addSelection(eid,d)    { return this.post(`/events/${eid}/selections`, d); },
  updateSelection(id,d)  { return this.put(`/events/selection/${id}`, d); },
  deleteSelection(id)    { return this.delete(`/events/selection/${id}`); },
  scratchSelection(id,d) { return this.post(`/events/selection/${id}/scratch`, d); },

  getBetslips(p={})           { const qs=new URLSearchParams(p).toString(); return this.get(`/betslips${qs?'?'+qs:''}`); },
  placeBet(d)                 { return this.post('/betslips', d); },
  cashoutBet(slipId)          { return this.post(`/betslips/${slipId}/cashout`, {}); },
  getCashoutValue(slipId)     { return this.get(`/betslips/${slipId}/cashout-value`); },

  getCountries()         { return this.get('/countries'); },
  createCountry(d)       { return this.post('/countries', d); },
  updateCountry(id,d)    { return this.put(`/countries/${id}`, d); },
  deleteCountry(id)      { return this.delete(`/countries/${id}`); },
  getCountryCourses(id)  { return this.get(`/countries/${id}/courses`); },
  getAllCourses()         { return this.get('/countries/courses/all'); },
  createCourse(d)        { return this.post('/countries/courses', d); },
  updateCourse(id,d)     { return this.put(`/countries/courses/${id}`, d); },
  deleteCourse(id)       { return this.delete(`/countries/courses/${id}`); },

  dashStats()            { return this.get('/dashboard/stats'); },

  reportSummary(p={})      { const qs=new URLSearchParams(p).toString(); return this.get(`/reports/summary${qs?'?'+qs:''}`); },
  reportByEvent(p={})      { const qs=new URLSearchParams(p).toString(); return this.get(`/reports/by-event${qs?'?'+qs:''}`); },
  reportByWallet(p={})     { const qs=new URLSearchParams(p).toString(); return this.get(`/reports/by-wallet${qs?'?'+qs:''}`); },
  reportByMeeting(p={})    { const qs=new URLSearchParams(p).toString(); return this.get(`/reports/by-meeting${qs?'?'+qs:''}`); },
  reportEventBets(id,p={}) { const qs=new URLSearchParams(p).toString(); return this.get(`/reports/event/${id}/bets${qs?'?'+qs:''}`); },
};
