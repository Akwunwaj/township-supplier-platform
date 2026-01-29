
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { requireAuth, requireRole } from '@tsm/common';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.post('/api/auth/login', async (req,res)=>{
  const { phone, password } = req.body || {};
  const u = await pool.query('SELECT id, password_hash, role FROM users WHERE phone=$1', [phone]);
  if(!u.rowCount) return res.status(401).json({ error:'invalid' });
  const ok = await bcrypt.compare(password, u.rows[0].password_hash);
  if(!ok) return res.status(401).json({ error:'invalid' });
  const access = jwt.sign({ sub: u.rows[0].id, role: u.rows[0].role }, process.env.JWT_ACCESS_SECRET||'dev', { expiresIn:'24h' });
  const refresh = jwt.sign({ sub: u.rows[0].id }, process.env.JWT_REFRESH_SECRET||'dev', { expiresIn:'7d' });
  res.json({ access, refresh });
});

router.post('/api/auth/register', async (req,res)=>{
  const { phone, email, password, role } = req.body || {};
  if(!phone || !password || !role) return res.status(400).json({ error:'missing' });
  const hash = await bcrypt.hash(password, 12);
  await pool.query('INSERT INTO users (phone,email,password_hash,role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [phone,email,hash,role]);
  res.json({ ok:true });
});

router.get('/api/notifications/preferences', requireAuth, async (req, res) => {
  const uid = (req as any).user?.sub;
  const p = await pool.query('SELECT sms_enabled, email_enabled, push_enabled FROM notification_preferences WHERE user_id=$1', [uid]);
  if (!p.rowCount) return res.json({ sms_enabled: true, email_enabled: true, push_enabled: true });
  res.json(p.rows[0]);
});

router.put('/api/notifications/preferences', requireAuth, async (req, res) => {
  const uid = (req as any).user?.sub;
  const { sms_enabled = true, email_enabled = true, push_enabled = true } = req.body || {};
  await pool.query('INSERT INTO notification_preferences (user_id, sms_enabled, email_enabled, push_enabled) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id) DO UPDATE SET sms_enabled=$2, email_enabled=$3, push_enabled=$4, updated_at=now()', [uid, sms_enabled, email_enabled, push_enabled]);
  res.json({ ok: true });
});

router.get('/api/admin/users', requireAuth, requireRole('admin'), async (_req,res)=>{
  const q = await pool.query('SELECT id, phone, email, role, status, created_at FROM users ORDER BY created_at DESC LIMIT 200');
  res.json(q.rows);
});

export default router;
