const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, runTransaction } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const { wallet_id, status } = req.query;
    let q = `SELECT bs.*, w.name as wallet_name FROM betslips bs JOIN wallets w ON bs.wallet_id=w.id`;
    const cond=[], params=[];
    if (wallet_id) { cond.push('bs.wallet_id=?'); params.push(wallet_id); }
    if (status)    { cond.push('bs.status=?');    params.push(status); }
    if (cond.length) q += ' WHERE '+cond.join(' AND ');
    q += ' ORDER BY bs.created_at DESC LIMIT 500';
    const slips = db.prepare(q).all(...params);
    for (const slip of slips) {
      slip.legs = db.prepare(`
        SELECT bl.*, s.name as selection_name, s.win_odds, s.place_odds, s.status as sel_status,
          e.event_name, e.event_date, e.race_number, e.status as event_status,
          sp.name as sport_name, sp.icon as sport_icon
        FROM betslip_legs bl
        JOIN selections s ON bl.selection_id=s.id
        JOIN events e ON bl.event_id=e.id
        JOIN sports sp ON e.sport_id=sp.id
        WHERE bl.betslip_id=?
      `).all(slip.id);
    }
    res.json(slips);
  } catch(err) { console.error('GET betslips:', err.message); res.status(500).json({error:err.message}); }
});

router.post('/', authenticate, (req, res) => {
  try {
    const { wallet_id, selections, stake, slip_type='single', payment_type='cash' } = req.body;
    if (!wallet_id)                                               return res.status(400).json({error:'wallet_id required'});
    if (!selections||!Array.isArray(selections)||!selections.length) return res.status(400).json({error:'Selections required'});
    if (!stake||parseFloat(stake)<=0)                             return res.status(400).json({error:'Valid stake required'});
    if (!['single','multi'].includes(slip_type))                  return res.status(400).json({error:'slip_type must be single or multi'});
    if (!['cash','credit'].includes(payment_type))                return res.status(400).json({error:'payment_type must be cash or credit'});
    if (slip_type==='single'&&selections.length>1)                return res.status(400).json({error:'Single = one selection only'});
    if (slip_type==='multi'&&selections.length<2)                 return res.status(400).json({error:'Multi needs 2+ selections'});

    const db = getDb();
    const stakeAmt = parseFloat(parseFloat(stake).toFixed(2));
    const wallet   = db.prepare('SELECT * FROM wallets WHERE id=? AND is_active=1').get(wallet_id);
    if (!wallet) return res.status(404).json({error:'Wallet not found or inactive'});

    // Check available funds based on payment type
    if (payment_type==='cash') {
      if (wallet.cash_balance < stakeAmt) return res.status(400).json({error:`Insufficient cash. Balance: R${wallet.cash_balance.toFixed(2)}`});
    } else {
      const creditAvailable = Math.max(0, wallet.credit_limit - wallet.credit_used);
      if (creditAvailable < stakeAmt) return res.status(400).json({error:`Insufficient credit. Available: R${creditAvailable.toFixed(2)}`});
    }

    // Validate selections
    const validated=[], seenEvents=new Set();
    for (const item of selections) {
      if (!item.selection_id) return res.status(400).json({error:'Each item needs selection_id'});
      const betOn = item.bet_on||'win';
      const sel = db.prepare(`
        SELECT s.*, COALESCE(s.win_odds,2) as win_odds, s.place_odds,
          e.status as event_status, e.id as event_id, e.event_name, e.closes_at
        FROM selections s JOIN events e ON s.event_id=e.id WHERE s.id=?
      `).get(item.selection_id);
      if (!sel)                       return res.status(404).json({error:`Selection not found: ${item.selection_id}`});
      if (sel.status==='scratched')   return res.status(400).json({error:`${sel.name} is scratched`});
      if (sel.event_status!=='open')  return res.status(400).json({error:`${sel.event_name} is not open for betting`});
      if (sel.closes_at&&new Date(sel.closes_at)<new Date()) return res.status(400).json({error:`Betting closed for ${sel.event_name}`});
      if (seenEvents.has(sel.event_id)) return res.status(400).json({error:'Cannot bet same event twice in one slip'});
      seenEvents.add(sel.event_id);
      const odds = betOn==='place' ? (sel.place_odds||parseFloat((sel.win_odds*0.25).toFixed(2))) : sel.win_odds;
      validated.push({...sel, bet_on:betOn, odds_to_use:parseFloat(odds)});
    }

    const combinedOdds = slip_type==='multi'
      ? parseFloat(validated.reduce((a,s)=>a*s.odds_to_use,1).toFixed(4))
      : parseFloat(validated[0].odds_to_use);
    const potentialReturn = parseFloat((stakeAmt*combinedOdds).toFixed(2));

    const result = runTransaction(()=>{
      const slipId=uuidv4();

      // Deduct from appropriate balance
      if (payment_type==='cash') {
        const nb = parseFloat((wallet.cash_balance-stakeAmt).toFixed(2));
        db.prepare("UPDATE wallets SET cash_balance=?,updated_at=datetime('now') WHERE id=?").run(nb,wallet.id);
        try { db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,payment_type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'bet','cash',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,stakeAmt,wallet.cash_balance,nb,`${slip_type} bet (cash)`,slipId); } catch(te) { db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'bet',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,stakeAmt,wallet.cash_balance,nb,`${slip_type} bet`,slipId); }
      } else {
        const newUsed = parseFloat((wallet.credit_used+stakeAmt).toFixed(2));
        db.prepare("UPDATE wallets SET credit_used=?,updated_at=datetime('now') WHERE id=?").run(newUsed,wallet.id);
        try { db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,payment_type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'bet','credit',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,stakeAmt,wallet.credit_used,newUsed,`${slip_type} bet (credit)`,slipId); } catch(te) { db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description,reference_id) VALUES (?,?,?,'bet',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,stakeAmt,wallet.credit_used,newUsed,`${slip_type} bet`,slipId); }
      }

      db.prepare("INSERT INTO betslips (id,wallet_id,operator_id,slip_type,payment_type,status,total_stake,potential_return) VALUES (?,?,?,?,?,'pending',?,?)").run(slipId,wallet.id,req.user.id,slip_type,payment_type,stakeAmt,potentialReturn);

      for (const s of validated) {
        try { db.prepare("INSERT INTO betslip_legs (id,betslip_id,selection_id,event_id,bet_on,odds_at_time) VALUES (?,?,?,?,?,?)").run(uuidv4(),slipId,s.id,s.event_id,s.bet_on,s.odds_to_use); } catch(e) { try { db.prepare("INSERT INTO betslip_legs (id,betslip_id,selection_id,event_id,bet_type,odds_at_time) VALUES (?,?,?,?,?,?)").run(uuidv4(),slipId,s.id,s.event_id,s.bet_on,s.odds_to_use); } catch(e2) { db.prepare("INSERT INTO betslip_legs (id,betslip_id,selection_id,event_id,odds_at_time) VALUES (?,?,?,?,?)").run(uuidv4(),slipId,s.id,s.event_id,s.odds_to_use); } }
      }
      if (slip_type==='single') {
        const s=validated[0];
        try {
          db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,bet_type,bet_on,payment_type,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,'single',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,slipId,s.id,s.event_id,s.bet_on,payment_type,stakeAmt,s.odds_to_use,potentialReturn);
        } catch(be) {
          db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,slipId,s.id,s.event_id,stakeAmt,s.odds_to_use,potentialReturn);
        }
      } else {
        const s=validated[0];
        try {
          db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,bet_type,bet_on,payment_type,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,'multi',?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,slipId,s.id,s.event_id,s.bet_on,payment_type,stakeAmt,combinedOdds,potentialReturn);
        } catch(be) {
          db.prepare("INSERT INTO bets (id,wallet_id,operator_id,betslip_id,selection_id,event_id,stake,odds_at_time,potential_return) VALUES (?,?,?,?,?,?,?,?,?)").run(uuidv4(),wallet.id,req.user.id,slipId,s.id,s.event_id,stakeAmt,combinedOdds,potentialReturn);
        }
      }

      const updated = db.prepare('SELECT * FROM wallets WHERE id=?').get(wallet.id);
      return { slipId, wallet: updated };
    });

    const w = result.wallet;
    res.status(201).json({
      success:true, message:'Bet placed', slip_id:result.slipId,
      payment_type, combined_odds:combinedOdds, stake:stakeAmt, potential_return:potentialReturn,
      new_cash_balance: w.cash_balance,
      credit_used: w.credit_used, credit_available: Math.max(0,w.credit_limit-w.credit_used)
    });
  } catch(err) { console.error('Place bet error:', err.message, err.stack); res.status(500).json({error:err.message}); }
});

// Cash out
router.post('/:id/cashout', authenticate, (req, res) => {
  try {
    const db=getDb();
    const slip=db.prepare('SELECT bs.*,w.cash_balance,w.credit_used,w.credit_limit FROM betslips bs JOIN wallets w ON bs.wallet_id=w.id WHERE bs.id=?').get(req.params.id);
    if (!slip||slip.status!=='pending') return res.status(400).json({error:'Not a pending bet'});
    const legs=db.prepare('SELECT bl.*,s.win_odds,s.place_odds FROM betslip_legs bl JOIN selections s ON bl.selection_id=s.id WHERE bl.betslip_id=?').all(req.params.id);
    let currentOdds=1;
    for (const leg of legs) currentOdds *= (leg.bet_on||leg.bet_type||'win')==='place'?(leg.place_odds||leg.win_odds*0.25):leg.win_odds;
    const origOdds = slip.potential_return/slip.total_stake;
    const cashout  = Math.max(parseFloat((slip.total_stake*(currentOdds/origOdds)*0.85).toFixed(2)), parseFloat((slip.total_stake*0.1).toFixed(2)));

    runTransaction(()=>{
      db.prepare("UPDATE betslips SET status='cashed_out',cashout_value=?,cashed_out_at=datetime('now'),updated_at=datetime('now') WHERE id=?").run(cashout,slip.id);
      db.prepare("UPDATE bets SET status='cashed_out',cashout_value=?,settled_at=datetime('now') WHERE betslip_id=?").run(cashout,slip.id);
      if (slip.payment_type==='cash') {
        const nb=parseFloat((slip.cash_balance+cashout).toFixed(2));
        db.prepare("UPDATE wallets SET cash_balance=?,updated_at=datetime('now') WHERE id=?").run(nb,slip.wallet_id);
        db.prepare("INSERT INTO transactions (id,wallet_id,operator_id,type,payment_type,amount,balance_before,balance_after,description) VALUES (?,?,?,'cashout','cash',?,?,?,?)").run(uuidv4(),slip.wallet_id,req.user.id,cashout,slip.cash_balance,nb,'Cash Out');
      } else {
        const newUsed=Math.max(0,parseFloat((slip.credit_used-cashout).toFixed(2)));
        db.prepare("UPDATE wallets SET credit_used=?,updated_at=datetime('now') WHERE id=?").run(newUsed,slip.wallet_id);
      }
    });
    res.json({success:true, cashout_value:cashout});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id/cashout-value', authenticate, (req, res) => {
  try {
    const db=getDb();
    const slip=db.prepare('SELECT * FROM betslips WHERE id=?').get(req.params.id);
    if (!slip||slip.status!=='pending') return res.json({available:false,reason:'Not a pending bet'});
    const legs=db.prepare('SELECT bl.*,s.win_odds,s.place_odds FROM betslip_legs bl JOIN selections s ON bl.selection_id=s.id WHERE bl.betslip_id=?').all(req.params.id);
    let currentOdds=1;
    for (const leg of legs) currentOdds *= (leg.bet_on||leg.bet_type||'win')==='place'?(leg.place_odds||leg.win_odds*0.25):leg.win_odds;
    const origOdds=slip.potential_return/slip.total_stake;
    const cashout=Math.max(parseFloat((slip.total_stake*(currentOdds/origOdds)*0.85).toFixed(2)),parseFloat((slip.total_stake*0.1).toFixed(2)));
    res.json({available:true, cashout_value:cashout, original_stake:slip.total_stake, potential_return:slip.potential_return});
  } catch(err) { res.status(500).json({error:err.message}); }
});

module.exports = router;
