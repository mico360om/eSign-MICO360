import { NextFunction, Request, Response } from "express";
import { Permission, parsePermissions } from "../constants";
import { verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { forbidden, unauthorized } from "../lib/http";

/** Authenticate the request from the Bearer token and load the live user + permissions. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    // Token comes from the Authorization header, or a ?token= query param so
    // the mobile app can open PDF view/download links in an external viewer.
    const header = req.headers.authorization;
    const queryToken = typeof req.query.token === "string" ? req.query.token : undefined;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;
    if (!token) throw unauthorized("Missing bearer token");
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      // Malformed, tampered, or expired token -> 401 (not a 500).
      throw unauthorized("Invalid or expired token");
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user) throw unauthorized("User no longer exists");
    if (!user.isActive) throw forbidden("Account is deactivated");

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive,
      roleName: user.role?.name ?? null,
      permissions: parsePermissions(user.role?.permissions),
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Require that the authenticated user's role has ALL of the given permissions. */
export function requirePermission(...needed: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    const has = needed.every((p) => req.user!.permissions.includes(p));
    if (!has) return next(forbidden(`Requires permission: ${needed.join(", ")}`));
    next();
  };
}

export const hasPermission = (req: Request, p: Permission) => !!req.user?.permissions.includes(p);
