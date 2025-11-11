import app from './app.js';
import { getConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const config = getConfig();
  const port = config.API_PORT;

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API server listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API server', error);
  process.exit(1);
});

