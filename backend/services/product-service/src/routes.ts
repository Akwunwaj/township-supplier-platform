
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { requireAuth, requireRole } from '@tsm/common';

const router = Router();

const ProductSchema = new mongoose.Schema({
  supplier_id: String,
  name: String,
  category: String,
  price: Number,
  approved: { type: Boolean, default: false },
  images: { original: String, medium: String, thumb: String }
}, { timestamps: true });

const Product = mongoose.model('Product', ProductSchema);

async function invalidateCaches(){
  try {
    const keys = await (require('../index').redis as any).keys('products:*');
    if (keys?.length) await (require('../index').redis as any).del(keys);
  } catch {}
}

const s3 = new S3Client({
  region: 'us-east-1',
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.MINIO_ROOT_USER || 'minio', secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'miniostorage' }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });

router.get('/api/products', async (req,res)=>{
  const page = Math.max(1, Number(req.query.page||1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit||20)));
  const key = `products:list:${page}:${limit}`;
  const cached = await (require('../index').redis as any).get(key);
  if (cached) return res.json(JSON.parse(cached));
  const docs = await Product.find({ approved: true }).skip((page-1)*limit).limit(limit).lean();
  await (require('../index').redis as any).set(key, JSON.stringify({ page, limit, items: docs }), 'EX', 60);
  res.json({ page, limit, items: docs });
});

router.get('/api/products/:id', async (req,res)=>{
  const doc = await Product.findById(req.params.id).lean();
  if(!doc) return res.status(404).json({ error:'Not found' });
  res.json(doc);
});

router.post('/api/products', requireAuth, requireRole('supplier','admin'), async (req,res)=>{
  const schema = z.object({ supplier_id: z.string(), name: z.string(), price: z.number(), category: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json(parsed.error);
  const created = await Product.create(parsed.data);
  await invalidateCaches();
  res.status(201).json(created);
});

router.put('/api/products/:id', requireAuth, requireRole('supplier','admin'), async (req,res)=>{
  const updated = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if(!updated) return res.status(404).json({ error:'Not found' });
  await invalidateCaches();
  res.json(updated);
});

router.get('/api/products/bulk', async (req,res)=>{
  const ids = String(req.query.ids||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!ids.length) return res.json({ items: [] });
  const docs = await Product.find({ _id: { $in: ids } }).lean();
  res.json({ items: docs.map((d:any)=>({ _id: d._id, name: d.name, category: d.category, images: d.images })) });
});

router.get('/api/admin/products/pending', requireAuth, requireRole('admin'), async (_req,res)=>{
  const pending = await Product.find({ approved: false }).limit(100).lean();
  res.json(pending);
});

router.put('/api/admin/products/:id/approve', requireAuth, requireRole('admin'), async (req,res)=>{
  const updated = await Product.findByIdAndUpdate(req.params.id, { approved: true }, { new: true }).lean();
  if(!updated) return res.status(404).json({ error:'Not found' });
  await invalidateCaches();
  res.json(updated);
});

// image endpoints (same as before)
router.post('/api/products/:id/image', requireAuth, requireRole('supplier','admin'), upload.single('image'), async (req,res)=>{
  const file = req.file;
  if(!file) return res.status(400).json({ error:'image required' });
  const id = req.params.id;
  const original = await sharp(file.buffer).toFormat('webp').toBuffer();
  const medium = await sharp(file.buffer).resize(800).toFormat('webp').toBuffer();
  const thumb = await sharp(file.buffer).resize(200).toFormat('webp').toBuffer();
  const bucket = process.env.MINIO_BUCKET || 'tsm-images';
  const base = `products/${id}/${Date.now()}`;
  const kO = `${base}-orig.webp`; const kM = `${base}-med.webp`; const kT = `${base}-th.webp`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kO, Body: original, ContentType:'image/webp' } as any));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kM, Body: medium, ContentType:'image/webp' } as any));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kT, Body: thumb, ContentType:'image/webp' } as any));
  const pub = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
  const images = { original: `${pub}/${bucket}/${kO}`, medium: `${pub}/${bucket}/${kM}`, thumb: `${pub}/${bucket}/${kT}` };
  await Product.findByIdAndUpdate(id, { images });
  await invalidateCaches();
  res.json({ ok:true, images });
});

router.post('/api/products/:id/image/presign', requireAuth, requireRole('supplier','admin'), async (req,res)=>{
  const bucket = process.env.MINIO_BUCKET || 'tsm-images';
  const id = req.params.id;
  const key = `products/${id}/${Date.now()}-upload.webp`;
  const post = await createPresignedPost(s3 as any, { Bucket: bucket, Key: key, Expires: 300, Conditions: [['content-length-range',0,5*1024*1024]] } as any);
  res.json({ url: post.url, fields: post.fields, bucket, key });
});

router.post('/api/products/:id/image/process', requireAuth, requireRole('supplier','admin'), async (req,res)=>{
  const bucket = process.env.MINIO_BUCKET || 'tsm-images';
  const key = String(req.body?.key||'');
  if(!key) return res.status(400).json({ error:'key required' });
  const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key } as any));
  const chunks:any[] = []; for await (const c of obj.Body as any) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const original = await sharp(buf).toFormat('webp').toBuffer();
  const medium = await sharp(buf).resize(800).toFormat('webp').toBuffer();
  const thumb = await sharp(buf).resize(200).toFormat('webp').toBuffer();
  const base = key.replace(/\.[^/.]+$/, '') + '-proc';
  const kO = `${base}-orig.webp`; const kM = `${base}-med.webp`; const kT = `${base}-th.webp`;
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kO, Body: original, ContentType:'image/webp' } as any));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kM, Body: medium, ContentType:'image/webp' } as any));
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: kT, Body: thumb, ContentType:'image/webp' } as any));
  const pub = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
  const images = { original: `${pub}/${bucket}/${kO}`, medium: `${pub}/${bucket}/${kM}`, thumb: `${pub}/${bucket}/${kT}` };
  await Product.findByIdAndUpdate(req.params.id, { images });
  await invalidateCaches();
  res.json({ ok:true, images });
});

router.delete('/api/products/:id/image', requireAuth, requireRole('supplier','admin'), async (req,res)=>{
  const size = String(req.query.size||'original');
  const doc = await Product.findById(req.params.id);
  if(!doc) return res.status(404).json({ error:'Not found' });
  const bucket = process.env.MINIO_BUCKET || 'tsm-images';
  const url = (doc as any).images?.[size];
  if(url){
    const pub = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    const key = url.replace(pub + '/' + bucket + '/', '');
    try { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key } as any)); } catch {}
    (doc as any).images[size] = undefined;
    await doc.save();
    await invalidateCaches();
  }
  res.json({ ok:true });
});

router.get('/api/products/:id/image-url', async (req,res)=>{
  const size = String(req.query.size||'original');
  const doc = await Product.findById(req.params.id).lean();
  if(!doc) return res.status(404).json({ error:'Not found' });
  const bucket = process.env.MINIO_BUCKET || 'tsm-images';
  const url = (doc as any).images?.[size];
  if(!url) return res.status(404).json({ error:'image not set' });
  const pub = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
  const key = String(url).replace(pub + '/' + bucket + '/', '');
  const signed = await getSignedUrl(s3 as any, new GetObjectCommand({ Bucket: bucket, Key: key } as any), { expiresIn: 300 });
  res.json({ url: signed });
});

router.get('/api/media/:bucket/*', requireAuth, async (req,res)=>{
  const bucket = req.params.bucket;
  const key = (req.params as any)[0];
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    if (obj.Body && typeof (obj.Body as any).pipe === 'function') (obj.Body as any).pipe(res);
    else {
      const chunks:any[]=[]; for await (const c of obj.Body as any) chunks.push(c);
      res.end(Buffer.concat(chunks));
    }
  } catch { res.status(404).end(); }
});

export default router;
