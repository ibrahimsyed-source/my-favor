import { createApp } from './app';
import { config } from './config';
import { disconnect } from './db';

const app = createApp();

const server = app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 My Favor API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

// Graceful shutdown: stop accepting new connections, drain in-flight requests,
// then disconnect from the DB and exit. Guarded so repeated signals don't run twice.
let shuttingDown = false;
async function shutdown(signal: string, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received — shutting down…`);

  // Force-exit fallback if graceful drain hangs (e.g. a stuck keep-alive socket).
  // .unref() so this timer never keeps the process alive on its own.
  const forceExit = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error('Graceful shutdown timed out — forcing exit.');
    process.exit(code || 1);
  }, 10_000);
  forceExit.unref();

  try {
    // Stop accepting new connections and wait for in-flight requests to finish.
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await disconnect();
    clearTimeout(forceExit);
    process.exit(code);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Error during shutdown:', err);
    clearTimeout(forceExit);
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Last-resort handlers: log and shut down cleanly instead of crashing silently.
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('Unhandled promise rejection:', reason);
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('Uncaught exception:', err);
  void shutdown('uncaughtException', 1);
});
