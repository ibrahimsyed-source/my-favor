import { createApp } from './app';
import { config } from './config';
import { disconnect } from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 My Favor API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

// Graceful shutdown.
async function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down…`);
  server.close();
  await disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
