
import { Router } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import amqplib from 'amqplib';
import { requireAuth } from '@tsm/common';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function publishEvent(type: string, payload: any) {
  const conn = await amqplib.connect('amqp://rabbitmq:5672');
  const ch = await conn.createChannel();
  const ex='tsm.events';
  await ch.assertExchange(ex, 'topic', { durable: true });
  ch.publish(ex, type, Buffer.from(JSON.stringify(payload)));
  await ch.close();
  await conn.close();
}

router.get('/api/cart', requireAuth, async (req,res)=>{
  const userId = (req as any).user?.sub;
  let cart = await pool.query('SELECT id FROM carts WHERE retailer_id=$1', [userId]);
  if(!cart.rowCount){
    await pool.query('INSERT INTO carts (retailer_id) VALUES ($1)', [userId]);
    cart = await pool.query('SELECT id FROM carts WHERE retailer_id=$1', [userId]);
  }
  const items = await pool.query('SELECT * FROM cart_items WHERE cart_id=$1', [cart.rows[0].id]);
  res.json({ id: cart.rows[0].id, items: items.rows });
});

router.post('/api/cart/items', requireAuth, async (req,res)=>{
  const schema = z.object({ product_id: z.string(), supplier_id: z.string(), quantity: z.number().int().positive(), unit_price: z.number().positive() });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json(parsed.error);
  const userId = (req as any).user?.sub;
  const { product_id, supplier_id, quantity, unit_price } = parsed.data;
  const cart = await pool.query('SELECT id FROM carts WHERE retailer_id=$1', [userId]);
  const cartId = cart.rowCount ? cart.rows[0].id : (await pool.query('INSERT INTO carts (retailer_id) VALUES ($1) RETURNING id', [userId])).rows[0].id;
  const r = await pool.query('INSERT INTO cart_items (cart_id, product_id, supplier_id, quantity, unit_price) VALUES ($1,$2,$3,$4,$5) RETURNING *', [cartId, product_id, supplier_id, quantity, unit_price]);
  res.status(201).json(r.rows[0]);
});

router.post('/api/orders', requireAuth, async (req,res)=>{
  const schema = z.object({ supplier_id: z.string(), delivery_address: z.any() });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json(parsed.error);
  const userId = (req as any).user?.sub;
  const { supplier_id, delivery_address } = parsed.data;
  const items = await pool.query('SELECT * FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.retailer_id=$1 AND ci.supplier_id=$2', [userId, supplier_id]);
  if(!items.rowCount) return res.status(400).json({ error:'Cart is empty for this supplier' });
  const total = items.rows.reduce((sum: number, it: any)=> sum + Number(it.unit_price)*it.quantity, 0);
  const o = await pool.query('INSERT INTO orders (retailer_id, supplier_id, total_amount, status, delivery_address) VALUES ($1,$2,$3,$4,$5) RETURNING *', [userId, supplier_id, total, 'pending', delivery_address]);
  for(const it of items.rows){
    await pool.query('INSERT INTO order_items (order_id, product_id, quantity, unit_price, total_price) VALUES ($1,$2,$3,$4,$5)', [o.rows[0].id, it.product_id, it.quantity, it.unit_price, Number(it.unit_price)*it.quantity]);
    await publishEvent('product.ordered', { product_id: it.product_id, supplier_id, quantity: it.quantity, order_id: o.rows[0].id });
  }
  await pool.query('DELETE FROM cart_items WHERE cart_id=$1 AND supplier_id=$2', [items.rows[0].cart_id, supplier_id]);
  res.status(201).json(o.rows[0]);
});

router.get('/api/orders/:id', requireAuth, async (req,res)=>{
  const o = await pool.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
  if(!o.rowCount) return res.status(404).json({ error:'Not found' });
  const items = await pool.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
  res.json({ ...o.rows[0], items: items.rows });
});

export default router;
