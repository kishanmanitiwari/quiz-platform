import type { Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./env.js";
import { prisma } from "./prisma.js";
import { calculateScore } from "./scoring.js";
import { getLeaderboard, getPublicRoomState, persistResults } from "./room-state.js";
import { participantAuthSchema, submitAnswerSchema } from "./validation.js";
import { verifyAdminToken } from "./auth.js";

const socketRoom = (roomCode: string) => `quiz-room-${roomCode.toUpperCase()}`;

export function createSocketServer(server: Server) {
  const io = new SocketIOServer(server, {
    cors: { origin: env.FRONTEND_URL, credentials: true }
  });

  async function emitRoomState(roomId: string) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;
    const state = await getPublicRoomState(prisma, roomId);
    io.to(socketRoom(room.roomCode)).emit("room:state", state);
  }

  io.on("connection", (socket) => {
    const attachParticipant = async (payload: unknown, callback?: (ack: any) => void) => {
      try {
        const parsed = participantAuthSchema.parse(payload);
        const participant = await prisma.participant.findFirst({
          where: {
            id: parsed.participantId,
            sessionId: parsed.sessionId,
            room: { roomCode: parsed.roomCode.toUpperCase() }
          },
          include: { room: true }
        });
        if (!participant) return callback?.({ ok: false, error: "Participant not found for this room" });
        socket.data.participantId = participant.id;
        socket.data.roomId = participant.roomId;
        socket.join(socketRoom(participant.room.roomCode));
        const state = await getPublicRoomState(prisma, participant.roomId, participant.id);
        callback?.({ ok: true, state });
        io.to(socketRoom(participant.room.roomCode)).emit("participant:joined", {
          participant: { id: participant.id, name: participant.name }
        });
        await emitRoomState(participant.roomId);
      } catch {
        callback?.({ ok: false, error: "Invalid participant join payload" });
      }
    };

    socket.on("participant:join", attachParticipant);

    socket.on("participant:reconnect", async (payload, callback) => {
      await attachParticipant(payload, callback);
    });

    socket.on("admin:join", async ({ roomId }, callback) => {
      const token = socket.handshake.auth?.token;
      if (!verifyAdminToken(typeof token === "string" ? token : undefined)) {
        return callback?.({ ok: false, error: "Admin login required" });
      }
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return callback?.({ ok: false, error: "Room not found" });
      socket.data.isAdmin = true;
      socket.data.adminRoomId = room.id;
      socket.join(socketRoom(room.roomCode));
      callback?.({ ok: true, state: await getPublicRoomState(prisma, room.id) });
    });

    socket.on("quiz:start", async ({ roomId }, callback) => {
      if (!socket.data.isAdmin) return callback?.({ ok: false, error: "Admin login required" });
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { quiz: { include: { questions: true } } } });
      if (!room) return callback?.({ ok: false, error: "Room not found" });
      if (room.status !== "WAITING") return callback?.({ ok: false, error: "Room is not waiting" });
      if (room.quiz.questions.length !== 6) return callback?.({ ok: false, error: "Quiz must have 6 questions" });
      const updated = await prisma.room.update({ where: { id: room.id }, data: { status: "ACTIVE", currentQuestion: 0 } });
      io.to(socketRoom(room.roomCode)).emit("quiz:start", { room: updated });
      await emitRoomState(room.id);
      callback?.({ ok: true });
    });

    socket.on("question:start", async ({ roomId }, callback) => {
      if (!socket.data.isAdmin) return callback?.({ ok: false, error: "Admin login required" });
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } }
      });
      if (!room) return callback?.({ ok: false, error: "Room not found" });
      if (!["ACTIVE", "BETWEEN_QUESTIONS"].includes(room.status)) {
        return callback?.({ ok: false, error: "Cannot start next question now" });
      }
      const nextQuestion = room.quiz.questions.find((q) => q.order === room.currentQuestion + 1);
      if (!nextQuestion) return callback?.({ ok: false, error: "No more questions" });
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + nextQuestion.timeLimit * 1000);
      await prisma.room.update({
        where: { id: room.id },
        data: {
          status: "QUESTION_ACTIVE",
          currentQuestion: nextQuestion.order,
          questionStartedAt: startedAt,
          questionEndsAt: endsAt
        }
      });
      const state = await getPublicRoomState(prisma, room.id);
      io.to(socketRoom(room.roomCode)).emit("question:start", state);
      callback?.({ ok: true, state });
    });

    socket.on("answer:submit", async (payload, callback) => {
      try {
        const parsed = submitAnswerSchema.parse(payload);
        const participant = await prisma.participant.findFirst({
          where: {
            id: parsed.participantId,
            sessionId: parsed.sessionId,
            room: { roomCode: parsed.roomCode.toUpperCase() }
          },
          include: { room: true }
        });
        if (!participant) return callback?.({ ok: false, error: "Participant not found for this room" });
        const room = await prisma.room.findUnique({ where: { id: participant.roomId } });
        if (!room || room.status !== "QUESTION_ACTIVE" || !room.questionStartedAt || !room.questionEndsAt) {
          return callback?.({ ok: false, error: "No active question" });
        }
        const now = new Date();
        if (now.getTime() > room.questionEndsAt.getTime()) {
          return callback?.({ ok: false, error: "Answer submitted after deadline" });
        }
        const question = await prisma.question.findFirst({
          where: { id: parsed.questionId, quizId: room.quizId, order: room.currentQuestion }
        });
        if (!question) return callback?.({ ok: false, error: "Invalid question for this room" });
        const responseTime = now.getTime() - room.questionStartedAt.getTime();
        const isCorrect = parsed.selectedOption === question.correctOption;
        const score = calculateScore({
          isCorrect,
          basePoints: question.basePoints,
          responseTimeMs: responseTime,
          timeLimitSeconds: question.timeLimit
        });
        const answer = await prisma.answer.create({
          data: {
            participantId: participant.id,
            questionId: question.id,
            selectedOption: parsed.selectedOption,
            submittedAt: now,
            responseTime,
            isCorrect,
            score
          }
        });
        callback?.({ ok: true, answer: { id: answer.id, score: answer.score } });
        io.to(socketRoom(participant.room.roomCode)).emit("answer:accepted", {
          participantId: participant.id,
          questionId: question.id
        });
        io.to(socketRoom(participant.room.roomCode)).emit("leaderboard:update", await getLeaderboard(prisma, participant.roomId));
      } catch (error: any) {
        if (error?.code === "P2002") return callback?.({ ok: false, error: "Answer already submitted" });
        callback?.({ ok: false, error: "Invalid answer payload" });
      }
    });

    socket.on("question:end", async ({ roomId }, callback) => {
      if (!socket.data.isAdmin) return callback?.({ ok: false, error: "Admin login required" });
      const room = await prisma.room.findUnique({ where: { id: roomId }, include: { quiz: { include: { questions: true } } } });
      if (!room) return callback?.({ ok: false, error: "Room not found" });
      const isLast = room.currentQuestion >= room.quiz.questions.length;
      const updated = await prisma.room.update({
        where: { id: room.id },
        data: { status: isLast ? "FINISHED" : "BETWEEN_QUESTIONS", questionEndsAt: new Date() }
      });
      const leaderboard = isLast ? await persistResults(prisma, room.id) : await getLeaderboard(prisma, room.id);
      io.to(socketRoom(room.roomCode)).emit(isLast ? "quiz:finish" : "question:end", { room: updated, leaderboard });
      callback?.({ ok: true, room: updated, leaderboard });
    });

    socket.on("quiz:finish", async ({ roomId }, callback) => {
      if (!socket.data.isAdmin) return callback?.({ ok: false, error: "Admin login required" });
      const room = await prisma.room.findUnique({ where: { id: roomId } });
      if (!room) return callback?.({ ok: false, error: "Room not found" });
      const updated = await prisma.room.update({ where: { id: room.id }, data: { status: "FINISHED" } });
      const leaderboard = await persistResults(prisma, room.id);
      io.to(socketRoom(room.roomCode)).emit("quiz:finish", { room: updated, leaderboard });
      callback?.({ ok: true, room: updated, leaderboard });
    });

    socket.on("participant:disconnect", async () => {
      if (socket.data.roomId) await emitRoomState(socket.data.roomId);
    });

    socket.on("disconnect", async () => {
      if (socket.data.roomId) await emitRoomState(socket.data.roomId);
    });
  });

  return io;
}
