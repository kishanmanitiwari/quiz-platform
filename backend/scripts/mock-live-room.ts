import "dotenv/config";
import { io, type Socket } from "socket.io-client";
import { nanoid } from "nanoid";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";
const socketUrl = process.env.SOCKET_URL ?? apiUrl;
const participantCount = Number(process.env.PARTICIPANTS ?? 25);
const quizId = process.env.QUIZ_ID ?? "sample-iskcon-quiz";
const adminSecret = process.env.ADMIN_SECRET;

type Ack<T = unknown> = { ok: true } & T | { ok: false; error: string };
type Participant = {
  id: string;
  name: string;
  sessionId: string;
  roomCode: string;
  socket: Socket;
  receivedQuestionStarts: number;
};

const openSockets: Socket[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ackError(ack: Ack): string {
  return ack.ok ? "unknown error" : ack.error;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${body.error ?? response.status}`);
  return body;
}

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    socket.timeout(5_000).emit(event, payload, (error: Error | null, ack: Ack<T>) => {
      if (error) resolve({ ok: false, error: `${event} timed out` });
      else resolve(ack);
    });
  });
}

function connectSocket(auth?: Record<string, string>): Promise<Socket> {
  const socket = io(socketUrl, { auth, transports: ["websocket"], reconnection: false });
  openSockets.push(socket);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Socket connect timed out")), 5_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function attachQuestionCounter(participant: Participant) {
  participant.socket.on("question:start", () => {
    participant.receivedQuestionStarts += 1;
  });
}

async function loginAdmin() {
  assert(adminSecret, "ADMIN_SECRET is required");
  const { token } = await request<{ token: string }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ secret: adminSecret })
  });
  return token;
}

async function createRoom(token: string) {
  const { room } = await request<{ room: { id: string; roomCode: string; status: string } }>("/api/admin/rooms", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ quizId })
  });
  return room;
}

async function createParticipant(index: number, roomCode: string): Promise<Participant> {
  const sessionId = nanoid(24);
  const name = `Mock User ${String(index).padStart(2, "0")}`;
  const { participant } = await request<{ participant: { id: string; name: string } }>("/api/join", {
    method: "POST",
    body: JSON.stringify({ roomCode, name, sessionId })
  });
  const socket = await connectSocket();
  const joinAck = await emitAck(socket, "participant:join", { roomCode, participantId: participant.id, sessionId });
  assert(joinAck.ok, `Participant socket join failed: ${ackError(joinAck)}`);
  return { id: participant.id, name: participant.name, sessionId, roomCode, socket, receivedQuestionStarts: 0 };
}

async function reconnectParticipant(participant: Participant) {
  participant.socket.close();
  participant.socket = await connectSocket();
  attachQuestionCounter(participant);
  const ack = await emitAck(participant.socket, "participant:reconnect", {
    roomCode: participant.roomCode,
    participantId: participant.id,
    sessionId: participant.sessionId
  });
  assert(ack.ok, `Reconnect failed for ${participant.name}: ${ackError(ack)}`);
}

async function main() {
  assert(participantCount >= 20 && participantCount <= 25, "Use PARTICIPANTS between 20 and 25 for this smoke test");

  console.log(`Mocking ${participantCount} participants against ${apiUrl}`);
  const token = await loginAdmin();
  const roomA = await createRoom(token);
  const roomB = await createRoom(token);
  console.log(`Created Room A ${roomA.roomCode} and isolation Room B ${roomB.roomCode}`);

  const adminA = await connectSocket({ token });
  const adminB = await connectSocket({ token });
  const adminAJoin = await emitAck(adminA, "admin:join", { roomId: roomA.id });
  const adminBJoin = await emitAck(adminB, "admin:join", { roomId: roomB.id });
  assert(adminAJoin.ok, `Admin Room A join failed: ${ackError(adminAJoin)}`);
  assert(adminBJoin.ok, `Admin Room B join failed: ${ackError(adminBJoin)}`);

  let roomBQuestionEvents = 0;
  adminB.on("question:start", () => {
    roomBQuestionEvents += 1;
  });

  const participants = await Promise.all(
    Array.from({ length: participantCount }, (_, index) => createParticipant(index + 1, roomA.roomCode))
  );
  participants.forEach(attachQuestionCounter);
  console.log(`Joined ${participants.length} participants to Room A`);

  const startQuiz = await emitAck(adminA, "quiz:start", { roomId: roomA.id });
  assert(startQuiz.ok, `Quiz start failed: ${ackError(startQuiz)}`);

  let duplicateRejected = false;
  let lateRejected = false;

  for (let order = 1; order <= 6; order += 1) {
    const startQuestion = await emitAck<{ state: { currentQuestion: { id: string } } }>(adminA, "question:start", {
      roomId: roomA.id
    });
    assert(startQuestion.ok, `Question ${order} start failed: ${ackError(startQuestion)}`);
    const questionId = startQuestion.state.currentQuestion.id;

    const answers = participants.map(async (participant, index) => {
      if (order === 6 && index === participants.length - 1) return;
      await new Promise((resolve) => setTimeout(resolve, 120 + (index % 10) * 60));
      const selectedOption = ["A", "B", "C", "D"][(index + order) % 4];
      const ack = await emitAck(participant.socket, "answer:submit", {
        roomCode: participant.roomCode,
        participantId: participant.id,
        sessionId: participant.sessionId,
        questionId,
        selectedOption
      });
      assert(ack.ok, `${participant.name} answer failed on question ${order}: ${ackError(ack)}`);

      if (order === 1 && index === 0) {
        const duplicate = await emitAck(participant.socket, "answer:submit", {
          roomCode: participant.roomCode,
          participantId: participant.id,
          sessionId: participant.sessionId,
          questionId,
          selectedOption
        });
        duplicateRejected = !duplicate.ok && duplicate.error === "Answer already submitted";
      }
    });

    await Promise.all(answers);

    if (order === 3) {
      await Promise.all(participants.slice(0, 5).map((participant) => reconnectParticipant(participant)));
      console.log("Reconnected 5 participants after question 3");
    }

    if (order === 6) {
      await new Promise((resolve) => setTimeout(resolve, 21_000));
      const lateParticipant = participants[participants.length - 1];
      const late = await emitAck(lateParticipant.socket, "answer:submit", {
        roomCode: lateParticipant.roomCode,
        participantId: lateParticipant.id,
        sessionId: lateParticipant.sessionId,
        questionId,
        selectedOption: "A"
      });
      lateRejected = !late.ok && late.error === "Answer submitted after deadline";
    }

    const endQuestion = await emitAck(adminA, "question:end", { roomId: roomA.id });
    assert(endQuestion.ok, `Question ${order} end failed: ${ackError(endQuestion)}`);
    console.log(`Question ${order} completed`);
  }

  assert(duplicateRejected, "Duplicate answer was not rejected");
  assert(lateRejected, "Late answer was not rejected");
  assert(roomBQuestionEvents === 0, "Room B received Room A question events");
  assert(
    participants.every((participant) => participant.receivedQuestionStarts === 6),
    "Not every participant received all six question starts"
  );

  const leaderboard = await emitAck<{ leaderboard: Array<{ rank: number; name: string; totalScore: number }> }>(
    adminA,
    "quiz:finish",
    { roomId: roomA.id }
  );
  assert(leaderboard.ok, `Final leaderboard failed: ${ackError(leaderboard)}`);

  const topFive = leaderboard.leaderboard.slice(0, 5).map((entry) => `${entry.rank}. ${entry.name} ${entry.totalScore}`);
  console.log("Final leaderboard top 5:");
  console.log(topFive.join("\n"));
  console.log("Live room mock passed");

  openSockets.forEach((socket) => socket.close());
}

main().catch((error) => {
  console.error(error);
  openSockets.forEach((socket) => socket.close());
  process.exit(1);
});
