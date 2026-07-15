import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";
import { notifyUsers } from "../../lib/push.ts";

export const complaintsRouter = Router();
complaintsRouter.use(authenticate);

const CATEGORIES = [
  "PLUMBING", "ELECTRICAL", "HOUSEKEEPING", "SECURITY",
  "ELEVATOR", "PARKING", "NOISE", "OTHER",
] as const;

// ── List: residents see their own; admins see the whole society ──
complaintsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const where =
      req.user!.role === "ADMIN"
        ? { societyId, ...(status ? { status: status as any } : {}) }
        : { societyId, raisedById: req.user!.id, ...(status ? { status: status as any } : {}) };

    const complaints = await prisma.complaint.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        raisedBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        _count: { select: { comments: true } },
      },
    });
    res.json({ complaints });
  })
);

// ── Single complaint with thread ──
complaintsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        raisedBy: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!complaint) throw notFound("Complaint not found");
    if (req.user!.role !== "ADMIN" && complaint.raisedById !== req.user!.id) {
      throw notFound("Complaint not found");
    }
    res.json({ complaint });
  })
);

// ── Resident: raise a complaint ──
const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(3),
  category: z.enum(CATEGORIES).default("OTHER"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

complaintsRouter.post(
  "/",
  requireRole("RESIDENT"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof createSchema>;
    const complaint = await prisma.complaint.create({
      data: { ...body, societyId, raisedById: req.user!.id },
    });

    // Notify society admins.
    const admins = await prisma.user.findMany({
      where: { societyId, role: "ADMIN" },
      select: { id: true },
    });
    await notifyUsers({
      userIds: admins.map((a) => a.id),
      type: "COMPLAINT_UPDATE",
      title: "New complaint raised",
      body: complaint.title,
      data: { complaintId: complaint.id },
    });

    res.status(201).json({ complaint });
  })
);

// ── Add a comment (resident on own, admin on any) ──
const commentSchema = z.object({ body: z.string().min(1) });

complaintsRouter.post(
  "/:id/comments",
  validate(commentSchema),
  asyncHandler(async (req, res) => {
    const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!complaint) throw notFound("Complaint not found");
    if (req.user!.role !== "ADMIN" && complaint.raisedById !== req.user!.id) {
      throw notFound("Complaint not found");
    }
    const comment = await prisma.complaintComment.create({
      data: { complaintId: complaint.id, authorId: req.user!.id, body: req.body.body },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    // Notify the other party.
    const notifyId = req.user!.role === "ADMIN" ? complaint.raisedById : complaint.assigneeId;
    if (notifyId) {
      await notifyUsers({
        userIds: [notifyId],
        type: "COMPLAINT_UPDATE",
        title: "New reply on your complaint",
        body: complaint.title,
        data: { complaintId: complaint.id },
      });
    }
    res.status(201).json({ comment });
  })
);

// ── Admin: update status / priority / assignee ──
const updateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().nullable().optional(),
});

complaintsRouter.patch(
  "/:id",
  requireRole("ADMIN"),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.complaint.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound("Complaint not found");

    const complaint = await prisma.complaint.update({
      where: { id: req.params.id },
      data: {
        ...body,
        resolvedAt:
          body.status === "RESOLVED" || body.status === "CLOSED"
            ? existing.resolvedAt ?? new Date()
            : body.status
            ? null
            : undefined,
      },
    });

    if (body.status) {
      await notifyUsers({
        userIds: [complaint.raisedById],
        type: "COMPLAINT_UPDATE",
        title: `Complaint ${body.status.toLowerCase().replace("_", " ")}`,
        body: complaint.title,
        data: { complaintId: complaint.id },
      });
    }
    res.json({ complaint });
  })
);
