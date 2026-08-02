import { createApp } from './app.js';
import { config } from './config.js';
import { closeDatabase, getDatabase } from './db/connection.js';
import { applySchema } from './db/schema.js';
import { seedDatabase } from './db/seed.js';

/**
 * Process entry point: prepare the database, serve, and shut down cleanly.
 *
 * The schema is applied and the database seeded when empty before the server
 * accepts connections. That is what makes both `yarn dev` on a fresh clone and
 * `docker compose up` on an empty volume a single command — and because the
 * seeder skips when data already exists, it is safe on every restart.
 */

const db = getDatabase();

applySchema(db);

const seedResult = seedDatabase(db, { log: (message) => console.log(message) });
if (seedResult.seeded) {
  console.log(
    `Seeded ${seedResult.users.toLocaleString('en-US')} users in ` +
      `${(seedResult.durationMs / 1000).toFixed(2)}s`,
  );
}

const app = createApp(db);

const server = app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port} (${config.nodeEnv})`);
});

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * database. Without this the container is killed mid-write on every redeploy,
 * which is exactly when WAL recovery gets exercised for real.
 */
function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);

  server.close(() => {
    closeDatabase();
    process.exit(0);
  });

  // Do not hang forever on a stuck connection. `unref` so this timer alone
  // never keeps the process alive.
  setTimeout(() => {
    console.error('Shutdown timed out, exiting');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
