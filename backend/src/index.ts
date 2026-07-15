import { createApp } from "./app.ts";
import { env } from "./env.ts";
import { prisma } from "./lib/prisma.ts";

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`🐾 Portl API listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
