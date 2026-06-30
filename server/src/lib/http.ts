import { Response } from "express";

/** Application error with an HTTP status code. */
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (m: string) => new AppError(400, m);
export const unauthorized = (m = "Unauthorized") => new AppError(401, m);
export const forbidden = (m = "Forbidden") => new AppError(403, m);
export const notFound = (m = "Not found") => new AppError(404, m);
export const conflict = (m: string) => new AppError(409, m);

/** Wrap an async route handler so thrown errors reach the error middleware. */
export const asyncHandler =
  (fn: (...args: any[]) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export const ok = (res: Response, data: unknown) => res.json({ data });
