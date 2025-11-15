import 'dotenv/config';
import { executeCommissionPaymentIntent } from '../apps/api/dist/services/gridTransferService.js';

const snapshot = {
  id: '66a485a2-2fd6-46dc-829a-25131ab263ca',
  status: 'awaiting_funds',
  transaction: 'AslSv2k3F0dWe5yk1qu6loxtSWy8LwGd3C0uEwGWKEi0VYQI7jDFha4rUx4FNjOGPEZP9yrBih0waTxwIXRTuwYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAIBCAtkOeZI0XvV8aC28zALEzH7Y52dhNHARMTutAmL4I/cDoRvs4CgobGl6+pCqTzM5HP3o1bkeiv+1qtlH0kG3fTw+m4hE4m4fQalAkW7436D1yIcJHcKkSArGU32ot4b2bEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMGRm/lIRcy/+ytunLDm+e8jOW7xfcSayxDmzpAAAAABn6cetpaLSaDyTGDLDKI2lqRSxzzCBZhQvsBAW/0HEEG3fbh12Whk9nL4UbO63msHLSF7V9bN5E6jPWFfv8AqRvHw/sgqZK+CwxG4ET+pJgWdVUFEWsyQrf/auZ8RyjeKpJO2c/qgYcOuQYVBw9/lA8/H60qvs2ikX+N4NJA2nWMlyWPTiSJ8bs9ECkUjg2DC1oTmdr/EIQEjnvY2+n4Wcb6evO+2606PWXzaqvJdDGxu+TC0vbg5HymAgNFL11hlPbs/E5mSfhK8evoKSObRbsxC6uP/MrlLvVroFDQxh0EBAAFAtjWAAAEAAkDVhwAAAAAAAAJBgACCAoDBgEABQcHBQEIAgYKIStm+FnnYWiGAAETAAAAAQMEAgQCAQoADEBLTAAAAAAABgA=',
  transactionSigners: ['9uyc6svkRsbg7ALVBiHoqGU3ooddwGXdvAQBgryRVmmh'],
  kmsPayloads: [],
  createdAt: '2025-11-12T01:35:35.603875352Z',
  validUntil: '2025-11-12T01:37:05.603882718Z'
};

const result = await executeCommissionPaymentIntent({
  sourceAccount: '3sBX6RNnBa29rzVbrQw3p1RPKzyCaBUSyuneKspB9vhr',
  intentSnapshot: snapshot
});

console.log(result);
