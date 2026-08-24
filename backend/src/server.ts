import http from "http";
import { app } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { createSocketServer } from "./socket.js";

const server = http.createServer(app);
createSocketServer(server);

server.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
