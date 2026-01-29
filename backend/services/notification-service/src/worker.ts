
import amqplib from 'amqplib';
import axios from 'axios';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function sendSMS(to: string, message: string){
  await axios.post('http://notification-service:3000/api/notifications/send', { provider:'sms', to, message });
}

async function start(){
  const conn = await amqplib.connect('amqp://rabbitmq:5672');
  const ch = await conn.createChannel();
  const ex='tsm.events';
  await ch.assertExchange(ex, 'topic', { durable: true });
  const q = await ch.assertQueue('', { exclusive: true });
  await ch.bindQueue(q.queue, ex, '#');
  console.log('notification-worker subscribed to tsm.events');

  ch.consume(q.queue, async (msg)=>{
    if(!msg) return;
    const rk = msg.fields.routingKey;
    const body = msg.content.toString();
    try {
      const payload = JSON.parse(body);
      if (rk === 'payment.completed') {
        const orderId = payload.order_id;
        const o = await pool.query('SELECT retailer_id FROM orders WHERE id=$1', [orderId]);
        if (o.rowCount) {
          const u = await pool.query('SELECT phone FROM users WHERE id=$1', [o.rows[0].retailer_id]);
          const to = u.rowCount ? u.rows[0].phone : null;
          if (to) await sendSMS(to, `Payment received for Order ${orderId}. Thank you!`);
        }
      }
      if (rk === 'delivery.assigned') {
        const driverId = payload.driver_id;
        const d = await pool.query('SELECT phone FROM users WHERE id=$1', [driverId]);
        const to = d.rowCount ? d.rows[0].phone : null;
        if (to) await sendSMS(to, `New delivery assigned: ${payload.delivery_id}`);
      }
      if (rk === 'delivery.delivered') {
        // optionally notify retailer
      }
    } catch (e) {
      console.error('worker error', rk, e);
    }
    ch.ack(msg);
  });
}

start().catch(e=>{ console.error('notification-worker failed', e); process.exit(1); });
