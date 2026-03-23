const API = {
  base: '/api',
  getToken() { return localStorage.getItem('rv_token'); },
  setToken(t) { localStorage.setItem('rv_token', t); },
  clearToken() { localStorage.removeItem('rv_token'); localStorage.removeItem('rv_user'); },
  getUser() { try { return JSON.parse(localStorage.getItem('rv_user')); } catch { return null; } },
  setUser(u) { localStorage.setItem('rv_user', JSON.stringify(u)); },

  async request(method, path, body=null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    const token = this.getToken();
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  get(p)        { return this.request('GET', p); },
  post(p, b)    { return this.request('POST', p, b); },
  put(p, b)     { return this.request('PUT', p, b); },
  delete(p)     { return this.request('DELETE', p); },

  login(e,p)              { return this.post('/auth/login', {email:e,password:p}); },
  me()                    { return this.get('/auth/me'); },
  changePassword(d)       { return this.post('/auth/change-password', d); },
  dashStats()             { return this.get('/dashboard/stats'); },

  getUsers()              { return this.get('/users'); },
  createUser(d)           { return this.post('/users', d); },
  updateUser(id,d)        { return this.put(`/users/${id}`, d); },
  deleteUser(id)          { return this.delete(`/users/${id}`); },
  depositUser(id,d)       { return this.post(`/users/${id}/deposit`, d); },
  withdrawUser(id,d)      { return this.post(`/users/${id}/withdraw`, d); },
  getUserTxns(id)         { return this.get(`/users/${id}/transactions`); },

  getCountries()          { return this.get('/countries'); },
  createCountry(d)        { return this.post('/countries', d); },
  updateCountry(id,d)     { return this.put(`/countries/${id}`, d); },
  deleteCountry(id)       { return this.delete(`/countries/${id}`); },
  getCountryCourses(id)   { return this.get(`/countries/${id}/courses`); },
  getAllCourses()          { return this.get('/countries/courses/all'); },
  createCourse(d)         { return this.post('/countries/courses', d); },
  updateCourse(id,d)      { return this.put(`/countries/courses/${id}`, d); },
  deleteCourse(id)        { return this.delete(`/countries/courses/${id}`); },

  getMeetings(cid)        { return this.get(`/races/meetings${cid?'?course_id='+cid:''}`); },
  createMeeting(d)        { return this.post('/races/meetings', d); },
  updateMeeting(id,d)     { return this.put(`/races/meetings/${id}`, d); },
  deleteMeeting(id)       { return this.delete(`/races/meetings/${id}`); },

  getRaces(mid)           { return this.get(`/races${mid?'?meeting_id='+mid:''}`); },
  getRace(id)             { return this.get(`/races/${id}`); },
  createRace(d)           { return this.post('/races', d); },
  updateRace(id,d)        { return this.put(`/races/${id}`, d); },
  deleteRace(id)          { return this.delete(`/races/${id}`); },
  setRaceResult(id,d)     { return this.post(`/races/${id}/result`, d); },

  getHorses(rid)          { return this.get(`/races/${rid}/horses`); },
  addHorse(rid,d)         { return this.post(`/races/${rid}/horses`, d); },
  updateHorse(id,d)       { return this.put(`/races/horse/${id}`, d); },
  deleteHorse(id)         { return this.delete(`/races/horse/${id}`); },
  scratchHorse(id,d)      { return this.post(`/races/horse/${id}/scratch`, d); },

  getBetslips(p={})       { const qs=new URLSearchParams(p).toString(); return this.get(`/betslips${qs?'?'+qs:''}`); },
  submitBetslip(d)        { return this.post('/betslips', d); },
  getRaceResults(rid)     { return this.get(`/betslips/race/${rid}/results`); },
};
