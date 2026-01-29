
import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import axios from 'axios';
import crypto from 'crypto';
import amqplib from 'amqplib';
import PDFDocument from 'pdfkit';
import { requireAuth } from '@tsm/common';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function payfastHost(){
  const mode = (process.env.PAYFAST_MODE || 'sandbox').toLowerCase();
  return mode === 'live' ? 'www.payfast.co.za' : 'sandbox.payfast.co.za';
}
function payfastProcessUrl(){ return `https://${payfastHost()}/eng/process`; }
function payfastValidateUrl(){ return `https://${payfastHost()}/eng/query/validate`; }

const PAYFAST_ORDER = [
  'merchant_id','merchant_key','return_url','cancel_url','notify_url',
  'name_first','name_last','email_address','cell_number',
  'm_payment_id','amount','item_name','item_description',
  'custom_int1','custom_int2','custom_int3','custom_int4','custom_int5',
  'custom_str1','custom_str2','custom_str3','custom_str4','custom_str5',
  'email_confirmation','confirmation_address','payment_method'
];

function encodePF(val: string){
  return encodeURIComponent(val).replace(/%20/g, '+');
}

function generatePayfastSignature(data: Record<string,string>, passphrase?: string){
  const parts: string[] = [];
  for (const k of PAYFAST_ORDER){
    const v = data[k];
    if (v !== undefined && v !== null && String(v) !== '') {
      parts.push(`${k}=${encodePF(String(v).trim())}`);
    }
  }
  let s = parts.join('&');
  if (passphrase) s += `&passphrase=${encodePF(passphrase.trim())}`;
  return crypto.createHash('md5').update(s).digest('hex');
}

async function publishEvent(type: string, payload: any) {
  const conn = await amqplib.connect('amqp://rabbitmq:5672');
  const ch = await conn.createChannel();
  const ex='tsm.events';
  await ch.assertExchange(ex, 'topic', { durable: true });
  ch.publish(ex, type, Buffer.from(JSON.stringify(payload)));
  await ch.close();
  await conn.close();
}

router.post('/api/payments/initiate', requireAuth, async (req,res)=>{
  const schema = z.object({ order_id: z.string(), method: z.enum(['payfast']), item_name: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json(parsed.error);

  const { order_id } = parsed.data;
  const o = await pool.query('SELECT id, total_amount FROM orders WHERE id=$1', [order_id]);
  if(!o.rowCount) return res.status(404).json({ error:'order not found' });

  const amount = Number(o.rows[0].total_amount || 0).toFixed(2);
  const txRef = `MP-${order_id}`;

  await pool.query('INSERT INTO payments (order_id, amount, method, status, transaction_ref, provider) VALUES ($1,$2,$3,$4,$5,$6)',
    [order_id, amount, 'payfast', 'initiated', txRef, 'payfast']
  ).catch(()=>{});

  const data: Record<string,string> = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID || '',
    merchant_key: process.env.PAYFAST_MERCHANT_KEY || '',
    return_url: process.env.PAYFAST_RETURN_URL || '',
    cancel_url: process.env.PAYFAST_CANCEL_URL || '',
    notify_url: process.env.PAYFAST_NOTIFY_URL || '',
    m_payment_id: txRef,
    amount: amount,
    item_name: parsed.data.item_name || `Order#${order_id}`,
    custom_str1: order_id
  };

  const sig = generatePayfastSignature(data, process.env.PAYFAST_PASSPHRASE || undefined);
  data.signature = sig;

  res.status(201).json({ provider:'payfast', process_url: payfastProcessUrl(), fields: data, transaction_ref: txRef });
});

router.post('/api/payments/webhook/payfast/itn', async (req, res) => {
  res.status(200).send('OK');
  try {
    const pfData = req.body || {};
    const m_payment_id = pfData.m_payment_id;
    const payment_status = pfData.payment_status;
    const amount_gross = pfData.amount_gross;
    if (!m_payment_id) return;

    const keys = Object.keys(pfData);
    const parts: string[] = [];
    for (const k of keys) { if (k === 'signature') break; parts.push(`${k}=${encodePF(String(pfData[k]))}`); }
    const pfParamString = parts.join('&');
    let sigStr = pfParamString;
    if (process.env.PAYFAST_PASSPHRASE) sigStr += `&passphrase=${encodePF(process.env.PAYFAST_PASSPHRASE)}`;
    const localSig = crypto.createHash('md5').update(sigStr).digest('hex');
    const sigOk = (pfData.signature === localSig);

    const payRow = await pool.query('SELECT id, order_id, amount FROM payments WHERE transaction_ref=$1 OR order_id=$2 ORDER BY created_at DESC LIMIT 1', [m_payment_id, pfData.custom_str1]);
    if (!payRow.rowCount) return;
    const expected = Number(payRow.rows[0].amount || 0);
    const amountOk = Math.abs(expected - Number(amount_gross||0)) <= 0.01;

    let serverOk = false;
    try {
      const resp = await axios.post(payfastValidateUrl(), pfParamString, { headers: { 'Content-Type':'application/x-www-form-urlencoded' }, timeout: 10000 });
      serverOk = String(resp.data||'').trim() === 'VALID';
    } catch { serverOk = false; }

    if (!(sigOk && amountOk && serverOk)) {
      await pool.query('UPDATE payments SET status=$1, updated_at=now() WHERE id=$2', ['needs_review', payRow.rows[0].id]).catch(()=>{});
      return;
    }

    if (String(payment_status).toUpperCase() === 'COMPLETE') {
      const oid = payRow.rows[0].order_id;
      await pool.query("UPDATE payments SET status='completed', updated_at=now() WHERE id=$1 AND status <> 'completed'", [payRow.rows[0].id]);
      await pool.query("UPDATE orders SET status='paid', updated_at=now() WHERE id=$1 AND status <> 'paid'", [oid]);
      await publishEvent('payment.completed', { order_id: oid, ref: m_payment_id, amount: expected });

      // Auto-create delivery
      const exists = await pool.query('SELECT id FROM deliveries WHERE order_id=$1 LIMIT 1', [oid]);
      if (!exists.rowCount) {
        const d = await pool.query('INSERT INTO deliveries (order_id, status) VALUES ($1,$2) RETURNING id', [oid, 'created']);
        await pool.query('INSERT INTO delivery_tracking (delivery_id, status, note) VALUES ($1,$2,$3)', [d.rows[0].id, 'created', 'Auto-created after payment']);
        await publishEvent('delivery.created', { order_id: oid, delivery_id: d.rows[0].id });
      }
    }
  } catch (e) {
    console.error('PayFast ITN error', e);
  }
});

router.get('/api/payments/:id/receipt.pdf', requireAuth, async (req,res)=>{
  const p = await pool.query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
  if(!p.rowCount) return res.status(404).json({ error:'Not found' });
  const pay = p.rows[0];
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=receipt-${req.params.id}.pdf`);
  const doc = new (PDFDocument as any)();
  doc.pipe(res);
  doc.fontSize(18).text('Payment Receipt', { align:'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Receipt #: ${req.params.id}`);
  doc.text(`Order ID: ${pay.order_id}`);
  doc.text(`Status: ${pay.status}`);
  doc.text(`Amount: ZAR ${Number(pay.amount).toFixed(2)}`);
  doc.text(`Transaction Ref: ${pay.transaction_ref}`);
  doc.end();
});

export default router;
