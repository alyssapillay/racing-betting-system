const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, (req, res) => {
  try {
    const db = getDb();
    const wallets = db.prepare("SELECT *, COALESCE(wallet_type,'cash') as wallet_type, COALESCE(credit_limit,0) as credit_limit FROM wallets ORDER BY name ASC, wallet_type ASC").all();
    for (const w of wallets) {
      w.total_bets    = db.prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=?").get(w.id).c;
      w.pending_bets  = db.prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=? AND status='pending'").get(w.id).c;
      w.total_staked  = db.prepare("SELECT COALESCE(SUM(stake),0) as s FROM bets WHERE wallet_id=?").get(w.id).s;
      w.total_won     = db.prepare("SELECT COALESCE(SUM(actual_return),0) as s FROM bets WHERE wallet_id=? AND status='won'").get(w.id).s;
      w.available     = (w.wallet_type||'cash')==='credit' ? w.balance + (w.credit_limit||0) : w.balance;
    }
    res.json(wallets);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id', authenticate, (req, res) => {
  try {
    const w = getDb().prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
    if (!w) return res.status(404).json({error:'Not found'});
    w.available = (w.wallet_type||'cash')==='credit' ? w.balance + (w.credit_limit||0) : w.balance;
    res.json(w);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/', authenticate, (req, res) => {
  try {
    const { name, phone, wallet_type='cash', balance=0, credit_limit=0 } = req.body;
    if (!name) return res.status(400).json({error:'Name required'});
    if (!['cash','credit'].includes(wallet_type)) return res.status(400).json({error:'wallet_type must be cash or credit'});
    const db=getDb(), id=uuidv4();
    db.prepare('INSERT INTO wallets (id,name,phone,wallet_type,balance,credit_limit) VALUES (?,?,?,?,?,?)').run(id,name.trim(),phone||null,wallet_type,parseFloat(balance),parseFloat(credit_limit));
    if (balance>0) db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,0,?,?)').run(uuidv4(),id,req.user.id,'deposit',parseFloat(balance),parseFloat(balance),'Initial deposit');
    const w=getDb().prepare('SELECT * FROM wallets WHERE id=?').get(id);
    w.available=(w.wallet_type||'cash')==='credit'?w.balance+(w.credit_limit||0):w.balance;
    res.status(201).json(w);
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.put('/:id', authenticate, (req, res) => {
  try {
    const { name, phone, credit_limit, is_active } = req.body;
    const db=getDb();
    db.prepare('UPDATE wallets SET name=COALESCE(?,name),phone=COALESCE(?,phone),credit_limit=COALESCE(?,credit_limit),is_active=COALESCE(?,is_active),updated_at=datetime("now") WHERE id=?')
      .run(name,phone,credit_limit?parseFloat(credit_limit):null,is_active!==undefined?(is_active?1:0):null,req.params.id);
    res.json(getDb().prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.delete('/:id', authenticate, (req, res) => {
  try {
    const pending=getDb().prepare("SELECT COUNT(*) as c FROM bets WHERE wallet_id=? AND status='pending'").get(req.params.id).c;
    if (pending>0) return res.status(400).json({error:`${pending} pending bets on this wallet`});
    getDb().prepare('DELETE FROM wallets WHERE id=?').run(req.params.id);
    res.json({message:'Deleted'});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/:id/deposit', authenticate, (req, res) => {
  try {
    const { amount, description='Deposit' } = req.body;
    if (!amount||amount<=0) return res.status(400).json({error:'Valid amount required'});
    const db=getDb(), w=db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
    if (!w) return res.status(404).json({error:'Not found'});
    const nb=parseFloat((w.balance+parseFloat(amount)).toFixed(2));
    db.prepare("UPDATE wallets SET balance=?,updated_at=datetime('now') WHERE id=?").run(nb,w.id);
    db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(),w.id,req.user.id,'deposit',parseFloat(amount),w.balance,nb,description);
    res.json({new_balance:nb});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.post('/:id/withdraw', authenticate, (req, res) => {
  try {
    const { amount, description='Withdrawal' } = req.body;
    if (!amount||amount<=0) return res.status(400).json({error:'Valid amount required'});
    const db=getDb(), w=db.prepare('SELECT * FROM wallets WHERE id=?').get(req.params.id);
    if (!w) return res.status(404).json({error:'Not found'});
    if (w.balance<amount) return res.status(400).json({error:'Insufficient balance'});
    const nb=parseFloat((w.balance-parseFloat(amount)).toFixed(2));
    db.prepare("UPDATE wallets SET balance=?,updated_at=datetime('now') WHERE id=?").run(nb,w.id);
    db.prepare('INSERT INTO transactions (id,wallet_id,operator_id,type,amount,balance_before,balance_after,description) VALUES (?,?,?,?,?,?,?,?)').run(uuidv4(),w.id,req.user.id,'withdrawal',parseFloat(amount),w.balance,nb,description);
    res.json({new_balance:nb});
  } catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id/transactions', authenticate, (req, res) => {
  try { res.json(getDb().prepare('SELECT * FROM transactions WHERE wallet_id=? ORDER BY created_at DESC LIMIT 100').all(req.params.id)); }
  catch(err) { res.status(500).json({error:err.message}); }
});

router.get('/:id/bets', authenticate, (req, res) => {
  try {
    res.json(getDb().prepare(`
      SELECT b.*, s.name as selection_name, e.event_name, e.event_date,
        sp.name as sport_name, sp.icon as sport_icon
      FROM bets b JOIN selections s ON b.selection_id=s.id
      JOIN events e ON b.event_id=e.id JOIN sports sp ON e.sport_id=sp.id
      WHERE b.wallet_id=? ORDER BY b.created_at DESC LIMIT 50
    `).all(req.params.id));
  } catch(err) { res.status(500).json({error:err.message}); }
});

module.exports = router;
