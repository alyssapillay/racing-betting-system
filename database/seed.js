'use strict';
const { getDb } = require('./db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = getDb();

// ── Guard: only seed if countries table is empty ───────────────
const existing = db.prepare('SELECT COUNT(*) as c FROM countries').get().c;
if (existing > 0) {
  console.log('Seed skipped — data already present.');
  if (require.main === module) process.exit(0);
  return;
}

console.log('🌱 Seeding demo data...');

// ── Helpers ────────────────────────────────────────────────────
function futureISO(hours, mins = 0) {
  const d = new Date();
  d.setHours(d.getHours() + hours, d.getMinutes() + mins, 0, 0);
  return d.toISOString();
}
function todayDate() { return new Date().toISOString().split('T')[0]; }
function padTime(h, m) { return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

// ── Countries ──────────────────────────────────────────────────
const countryRows = [
  { name:'South Africa',        code:'ZA', flag:'🇿🇦' },
  { name:'United Kingdom',      code:'GB', flag:'🇬🇧' },
  { name:'Australia',           code:'AU', flag:'🇦🇺' },
  { name:'United Arab Emirates',code:'AE', flag:'🇦🇪' },
  { name:'France',              code:'FR', flag:'🇫🇷' },
  { name:'United States',       code:'US', flag:'🇺🇸' },
];
const countryIds = {};
for (const c of countryRows) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,c.name,c.code,c.flag);
  countryIds[c.code] = db.prepare('SELECT id FROM countries WHERE code=?').get(c.code).id;
}

// ── Courses ────────────────────────────────────────────────────
const courseRows = [
  { country:'ZA', name:'Greyville Racecourse',    location:'Durban',          surface:'Turf' },
  { country:'ZA', name:'Kenilworth Racecourse',   location:'Cape Town',       surface:'Turf' },
  { country:'ZA', name:'Turffontein Racecourse',  location:'Johannesburg',    surface:'Turf' },
  { country:'ZA', name:'Fairview Racecourse',     location:'Port Elizabeth',  surface:'Turf' },
  { country:'GB', name:'Ascot Racecourse',        location:'Berkshire',       surface:'Turf' },
  { country:'GB', name:'Cheltenham Racecourse',   location:'Gloucestershire', surface:'Turf' },
  { country:'GB', name:'Newmarket Racecourse',    location:'Suffolk',         surface:'Turf' },
  { country:'AU', name:'Flemington Racecourse',   location:'Melbourne',       surface:'Turf' },
  { country:'AU', name:'Royal Randwick',          location:'Sydney',          surface:'Turf' },
  { country:'AE', name:'Meydan Racecourse',       location:'Dubai',           surface:'Dirt / Turf' },
  { country:'FR', name:'ParisLongchamp',          location:'Paris',           surface:'Turf' },
  { country:'US', name:'Churchill Downs',         location:'Louisville, KY',  surface:'Dirt' },
];
const courseIds = {};
for (const c of courseRows) {
  const id = uuidv4();
  db.prepare('INSERT OR IGNORE INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,countryIds[c.country],c.name,c.location,c.surface);
  courseIds[c.name] = db.prepare('SELECT id FROM courses WHERE name=?').get(c.name).id;
}

// ── Demo users ─────────────────────────────────────────────────
const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get().id;
const demoUsers = [
  { username:'john_punter',  email:'john@demo.com',  balance:5000  },
  { username:'sarah_jones',  email:'sarah@demo.com', balance:2500  },
  { username:'mike_bets',    email:'mike@demo.com',  balance:10000 },
  { username:'lisa_racing',  email:'lisa@demo.com',  balance:750   },
  { username:'david_win',    email:'david@demo.com', balance:15000 },
];
const hash = bcrypt.hashSync('Demo@1234', 10);
for (const u of demoUsers) {
  const uid = uuidv4();
  db.prepare('INSERT OR IGNORE INTO users (id,username,email,password_hash,role,wallet_balance) VALUES (?,?,?,?,?,?)').run(uid,u.username,u.email,hash,'punter',u.balance);
  const realId = db.prepare('SELECT id FROM users WHERE email=?').get(u.email).id;
  const hasTxn = db.prepare('SELECT id FROM transactions WHERE user_id=? LIMIT 1').get(realId);
  if (!hasTxn && u.balance > 0) {
    db.prepare('INSERT INTO transactions (id,user_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,0,?,?)').run(uuidv4(),realId,'deposit',u.balance,u.balance,'Initial allocation');
  }
}

// ── Meeting + race + horses helpers ───────────────────────────
function meeting(courseName, time) {
  const id = uuidv4();
  db.prepare('INSERT INTO race_meetings (id,course_id,meeting_date,meeting_time,status,created_by) VALUES (?,?,?,?,?,?)').run(id,courseIds[courseName],todayDate(),time,'upcoming',adminId);
  return id;
}
function race(mid, num, name, dist, cls, prize, closesAt) {
  const id = uuidv4();
  db.prepare('INSERT INTO races (id,meeting_id,race_number,race_name,distance,race_class,prize_money,closes_at,status) VALUES (?,?,?,?,?,?,?,?,?)').run(id,mid,num,name,dist,cls,prize,closesAt,'open');
  return id;
}
function horse(rid, num, name, jockey, trainer, weight, age, form, colour, odds) {
  db.prepare('INSERT INTO horses (id,race_id,horse_name,barrier_number,jockey,trainer,weight,age,form,colour,odds) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(uuidv4(),rid,name,num,jockey,trainer,weight,age,form,colour,odds);
}

// ── 🇿🇦 GREYVILLE ──────────────────────────────────────────────
{
  const mid = meeting('Greyville Racecourse', padTime(13,30));
  const r1 = race(mid,1,'Vodacom Durban July','2200m','Grade 1','R5,000,000',futureISO(1));
  horse(r1,1,'Sparkling Water','S Within','J Snaith','60kg',5,'1-2-1-1','Bay',3.20);
  horse(r1,2,'Legal Eagle','G Lerena','M Azzie','58kg',4,'2-1-3-1','Chestnut',4.50);
  horse(r1,3,'Jet Dark','P Strydom','NJ Kotzen','57.5kg',5,'1-1-2-3','Black',6.00);
  horse(r1,4,'Rainbow Bridge','W Kennedy','A Laird','57kg',4,'3-2-1-2','Bay',7.00);
  horse(r1,5,'Cape Crusader','C Orffer','A Marcus','56.5kg',6,'4-1-2-1','Grey',9.00);
  horse(r1,6,'Golden Horn','K Venter','J Snaith','56kg',5,'2-3-1-4','Chestnut',12.00);
  horse(r1,7,'African Queen','L Hewitson','G Kotzen','55.5kg',4,'1-3-2-2','Bay',15.00);
  horse(r1,8,'Storm Chaser','R Fourie','S Tarry','55kg',7,'5-2-3-1','Dark Bay',20.00);

  const r2 = race(mid,2,'Daily News 2000','2000m','Grade 2','R1,000,000',futureISO(2));
  horse(r2,1,'Soqrat','G Lerena','M de Kock','59kg',4,'1-1-2-1','Bay',2.80);
  horse(r2,2,'Whisky Baron','S Within','J Snaith','58kg',5,'2-1-1-3','Chestnut',3.50);
  horse(r2,3,'Silver Bullet','P Strydom','A Marcus','57kg',4,'3-2-1-2','Grey',5.00);
  horse(r2,4,'Night Owl','W Kennedy','S Tarry','56kg',6,'1-4-2-1','Black',8.00);
  horse(r2,5,'Cape Magic','C Orffer','NJ Kotzen','55.5kg',4,'2-2-3-4','Bay',10.00);
  horse(r2,6,'Flying Dutchman','K Venter','A Laird','55kg',5,'4-3-1-2','Chestnut',14.00);

  const r3 = race(mid,3,'Merchants Stakes','1600m','Grade 3','R500,000',futureISO(3));
  horse(r3,1,'Pathfinder','L Hewitson','M de Kock','58kg',3,'1-2-1','Bay',3.00);
  horse(r3,2,'Bright Future','G Lerena','G Kotzen','57.5kg',3,'2-1-1','Chestnut',4.00);
  horse(r3,3,'Sun Dancer','R Fourie','J Snaith','57kg',3,'1-3-2','Bay',6.00);
  horse(r3,4,'Lemon Drop','S Within','A Marcus','56.5kg',3,'3-1-3','Grey',8.00);
  horse(r3,5,'Coral Reef','P Strydom','S Tarry','56kg',3,'2-2-4','Chestnut',11.00);
  horse(r3,6,'Thunder Road','W Kennedy','NJ Kotzen','55.5kg',4,'4-1-2','Dark Bay',16.00);
}

// ── 🇿🇦 KENILWORTH ────────────────────────────────────────────
{
  const mid = meeting('Kenilworth Racecourse', padTime(14,0));
  const r1 = race(mid,1,'Cape Town Guineas','1600m','Grade 1','R750,000',futureISO(2,30));
  horse(r1,1,'Do It Again','G Lerena','J Snaith','59kg',5,'1-1-1-2','Bay',2.50);
  horse(r1,2,'Hawwaam','S Within','M Azzie','58.5kg',4,'2-1-1-1','Chestnut',3.20);
  horse(r1,3,'Vardy','P Strydom','S Tarry','57.5kg',5,'1-2-3-1','Dark Bay',5.50);
  horse(r1,4,'London News','W Kennedy','A Marcus','57kg',4,'3-1-2-2','Bay',7.00);
  horse(r1,5,'Smart Ruler','C Orffer','NJ Kotzen','56.5kg',5,'2-3-1-3','Grey',10.00);
  horse(r1,6,'Forest Edge','K Venter','A Laird','56kg',4,'4-2-2-1','Chestnut',18.00);
}

// ── 🇬🇧 ASCOT ─────────────────────────────────────────────────
{
  const mid = meeting('Ascot Racecourse', padTime(14,30));
  const r1 = race(mid,1,'Royal Ascot Gold Cup','4023m','Group 1','£750,000',futureISO(3));
  horse(r1,1,'Stradivarius','F Dettori','J Gosden','91kg',7,'1-1-1-1','Bay',2.20);
  horse(r1,2,'Kyprios','R Moore','A O\'Brien','90kg',5,'1-2-1-2','Chestnut',3.50);
  horse(r1,3,'Trueshan','H Bentley','A Balding','89.5kg',6,'2-1-3-1','Grey',5.00);
  horse(r1,4,'Nayef Road','J Fanning','M Johnston','89kg',6,'3-2-1-3','Bay',8.00);
  horse(r1,5,'Spanish Mission','D Tudhope','A Watson','88.5kg',7,'2-3-2-2','Dark Bay',12.00);
  horse(r1,6,'Princess Zoe','C Soumillon','T Rohaut','88kg',7,'1-4-3-1','Bay',20.00);

  const r2 = race(mid,2,'Queen Anne Stakes','1609m','Group 1','£600,000',futureISO(4));
  horse(r2,1,'Palace Pier','F Dettori','J Gosden','90kg',5,'1-1-2-1','Bay',2.00);
  horse(r2,2,'Baaeed','J Crowley','W Haggas','89.5kg',4,'1-1-1-1','Chestnut',2.80);
  horse(r2,3,'Chindit','R Kingscote','R Hannon','89kg',5,'2-1-3-2','Grey',6.00);
  horse(r2,4,'Real World','W Buick','C Appleby','88.5kg',4,'3-2-1-3','Bay',9.00);
  horse(r2,5,'Eldrickjones','S De Sousa','A Balding','88kg',5,'1-3-2-4','Dark Bay',14.00);
}

// ── 🇦🇺 FLEMINGTON ────────────────────────────────────────────
{
  const mid = meeting('Flemington Racecourse', padTime(12,0));
  const r1 = race(mid,1,'Melbourne Cup','3200m','Group 1','AUD $8,000,000',futureISO(4,15));
  horse(r1,1,'Verry Elleegant','J McNeil','C Waller','57kg',6,'1-1-2-1','Bay',4.00);
  horse(r1,2,'Incentivise','B Melham','P Moody','57.5kg',7,'1-1-1-3','Chestnut',5.00);
  horse(r1,3,'Twilight Payment','J Orman','J Mullins','57kg',8,'2-1-1-2','Dark Bay',6.50);
  horse(r1,4,'Delphi','S Clipperton','G Portelli','56.5kg',5,'3-2-1-1','Grey',9.00);
  horse(r1,5,'Emissary','D Lane','C Waller','56kg',6,'2-3-2-1','Bay',11.00);
  horse(r1,6,'Floating Artist','M Dee','M Price','55.5kg',5,'1-4-3-2','Chestnut',15.00);
  horse(r1,7,'Explosive Jack','T Berry','G Waterhouse','55kg',7,'4-2-1-3','Bay',18.00);
  horse(r1,8,'Grand Promenade','J Allen','B Cole','54kg',5,'5-2-3-1','Bay',30.00);
}

// ── 🇦🇪 MEYDAN ─────────────────────────────────────────────────
{
  const mid = meeting('Meydan Racecourse', padTime(20,0));
  const r1 = race(mid,1,'Dubai World Cup','2000m','Group 1','USD $12,000,000',futureISO(5));
  horse(r1,1,'Country Grammer','F Prat','B Baffert','58kg',5,'1-1-2-1','Bay',3.50);
  horse(r1,2,'Mishriff','D Egan','J Gosden','58kg',5,'2-1-1-2','Chestnut',4.00);
  horse(r1,3,'Charlatan','J Velazquez','B Baffert','57.5kg',5,'1-2-3-1','Dark Bay',5.50);
  horse(r1,4,'Life Is Good','I Ortiz Jr','T Pletcher','57kg',4,'1-1-2-3','Bay',6.00);
  horse(r1,5,'Maximum Security','L Saez','B Cox','56.5kg',6,'2-3-1-2','Chestnut',9.00);
  horse(r1,6,'Gifts Of Gold','C Soumillon','N Camacho','55.5kg',5,'4-1-3-2','Grey',20.00);
}

// ── 🇫🇷 PARISLONGCHAMP ────────────────────────────────────────
{
  const mid = meeting('ParisLongchamp', padTime(15,0));
  const r1 = race(mid,1,'Prix de l\'Arc de Triomphe','2400m','Group 1','€5,000,000',futureISO(6,30));
  horse(r1,1,'Alpinista','F Minarik','Sir M Prescott','58kg',5,'1-1-1-1','Bay',3.20);
  horse(r1,2,'Torquator Tasso','A Starke','M Weiss','57.5kg',5,'2-1-2-1','Chestnut',4.50);
  horse(r1,3,'Snowfall','R Moore','A O\'Brien','57kg',4,'1-2-1-2','Grey',5.50);
  horse(r1,4,'Vadeni','C Demuro','JC Rouget','56.5kg',4,'3-1-2-1','Dark Bay',7.00);
  horse(r1,5,'Ace Impact','C Soumillon','JC Rouget','55.5kg',3,'1-1-2','Chestnut',13.00);
}

// ── 🇺🇸 CHURCHILL DOWNS ───────────────────────────────────────
{
  const mid = meeting('Churchill Downs', padTime(17,0));
  const r1 = race(mid,1,'Kentucky Derby','2012m','Grade 1','USD $3,000,000',futureISO(7));
  horse(r1,1,'Rich Strike','S Leon','E Reed','57kg',3,'4-1-1-1','Chestnut',80.00);
  horse(r1,2,'Epicenter','J Velazquez','S Asmussen','57kg',3,'2-1-1-2','Bay',4.00);
  horse(r1,3,'Simplification','J Ortiz','A Avila','57kg',3,'1-2-3-1','Dark Bay',6.00);
  horse(r1,4,'Zandon','T Gaffalione','C McGaughey','57kg',3,'3-1-2-3','Grey',7.00);
  horse(r1,5,'Mo Donegal','I Ortiz Jr','T Pletcher','57kg',3,'1-3-1-2','Bay',9.00);
  horse(r1,6,'Messier','J Rosario','B Baffert','57kg',3,'2-2-1-3','Chestnut',10.00);
  horse(r1,7,'Cyberknife','F Prat','B Cox','57kg',3,'2-3-2-1','Dark Bay',17.00);
}

console.log('✅ Demo data seeded — 6 countries, 12 courses, 7 meetings, 40+ horses');
console.log('   Demo password: Demo@1234');

if (require.main === module) process.exit(0);
