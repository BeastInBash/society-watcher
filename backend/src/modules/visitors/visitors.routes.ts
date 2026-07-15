import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, forbidden, notFound } from "../../utils/http.ts";
import { getResidentContext } from "../../utils/context.ts";
import { notifyUsers } from "../../lib/push.ts";

export const visitorsRouter = Router();
visitorsRouter.use(authenticate);

// ── Resident: current visitors for my flat (pending + on-premises) ──
visitorsRouter.get(
  "/",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const visitors = await prisma.visitor.findMany({
      where: {
        flatId: resident.flatId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { registeredBy: { select: { id: true, name: true } } },
    });
    res.json({ visitors });
  })
);

// ── Resident: pending approvals awaiting my action ──
visitorsRouter.get(
  "/pending",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const visitors = await prisma.visitor.findMany({
      where: { flatId: resident.flatId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    res.json({ visitors });
  })
);

// ── Resident: visitor history for my flat ──
visitorsRouter.get(
  "/history",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const visitors = await prisma.visitor.findMany({
      where: {
        flatId: resident.flatId,
        status: { in: ["CHECKED_OUT", "DENIED", "EXPIRED", "CHECKED_IN"] },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({ visitors });
  })
);

// ── Resident: single visitor ──
visitorsRouter.get(
  "/:id",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const visitor = await prisma.visitor.findFirst({
      where: { id: req.params.id, flatId: resident.flatId },
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });
    if (!visitor) throw notFound("Visitor not found");
    res.json({ visitor });
  })
);

// ── Resident: approve / deny a pending visitor ──
const decideSchema = z.object({ note: z.string().max(280).optional() });

async function decide(id: string, residentId: string, flatId: string, approve: boolean, note?: string) {
  const visitor = await prisma.visitor.findFirst({ where: { id, flatId } });
  if (!visitor) throw notFound("Visitor not found");
  if (visitor.status !== "PENDING") throw forbidden("Visitor is no longer pending");

  const updated = await prisma.visitor.update({
    where: { id },
    data: approve
      ? { status: "APPROVED", approvedAt: new Date(), residentId }
      : { status: "DENIED", deniedAt: new Date(), residentId },
  });
  await prisma.visitorLog.create({
    data: {
      visitorId: id,
      action: approve ? "APPROVED" : "DENIED",
      note,
      actorId: residentId,
    },
  });
  return updated;
}

visitorsRouter.post(
  "/:id/approve",
  requireRole("RESIDENT"),
  validate(decideSchema),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const visitor = await decide(req.params.id, resident.id, resident.flatId, true, req.body.note);
    // Notify the guard who registered the visitor.
    if (visitor.registeredById) {
      await notifyUsers({
        userIds: [visitor.registeredById],
        type: "VISITOR_UPDATE",
        title: "Visitor approved",
        body: `${visitor.name} has been approved for entry.`,
        data: { visitorId: visitor.id },
      });
    }
    res.json({ visitor });
  })
);

visitorsRouter.post(
  "/:id/deny",
  requireRole("RESIDENT"),
  validate(decideSchema),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const visitor = await decide(req.params.id, resident.id, resident.flatId, false, req.body.note);
    if (visitor.registeredById) {
      await notifyUsers({
        userIds: [visitor.registeredById],
        type: "VISITOR_UPDATE",
        title: "Visitor denied",
        body: `${visitor.name} was denied entry.`,
        data: { visitorId: visitor.id },
      });
    }
    res.json({ visitor });
  })
);
