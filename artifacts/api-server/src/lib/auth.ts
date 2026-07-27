import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { UserRole } from "@workspace/db";

const SECRET_RAW = process.env["SESSION_SECRET"];
if (!SECRET_RAW) {
  throw new Error("SESSION_SECRET must be set");
}
const SECRET: Secret = SECRET_RAW;
const EXPIRES_IN: SignOptions["expiresIn"] = "1d";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, kind: "session" }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET, { algorithms: ["HS256"] }) as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
