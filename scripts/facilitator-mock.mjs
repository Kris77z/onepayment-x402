import http from 'http';

const PORT = process.env.MOCK_FACILITATOR_PORT || 3001;
const responses = {
  health: JSON.stringify({ status: 'ok' }),
  verify: JSON.stringify({ isValid: true }),
  settle: JSON.stringify({ status: 'settled', transactionSignature: 'mock-grid-signature' })
};

const server = http.createServer((req, res) => {
  const { method, url } = req;

  if (method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(responses.health);
    return;
  }

  if (method === 'POST' && url === '/verify') {
    collectBody(req, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responses.verify);
    });
    return;
  }

  if (method === 'POST' && url === '/settle') {
    collectBody(req, () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responses.settle);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[mock facilitator] listening on port ${PORT}`);
});

function collectBody(req, cb) {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (process.env.DEBUG_MOCK_FACILITATOR === 'true') {
        console.log('[mock facilitator] received body', parsed);
      }
    } catch (error) {
      console.error('[mock facilitator] body parse error', error);
    }
    cb();
  });
}
