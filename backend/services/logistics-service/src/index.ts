
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '4mb' }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(helmet());
app.use(morgan('combined'));
app.use(rateLimit({ windowMs: 60000, max: 200 }));
app.get('/health', (_req,res)=> res.json({ status:'ok', service:'logistics-service' }));
import router from './routes';
app.use('/', router);
app.listen(process.env.PORT||3000, ()=> console.log('logistics-service listening'));
