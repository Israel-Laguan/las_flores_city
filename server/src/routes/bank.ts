import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { BankService } from '../services/BankService.js';

export const bankRouter = Router();

bankRouter.get('/ledger', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ledger = await BankService.getLedger(req.userId!);
    res.json({ success: true, data: ledger, timestamp: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});
