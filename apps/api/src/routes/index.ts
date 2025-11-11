import { Router } from 'express';
import gridRouter from './grid.js';
import paymentsRouter from './payments.js';

const router = Router();

router.use('/payments', paymentsRouter);
router.use('/grid', gridRouter);

export default router;

