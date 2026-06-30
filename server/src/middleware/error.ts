import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/http";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  // Prisma unique-constraint
  if (typeof err === "object" && err && (err as any).code === "P2002") {
    return res.status(409).json({ error: "A record with that value already exists" });
  }
  console.error("[unhandled]", err);
  res.status(500).json({ error: "Internal server error" });
}
