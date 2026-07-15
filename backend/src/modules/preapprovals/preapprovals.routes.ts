import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, notFound } from "../../utils/http.ts";
import { getResidentContext } from "../../utils/context.ts";

export const preApprovalsRouter = Router();
preApprovalsRouter.use(authenticate);

const genCode = () =>
  Math.random().toString(36).slice(2, 6).toUpperCase() + Math.floor(1000 + Math.random() * 9000);

// ── Resident: list my pre-approvals ──
preApprovalsRouter.get(
  "/",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const preApprovals = await prisma.preApproval.findMany({
      where: { residentId: resident.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ preApprovals });
  }),
);

// ── Resident: create a pre-approval / gate pass ──
const createSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  kind: z.enum(["GUEST", "DELIVERY", "CAB", "SERVICE", "STAFF"]).default("GUEST"),
  validUntil: z.coerce.date(),
  maxUses: z.number().int().min(1).max(50).default(1),
});

preApprovalsRouter.post(
  "/",
  requireRole("RESIDENT"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const body = req.body as z.infer<typeof createSchema>;
    const preApproval = await prisma.preApproval.create({
      data: {
        code: genCode(),
        name: body.name,
        phone: body.phone,
        kind: body.kind,
        validUntil: body.validUntil,
        maxUses: body.maxUses,
        residentId: resident.id,
      },
    });
    res.status(201).json({ preApproval });
  }),
);

// ── Resident: cancel a pre-approval ──
preApprovalsRouter.post(
  "/:id/cancel",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const existing = await prisma.preApproval.findFirst({
      where: { id: req.params.id, residentId: resident.id },
    });
    if (!existing) throw notFound("Pre-approval not found");
    const preApproval = await prisma.preApproval.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
    res.json({ preApproval });
  }),
);
