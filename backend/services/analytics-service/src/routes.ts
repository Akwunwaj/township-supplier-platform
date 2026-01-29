
import { Router } from 'express';
import { Pool } from 'pg';
import { requireAuth } from '@tsm/common';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/api/analytics/platform', requireAuth, async (_req,res)=>{
  const users = await pool.query('SELECT COUNT(*) FROM users');
  const orders = await pool.query('SELECT COUNT(*) FROM orders');
  const gmv = await pool.query('SELECT COALESCE(SUM(total_amount),0) AS total FROM orders');
  res.json({ users: Number(users.rows[0].count), orders: Number(orders.rows[0].count), gmv: Number(gmv.rows[0].total) });
});

router.get('/api/analytics/gmv/daily', requireAuth, async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days||30)));
  const since = new Date(Date.now() - days*24*60*60*1000);
  const q = await pool.query(`SELECT to_char(created_at::date,'YYYY-MM-DD') AS d, SUM(total_amount) AS total
                              FROM orders WHERE created_at >= $1 GROUP BY d ORDER BY d`, [since]);
  res.json({ days, series: q.rows });
});

router.get('/api/analytics/top-products', requireAuth, async (req, res) => {
  const days = Math.max(1, Math.min(90, Number(req.query.days||30)));
  const limit = Math.max(1, Math.min(50, Number(req.query.limit||10)));
  const since = new Date(Date.now() - days*24*60*60*1000);
  const q = await pool.query(`SELECT oi.product_id, SUM(oi.quantity) AS qty, SUM(oi.total_price) AS revenue
                              FROM order_items oi
                              JOIN orders o ON o.id = oi.order_id
                              WHERE o.created_at >= $1
                              GROUP BY oi.product_id
                              ORDER BY revenue DESC
                              LIMIT $2`, [since, limit]);
  res.json({ days, items: q.rows });
});

export default router;
