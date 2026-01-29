
import express from 'express';
import axios from 'axios';
import { Pool } from 'pg';

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function sendSMS(to: string, message: string){
  const url = process.env.AFRICASTALKING_SMS_URL || 'https://api.africastalking.com/version1/messaging/bulk';
  const username = process.env.AFRICASTALKING_USERNAME || '';
  const apiKey = process.env.AFRICASTALKING_API_KEY || '';
  const senderId = process.env.AFRICASTALKING_SENDER_ID || undefined;
  const payload: any = { username, phoneNumbers: to, message, enqueue: 1 };
  if (senderId) payload.senderId = senderId;
  const resp = await axios.post(url, payload, { headers: { apiKey, Accept: 'application/json' }, timeout: 15000 });
  return resp.data;
}

router.post('/api/notifications/send', async (req,res)=>{
  const { provider='log', to, message, payload } = req.body || {};

  // preferences check
  try {
    const uid = payload?.user_id;
    if (uid) {
      const p = await pool.query('SELECT sms_enabled FROM notification_preferences WHERE user_id=$1', [uid]);
      if (p.rowCount && provider==='sms' && p.rows[0].sms_enabled===false) return res.json({ ok:true, skipped:true });
    }
  } catch {}

  try {
    if (provider === 'sms') {
      const data = await sendSMS(to, message);
      return res.json({ ok:true, provider:'sms', data });
    }
    console.log('NOTIFY', provider, to, message);
    return res.json({ ok:true, provider });
  } catch (e:any) {
    console.error('notify error', e?.response?.data || e?.message);
    return res.status(500).json({ error:'send_failed' });
  }
});

export default router;
