import type { NextFunction, Request, Response } from "express";
import type { Role } from "@db";
import { verifyAccessToken } from "../lib/jwt.ts";
import { unauthorized } from "../utils/http.ts";

export interface AuthUser {
  id: string;
  role: Role;
  societyId: string | null;
}

// Augment Express Request with the authenticated user.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(unauthorized("Missing bearer token"));
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.user = { id: payload.sub, role: payload.role, societyId: payload.societyId };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
