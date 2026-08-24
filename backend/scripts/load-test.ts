import { io } from "socket.io-client";
import { nanoid } from "nanoid";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const socketUrl = process.env.SOCKET_URL ?? apiUrl;
const roomCode = process.env.ROOM_CODE;
const total = Number(process.env.PARTICIPANTS ?? 100);

if (!roomCode) {
  console.error("ROOM_CODE is required");
  process.exit(1);
}

async function join(index: number) {
  const sessionId = nanoid(24);
  const joinRes = await fetch(`${apiUrl}/api/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roomCode, name: `Load User ${index}`, sessionId })
  });
  if (!joinRes.ok) throw new Error(`Join failed ${index}: ${await joinRes.text()}`);
  const { participant } = (await joinRes.json()) as { participant: { id: string } };
  const socket = io(socketUrl, { transports: ["websocket"] });
  socket.emit("participant:join", { roomCode, participantId: participant.id, sessionId }, (ack: any) => {
    if (!ack?.ok) console.error("socket join failed", ack);
  });
  socket.on("question:start", (state: any) => {
    const q = state.currentQuestion;
    if (!q) return;
    setTimeout(() => {
      socket.emit("answer:submit", {
        roomCode,
        participantId: participant.id,
        sessionId,
        questionId: q.id,
        selectedOption: ["A", "B", "C", "D"][index % 4]
      });
    }, 200 + (index % 20) * 50);
  });
  return socket;
}

const sockets = await Promise.all(Array.from({ length: total }, (_, index) => join(index + 1)));
console.log(`Connected ${sockets.length} participants to ${roomCode}`);

process.on("SIGINT", () => {
  sockets.forEach((socket) => socket.close());
  process.exit(0);
});
