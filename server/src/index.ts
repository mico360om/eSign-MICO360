import { createApp } from "./app";
import { env } from "./config/env";
import { ensureStorage } from "./lib/storage";
import { prisma } from "./lib/prisma";
import { startReminderScheduler } from "./services/reminders";

async function main() {
  ensureStorage();
  // fail fast if the database is unreachable
  await prisma.$queryRaw`SELECT 1`;

  const app = createApp();
  startReminderScheduler();
  app.listen(env.port, () => {
    console.log(`\n  eSign MICO360 API`);
    console.log(`  ▸ http://localhost:${env.port}/api/health`);
    console.log(`  ▸ env: ${env.nodeEnv}\n`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
