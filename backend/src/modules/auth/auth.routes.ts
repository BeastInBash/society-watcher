import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { hashPassword, verifyPassword } from "../../lib/password.ts";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt.ts";
import { validate } from "../../middleware/validate.ts";
import { authenticate } from "../../middleware/auth.ts";
import { asyncHandler, badRequest, conflict, unauthorized } from "../../utils/http.ts";

export const authRouter = Router();

const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  avatarUrl: true,
  societyId: true,
} as const;

async function issueTokens(user: { id: string; role: any; societyId: string | null }) {
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    societyId: user.societyId,
  });
  const refreshToken = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  return { accessToken, refreshToken };
}

// ── Register (resident self-signup via society code + flat) ──
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
  societyCode: z.string().min(3),
  flatId: z.string().min(1),
  residentType: z.enum(["OWNER", "TENANT", "FAMILY"]).default("OWNER"),
});

authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, societyCode, flatId, residentType } =
      req.body as z.infer<typeof registerSchema>;

    const society = await prisma.society.findUnique({ where: { code: societyCode } });
    if (!society) throw badRequest("Invalid society code");

    const flat = await prisma.flat.findFirst({
      where: { id: flatId, societyId: society.id },
    });
    if (!flat) throw badRequest("Flat not found in this society");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflict("Email already registered");

    const user = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        passwordHash: await hashPassword(password),
        role: "RESIDENT",
        societyId: society.id,
        resident: { create: { flatId, type: residentType } },
      },
      select: publicUser,
    });

    const tokens = await issueTokens(user);
    res.status(201).json({ user, ...tokens });
  })
);

// ── Login ──
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw unauthorized("Invalid credentials");

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized("Invalid credentials");

    const tokens = await issueTokens(user);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        avatarUrl: user.avatarUrl,
        societyId: user.societyId,
      },
      ...tokens,
    });
  })
);

// ── Refresh access token ──
const refreshSchema = z.object({ refreshToken: z.string().min(10) });

authRouter.post(
  "/refresh",
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
    let payload: { sub: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw unauthorized("Invalid refresh token");
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw unauthorized("Refresh token expired");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw unauthorized();

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      societyId: user.societyId,
    });
    res.json({ accessToken });
  })
);

// ── Logout (revoke refresh token) ──
authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(async (req, res) => {
    const token = (req.body?.refreshToken as string) ?? "";
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { token, userId: req.user!.id },
        data: { revoked: true },
      });
    }
    res.json({ ok: true });
  })
);

// ── Current user profile ──
authRouter.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        ...publicUser,
        society: { select: { id: true, name: true, code: true } },
        resident: {
          select: {
            id: true,
            type: true,
            flat: {
              select: {
                id: true,
                number: true,
                tower: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    res.json({ user });
  })
);

// ── Register an Expo push token for the current device ──
const pushSchema = z.object({
  token: z.string().min(5),
  platform: z.string().optional(),
});

authRouter.post(
  "/push-token",
  authenticate,
  validate(pushSchema),
  asyncHandler(async (req, res) => {
    const { token, platform } = req.body as z.infer<typeof pushSchema>;
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.user!.id, platform },
      create: { token, platform, userId: req.user!.id },
    });
    res.json({ ok: true });
  })
);
