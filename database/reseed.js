'use strict';
const { DatabaseSync } = require('node:sqlite');
const { v4: uuidv4 }   = require('uuid');
const bcrypt           = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || '/data/racing.db';
console.log('DB:', DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys=OFF');

// ── Add any missing columns ──────────────────────────────────────
const fix = (t, col, def) => { try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); console.log('  +', col); } catch(e) {} };
fix('wallets', 'cash_balance',   'REAL NOT NULL DEFAULT 0');
fix('wallets', 'credit_limit',   'REAL NOT NULL DEFAULT 0');
fix('wallets', 'credit_used',    'REAL NOT NULL DEFAULT 0');
fix('transactions', 'payment_type', 'TEXT DEFAULT "cash"');
fix('bets',    'payment_type',   'TEXT DEFAULT "cash"');
fix('bets',    'bet_on',         'TEXT DEFAULT "win"');
fix('betslips','payment_type',   'TEXT DEFAULT "cash"');
fix('betslips','cashout_value',  'REAL DEFAULT 0');
fix('betslips','cashed_out_at',  'TEXT');
fix('events',  'race_number',    'INTEGER DEFAULT 1');
fix('events',  'meeting_key',    'TEXT');
fix('events',  'meeting_name',   'TEXT');
fix('events',  'distance',       'TEXT');
fix('events',  'prize_money',    'TEXT');
fix('selections','win_odds',         'REAL DEFAULT 2');
fix('selections','place_odds',       'REAL');
fix('selections','opening_win_odds', 'REAL DEFAULT 2');
db.exec('CREATE TABLE IF NOT EXISTS selection_price_history (id TEXT PRIMARY KEY, selection_id TEXT NOT NULL, price_type TEXT NOT NULL DEFAULT \'win\', old_price REAL NOT NULL, new_price REAL NOT NULL, changed_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');

// Sync legacy columns
try { db.exec("UPDATE wallets SET cash_balance=COALESCE(balance,0) WHERE cash_balance=0 AND (SELECT 1 FROM pragma_table_info('wallets') WHERE name='balance')"); } catch(e) {}
try { db.exec("UPDATE selections SET win_odds=COALESCE(odds,2) WHERE win_odds IS NULL OR win_odds=0"); } catch(e) {}
try { db.exec("UPDATE selections SET opening_win_odds=win_odds WHERE opening_win_odds IS NULL OR opening_win_odds=0"); } catch(e) {}
console.log('Schema ready');

// ── Wipe data ────────────────────────────────────────────────────
['bets','betslip_legs','betslips','transactions','selection_price_history',
 'selections','events','courses','countries','wallets'].forEach(t => {
  try { db.exec(`DELETE FROM ${t}`); } catch(e) {}
});
console.log('Data wiped');

const adminId = db.prepare("SELECT id FROM operators WHERE role='super_admin' LIMIT 1").get()?.id;
if (!adminId) { console.error('No admin — start server first'); process.exit(1); }

// ── Sports ───────────────────────────────────────────────────────
[{id:'sport_hr',name:'Horse Racing',icon:'🏇'},{id:'sport_fb',name:'Football',icon:'⚽'},
 {id:'sport_cr',name:'Cricket',icon:'🏏'},{id:'sport_rb',name:'Rugby',icon:'🏉'},
 {id:'sport_tn',name:'Tennis',icon:'🎾'},{id:'sport_bx',name:'Boxing',icon:'🥊'}]
  .forEach(s => db.prepare('INSERT OR IGNORE INTO sports (id,name,icon) VALUES (?,?,?)').run(s.id,s.name,s.icon));

// ── Countries ────────────────────────────────────────────────────
const cId = {};
[{n:'South Africa',c:'ZA',f:'🇿🇦'},{n:'United Kingdom',c:'GB',f:'🇬🇧'},
 {n:'Australia',c:'AU',f:'🇦🇺'},{n:'UAE',c:'AE',f:'🇦🇪'}].forEach(x => {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,x.n,x.c,x.f);
  cId[x.c] = db.prepare('SELECT id FROM countries WHERE code=?').get(x.c).id;
});

// ── Courses ──────────────────────────────────────────────────────
const coId = {};
[{c:'ZA',n:'Greyville Racecourse',l:'Durban',s:'Turf'},
 {c:'ZA',n:'Kenilworth Racecourse',l:'Cape Town',s:'Turf'},
 {c:'ZA',n:'Turffontein',l:'Johannesburg',s:'Turf'},
 {c:'GB',n:'Ascot Racecourse',l:'Berkshire',s:'Turf'},
 {c:'AU',n:'Flemington',l:'Melbourne',s:'Turf'},
 {c:'AE',n:'Meydan Racecourse',l:'Dubai',s:'Dirt/Turf'}].forEach(x => {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,cId[x.c],x.n,x.l,x.s);
  coId[x.n] = db.prepare('SELECT id FROM courses WHERE name=?').get(x.n).id;
});

// ── Bookmaker ────────────────────────────────────────────────────
db.prepare('INSERT OR IGNORE INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(),'bookmaker1','bookmaker@racingbet.com',bcrypt.hashSync('Bookmaker@123',10),'bookmaker');

// ── Wallets ──────────────────────────────────────────────────────
[{n:'John Smith',p:'082-111-1111',cash:5000,credit:2000},
 {n:'Sarah Johnson',p:'083-222-2222',cash:2500,credit:1000},
 {n:'Mike Peters',p:'084-333-3333',cash:10000,credit:5000},
 {n:'Lisa van Wyk',p:'076-444-4444',cash:750,credit:500},
 {n:'David Dlamini',p:'071-555-5555',cash:15000,credit:3000},
 {n:'Themba Nkosi',p:'079-666-6666',cash:3000,credit:1500}].forEach(cu => {
  const id = uuidv4();
  db.prepare('INSERT INTO wallets (id,name,phone,cash_balance,credit_limit,credit_used) VALUES (?,?,?,?,?,0)').run(id,cu.n,cu.p,cu.cash,cu.credit);
  db.prepare('INSERT INTO transactions (id,wallet_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,0,?,?)').run(uuidv4(),id,'deposit',cu.cash,cu.cash,'Opening deposit');
});
console.log('Wallets:', db.prepare('SELECT COUNT(*) as c FROM wallets').get().c);

// ── Helpers ──────────────────────────────────────────────────────
const fd  = d  => { const dt=new Date(); dt.setDate(dt.getDate()+d); return dt.toISOString().split('T')[0]; };
const rt  = (h,m=0) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
const ca  = (ds,h,m) => { const d=new Date(`${ds}T${rt(h,m)}:00`); d.setMinutes(d.getMinutes()-10); return d.toISOString(); };

// Create a named event with N races at a course
// meeting_key = courseName__meetingName__date (unique per event per course)
function createEvent(courseName, countryCode, meetingName, daysAhead, startH, numRaces) {
  const courseId   = coId[courseName] || null;
  const countryId  = cId[countryCode] || null;
  const ds         = fd(daysAhead);
  const meetingKey = `${courseName.replace(/\s+/g,'_')}__${meetingName.replace(/\s+/g,'_')}__${ds}`;
  const ids        = [];
  for (let r = 1; r <= numRaces; r++) {
    const id    = uuidv4();
    const mins  = startH * 60 + (r-1) * 30;
    const h     = Math.floor(mins/60) % 24, m = mins % 60;
    const ts    = rt(h, m);
    const rName = `Race ${r}`;
    db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,meeting_key,meeting_name,race_number,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      id, 'sport_hr', countryId, courseId, meetingKey, meetingName, r, rName, ds, ts, ca(ds,h,m), 'open', adminId
    );
    ids.push(id);
  }
  return { ids, meetingKey, date: ds, courseId };
}

// Add a runner to a race
function R(eid, num, name, jky, trn, wt, age, form, col, win, plc) {
  const id = uuidv4();
  db.prepare('INSERT INTO selections (id,event_id,barrier_number,name,jockey,trainer,weight,age,form,colour,win_odds,place_odds,opening_win_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    id, eid, num, name, jky||null, trn||null, wt||null, age||null, form||null, col||null, win, plc||null, win
  );
  // Price history (2 prior prices)
  const p1 = parseFloat((win*1.15).toFixed(2));
  const p2 = parseFloat((win*1.07).toFixed(2));
  const d1 = new Date(); d1.setHours(d1.getHours()-6);
  const d2 = new Date(); d2.setHours(d2.getHours()-2);
  db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price,changed_at) VALUES (?,?,?,?,?,?)').run(uuidv4(),id,'win',p1,p2,d1.toISOString());
  db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price,changed_at) VALUES (?,?,?,?,?,?)').run(uuidv4(),id,'win',p2,win,d2.toISOString());
}

// Generic fill for races that don't have specific runners
function fillRace(eid, runners) {
  runners.forEach((r,i) => R(eid, i+1, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]));
}

const genericRunners = [
  ['Bold Runner',   'G Lerena',  'J Snaith',   '58kg', 4, '1-2-1', 'Bay',      3.50, 1.30],
  ['Swift Wind',    'S Within',  'M Azzie',    '57.5kg',4,'2-1-2', 'Chestnut', 4.50, 1.45],
  ['Thunder Bolt',  'P Strydom', 'S Tarry',    '57kg',  5,'1-3-1', 'Grey',     6.50, 1.85],
  ['Desert Star',   'W Kennedy', 'A Laird',    '56.5kg',4,'3-1-3', 'Dark Bay', 9.00, 2.35],
  ['Golden Fleece', 'C Orffer',  'NJ Kotzen',  '56kg',  5,'2-2-4', 'Bay',      12.00,2.90],
  ['Cape Ranger',   'K Venter',  'A Marcus',   '55.5kg',4,'4-3-1', 'Chestnut', 18.00,4.00],
];

// ════════════════════════════════════════════════════════════════
// 🇿🇦 GREYVILLE RACECOURSE — 3 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  // Event 1: Vodacom Durban July (biggest race day)
  const { ids } = createEvent('Greyville Racecourse','ZA','Vodacom Durban July', 7, 12, 5);
  // R1 — Maiden Plate
  R(ids[0],1,'Morning Star','C Orffer','A Marcus','56kg',3,'2-1-3','Bay',4.00,1.40);
  R(ids[0],2,'Dawn Breaker','K Venter','J Snaith','55.5kg',3,'1-2-2','Chestnut',5.50,1.65);
  R(ids[0],3,'First Light','G Lerena','M de Kock','55kg',3,'3-1-4','Grey',7.00,2.00);
  R(ids[0],4,'Sunrise Glory','S Within','S Tarry','54.5kg',3,'2-3-1','Dark Bay',9.00,2.40);
  R(ids[0],5,'Early Bird','P Strydom','A Laird','54kg',3,'4-2-3','Bay',14.00,3.20);
  // R2 — Allow Handicap
  R(ids[1],1,'Fast Track','G Lerena','M Azzie','58kg',4,'1-2-1','Bay',3.20,1.25);
  R(ids[1],2,'Quick Step','S Within','J Snaith','57.5kg',4,'2-1-2','Chestnut',4.00,1.38);
  R(ids[1],3,'Rapid Fire','P Strydom','S Tarry','57kg',5,'1-3-1','Grey',6.00,1.75);
  R(ids[1],4,'Swift Arrow','W Kennedy','A Laird','56.5kg',4,'3-1-3','Dark Bay',8.50,2.20);
  R(ids[1],5,'Speed Demon','C Orffer','NJ Kotzen','56kg',4,'2-2-4','Bay',11.00,2.70);
  // R3 — Feature Race (Durban July)
  R(ids[2],1,'Sparkling Water','S Within','J Snaith','60kg',5,'1-2-1-1','Bay',3.20,1.20);
  R(ids[2],2,'Legal Eagle','G Lerena','M Azzie','58kg',4,'2-1-3-1','Chestnut',4.50,1.40);
  R(ids[2],3,'Jet Dark','P Strydom','NJ Kotzen','57.5kg',5,'1-1-2-3','Black',6.00,1.80);
  R(ids[2],4,'Rainbow Bridge','W Kennedy','A Laird','57kg',4,'3-2-1-2','Bay',7.00,2.00);
  R(ids[2],5,'Cape Crusader','C Orffer','A Marcus','56.5kg',6,'4-1-2-1','Grey',9.00,2.40);
  R(ids[2],6,'Golden Horn','K Venter','J Snaith','56kg',5,'2-3-1-4','Chestnut',12.00,3.00);
  R(ids[2],7,'African Queen','L Hewitson','G Kotzen','55.5kg',4,'1-3-2-2','Bay',15.00,3.50);
  R(ids[2],8,'Storm Chaser','R Fourie','S Tarry','55kg',7,'5-2-3-1','Dark Bay',20.00,4.50);
  // R4 — Daily News 2000
  R(ids[3],1,'Soqrat','G Lerena','M de Kock','59kg',4,'1-1-2-1','Bay',2.80,1.15);
  R(ids[3],2,'Whisky Baron','S Within','J Snaith','58kg',5,'2-1-1-3','Chestnut',3.50,1.28);
  R(ids[3],3,'Silver Bullet','P Strydom','A Marcus','57kg',4,'3-2-1-2','Grey',5.00,1.60);
  R(ids[3],4,'Night Owl','W Kennedy','S Tarry','56kg',6,'1-4-2-1','Black',8.00,2.10);
  R(ids[3],5,'Cape Magic','C Orffer','NJ Kotzen','55.5kg',4,'2-2-3-4','Bay',10.00,2.60);
  // R5 — Closing Stakes
  R(ids[4],1,'Bold Approach','C Orffer','A Marcus','59kg',5,'1-2-1-1','Bay',4.00,1.40);
  R(ids[4],2,'Night Hawk','K Venter','J Snaith','58.5kg',4,'2-1-2-1','Chestnut',5.50,1.60);
  R(ids[4],3,'Silver Sands','L Hewitson','M de Kock','58kg',5,'3-1-1-2','Grey',7.00,1.90);
  R(ids[4],4,'Desert Wind','G Lerena','S Tarry','57.5kg',4,'1-3-2-1','Dark Bay',9.00,2.30);
  R(ids[4],5,'Golden Mile','S Within','NJ Kotzen','56.5kg',4,'4-1-3-2','Chestnut',12.00,2.90);
}
{
  // Event 2: Greyville Gold Cup Day
  const { ids } = createEvent('Greyville Racecourse','ZA','Gold Cup Day', 14, 12, 5);
  fillRace(ids[0],[['Sea Mist','R Fourie','M de Kock','57kg',4,'1-2-3','Bay',3.80,1.35],['River Hawk','G Lerena','J Snaith','56.5kg',4,'2-1-2','Chestnut',5.00,1.55],['Autumn Leaf','S Within','S Tarry','56kg',5,'3-2-1','Grey',7.50,2.05],['Night Fire','P Strydom','A Laird','55.5kg',4,'1-3-2','Dark Bay',10.00,2.60],['Star Burst','W Kennedy','NJ Kotzen','55kg',3,'4-1-3','Bay',15.00,3.50]]);
  fillRace(ids[1],genericRunners.slice(0,5));
  fillRace(ids[2],[['Greyville Gold','G Lerena','M de Kock','60kg',6,'1-1-1-2','Bay',2.50,1.12],['Century Man','S Within','J Snaith','59.5kg',5,'1-2-1-1','Chestnut',3.80,1.32],['Iron Duke','P Strydom','S Tarry','59kg',6,'2-1-2-1','Dark Bay',5.50,1.65],['Silver Fox','W Kennedy','A Marcus','58.5kg',5,'3-2-1-3','Grey',8.00,2.10],['Cape Glory','C Orffer','A Laird','58kg',4,'2-3-2-2','Bay',11.00,2.75],['Wild Storm','K Venter','NJ Kotzen','57.5kg',5,'4-1-3-2','Chestnut',16.00,3.80]]);
  fillRace(ids[3],genericRunners.slice(1,5));
  fillRace(ids[4],genericRunners);
}
{
  // Event 3: Greyville Sprint Day
  const { ids } = createEvent('Greyville Racecourse','ZA','Sprint Day', 21, 13, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners.map((r,j) => [`${r[0]} ${i+1}`,r[1],r[2],r[3],r[4],r[5],r[6],parseFloat((r[7]+j*0.3).toFixed(2)),parseFloat((r[8]+j*0.05).toFixed(2))]));
}

// ════════════════════════════════════════════════════════════════
// 🇿🇦 KENILWORTH RACECOURSE — 3 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  // Event 1: Cape Town Guineas Day
  const { ids } = createEvent('Kenilworth Racecourse','ZA','Cape Town Guineas Day', 8, 13, 5);
  R(ids[0],1,'Cape Star','G Lerena','J Snaith','58kg',4,'1-2-1','Bay',3.00,1.20);
  R(ids[0],2,'Ocean Breeze','S Within','M de Kock','57.5kg',4,'2-1-2','Chestnut',4.20,1.40);
  R(ids[0],3,'Table Top','P Strydom','S Tarry','57kg',5,'1-3-1','Grey',6.00,1.75);
  R(ids[0],4,'Mountain View','W Kennedy','A Laird','56.5kg',4,'3-1-3','Dark Bay',8.50,2.20);
  R(ids[0],5,'Lion Rock','C Orffer','NJ Kotzen','56kg',4,'2-2-4','Bay',13.00,3.10);
  R(ids[1],1,'Western Cape','L Hewitson','M de Kock','59.5kg',5,'1-1-1','Bay',2.80,1.15);
  R(ids[1],2,'Atlantic Storm','R Fourie','G Kotzen','59kg',4,'2-1-2','Chestnut',3.80,1.30);
  R(ids[1],3,'Lion Head','G Lerena','J Snaith','58.5kg',5,'1-2-3','Dark Bay',5.50,1.65);
  R(ids[1],4,'Signal Hill','K Venter','A Laird','58kg',4,'3-1-2','Bay',8.00,2.10);
  R(ids[1],5,'Boulders','S Within','S Tarry','57.5kg',4,'2-3-1','Grey',14.00,3.30);
  R(ids[2],1,'Do It Again','G Lerena','J Snaith','59kg',5,'1-1-1-2','Bay',2.50,1.15);
  R(ids[2],2,'Hawwaam','S Within','M Azzie','58.5kg',4,'2-1-1-1','Chestnut',3.20,1.25);
  R(ids[2],3,'Vardy','P Strydom','S Tarry','57.5kg',5,'1-2-3-1','Dark Bay',5.50,1.70);
  R(ids[2],4,'London News','W Kennedy','A Marcus','57kg',4,'3-1-2-2','Bay',7.00,2.00);
  R(ids[2],5,'Smart Ruler','C Orffer','NJ Kotzen','56.5kg',5,'2-3-1-3','Grey',10.00,2.60);
  R(ids[2],6,'Forest Edge','K Venter','A Laird','56kg',4,'4-2-2-1','Chestnut',18.00,4.00);
  R(ids[3],1,'Futura','C Orffer','A Marcus','60kg',5,'1-1-2-1','Bay',3.00,1.20);
  R(ids[3],2,'Warrior King','P Strydom','NJ Kotzen','59.5kg',6,'1-2-1-1','Chestnut',4.00,1.35);
  R(ids[3],3,'Desert Gold','W Kennedy','M de Kock','59kg',5,'2-1-3-1','Dark Bay',6.00,1.75);
  R(ids[3],4,'Night Vision','L Hewitson','G Kotzen','58.5kg',4,'3-2-1-2','Grey',8.50,2.20);
  R(ids[3],5,'Last Tango','G Lerena','A Laird','58kg',4,'2-3-3-1','Chestnut',18.00,4.00);
  R(ids[4],1,'Hawksmoor','G Lerena','J Snaith','60kg',4,'1-1-2-1','Bay',3.50,1.30);
  R(ids[4],2,'Crimson Tide','S Within','M Azzie','59kg',4,'2-1-1-2','Chestnut',4.50,1.45);
  R(ids[4],3,'Cape Storm','P Strydom','S Tarry','58.5kg',4,'1-2-3-1','Dark Bay',6.50,1.80);
  R(ids[4],4,'Sea Breeze','C Orffer','NJ Kotzen','57.5kg',4,'2-3-1-3','Bay',13.00,3.10);
  R(ids[4],5,'Solar Flare','W Kennedy','A Marcus','57kg',5,'3-1-2-2','Grey',19.00,4.20);
}
{
  // Event 2: Western Province Summer Cup
  const { ids } = createEvent('Kenilworth Racecourse','ZA','Western Province Summer Cup', 15, 12, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners);
}
{
  // Event 3: Cape Fillies Guineas
  const { ids } = createEvent('Kenilworth Racecourse','ZA','Cape Fillies Guineas', 22, 13, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners.map((r,j)=>[r[0]+' F',r[1],r[2],'56kg',3,r[5],r[6],parseFloat((r[7]+0.5).toFixed(2)),parseFloat((r[8]+0.1).toFixed(2))]));
}

// ════════════════════════════════════════════════════════════════
// 🇿🇦 TURFFONTEIN — 2 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  const { ids } = createEvent('Turffontein','ZA',"Emperor's Palace Champions Cup", 10, 13, 5);
  R(ids[0],1,'Jet Master','G Lerena','M de Kock','60kg',6,'1-2-1-1','Bay',3.00,1.20);
  R(ids[0],2,'Woodland Dream','S Within','J Snaith','58.5kg',5,'2-1-2-1','Chestnut',4.00,1.38);
  R(ids[0],3,'Pomodoro','P Strydom','A Marcus','58kg',7,'1-1-3-2','Dark Bay',5.50,1.65);
  R(ids[0],4,'Heavy Metal','W Kennedy','S Tarry','57.5kg',5,'3-2-1-3','Grey',8.00,2.10);
  R(ids[0],5,'Edict of Milan','C Orffer','NJ Kotzen','57kg',4,'2-3-2-1','Bay',11.00,2.75);
  for (let i=1;i<5;i++) fillRace(ids[i], genericRunners);
}
{
  const { ids } = createEvent('Turffontein','ZA','Gauteng Champions Day', 17, 12, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners);
}

// ════════════════════════════════════════════════════════════════
// 🇬🇧 ASCOT RACECOURSE — 2 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  const { ids } = createEvent('Ascot Racecourse','GB','Royal Ascot Day', 9, 14, 5);
  for (let i=0;i<5;i++) {
    if (i===2) {
      R(ids[2],1,'Stradivarius','F Dettori','J Gosden','91kg',7,'1-1-1-1','Bay',2.20,1.10);
      R(ids[2],2,'Kyprios','R Moore',"A O'Brien",'90kg',5,'1-2-1-2','Chestnut',3.50,1.30);
      R(ids[2],3,'Trueshan','H Bentley','A Balding','89.5kg',6,'2-1-3-1','Grey',5.00,1.60);
      R(ids[2],4,'Nayef Road','J Fanning','M Johnston','89kg',6,'3-2-1-3','Bay',8.00,2.20);
      R(ids[2],5,'Spanish Mission','D Tudhope','A Watson','88.5kg',7,'2-3-2-2','Dark Bay',12.00,3.00);
    } else {
      R(ids[i],1,'Windsor Castle','F Dettori','J Gosden','58kg',4,'1-1-2','Bay',3.00,1.20);
      R(ids[i],2,'Royal Guard','R Moore',"A O'Brien",'57.5kg',4,'2-1-1','Chestnut',4.00,1.38);
      R(ids[i],3,'Ascot Victor','W Buick','C Appleby','57kg',5,'1-2-3','Grey',6.00,1.75);
      R(ids[i],4,'Palace Ace','J Crowley','W Haggas','56.5kg',4,'3-1-2','Dark Bay',9.00,2.30);
      R(ids[i],5,'Crown Jewel','K Shoemark','R Hannon','56kg',4,'2-2-4','Bay',14.00,3.40);
    }
  }
}
{
  const { ids } = createEvent('Ascot Racecourse','GB','King George VI & Queen Elizabeth Day', 16, 14, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners.map(r=>['GB '+r[0],'F Dettori',r[2],r[3],r[4],r[5],r[6],parseFloat((r[7]+0.3).toFixed(2)),parseFloat((r[8]+0.05).toFixed(2))]));
}

// ════════════════════════════════════════════════════════════════
// 🇦🇺 FLEMINGTON — 2 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  const { ids } = createEvent('Flemington','AU','Melbourne Cup Day', 11, 12, 5);
  for (let i=0;i<5;i++) {
    if (i===3) {
      R(ids[3],1,'Verry Elleegant','J McNeil','C Waller','57kg',6,'1-1-2-1','Bay',4.00,1.35);
      R(ids[3],2,'Incentivise','B Melham','P Moody','57.5kg',7,'1-1-1-3','Chestnut',5.00,1.50);
      R(ids[3],3,'Twilight Payment','J Orman','J Mullins','57kg',8,'2-1-1-2','Dark Bay',6.50,1.80);
      R(ids[3],4,'Delphi','S Clipperton','G Portelli','56.5kg',5,'3-2-1-1','Grey',9.00,2.30);
      R(ids[3],5,'Explosive Jack','T Berry','G Waterhouse','55kg',7,'4-2-1-3','Bay',18.00,4.00);
    } else {
      R(ids[i],1,'Flemington Star','J McNeil','C Waller','58kg',4,'1-2-1','Bay',3.50,1.30);
      R(ids[i],2,'Melbourne Pride','B Melham','P Moody','57.5kg',4,'2-1-2','Chestnut',4.50,1.45);
      R(ids[i],3,'Turf Master','D Lane','A Freedman','57kg',5,'1-3-1','Grey',6.00,1.75);
      R(ids[i],4,'Golden Slipper','T Berry','G Waterhouse','56.5kg',4,'3-1-3','Dark Bay',9.00,2.35);
      R(ids[i],5,'Spring Hero','J Allen','B Cole','56kg',4,'2-2-4','Bay',12.00,2.90);
    }
  }
}
{
  const { ids } = createEvent('Flemington','AU','Cox Plate Day', 18, 12, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners.map(r=>['AU '+r[0],r[1],r[2],r[3],r[4],r[5],r[6],parseFloat((r[7]+0.2).toFixed(2)),r[8]]));
}

// ════════════════════════════════════════════════════════════════
// 🇦🇪 MEYDAN — 2 named events × 5 races each
// ════════════════════════════════════════════════════════════════
{
  const { ids } = createEvent('Meydan Racecourse','AE','Dubai World Cup Day', 12, 20, 5);
  R(ids[2],1,'Country Grammer','F Prat','B Baffert','58kg',5,'1-1-2-1','Bay',3.50,1.30);
  R(ids[2],2,'Mishriff','D Egan','J Gosden','58kg',5,'2-1-1-2','Chestnut',4.00,1.40);
  R(ids[2],3,'Charlatan','J Velazquez','B Baffert','57.5kg',5,'1-2-3-1','Dark Bay',5.50,1.65);
  R(ids[2],4,'Life Is Good','I Ortiz Jr','T Pletcher','57kg',4,'1-1-2-3','Bay',6.00,1.80);
  R(ids[2],5,'Maximum Security','L Saez','B Cox','56.5kg',6,'2-3-1-2','Chestnut',9.00,2.40);
  for (let i of [0,1,3,4]) fillRace(ids[i], genericRunners.map(r=>['ME '+r[0],r[1],r[2],r[3],r[4],r[5],r[6],parseFloat((r[7]+0.4).toFixed(2)),r[8]]));
}
{
  const { ids } = createEvent('Meydan Racecourse','AE','Dubai Gold Cup Day', 19, 19, 5);
  for (let i=0;i<5;i++) fillRace(ids[i], genericRunners);
}

// ════════════════════════════════════════════════════════════════
// OTHER SPORTS
// ════════════════════════════════════════════════════════════════
function nonHorse(sid, cc, name, days, h) {
  const d=fd(days), id=uuidv4(), cl=new Date(`${d}T${rt(h-1,50)}:00`);
  db.prepare('INSERT INTO events (id,sport_id,country_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,sid,cId[cc]||null,name,d,rt(h),cl.toISOString(),'open',adminId);
  return id;
}
function T(eid,nm,sub,odds) { db.prepare('INSERT INTO selections (id,event_id,name,sub_info,win_odds,opening_win_odds) VALUES (?,?,?,?,?,?)').run(uuidv4(),eid,nm,sub||null,odds,odds); }

{ const e=nonHorse('sport_fb','ZA','Kaizer Chiefs vs Orlando Pirates',7,15); T(e,'Kaizer Chiefs','Home',2.80);T(e,'Draw','',3.10);T(e,'Orlando Pirates','Away',2.60); }
{ const e=nonHorse('sport_fb','GB','Arsenal vs Manchester City',8,15); T(e,'Arsenal','Home',3.40);T(e,'Draw','',3.20);T(e,'Man City','Away',2.10); }
{ const e=nonHorse('sport_fb','ZA','Mamelodi Sundowns vs SuperSport',9,15); T(e,'Mamelodi Sundowns','Home',1.80);T(e,'Draw','',3.40);T(e,'SuperSport United','Away',4.20); }
{ const e=nonHorse('sport_cr','ZA','South Africa vs England — Test',9,9); T(e,'South Africa','Win',2.20);T(e,'Draw','',3.00);T(e,'England','Win',3.40); }
{ const e=nonHorse('sport_cr','AU','Australia vs India — T20',12,14); T(e,'Australia','Win',1.85);T(e,'India','Win',2.00); }
{ const e=nonHorse('sport_rb','ZA','Springboks vs All Blacks',10,17); T(e,'Springboks','Win',1.90);T(e,'Draw','',18.00);T(e,'All Blacks','Win',1.95); }
{ const e=nonHorse('sport_rb','ZA','Bulls vs Lions — URC',13,14); T(e,'Bulls','Win',1.75);T(e,'Draw','',15.00);T(e,'Lions','Win',2.10); }
{ const d=fd(11),id=uuidv4(),cl=new Date(`${d}T13:50:00`); db.prepare('INSERT INTO events (id,sport_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,1)').run(id,'sport_tn','Djokovic vs Alcaraz',d,rt(14),cl.toISOString(),'open',adminId); T(id,'Djokovic','',1.95);T(id,'Alcaraz','',1.90); }
{ const d=fd(14),id=uuidv4(),cl=new Date(`${d}T21:50:00`); db.prepare('INSERT INTO events (id,sport_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,1)').run(id,'sport_bx','Fury vs Usyk',d,rt(22),cl.toISOString(),'open',adminId); T(id,'Fury','KO',2.10);T(id,'Draw','',16.00);T(id,'Usyk','KO',1.80); }

db.exec('PRAGMA foreign_keys=ON');
console.log('\n✅ SEED COMPLETE');
console.log('  Countries: ', db.prepare('SELECT COUNT(*) as c FROM countries').get().c);
console.log('  Courses:   ', db.prepare('SELECT COUNT(*) as c FROM courses').get().c);
console.log('  Wallets:   ', db.prepare('SELECT COUNT(*) as c FROM wallets').get().c);
console.log('  Events:    ', db.prepare('SELECT COUNT(*) as c FROM events').get().c);
console.log('  Selections:', db.prepare('SELECT COUNT(*) as c FROM selections').get().c);

// Show events per course
const byCourse = db.prepare(`
  SELECT COALESCE(cu.name,'Other') as course,
    COUNT(DISTINCT e.meeting_key) as named_events,
    COUNT(e.id) as total_races
  FROM events e
  LEFT JOIN courses cu ON e.course_id=cu.id
  WHERE e.sport_id='sport_hr'
  GROUP BY e.course_id
  ORDER BY course
`).all();
console.log('\n  Horse Racing breakdown:');
byCourse.forEach(r => console.log(`    ${r.course}: ${r.named_events} events × ${Math.round(r.total_races/r.named_events)} races`));
