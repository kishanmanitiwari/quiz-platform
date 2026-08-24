import { z } from "zod";

export const optionSchema = z.enum(["A", "B", "C", "D"]);

export const loginSchema = z.object({
  secret: z.string().min(1)
});

export const createQuizSchema = z.object({
  title: z.string().trim().min(1).max(120)
});

export const upsertQuestionSchema = z.object({
  order: z.number().int().min(1).max(6),
  text: z.string().trim().min(1).max(500),
  optionA: z.string().trim().min(1).max(200),
  optionB: z.string().trim().min(1).max(200),
  optionC: z.string().trim().min(1).max(200),
  optionD: z.string().trim().min(1).max(200),
  correctOption: optionSchema,
  timeLimit: z.number().int().min(5).max(120),
  basePoints: z.number().int().min(1).max(10000)
});

export const createRoomSchema = z.object({
  quizId: z.string().min(1)
});

export const joinRoomSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  name: z.string().trim().min(1).max(40),
  sessionId: z.string().trim().min(10).max(80)
});

export const participantAuthSchema = z.object({
  roomCode: z.string().trim().min(4).max(12),
  participantId: z.string().min(1),
  sessionId: z.string().trim().min(10).max(80)
});

export const submitAnswerSchema = participantAuthSchema.extend({
  questionId: z.string().min(1),
  selectedOption: optionSchema
});

export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").replace(/[<>]/g, "").trim().slice(0, 40);
}
