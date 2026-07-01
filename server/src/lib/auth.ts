import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role?: string;
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

export function signToken(payload: JwtPayload, expiresIn?: string): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: expiresIn || env.jwtExpiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}
