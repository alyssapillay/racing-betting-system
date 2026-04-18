'use strict';
const { getDb } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const db = getDb();

const existing = db.prepare('SELECT COUNT(*) as c FROM countries').get().c;
if (existing > 0) { console.log('Seed skipped'); if (require.main===module) process.exit(0); return; }

console.log('Seeding...');
const adminId = db.prepare("SELECT id FROM operators WHERE role='super_admin' LIMIT 1").get().id;

function daysFromNow(d,h=0,m=0) { const dt=new Date(); dt.setDate(dt.getDate()+d); dt.setHours(h,m,0,0); return dt; }
function eDate(d)       { return daysFromNow(d).toISOString().split('T')[0]; }
function eTime(h,m)     { return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
function closesAt(d,h,m){ const dt=daysFromNow(d,h,m); dt.setMinutes(dt.getMinutes()-30); return dt.toISOString(); }

// Countries
const cRows = [
  {name:'South Africa',code:'ZA',flag:'🇿🇦'},{name:'United Kingdom',code:'GB',flag:'🇬🇧'},
  {name:'Australia',code:'AU',flag:'🇦🇺'},{name:'UAE',code:'AE',flag:'🇦🇪'},
  {name:'France',code:'FR',flag:'🇫🇷'},{name:'United States',code:'US',flag:'🇺🇸'},
];
const cId={};
for (const c of cRows) {
  const id=uuidv4();
  db.prepare('INSERT OR IGNORE INTO countries (id,name,code,flag) VALUES (?,?,?,?)').run(id,c.name,c.code,c.flag);
  cId[c.code]=db.prepare('SELECT id FROM countries WHERE code=?').get(c.code).id;
}

// Courses
const courseRows = [
  {c:'ZA',name:'Greyville Racecourse',loc:'Durban',surf:'Turf'},
  {c:'ZA',name:'Kenilworth Racecourse',loc:'Cape Town',surf:'Turf'},
  {c:'ZA',name:'Turffontein',loc:'Johannesburg',surf:'Turf'},
  {c:'GB',name:'Ascot Racecourse',loc:'Berkshire',surf:'Turf'},
  {c:'AU',name:'Flemington',loc:'Melbourne',surf:'Turf'},
  {c:'AE',name:'Meydan Racecourse',loc:'Dubai',surf:'Dirt/Turf'},
  {c:'FR',name:'ParisLongchamp',loc:'Paris',surf:'Turf'},
  {c:'US',name:'Churchill Downs',loc:'Louisville,KY',surf:'Dirt'},
];
const coId={};
for (const c of courseRows) {
  const id=uuidv4();
  db.prepare('INSERT OR IGNORE INTO courses (id,country_id,name,location,surface) VALUES (?,?,?,?,?)').run(id,cId[c.c],c.name,c.loc,c.surf);
  coId[c.name]=db.prepare('SELECT id FROM courses WHERE name=?').get(c.name).id;
}

// Wallets — each customer gets CASH + CREDIT wallet
const customers = [
  {name:'John Smith',   phone:'082-111-1111', cash:5000,  credit:2000},
  {name:'Sarah Johnson',phone:'083-222-2222', cash:2500,  credit:1000},
  {name:'Mike Peters',  phone:'084-333-3333', cash:10000, credit:5000},
  {name:'Lisa van Wyk', phone:'076-444-4444', cash:750,   credit:500 },
  {name:'David Dlamini',phone:'071-555-5555', cash:15000, credit:3000},
  {name:'Themba Nkosi', phone:'079-666-6666', cash:3000,  credit:1500},
];
const bkHash = bcrypt.hashSync('Bookmaker@123',10);
db.prepare('INSERT OR IGNORE INTO operators (id,username,email,password_hash,role) VALUES (?,?,?,?,?)').run(uuidv4(),'bookmaker1','bookmaker@racingbet.com',bkHash,'bookmaker');

for (const cu of customers) {
  // Cash wallet
  const cashId=uuidv4();
  db.prepare('INSERT OR IGNORE INTO wallets (id,name,phone,wallet_type,balance,credit_limit) VALUES (?,?,?,?,?,0)').run(cashId,cu.name,cu.phone,'cash',cu.cash);
  db.prepare('INSERT INTO transactions (id,wallet_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,0,?,?)').run(uuidv4(),cashId,'deposit',cu.cash,cu.cash,'Initial cash deposit');
  // Credit wallet
  const credId=uuidv4();
  db.prepare('INSERT OR IGNORE INTO wallets (id,name,phone,wallet_type,balance,credit_limit) VALUES (?,?,?,?,?,?)').run(credId,cu.name+' (Credit)',cu.phone,'credit',0,cu.credit);
}

// Event helpers
function mkEvent(sportId,cc,courseName,name,days,h,m) {
  const id=uuidv4();
  db.prepare('INSERT INTO events (id,sport_id,country_id,course_id,event_name,event_date,event_time,closes_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id,sportId,cId[cc]||null,courseName?coId[courseName]:null,name,eDate(days),eTime(h,m),closesAt(days,h,m),'open',adminId);
  return id;
}

function sel(eid,num,name,sub,jockey,trainer,weight,age,form,colour,winOdds,placeOdds) {
  const id=uuidv4();
  db.prepare('INSERT INTO selections (id,event_id,barrier_number,name,sub_info,jockey,trainer,weight,age,form,colour,win_odds,place_odds,opening_win_odds) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,eid,num,name,sub,jockey,trainer,weight,age,form,colour,winOdds,placeOdds||null,winOdds);
  // Seed some fake price history so UI has data to show
  const prices = generateFakePriceHistory(winOdds);
  for (const p of prices) {
    db.prepare('INSERT INTO selection_price_history (id,selection_id,price_type,old_price,new_price,changed_at) VALUES (?,?,?,?,?,?)').run(uuidv4(),id,'win',p.old,p.new,p.at);
  }
}

function generateFakePriceHistory(currentOdds) {
  // Generate up to 3 realistic prior prices
  const history=[];
  let price = parseFloat((currentOdds * (0.85 + Math.random()*0.3)).toFixed(2));
  for (let i=3; i>=1; i--) {
    const nextPrice = i===1 ? currentOdds : parseFloat((price*(0.9+Math.random()*0.2)).toFixed(2));
    const dt = new Date(); dt.setHours(dt.getHours()-i*2);
    history.push({old:price, new:nextPrice, at:dt.toISOString()});
    price = nextPrice;
  }
  return history;
}

function teamSel(eid,name,sub,winOdds) {
  const id=uuidv4();
  db.prepare('INSERT INTO selections (id,event_id,name,sub_info,win_odds,opening_win_odds) VALUES (?,?,?,?,?,?)').run(id,eid,name,sub,winOdds,winOdds);
}

// 🏇 HORSE RACING
{
  const eid=mkEvent('sport_hr','ZA','Greyville Racecourse','Vodacom Durban July',7,13,30);
  sel(eid,1,'Sparkling Water','','S Within','J Snaith','60kg',5,'1-2-1-1','Bay',3.20,1.20);
  sel(eid,2,'Legal Eagle','','G Lerena','M Azzie','58kg',4,'2-1-3-1','Chestnut',4.50,1.40);
  sel(eid,3,'Jet Dark','','P Strydom','NJ Kotzen','57.5kg',5,'1-1-2-3','Black',6.00,1.80);
  sel(eid,4,'Rainbow Bridge','','W Kennedy','A Laird','57kg',4,'3-2-1-2','Bay',7.00,2.00);
  sel(eid,5,'Cape Crusader','','C Orffer','A Marcus','56.5kg',6,'4-1-2-1','Grey',9.00,2.40);
  sel(eid,6,'Golden Horn','','K Venter','J Snaith','56kg',5,'2-3-1-4','Chestnut',12.00,3.00);
  sel(eid,7,'African Queen','','L Hewitson','G Kotzen','55.5kg',4,'1-3-2-2','Bay',15.00,3.50);
  sel(eid,8,'Storm Chaser','','R Fourie','S Tarry','55kg',7,'5-2-3-1','Dark Bay',20.00,4.50);
}
{
  const eid=mkEvent('sport_hr','ZA','Kenilworth Racecourse','Cape Town Guineas',8,14,0);
  sel(eid,1,'Do It Again','','G Lerena','J Snaith','59kg',5,'1-1-1-2','Bay',2.50,1.15);
  sel(eid,2,'Hawwaam','','S Within','M Azzie','58.5kg',4,'2-1-1-1','Chestnut',3.20,1.25);
  sel(eid,3,'Vardy','','P Strydom','S Tarry','57.5kg',5,'1-2-3-1','Dark Bay',5.50,1.70);
  sel(eid,4,'London News','','W Kennedy','A Marcus','57kg',4,'3-1-2-2','Bay',7.00,2.00);
  sel(eid,5,'Smart Ruler','','C Orffer','NJ Kotzen','56.5kg',5,'2-3-1-3','Grey',10.00,2.60);
  sel(eid,6,'Forest Edge','','K Venter','A Laird','56kg',4,'4-2-2-1','Chestnut',18.00,4.00);
}
{
  const eid=mkEvent('sport_hr','GB','Ascot Racecourse','Royal Ascot Gold Cup',9,14,30);
  sel(eid,1,'Stradivarius','','F Dettori','J Gosden','91kg',7,'1-1-1-1','Bay',2.20,1.10);
  sel(eid,2,'Kyprios','','R Moore',"A O'Brien",'90kg',5,'1-2-1-2','Chestnut',3.50,1.30);
  sel(eid,3,'Trueshan','','H Bentley','A Balding','89.5kg',6,'2-1-3-1','Grey',5.00,1.60);
  sel(eid,4,'Nayef Road','','J Fanning','M Johnston','89kg',6,'3-2-1-3','Bay',8.00,2.20);
  sel(eid,5,'Spanish Mission','','D Tudhope','A Watson','88.5kg',7,'2-3-2-2','Dark Bay',12.00,3.00);
}
{
  const eid=mkEvent('sport_hr','AU','Flemington','Melbourne Cup',10,12,0);
  sel(eid,1,'Verry Elleegant','','J McNeil','C Waller','57kg',6,'1-1-2-1','Bay',4.00,1.35);
  sel(eid,2,'Incentivise','','B Melham','P Moody','57.5kg',7,'1-1-1-3','Chestnut',5.00,1.50);
  sel(eid,3,'Twilight Payment','','J Orman','J Mullins','57kg',8,'2-1-1-2','Dark Bay',6.50,1.80);
  sel(eid,4,'Delphi','','S Clipperton','G Portelli','56.5kg',5,'3-2-1-1','Grey',9.00,2.30);
  sel(eid,5,'Explosive Jack','','T Berry','G Waterhouse','55kg',7,'4-2-1-3','Bay',18.00,4.00);
}
{
  const eid=mkEvent('sport_hr','AE','Meydan Racecourse','Dubai World Cup',11,20,0);
  sel(eid,1,'Country Grammer','','F Prat','B Baffert','58kg',5,'1-1-2-1','Bay',3.50,1.30);
  sel(eid,2,'Mishriff','','D Egan','J Gosden','58kg',5,'2-1-1-2','Chestnut',4.00,1.40);
  sel(eid,3,'Charlatan','','J Velazquez','B Baffert','57.5kg',5,'1-2-3-1','Dark Bay',5.50,1.65);
  sel(eid,4,'Life Is Good','','I Ortiz Jr','T Pletcher','57kg',4,'1-1-2-3','Bay',6.00,1.80);
  sel(eid,5,'Maximum Security','','L Saez','B Cox','56.5kg',6,'2-3-1-2','Chestnut',9.00,2.40);
}
// ⚽ FOOTBALL
{const eid=mkEvent('sport_fb','GB',null,'Arsenal vs Manchester City',7,15,0);teamSel(eid,'Arsenal','Home Win',3.40);teamSel(eid,'Draw','Draw',3.20);teamSel(eid,'Manchester City','Away Win',2.10);}
{const eid=mkEvent('sport_fb','ZA',null,'Kaizer Chiefs vs Orlando Pirates',8,15,30);teamSel(eid,'Kaizer Chiefs','Home Win',2.80);teamSel(eid,'Draw','Draw',3.10);teamSel(eid,'Orlando Pirates','Away Win',2.60);}
// 🏏 CRICKET
{const eid=mkEvent('sport_cr','ZA',null,'South Africa vs England — 1st Test',8,9,0);teamSel(eid,'South Africa','Win',2.20);teamSel(eid,'Draw','Draw',3.00);teamSel(eid,'England','Win',3.40);}
// 🏉 RUGBY
{const eid=mkEvent('sport_rb','ZA',null,'Springboks vs All Blacks',9,17,0);teamSel(eid,'Springboks','Win',1.90);teamSel(eid,'Draw','Draw',18.00);teamSel(eid,'All Blacks','Win',1.95);}
// 🎾 TENNIS
{const eid=mkEvent('sport_tn',null,null,'Djokovic vs Alcaraz — Wimbledon',11,14,0);teamSel(eid,'Djokovic','',1.95);teamSel(eid,'Alcaraz','',1.90);}
// 🥊 BOXING
{const eid=mkEvent('sport_bx',null,null,'Fury vs Usyk — Heavyweight',14,22,0);teamSel(eid,'Fury','KO/TKO/Dec',2.10);teamSel(eid,'Draw','Draw',16.00);teamSel(eid,'Usyk','KO/TKO/Dec',1.80);}

console.log('Seed complete — wallets:', db.prepare('SELECT COUNT(*) as c FROM wallets').get().c, '| events:', db.prepare('SELECT COUNT(*) as c FROM events').get().c);
if (require.main===module) process.exit(0);
