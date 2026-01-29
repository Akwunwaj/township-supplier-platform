
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface JwtAuth { sub: string; role?: string; }

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.headers['authorization'];
  if (!hdr || !hdr.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = hdr.substring('Bearer '.length);
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || 'dev') as JwtAuth;
    (req as any).user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as JwtAuth | undefined;
    if (!user || !user.role || !roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
