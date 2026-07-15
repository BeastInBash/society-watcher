import jwt from "jsonwebtoken";
import type { Role } from "@db";
import { env } from "../env.ts";

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
  societyId: string | null;
}

export const signAccessToken = (payload: AccessTokenPayload) =>
  jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl as jwt.SignOptions["expiresIn"],
  });

export const signRefreshToken = (userId: string) =>
  jwt.sign({ sub: userId }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl as jwt.SignOptions["expiresIn"],
  });

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): { sub: string } =>
  jwt.verify(token, env.jwt.refreshSecret) as { sub: string };
