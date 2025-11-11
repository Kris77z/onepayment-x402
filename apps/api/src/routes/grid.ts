import { Router } from 'express';
import { fetchAccountBalances, fetchAccountTransfers } from '../services/gridService.js';

const router = Router();

router.get('/:accountId/balances', async (req, res) => {
  const { accountId } = req.params;

  try {
    const data = await fetchAccountBalances(accountId);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Grid error';
    res.status(502).json({
      success: false,
      data: null,
      error: {
        code: 'GRID_BALANCES_FAILED',
        message
      }
    });
  }
});

router.get('/:accountId/transfers', async (req, res) => {
  const { accountId } = req.params;
  const limitRaw = req.query.limit as string | undefined;
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

  try {
    const data = await fetchAccountTransfers(accountId, limit ? { limit } : undefined);
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Grid error';
    res.status(502).json({
      success: false,
      data: null,
      error: {
        code: 'GRID_TRANSFERS_FAILED',
        message
      }
    });
  }
});

export default router;

