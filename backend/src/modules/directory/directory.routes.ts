import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";

export const directoryRouter = Router();
directoryRouter.use(authenticate);

// ── Staff directory ──
directoryRouter.get(
  "/staff",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const staff = await prisma.staff.findMany({
      where: { societyId, isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ staff });
  })
);

const staffSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(2),
  phone: z.string().optional(),
  shift: z.string().optional(),
  photoUrl: z.string().url().optional(),
});

directoryRouter.post(
  "/staff",
  requireRole("ADMIN"),
  validate(staffSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const staff = await prisma.staff.create({
      data: { ...(req.body as z.infer<typeof staffSchema>), societyId },
    });
    res.status(201).json({ staff });
  })
);

// ── Service provider directory ──
directoryRouter.get(
  "/providers",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const category = req.query.category as string | undefined;
    const providers = await prisma.serviceProvider.findMany({
      where: { societyId, ...(category ? { category } : {}) },
      orderBy: [{ verified: "desc" }, { name: "asc" }],
    });
    res.json({ providers });
  })
);

const providerSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  phone: z.string().optional(),
  rating: z.number().min(0).max(5).optional(),
  verified: z.boolean().default(false),
});

directoryRouter.post(
  "/providers",
  requireRole("ADMIN"),
  validate(providerSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const provider = await prisma.serviceProvider.create({
      data: { ...(req.body as z.infer<typeof providerSchema>), societyId },
    });
    res.status(201).json({ provider });
  })
);
