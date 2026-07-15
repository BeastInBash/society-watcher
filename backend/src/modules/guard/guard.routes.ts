import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, badRequest, forbidden, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";
import { notifyUsers } from "../../lib/push.ts";

export const guardRouter = Router();
guardRouter.use(authenticate, requireRole("GUARD", "ADMIN"));

// ── Search residents / flats to attach a visitor to ──
guardRouter.get(
  "/search-residents",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const q = (req.query.q as string | undefined)?.trim() ?? "";
    const residents = await prisma.resident.findMany({
      where: {
        flat: { societyId },
        OR: [
          { user: { name: { contains: q, mode: "insensitive" } } },
          { flat: { number: { contains: q, mode: "insensitive" } } },
        ],
      },
      take: 20,
      include: {
        user: { select: { id: true, name: true, phone: true } },
        flat: { select: { id: true, number: true, tower: { select: { name: true } } } },
      },
    });
    res.json({ residents });
  }),
);

// ── Register a visitor & raise an approval request to the resident ──
const registerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  kind: z.enum(["GUEST", "DELIVERY", "CAB", "SERVICE", "STAFF"]).default("GUEST"),
  company: z.string().optional(),
  purpose: z.string().optional(),
  vehicleNo: z.string().optional(),
  photoUrl: z.string().url().optional(),
  flatId: z.string().min(1),
  preApprovalCode: z.string().optional(),
});

guardRouter.post(
  "/visitors",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof registerSchema>;

    const flat = await prisma.flat.findFirst({ where: { id: body.flatId, societyId } });
    if (!flat) throw badRequest("Flat not found in this society");

    // If a valid pre-approval code is supplied, auto-approve on the spot.
    let preApprovalId: string | undefined;
    let autoApprove = false;
    if (body.preApprovalCode) {
      const pa = await prisma.preApproval.findUnique({
        where: { code: body.preApprovalCode.toUpperCase() },
      });
      if (pa && pa.status === "ACTIVE" && pa.validUntil > new Date() && pa.usedCount < pa.maxUses) {
        preApprovalId = pa.id;
        autoApprove = true;
        await prisma.preApproval.update({
          where: { id: pa.id },
          data: {
            usedCount: { increment: 1 },
            status: pa.usedCount + 1 >= pa.maxUses ? "USED" : "ACTIVE",
          },
        });
      }
    }

    const visitor = await prisma.visitor.create({
      data: {
        name: body.name,
        phone: body.phone,
        kind: body.kind,
        company: body.company,
        purpose: body.purpose,
        vehicleNo: body.vehicleNo,
        photoUrl: body.photoUrl,
        societyId,
        flatId: body.flatId,
        registeredById: req.user!.id,
        preApprovalId,
        status: autoApprove ? "APPROVED" : "PENDING",
        approvedAt: autoApprove ? new Date() : null,
      },
    });

    await prisma.visitorLog.create({
      data: {
        visitorId: visitor.id,
        action: autoApprove ? "PRE_APPROVED" : "REGISTERED",
        actorId: req.user!.id,
      },
    });

    // Notify residents of the flat if approval is required.
    if (!autoApprove) {
      const residents = await prisma.resident.findMany({
        where: { flatId: body.flatId },
        select: { userId: true },
      });
      await notifyUsers({
        userIds: residents.map((r) => r.userId),
        type: "VISITOR_REQUEST",
        title: "Visitor at the gate",
        body: `${visitor.name}${visitor.company ? ` (${visitor.company})` : ""} is requesting entry.`,
        data: { visitorId: visitor.id },
      });
    }

    res.status(201).json({ visitor, autoApprove });
  }),
);

// ── Verify a pre-approval code without registering ──
guardRouter.get(
  "/preapprovals/:code",
  asyncHandler(async (req, res) => {
    const pa = await prisma.preApproval.findUnique({
      where: { code: req.params.code.toUpperCase() },
      include: {
        resident: {
          include: { flat: { select: { number: true, tower: { select: { name: true } } } } },
        },
      },
    });
    if (!pa) throw notFound("Invalid code");
    const valid = pa.status === "ACTIVE" && pa.validUntil > new Date() && pa.usedCount < pa.maxUses;
    res.json({ preApproval: pa, valid });
  }),
);

// ── Live gate: visitors currently on premises or awaiting entry ──
guardRouter.get(
  "/active",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const visitors = await prisma.visitor.findMany({
      where: { societyId, status: { in: ["PENDING", "APPROVED", "CHECKED_IN"] } },
      orderBy: { createdAt: "desc" },
      include: { flat: { select: { number: true, tower: { select: { name: true } } } } },
    });
    res.json({ visitors });
  }),
);

// ── Society-wide movement log ──
guardRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const visitors = await prisma.visitor.findMany({
      where: { societyId },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: { flat: { select: { number: true, tower: { select: { name: true } } } } },
    });
    res.json({ visitors });
  }),
);

// ── Mark entry / exit ──
async function setMovement(id: string, societyId: string, kind: "in" | "out", actorId: string) {
  const visitor = await prisma.visitor.findFirst({ where: { id, societyId } });
  if (!visitor) throw notFound("Visitor not found");

  if (kind === "in") {
    if (visitor.status !== "APPROVED") throw forbidden("Visitor must be approved before entry");
    const updated = await prisma.visitor.update({
      where: { id },
      data: { status: "CHECKED_IN", checkInAt: new Date() },
    });
    await prisma.visitorLog.create({ data: { visitorId: id, action: "CHECKED_IN", actorId } });
    return updated;
  }

  if (visitor.status !== "CHECKED_IN") throw forbidden("Visitor is not checked in");
  const updated = await prisma.visitor.update({
    where: { id },
    data: { status: "CHECKED_OUT", checkOutAt: new Date() },
  });
  await prisma.visitorLog.create({ data: { visitorId: id, action: "CHECKED_OUT", actorId } });
  return updated;
}

guardRouter.post(
  "/visitors/:id/checkin",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const visitor = await setMovement(req.params.id, societyId, "in", req.user!.id);
    res.json({ visitor });
  }),
);

guardRouter.post(
  "/visitors/:id/checkout",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const visitor = await setMovement(req.params.id, societyId, "out", req.user!.id);
    res.json({ visitor });
  }),
);
