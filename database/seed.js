'use strict';

function runSeed() {
  const { getDb } = require('./db');
  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');
  const db = getDb();

  if (db.prepare('SELECT COUNT(*) as c FROM countries').get().c > 0) {
    console.log('Seed skipped'); return;
  }
  console.log('Seeding...');
  const adminId = db.prepare("SELECT id FROM operators WHERE role='super_admin' LIMIT 1").get()?.id;
  if (!adminId) { console.error('No admin found'); return; }

  // Dates — always 7+ days in future so races are OPEN
  function futureDate(daysAhead) {
    const d = new Date(); d.setDate(d.getDate() + daysAhead);
    return d.toISOString().split('T')[0];
  }
  function raceTime(h, m=0) { return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
  function closesAt(dateStr, h, m) {
    // closes 10 mins before race
    const d = new Date(`${dateStr}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
    d.setMinutes(d.getMinutes() - 10);
    return d.toISOString();
  }

  // ── Countries ───────────────────────────────────────────────────
  const cRows = [
    {name:'South Africa',code:'ZA',flag:'🇿🇦'},
    {name:'United Kingdom',code:'GB',flag:'🇬🇧'},
    {name:'Australia',code:'AU',flag:'🇦🇺'},
    {name:'UAE',code:'AE',flag:'🇦🇪'},
  ];
  const cId = {};
  for (const c of cRows) {
    const id = uuidv4();
    db.prepare('INSERT OR IGNORE INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,c.name,c.code,c.flag);
    cId[c.code] = db.prepare('SELECT id FROM countries WHERE code=?').get(c.code).id;
  }

  // ── Courses ──────────────────────────────────────────────────────
  const courses = [
    {c:'ZA',name:'Greyville Racecourse',loc:'Durban',surf:'Turf'},
    {c:'ZA',name:'Kenilworth Racecourse',loc:'Cape Town',surf:'Turf'},
    {c:'ZA',name:'Turffontein',loc:'Johannesburg',surf:'Turf'},
    {c:'GB',name:'Ascot Racecourse',loc:'Berkshire',surf:'Turf'},
    {c:'AU',name:'Flemington',loc:'Melbourne',surf:'Turf'},
    {c:'AE',name:'Meydan Racecourse',loc:'Dubai',surf:'Dirt/Turf'},
  ];
  const coId = {};
  for (const c of courses) {
    const id = uuidv4();
    db.prepare('INSERT OR IGNORE INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,cId[c.c],c.name,c.loc,c.surf);
    coId[c.name] = db.prepare('SELECT id FROM courses WHERE name=?').get(c.name).id;
  }

  // ── Bookmaker operator ───────────────────────────────────────────
  const bkHash = bcrypt.hashSync('Bookmaker@123',10);
  db.prepare('INSERT OR IGNORE INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(),'bookmaker1','bookmaker@racingbet.com',bkHash,'bookmaker');

  // ── Wallets ──────────────────────────────────────────────────────
  const customers = [
    {name:'John Smith',   phone:'082-111-1111', cash:5000,  credit:2000},
    {name:'Sarah Johnson',phone:'083-222-2222', cash:2500,  credit:1000},
    {name:'Mike Peters',  phone:'084-333-3333', cash:10000, credit:5000},
    {name:'Lisa van Wyk', phone:'076-444-4444', cash:750,   credit:500},
    {name:'David Dlamini',phone:'071-555-5555', cash:15000, credit:3000},
  ];
  for (const cu of customers) {
    const id = uuidv4();
    db.prepare('INSERT OR IGNORE INTO wallets (id,name,phone,cash_balance,credit_limit,credit_used) VALUES (?,?,?,?,?,0)').run(id,cu.name,cu.phone,cu.cash,cu.credit);
    db.prepare('INSERT INTO transactions (id,wallet_id,type,payment_type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,0,?,?)').run(uuidv4(),id,'deposit','cash',cu.cash,cu.cash,'Opening deposit');
  }

  // ── Create meeting with N races starting at startH:00 ────────────
  function createMeeting(sportId, cc, courseName, daysAhead, startH, numRaces, raceNames=[]) {
    const courseId  = coId[courseName] || null;
    const countryId = cId[cc] || null;
    const dateStr   = futureDate(daysAhead);
    const meetKey   = `${courseId||'x'}__${dateStr}`;
    const ids = [];
    for (let r = 1; r <= numRaces; r++) {
      const id        = uuidv4();
      const totalMins = startH * 60 + (r-1) * 30;
      const h = Math.floor(totalMins/60) % 24, m = totalMins % 60;
      const timeStr   = raceTime(h, m);
      const name      = raceNames[r-1] || `Race ${r}`;
      db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,meeting_key,race_number,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sportId,countryId,courseId,meetKey,r,name,dateStr,timeStr,closesAt(dateStr,h,m),'open',adminId);
      ids.push(id);
    }
    return ids;
  }

  // ── Runner helper ─────────────────────────────────────────────────
  function runner(eid, num, name, jockey, trainer, weight, age, form, colour, win, place) {
    const id = uuidv4();
    db.prepare('INSERT INTO selections (id,event_id,barrier_number,name,jockey,trainer,weight,age,form,colour,win_odds,place_odds,opening_win_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,eid,num,name,jockey||null,trainer||null,weight||null,age||null,form||null,colour||null,win,place||null,win);
    // Add 2 historical prices
    const p1 = parseFloat((win*1.12).toFixed(2));
    const p2 = parseFloat((win*1.05).toFixed(2));
    const d1 = new Date(); d1.setHours(d1.getHours()-6);
    const d2 = new Date(); d2.setHours(d2.getHours()-3);
    db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price,changed_at) VALUES (?,?,?,?,?,?)').run(uuidv4(),id,'win',p1,p2,d1.toISOString());
    db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price,changed_at) VALUES (?,?,?,?,?,?)').run(uuidv4(),id,'win',p2,win,d2.toISOString());
  }

  function teamSel(eid, name, sub, odds) {
    db.prepare('INSERT INTO selections (id,event_id,name,sub_info,win_odds,opening_win_odds) VALUES (?,?,?,?,?,?)').run(uuidv4(),eid,name,sub||null,odds,odds);
  }

  function plainEvent(sportId, cc, name, daysAhead, h) {
    const d = futureDate(daysAhead), id = uuidv4();
    db.prepare('INSERT INTO events (id,sport_id,country_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,?,1)').run(id,sportId,cId[cc]||null,name,d,raceTime(h),closesAt(d,h-1,50),'open',adminId);
    return id;
  }

  // ── 🇿🇦 GREYVILLE — 5 races, day 7, starting 12:30 ──────────────
  {
    const ids = createMeeting('sport_hr','ZA','Greyville Racecourse',7,12,5,[
      'Race 1 — Maiden Plate',
      'Race 2 — Allow Handicap',
      'Race 3 — Vodacom Durban July',
      'Race 4 — Daily News 2000',
      'Race 5 — Closing Stakes',
    ]);
    // Race 1
    runner(ids[0],1,'Morning Star','C Orffer','A Marcus','56kg',3,'2-1-3','Bay',4.00,1.40);
    runner(ids[0],2,'Dawn Breaker','K Venter','J Snaith','55.5kg',3,'1-2-2','Chestnut',5.50,1.65);
    runner(ids[0],3,'First Light','G Lerena','M de Kock','55kg',3,'3-1-4','Grey',7.00,2.00);
    runner(ids[0],4,'Sunrise Glory','S Within','S Tarry','54.5kg',3,'2-3-1','Dark Bay',9.00,2.40);
    runner(ids[0],5,'Early Bird','P Strydom','A Laird','54kg',3,'4-2-3','Bay',14.00,3.20);
    // Race 2
    runner(ids[1],1,'Fast Track','G Lerena','M Azzie','58kg',4,'1-2-1','Bay',3.20,1.25);
    runner(ids[1],2,'Quick Step','S Within','J Snaith','57.5kg',4,'2-1-2','Chestnut',4.00,1.38);
    runner(ids[1],3,'Rapid Fire','P Strydom','S Tarry','57kg',5,'1-3-1','Grey',6.00,1.75);
    runner(ids[1],4,'Swift Arrow','W Kennedy','A Laird','56.5kg',4,'3-1-3','Dark Bay',8.50,2.20);
    runner(ids[1],5,'Speed Demon','C Orffer','NJ Kotzen','56kg',4,'2-2-4','Bay',11.00,2.70);
    runner(ids[1],6,'Jet Stream','K Venter','A Marcus','55.5kg',5,'4-1-2','Chestnut',16.00,3.80);
    // Race 3 — Main (Durban July)
    runner(ids[2],1,'Sparkling Water','S Within','J Snaith','60kg',5,'1-2-1-1','Bay',3.20,1.20);
    runner(ids[2],2,'Legal Eagle','G Lerena','M Azzie','58kg',4,'2-1-3-1','Chestnut',4.50,1.40);
    runner(ids[2],3,'Jet Dark','P Strydom','NJ Kotzen','57.5kg',5,'1-1-2-3','Black',6.00,1.80);
    runner(ids[2],4,'Rainbow Bridge','W Kennedy','A Laird','57kg',4,'3-2-1-2','Bay',7.00,2.00);
    runner(ids[2],5,'Cape Crusader','C Orffer','A Marcus','56.5kg',6,'4-1-2-1','Grey',9.00,2.40);
    runner(ids[2],6,'Golden Horn','K Venter','J Snaith','56kg',5,'2-3-1-4','Chestnut',12.00,3.00);
    runner(ids[2],7,'African Queen','L Hewitson','G Kotzen','55.5kg',4,'1-3-2-2','Bay',15.00,3.50);
    runner(ids[2],8,'Storm Chaser','R Fourie','S Tarry','55kg',7,'5-2-3-1','Dark Bay',20.00,4.50);
    // Race 4
    runner(ids[3],1,'Soqrat','G Lerena','M de Kock','59kg',4,'1-1-2-1','Bay',2.80,1.15);
    runner(ids[3],2,'Whisky Baron','S Within','J Snaith','58kg',5,'2-1-1-3','Chestnut',3.50,1.28);
    runner(ids[3],3,'Silver Bullet','P Strydom','A Marcus','57kg',4,'3-2-1-2','Grey',5.00,1.60);
    runner(ids[3],4,'Night Owl','W Kennedy','S Tarry','56kg',6,'1-4-2-1','Black',8.00,2.10);
    runner(ids[3],5,'Cape Magic','C Orffer','NJ Kotzen','55.5kg',4,'2-2-3-4','Bay',10.00,2.60);
    // Race 5
    runner(ids[4],1,'Bold Approach','C Orffer','A Marcus','59kg',5,'1-2-1-1','Bay',4.00,1.40);
    runner(ids[4],2,'Night Hawk','K Venter','J Snaith','58.5kg',4,'2-1-2-1','Chestnut',5.50,1.60);
    runner(ids[4],3,'Silver Sands','L Hewitson','M de Kock','58kg',5,'3-1-1-2','Grey',7.00,1.90);
    runner(ids[4],4,'Desert Wind','G Lerena','S Tarry','57.5kg',4,'1-3-2-1','Dark Bay',9.00,2.30);
    runner(ids[4],5,'Golden Mile','S Within','NJ Kotzen','56.5kg',4,'4-1-3-2','Chestnut',12.00,2.90);
  }

  // ── 🇿🇦 KENILWORTH — 5 races, day 8 ─────────────────────────────
  {
    const ids = createMeeting('sport_hr','ZA','Kenilworth Racecourse',8,13,5,[
      'Race 1 — Maiden','Race 2 — Allow Stakes','Race 3 — Cape Town Guineas',
      'Race 4 — WP Derby','Race 5 — Summer Cup',
    ]);
    runner(ids[0],1,'Cape Star','G Lerena','J Snaith','58kg',4,'1-2-1','Bay',3.00,1.20);
    runner(ids[0],2,'Ocean Breeze','S Within','M de Kock','57.5kg',4,'2-1-2','Chestnut',4.20,1.40);
    runner(ids[0],3,'Table Top','P Strydom','S Tarry','57kg',5,'1-3-1','Grey',6.00,1.75);
    runner(ids[0],4,'Mountain View','W Kennedy','A Laird','56.5kg',4,'3-1-3','Dark Bay',8.50,2.20);
    runner(ids[0],5,'Lion Rock','C Orffer','NJ Kotzen','56kg',4,'2-2-4','Bay',13.00,3.10);

    runner(ids[2],1,'Do It Again','G Lerena','J Snaith','59kg',5,'1-1-1-2','Bay',2.50,1.15);
    runner(ids[2],2,'Hawwaam','S Within','M Azzie','58.5kg',4,'2-1-1-1','Chestnut',3.20,1.25);
    runner(ids[2],3,'Vardy','P Strydom','S Tarry','57.5kg',5,'1-2-3-1','Dark Bay',5.50,1.70);
    runner(ids[2],4,'London News','W Kennedy','A Marcus','57kg',4,'3-1-2-2','Bay',7.00,2.00);
    runner(ids[2],5,'Smart Ruler','C Orffer','NJ Kotzen','56.5kg',5,'2-3-1-3','Grey',10.00,2.60);
    runner(ids[2],6,'Forest Edge','K Venter','A Laird','56kg',4,'4-2-2-1','Chestnut',18.00,4.00);

    for (let i of [1,3,4]) {
      runner(ids[i],1,'Western Cape','L Hewitson','M de Kock','59.5kg',5,'1-1-1-2','Bay',2.80,1.15);
      runner(ids[i],2,'Atlantic Storm','R Fourie','G Kotzen','59kg',4,'2-1-2-1','Chestnut',3.80,1.30);
      runner(ids[i],3,'Lion Head','G Lerena','J Snaith','58.5kg',5,'1-2-3-1','Dark Bay',5.50,1.65);
      runner(ids[i],4,'Signal Hill','K Venter','A Laird','58kg',4,'3-1-2-2','Bay',8.00,2.10);
      runner(ids[i],5,'Boulders','S Within','S Tarry','57.5kg',4,'2-3-1-3','Grey',14.00,3.30);
    }
  }

  // ── 🇬🇧 ASCOT — 5 races, day 9 ───────────────────────────────────
  {
    const ids = createMeeting('sport_hr','GB','Ascot Racecourse',9,14,5,['Race 1','Race 2','Royal Ascot Gold Cup','Queen Anne Stakes','Race 5']);
    runner(ids[2],1,'Stradivarius','F Dettori','J Gosden','91kg',7,'1-1-1-1','Bay',2.20,1.10);
    runner(ids[2],2,'Kyprios','R Moore',"A O'Brien",'90kg',5,'1-2-1-2','Chestnut',3.50,1.30);
    runner(ids[2],3,'Trueshan','H Bentley','A Balding','89.5kg',6,'2-1-3-1','Grey',5.00,1.60);
    runner(ids[2],4,'Nayef Road','J Fanning','M Johnston','89kg',6,'3-2-1-3','Bay',8.00,2.20);
    runner(ids[2],5,'Spanish Mission','D Tudhope','A Watson','88.5kg',7,'2-3-2-2','Dark Bay',12.00,3.00);
    for (let i of [0,1,3,4]) {
      runner(ids[i],1,'Windsor Castle','F Dettori','J Gosden','58kg',4,'1-1-2','Bay',3.00,1.20);
      runner(ids[i],2,'Royal Guard','R Moore',"A O'Brien",'57.5kg',4,'2-1-1','Chestnut',4.00,1.38);
      runner(ids[i],3,'Ascot Victor','W Buick','C Appleby','57kg',5,'1-2-3','Grey',6.00,1.75);
      runner(ids[i],4,'Palace Ace','J Crowley','W Haggas','56.5kg',4,'3-1-2','Dark Bay',9.00,2.30);
      runner(ids[i],5,'Crown Jewel','K Shoemark','R Hannon','56kg',4,'2-2-4','Bay',14.00,3.40);
    }
  }

  // ── 🇦🇺 FLEMINGTON — 5 races, day 10 ─────────────────────────────
  {
    const ids = createMeeting('sport_hr','AU','Flemington',10,12,5,['Race 1','Race 2','Race 3','Melbourne Cup','Race 5']);
    runner(ids[3],1,'Verry Elleegant','J McNeil','C Waller','57kg',6,'1-1-2-1','Bay',4.00,1.35);
    runner(ids[3],2,'Incentivise','B Melham','P Moody','57.5kg',7,'1-1-1-3','Chestnut',5.00,1.50);
    runner(ids[3],3,'Twilight Payment','J Orman','J Mullins','57kg',8,'2-1-1-2','Dark Bay',6.50,1.80);
    runner(ids[3],4,'Delphi','S Clipperton','G Portelli','56.5kg',5,'3-2-1-1','Grey',9.00,2.30);
    runner(ids[3],5,'Explosive Jack','T Berry','G Waterhouse','55kg',7,'4-2-1-3','Bay',18.00,4.00);
    for (let i of [0,1,2,4]) {
      runner(ids[i],1,'Flemington Star','J McNeil','C Waller','58kg',4,'1-2-1','Bay',3.50,1.30);
      runner(ids[i],2,'Melbourne Pride','B Melham','P Moody','57.5kg',4,'2-1-2','Chestnut',4.50,1.45);
      runner(ids[i],3,'Turf Master','D Lane','A Freedman','57kg',5,'1-3-1','Grey',6.00,1.75);
      runner(ids[i],4,'Golden Slipper','T Berry','G Waterhouse','56.5kg',4,'3-1-3','Dark Bay',9.00,2.35);
      runner(ids[i],5,'Spring Hero','J Allen','B Cole','56kg',4,'2-2-4','Bay',12.00,2.90);
    }
  }

  // ── ⚽ FOOTBALL ───────────────────────────────────────────────────
  {
    const eid = plainEvent('sport_fb','ZA','Kaizer Chiefs vs Orlando Pirates',7,15);
    teamSel(eid,'Kaizer Chiefs','Home Win',2.80); teamSel(eid,'Draw','Draw',3.10); teamSel(eid,'Orlando Pirates','Away Win',2.60);
  }
  {
    const eid = plainEvent('sport_fb','GB','Arsenal vs Manchester City',8,15);
    teamSel(eid,'Arsenal','Home Win',3.40); teamSel(eid,'Draw','Draw',3.20); teamSel(eid,'Manchester City','Away Win',2.10);
  }
  // 🏏 Cricket
  {
    const eid = plainEvent('sport_cr','ZA','South Africa vs England',9,9);
    teamSel(eid,'South Africa','Win',2.20); teamSel(eid,'Draw','Draw',3.00); teamSel(eid,'England','Win',3.40);
  }
  // 🏉 Rugby
  {
    const eid = plainEvent('sport_rb','ZA','Springboks vs All Blacks',10,17);
    teamSel(eid,'Springboks','Win',1.90); teamSel(eid,'Draw','Draw',18.00); teamSel(eid,'All Blacks','Win',1.95);
  }
  // 🎾 Tennis
  {
    const id = uuidv4(), d = futureDate(11);
    db.prepare('INSERT INTO events (id,sport_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,1)').run(id,'sport_tn','Djokovic vs Alcaraz',d,raceTime(14),closesAt(d,13,50),'open',adminId);
    teamSel(id,'Djokovic','',1.95); teamSel(id,'Alcaraz','',1.90);
  }
  // 🥊 Boxing
  {
    const id = uuidv4(), d = futureDate(14);
    db.prepare('INSERT INTO events (id,sport_id,event_name,event_date,event_time,closes_at,status,created_by,race_number) VALUES (?,?,?,?,?,?,?,?,1)').run(id,'sport_bx','Fury vs Usyk',d,raceTime(22),closesAt(d,21,50),'open',adminId);
    teamSel(id,'Fury','KO/TKO/Dec',2.10); teamSel(id,'Draw','Draw',16.00); teamSel(id,'Usyk','KO/TKO/Dec',1.80);
  }

  const cnt = {
    wallets:    db.prepare('SELECT COUNT(*) as c FROM wallets').get().c,
    events:     db.prepare('SELECT COUNT(*) as c FROM events').get().c,
    selections: db.prepare('SELECT COUNT(*) as c FROM selections').get().c,
  };
  console.log('Seed complete:', JSON.stringify(cnt));
}

runSeed();
module.exports = { runSeed };
if (require.main === module) process.exit(0);
