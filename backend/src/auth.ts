import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./env.js";

export function createAdminToken(): string {
  return jwt.sign({ role: "admin" }, env.JWT_SECRET, { expiresIn: "12h" });
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { role?: string };
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Admin login required" });
  next();
}
