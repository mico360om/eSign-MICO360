import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/http";
import { recordError } from "../lib/errorReport";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Route not found" });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
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
  // Unexpected server error → auto-capture for later debugging.
  console.error("[unhandled]", err);
  const e = err as any;
  recordError({
    source: "server",
    message: String(e?.message || e || "Internal server error"),
    stack: e?.stack ? String(e.stack) : null,
    url: req.originalUrl,
    method: req.method,
    status: 500,
    userId: req.user?.id ?? null,
    userAgent: req.headers["user-agent"] as string,
  });
  res.status(500).json({ error: "Internal server error" });
}
