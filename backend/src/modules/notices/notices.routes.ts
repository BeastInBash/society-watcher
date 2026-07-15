import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";
import { notifyUsers } from "../../lib/push.ts";

export const noticesRouter = Router();
noticesRouter.use(authenticate);

const CATEGORIES = ["GENERAL", "MAINTENANCE", "EVENT", "EMERGENCY", "FINANCE"] as const;

// ── List notices (pinned first) ──
noticesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const notices = await prisma.notice.findMany({
      where: { societyId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      include: { author: { select: { id: true, name: true } } },
    });
    res.json({ notices });
  }),
);

noticesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const notice = await prisma.notice.findUnique({
      where: { id: req.params.id },
      include: { author: { select: { id: true, name: true } } },
    });
    if (!notice) throw notFound("Notice not found");
    res.json({ notice });
  }),
);

// ── Admin: publish a notice ──
const createSchema = z.object({
  title: z.string().min(3),
  body: z.string().min(3),
  category: z.enum(CATEGORIES).default("GENERAL"),
  pinned: z.boolean().default(false),
});

noticesRouter.post(
  "/",
  requireRole("ADMIN"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const notice = await prisma.notice.create({
      data: { ...(req.body as z.infer<typeof createSchema>), societyId, authorId: req.user!.id },
    });

    // Broadcast to all residents of the society.
    const residents = await prisma.user.findMany({
      where: { societyId, role: "RESIDENT" },
      select: { id: true },
    });
    await notifyUsers({
      userIds: residents.map((r) => r.id),
      type: "NOTICE",
      title: notice.title,
      body: notice.body.slice(0, 120),
      data: { noticeId: notice.id },
    });
    res.status(201).json({ notice });
  }),
);

noticesRouter.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.notice.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
