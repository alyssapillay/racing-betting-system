'use strict';
const { getDb } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const db = getDb();

const existing = db.prepare('SELECT COUNT(*) as c FROM countries').get().c;
if (existing > 0) {
  console.log('Seed skipped — data present');
  if (require.main === module) process.exit(0);
  return;
}

console.log('Seeding demo data...');

const adminId = db.prepare("SELECT id FROM operators WHERE role='super_admin' LIMIT 1").get().id;
function futureISO(h, m=0) { const d=new Date(); d.setHours(d.getHours()+h,d.getMinutes()+m,0,0); return d.toISOString(); }
function todayDate() { return new Date().toISOString().split('T')[0]; }
function padT(h,m){ return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

// ── Countries ──────────────────────────────────────────────────
const countries = [
  { name:'South Africa',code:'ZA',flag:'🇿🇦' },
  { name:'United Kingdom',code:'GB',flag:'🇬🇧' },
  { name:'Australia',code:'AU',flag:'🇦🇺' },
  { name:'UAE',code:'AE',flag:'🇦🇪' },
  { name:'France',code:'FR',flag:'🇫🇷' },
  { name:'United States',code:'US',flag:'🇺🇸' },
];
const cId = {};
for (const c of countries) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,c.name,c.code,c.flag);
  cId[c.code] = db.prepare('SELECT id FROM countries WHERE code=?').get(c.code).id;
}

// ── Courses ────────────────────────────────────────────────────
const courses = [
  {c:'ZA',name:'Greyville Racecourse',   loc:'Durban',        surf:'Turf'},
  {c:'ZA',name:'Kenilworth Racecourse',  loc:'Cape Town',     surf:'Turf'},
  {c:'ZA',name:'Turffontein',            loc:'Johannesburg',  surf:'Turf'},
  {c:'GB',name:'Ascot Racecourse',       loc:'Berkshire',     surf:'Turf'},
  {c:'GB',name:'Cheltenham',             loc:'Gloucestershire',surf:'Turf'},
  {c:'AU',name:'Flemington',             loc:'Melbourne',     surf:'Turf'},
  {c:'AE',name:'Meydan Racecourse',      loc:'Dubai',         surf:'Dirt/Turf'},
  {c:'FR',name:'ParisLongchamp',         loc:'Paris',         surf:'Turf'},
  {c:'US',name:'Churchill Downs',        loc:'Louisville,KY', surf:'Dirt'},
];
const coId = {};
for (const c of courses) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,cId[c.c],c.name,c.loc,c.surf);
  coId[c.name] = db.prepare('SELECT id FROM courses WHERE name=?').get(c.name).id;
}

// ── Wallets (customers) ────────────────────────────────────────
const walletData = [
  {name:'John Smith',    phone:'082-111-1111', balance:5000},
  {name:'Sarah Johnson', phone:'083-222-2222', balance:2500},
  {name:'Mike Peters',   phone:'084-333-3333', balance:10000},
  {name:'Lisa van Wyk',  phone:'076-444-4444', balance:750},
  {name:'David Dlamini', phone:'071-555-5555', balance:15000},
  {name:'Themba Nkosi',  phone:'079-666-6666', balance:3000},
  {name:'Cash Wallet',   phone:null,           balance:500},
];
for (const w of walletData) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO wallets (id,name,phone,balance) VALUES (?,?,?,?)').run(id,w.name,w.phone,w.balance);
  const realId = db.prepare('SELECT id FROM wallets WHERE name=?').get(w.name).id;
  if (w.balance > 0) db.prepare('INSERT INTO transactions (id,wallet_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,0,?,?)').run(uuidv4(),realId,'deposit',w.balance,w.balance,'Initial deposit');
}

// ── Bookmaker operator ─────────────────────────────────────────
const bkHash = bcrypt.hashSync('Bookmaker@123', 10);
db.prepare('INSERT OR IGNORE INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(),'bookmaker1','bookmaker@racingbet.com',bkHash,'bookmaker');

// ── Event helpers ──────────────────────────────────────────────
function event(sportId, countryCode, courseName, name, date, time, closesAt) {
  const id = uuidv4();
  db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,sportId,cId[countryCode]||null,courseName?coId[courseName]:null,name,date,time,closesAt,'open',adminId);
  return id;
}
function sel(eid, num, name, sub, jockey, trainer, weight, age, form, colour, odds) {
  db.prepare('INSERT INTO selections (id,event_id,barrier_number,name,sub_info,jockey,trainer,weight,age,form,colour,odds,opening_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(),eid,num,name,sub,jockey,trainer,weight,age,form,colour,odds,odds);
}
function teamSel(eid, name, subInfo, odds) {
  db.prepare('INSERT INTO selections (id,event_id,name,sub_info,odds,opening_odds) VALUES (?,?,?,?,?,?)').run(uuidv4(),eid,name,subInfo,odds,odds);
}

// ── 🏇 HORSE RACING ────────────────────────────────────────────
const hrId = 'sport_hr';
{
  const eid = event(hrId,'ZA','Greyville Racecourse','Vodacom Durban July',todayDate(),padT(13,30),futureISO(1));
  sel(eid,1,'Sparkling Water',null,'S Within','J Snaith','60kg',5,'1-2-1-1','Bay',3.20);
  sel(eid,2,'Legal Eagle',null,'G Lerena','M Azzie','58kg',4,'2-1-3-1','Chestnut',4.50);
  sel(eid,3,'Jet Dark',null,'P Strydom','NJ Kotzen','57.5kg',5,'1-1-2-3','Black',6.00);
  sel(eid,4,'Rainbow Bridge',null,'W Kennedy','A Laird','57kg',4,'3-2-1-2','Bay',7.00);
  sel(eid,5,'Cape Crusader',null,'C Orffer','A Marcus','56.5kg',6,'4-1-2-1','Grey',9.00);
  sel(eid,6,'Golden Horn',null,'K Venter','J Snaith','56kg',5,'2-3-1-4','Chestnut',12.00);
  sel(eid,7,'African Queen',null,'L Hewitson','G Kotzen','55.5kg',4,'1-3-2-2','Bay',15.00);
  sel(eid,8,'Storm Chaser',null,'R Fourie','S Tarry','55kg',7,'5-2-3-1','Dark Bay',20.00);
}
{
  const eid = event(hrId,'ZA','Kenilworth Racecourse','Cape Town Guineas',todayDate(),padT(14,0),futureISO(2,30));
  sel(eid,1,'Do It Again',null,'G Lerena','J Snaith','59kg',5,'1-1-1-2','Bay',2.50);
  sel(eid,2,'Hawwaam',null,'S Within','M Azzie','58.5kg',4,'2-1-1-1','Chestnut',3.20);
  sel(eid,3,'Vardy',null,'P Strydom','S Tarry','57.5kg',5,'1-2-3-1','Dark Bay',5.50);
  sel(eid,4,'London News',null,'W Kennedy','A Marcus','57kg',4,'3-1-2-2','Bay',7.00);
  sel(eid,5,'Smart Ruler',null,'C Orffer','NJ Kotzen','56.5kg',5,'2-3-1-3','Grey',10.00);
  sel(eid,6,'Forest Edge',null,'K Venter','A Laird','56kg',4,'4-2-2-1','Chestnut',18.00);
}
{
  const eid = event(hrId,'GB','Ascot Racecourse','Royal Ascot Gold Cup',todayDate(),padT(14,30),futureISO(3));
  sel(eid,1,'Stradivarius',null,'F Dettori','J Gosden','91kg',7,'1-1-1-1','Bay',2.20);
  sel(eid,2,'Kyprios',null,'R Moore','A O\'Brien','90kg',5,'1-2-1-2','Chestnut',3.50);
  sel(eid,3,'Trueshan',null,'H Bentley','A Balding','89.5kg',6,'2-1-3-1','Grey',5.00);
  sel(eid,4,'Nayef Road',null,'J Fanning','M Johnston','89kg',6,'3-2-1-3','Bay',8.00);
  sel(eid,5,'Spanish Mission',null,'D Tudhope','A Watson','88.5kg',7,'2-3-2-2','Dark Bay',12.00);
}
{
  const eid = event(hrId,'AU','Flemington','Melbourne Cup',todayDate(),padT(12,0),futureISO(4,15));
  sel(eid,1,'Verry Elleegant',null,'J McNeil','C Waller','57kg',6,'1-1-2-1','Bay',4.00);
  sel(eid,2,'Incentivise',null,'B Melham','P Moody','57.5kg',7,'1-1-1-3','Chestnut',5.00);
  sel(eid,3,'Twilight Payment',null,'J Orman','J Mullins','57kg',8,'2-1-1-2','Dark Bay',6.50);
  sel(eid,4,'Delphi',null,'S Clipperton','G Portelli','56.5kg',5,'3-2-1-1','Grey',9.00);
  sel(eid,5,'Explosive Jack',null,'T Berry','G Waterhouse','55kg',7,'4-2-1-3','Bay',18.00);
}
{
  const eid = event(hrId,'AE','Meydan Racecourse','Dubai World Cup',todayDate(),padT(20,0),futureISO(5));
  sel(eid,1,'Country Grammer',null,'F Prat','B Baffert','58kg',5,'1-1-2-1','Bay',3.50);
  sel(eid,2,'Mishriff',null,'D Egan','J Gosden','58kg',5,'2-1-1-2','Chestnut',4.00);
  sel(eid,3,'Charlatan',null,'J Velazquez','B Baffert','57.5kg',5,'1-2-3-1','Dark Bay',5.50);
  sel(eid,4,'Life Is Good',null,'I Ortiz Jr','T Pletcher','57kg',4,'1-1-2-3','Bay',6.00);
  sel(eid,5,'Maximum Security',null,'L Saez','B Cox','56.5kg',6,'2-3-1-2','Chestnut',9.00);
}

// ── ⚽ FOOTBALL ────────────────────────────────────────────────
const fbId = 'sport_fb';
{
  const eid = event(fbId,'GB',null,'Arsenal vs Manchester City',todayDate(),padT(15,0),futureISO(2));
  teamSel(eid,'Arsenal','Home Win',3.40);
  teamSel(eid,'Draw','Draw',3.20);
  teamSel(eid,'Manchester City','Away Win',2.10);
}
{
  const eid = event(fbId,'ZA',null,'Kaizer Chiefs vs Orlando Pirates',todayDate(),padT(15,30),futureISO(3));
  teamSel(eid,'Kaizer Chiefs','Home Win',2.80);
  teamSel(eid,'Draw','Draw',3.10);
  teamSel(eid,'Orlando Pirates','Away Win',2.60);
}
{
  const eid = event(fbId,'FR',null,'PSG vs Lyon',todayDate(),padT(20,45),futureISO(6));
  teamSel(eid,'PSG','Home Win',1.60);
  teamSel(eid,'Draw','Draw',3.75);
  teamSel(eid,'Lyon','Away Win',5.50);
}

// ── 🏏 CRICKET ─────────────────────────────────────────────────
const crId = 'sport_cr';
{
  const eid = event(crId,'ZA',null,'SA vs England — 1st Test',todayDate(),padT(9,0),futureISO(4));
  teamSel(eid,'South Africa','Win',2.20);
  teamSel(eid,'Draw','Draw',3.00);
  teamSel(eid,'England','Win',3.40);
}
{
  const eid = event(crId,'AU',null,'Australia vs India — T20',todayDate(),padT(14,0),futureISO(5));
  teamSel(eid,'Australia','Win',1.85);
  teamSel(eid,'India','Win',2.00);
}

// ── 🏉 RUGBY ───────────────────────────────────────────────────
const rbId = 'sport_rb';
{
  const eid = event(rbId,'ZA',null,'Springboks vs All Blacks',todayDate(),padT(17,0),futureISO(4));
  teamSel(eid,'Springboks','Win',1.90);
  teamSel(eid,'Draw','Draw',18.00);
  teamSel(eid,'All Blacks','Win',1.95);
}
{
  const eid = event(rbId,'ZA',null,'Bulls vs Lions — URC',todayDate(),padT(14,0),futureISO(3));
  teamSel(eid,'Bulls','Win',1.75);
  teamSel(eid,'Draw','Draw',15.00);
  teamSel(eid,'Lions','Win',2.10);
}

// ── 🎾 TENNIS ──────────────────────────────────────────────────
const tnId = 'sport_tn';
{
  const eid = event(tnId,null,null,'Djokovic vs Alcaraz — Wimbledon Final',todayDate(),padT(14,0),futureISO(5));
  teamSel(eid,'Djokovic','',1.95);
  teamSel(eid,'Alcaraz','',1.90);
}

// ── 🥊 BOXING ──────────────────────────────────────────────────
const bxId = 'sport_bx';
{
  const eid = event(bxId,null,null,'Fury vs Usyk — Heavyweight',todayDate(),padT(22,0),futureISO(7));
  teamSel(eid,'Fury','KO/TKO/Dec',2.10);
  teamSel(eid,'Draw','Draw',16.00);
  teamSel(eid,'Usyk','KO/TKO/Dec',1.80);
}

console.log('Demo data seeded! Wallets, sports, events all ready.');
if (require.main === module) process.exit(0);
