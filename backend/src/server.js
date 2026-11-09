import 'dotenv/config';
import app from './app.js';
import prisma from './config/prisma.js';

const port = Number.parseInt(process.env.PORT || '5000', 10);
const configuredPort = process.env.PORT ?? '5000';

if (!/^\d+$/.test(configuredPort) || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('Invalid PORT value. PORT must be an integer from 0 to 65535.');
}

const server = app.listen(port, () => {
  console.log(`SecureGuard API listening on port ${server.address().port}`);
});

server.on('error', (error) => {
  console.error('Failed to start SecureGuard API:', error);
  process.exitCode = 1;
});

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`${signal} received. Shutting down SecureGuard API...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Shutdown timed out; forcing process exit.');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await prisma.$disconnect();
    clearTimeout(forceExitTimer);
    console.log('SecureGuard API shut down cleanly.');
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exitCode = 1;
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
