
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';

dotenv.config();
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(helmet());
app.use(morgan('combined'));
app.use(rateLimit({ windowMs: 60000, max: 200 }));

mongoose.connect(`mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME||'root'}:${process.env.MONGO_INITDB_ROOT_PASSWORD||'example'}@mongo:27017/${process.env.MONGO_DB||'tsm_catalog'}?authSource=admin`);
export const redis = new Redis({ host: 'redis', port: Number(process.env.REDIS_PORT||6379) });

app.get('/health', (_req,res)=> res.json({ status:'ok', service:'product-service' }));
import router from './routes';
app.use('/', router);
app.listen(process.env.PORT||3000, ()=> console.log('product-service listening'));
