import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().default("http://localhost:3000"),
  ADMIN_SECRET: z.string().min(12),
  JWT_SECRET: z.string().min(12),
  PORT: z.coerce.number().default(4000)
});

export const env = envSchema.parse(process.env);
