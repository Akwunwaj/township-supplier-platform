
import { Router } from 'express';
import { Pool } from 'pg';
import axios from 'axios';
import amqplib from 'amqplib';
import { requireAuth, requireRole } from '@tsm/common';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function publishEvent(type: string, payload: any){
  const conn = await amqplib.connect('amqp://rabbitmq:5672');
  const ch = await conn.createChannel();
  const ex='tsm.events';
  await ch.assertExchange(ex, 'topic', { durable: true });
  ch.publish(ex, type, Buffer.from(JSON.stringify(payload)));
  await ch.close();
  await conn.close();
}

// ---------- Admin: assign driver ----------
router.put('/api/admin/deliveries/:id/assign', requireAuth, requireRole('admin'), async (req,res)=>{
  const driver_id = req.body?.driver_id;
  if(!driver_id) return res.status(400).json({ error:'driver_id required' });
  const d = await pool.query('UPDATE deliveries SET driver_id=$1, status=$2 WHERE id=$3 RETURNING *', [driver_id, 'assigned', req.params.id]);
  if(!d.rowCount) return res.status(404).json({ error:'delivery not found' });
  await pool.query('INSERT INTO delivery_tracking (delivery_id, status, note) VALUES ($1,$2,$3)', [req.params.id, 'assigned', `Assigned to driver ${driver_id}`]);
  await publishEvent('delivery.assigned', { delivery_id: req.params.id, driver_id });
  res.json(d.rows[0]);
});

// ---------- Driver: manifest ----------
router.get('/api/driver/deliveries', requireAuth, requireRole('driver'), async (req,res)=>{
  const driverId = (req as any).user?.sub;
  const d = await pool.query('SELECT * FROM deliveries WHERE driver_id=$1 ORDER BY scheduled_time NULLS LAST, created_at NULLS LAST', [driverId]);
  res.json({ items: d.rows });
});

// Delivery detail + tracking for driver/admin
router.get('/api/deliveries/:id', requireAuth, requireRole('driver','admin'), async (req,res)=>{
  const d = await pool.query('SELECT * FROM deliveries WHERE id=$1', [req.params.id]);
  if(!d.rowCount) return res.status(404).json({ error:'not found' });
  const t = await pool.query('SELECT * FROM delivery_tracking WHERE delivery_id=$1 ORDER BY ts DESC', [req.params.id]);
  res.json({ delivery: d.rows[0], tracking: t.rows });
});

// Driver: update status
router.put('/api/deliveries/:id/status', requireAuth, requireRole('driver','admin'), async (req,res)=>{
  const status = String(req.body?.status||'').trim();
  if(!status) return res.status(400).json({ error:'status required' });
  await pool.query('UPDATE deliveries SET status=$1 WHERE id=$2', [status, req.params.id]);
  await pool.query('INSERT INTO delivery_tracking (delivery_id, status, note) VALUES ($1,$2,$3)', [req.params.id, status, 'Status updated']);
  await publishEvent('delivery.status', { delivery_id: req.params.id, status });
  res.json({ ok:true });
});

// ---------- Retailer: deliveries list ----------
router.get('/api/retailer/deliveries', requireAuth, requireRole('retailer'), async (req, res) => {
  const retailerId = (req as any).user?.sub;

  // Join deliveries to orders to ensure retailer only sees their own deliveries
  const q = await pool.query(
    `SELECT d.*
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE o.retailer_id = $1
     ORDER BY d.delivered_at DESC NULLS LAST, d.scheduled_time DESC NULLS LAST, d.id DESC
     LIMIT 200`,
    [retailerId]
  );

  res.json({ items: q.rows });
});

// ---------- Retailer: delivery detail + tracking ----------
router.get('/api/retailer/deliveries/:id', requireAuth, requireRole('retailer'), async (req, res) => {
  const retailerId = (req as any).user?.sub;
  const deliveryId = req.params.id;

  // Verify ownership by joining orders
  const d = await pool.query(
    `SELECT d.*
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     WHERE d.id = $1 AND o.retailer_id = $2
     LIMIT 1`,
    [deliveryId, retailerId]
  );

  if (!d.rowCount) return res.status(404).json({ error: 'not found' });

  const t = await pool.query(
    'SELECT * FROM delivery_tracking WHERE delivery_id=$1 ORDER BY ts DESC',
    [deliveryId]
  );

  res.json({ delivery: d.rows[0], tracking: t.rows });
});


// Driver: proof of delivery
router.post('/api/deliveries/:id/pod', requireAuth, requireRole('driver','admin'), async (req,res)=>{
  const proof_json = req.body?.proof_json || req.body || {};
  await pool.query('UPDATE deliveries SET proof_json=$1, status=$2, delivered_at=now() WHERE id=$3', [proof_json, 'delivered', req.params.id]);
  await pool.query('INSERT INTO delivery_tracking (delivery_id, status, note) VALUES ($1,$2,$3)', [req.params.id, 'delivered', 'Proof of delivery captured']);
  await publishEvent('delivery.delivered', { delivery_id: req.params.id });
  res.json({ ok:true });
});

// ---------- USSD (kept) ----------
router.post('/api/ussd', async (req,res)=>{
  const { phoneNumber='', text='' } = req.body || {};
  const parts = String(text).split('*').filter(Boolean);

  if (parts.length === 0) {
    return res.type('text/plain').send('CON Welcome to TSM
1. Wallet Balance
2. My Orders
3. Track Delivery
4. Login via OTP');
  }

  const choice = parts[0];
  if (choice === '1') {
    const user = await pool.query('SELECT id FROM users WHERE phone=$1', [phoneNumber]);
    const uid = user.rowCount ? user.rows[0].id : null;
    if (!uid) return res.type('text/plain').send('END Please register in the app first.');
    const w = await pool.query('SELECT balance FROM wallets WHERE user_id=$1', [uid]);
    const bal = w.rowCount ? Number(w.rows[0].balance).toFixed(2) : '0.00';
    return res.type('text/plain').send(`END Wallet balance: ZAR ${bal}`);
  }
  if (choice === '2') {
    const user = await pool.query('SELECT id FROM users WHERE phone=$1', [phoneNumber]);
    const uid = user.rowCount ? user.rows[0].id : null;
    if (!uid) return res.type('text/plain').send('END Please register in the app first.');
    const cnt = await pool.query('SELECT COUNT(*) FROM orders WHERE retailer_id=$1', [uid]);
    return res.type('text/plain').send(`END You have ${cnt.rows[0].count} orders.`);
  }
  if (choice === '3') {
    if (parts.length === 1) return res.type('text/plain').send('CON Enter Delivery ID');
    const did = parts[1];
    const t = await pool.query('SELECT status FROM deliveries WHERE id=$1', [did]);
    if (!t.rowCount) return res.type('text/plain').send('END Delivery not found');
    return res.type('text/plain').send(`END Delivery ${did} status: ${t.rows[0].status}`);
  }
  if (choice === '4') {
    if (parts.length === 1) {
      const code = String(Math.floor(100000 + Math.random()*900000));
      const expires = new Date(Date.now() + 5*60*1000);
      await pool.query('INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1,$2,$3)', [phoneNumber, code, expires.toISOString()]);
      try {
        await axios.post('http://notification-service:3000/api/notifications/send', { provider:'sms', to: phoneNumber, message: `Your TSM OTP: ${code}` });
      } catch {}
      return res.type('text/plain').send('CON Enter OTP');
    }
    if (parts.length === 2) {
      const entered = parts[1];
      const r = await pool.query("SELECT id FROM otp_codes WHERE phone=$1 AND code=$2 AND consumed=false AND expires_at>now() ORDER BY created_at DESC LIMIT 1", [phoneNumber, entered]);
      if (!r.rowCount) return res.type('text/plain').send('END Invalid or expired OTP');
      await pool.query('UPDATE otp_codes SET consumed=true WHERE id=$1', [r.rows[0].id]);
      return res.type('text/plain').send('END Login successful.');
    }
  }

  return res.type('text/plain').send('END Bye');
});

export default router;
