import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import morgan from "morgan";
import { nanoid } from "nanoid";
import { env } from "./env.js";
import { createAdminToken, requireAdmin } from "./auth.js";
import { prisma } from "./prisma.js";
import {
  getLeaderboard,
  getPublicRoomState,
  persistResults,
} from "./room-state.js";
import {
  cleanName,
  createQuizSchema,
  createRoomSchema,
  joinRoomSchema,
  loginSchema,
  upsertQuestionSchema,
} from "./validation.js";

export const app = express();

function asyncHandler(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req, res, next).catch(next);
  };
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value ?? "");
}

function hasContiguousQuestionOrders(questions: { order: number }[]) {
  return questions.every((question, index) => question.order === index + 1);
}

app.use((helmet as any)());
app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(morgan("tiny"));
app.use((rateLimit as any)({ windowMs: 60_000, max: 180 }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/admin/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.secret !== env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Invalid admin secret" });
  }
  res.json({ token: createAdminToken() });
});

app.get(
  "/api/admin/quizzes",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const quizzes = await prisma.quiz.findMany({
      include: {
        questions: { orderBy: { order: "asc" } },
        rooms: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ quizzes });
  }),
);

app.post(
  "/api/admin/quizzes",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createQuizSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const quiz = await prisma.quiz.create({
      data: { title: parsed.data.title },
    });
    res.status(201).json({ quiz });
  }),
);

app.get(
  "/api/admin/quizzes/:quizId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const quizId = routeParam(req.params.quizId);
    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        questions: { orderBy: { order: "asc" } },
        rooms: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });
    res.json({ quiz });
  }),
);

app.put(
  "/api/admin/quizzes/:quizId/questions/:order",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const quizId = routeParam(req.params.quizId);
    const parsed = upsertQuestionSchema.safeParse({
      ...req.body,
      order: Number(req.params.order),
    });
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });
    const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const question = await prisma.question.upsert({
      where: { quizId_order: { quizId: quiz.id, order: parsed.data.order } },
      create: {
        quizId: quiz.id,
        order: parsed.data.order,
        text: parsed.data.text,
        optionA: parsed.data.optionA,
        optionB: parsed.data.optionB,
        optionC: parsed.data.optionC,
        optionD: parsed.data.optionD,
        correctOption: parsed.data.correctOption,
        timeLimit: parsed.data.timeLimit,
        basePoints: parsed.data.basePoints,
      },
      update: parsed.data,
    });
    res.json({ question });
  }),
);

app.post(
  "/api/admin/rooms",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: parsed.error.flatten() });

    const questions = await prisma.question.findMany({
      where: { quizId: parsed.data.quizId },
      select: { order: true },
      orderBy: { order: "asc" },
    });
    const questionCount = questions.length;

    if (questionCount < 6 || questionCount > 50)
      return res
        .status(400)
        .json({ error: "Quiz must have between 6 and 50 questions" });

    if (!hasContiguousQuestionOrders(questions)) {
      return res.status(400).json({
        error: "Quiz questions must be numbered continuously from 1",
      });
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.room.deleteMany({
      where: {
        createdAt: { lt: yesterday },
      },
    });

    const room = await prisma.room.create({
      data: { quizId: parsed.data.quizId, roomCode: nanoid(6).toUpperCase() },
    });

    res.status(201).json({ room });
  }),
);

app.get(
  "/api/admin/rooms/:roomId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const roomId = routeParam(req.params.roomId);
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        quiz: { include: { questions: { orderBy: { order: "asc" } } } },
        participants: { orderBy: { createdAt: "asc" } },
        results: { include: { participant: true }, orderBy: { rank: "asc" } },
      },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });
    const leaderboard = await getLeaderboard(prisma, room.id);
    res.json({ room, leaderboard });
  }),
);

app.post(
  "/api/join",
  asyncHandler(async (req, res) => {
    // 1. Check Community Code First
    const requiredCode = process.env.COMMUNITY_CODE || "ISKCON108";
    if (req.body.communityCode !== requiredCode) {
      return res.status(400).json({ 
        error: "Invalid Community Code. Please check the WhatsApp group description." 
      });
    }

    const parsed = joinRoomSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid join request" });

    const room = await prisma.room.findUnique({
      where: { roomCode: parsed.data.roomCode.toUpperCase() },
    });

    if (!room) return res.status(404).json({ error: "Invalid room code" });

    if (room.status !== "WAITING") {
      return res.status(409).json({
        error: "Quiz has already started. Please join the next session.",
      });
    }

    try {
      const participant = await prisma.participant.upsert({
        where: {
          roomId_sessionId: {
            roomId: room.id,
            sessionId: parsed.data.sessionId,
          },
        },
        update: {
          name: cleanName(parsed.data.name),
          phone: parsed.data.phone,
          age: Number(req.body.age),      // <-- NEW
          gender: String(req.body.gender) // <-- NEW
        },
        create: {
          roomId: room.id,
          sessionId: parsed.data.sessionId,
          name: cleanName(parsed.data.name),
          phone: parsed.data.phone,
          age: Number(req.body.age),      // <-- NEW
          gender: String(req.body.gender) // <-- NEW
        },
      });

      const state = await getPublicRoomState(prisma, room.id, participant.id);
      res.status(201).json({ participant, state });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(400).json({
          error:
            "You have already joined or played this quiz with this WhatsApp number!",
        });
      }
      throw error;
    }
  }),
);

app.get(
  "/api/rooms/code/:roomCode",
  asyncHandler(async (req, res) => {
    const roomCode = routeParam(req.params.roomCode).toUpperCase();
    const room = await prisma.room.findUnique({ where: { roomCode } });
    if (!room) return res.status(404).json({ error: "Invalid room code" });
    const state = await getPublicRoomState(prisma, room.id);
    res.json({ state });
  }),
);

app.get(
  "/api/participants/:participantId/result",
  asyncHandler(async (req, res) => {
    const participantId = routeParam(req.params.participantId);
    const result = await prisma.result.findUnique({
      where: { participantId },
      include: { participant: true },
    });
    if (!result) return res.status(404).json({ error: "Result not found" });
    res.json({ result });
  }),
);

app.post(
  "/api/admin/rooms/:roomId/finish",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const roomId = routeParam(req.params.roomId);
    const room = await prisma.room.update({
      where: { id: roomId },
      data: { status: "FINISHED" },
    });
    const leaderboard = await persistResults(prisma, room.id);
    res.json({ room, leaderboard });
  }),
);

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});
