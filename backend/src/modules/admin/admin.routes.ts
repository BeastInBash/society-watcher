import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { hashPassword } from "../../lib/password.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, badRequest, conflict, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";

export const adminRouter = Router();
adminRouter.use(authenticate, requireRole("ADMIN"));

// ── Dashboard summary ──
adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      towers,
      flats,
      residents,
      guards,
      openComplaints,
      visitorsToday,
      activePolls,
      onPremises,
    ] = await Promise.all([
      prisma.tower.count({ where: { societyId } }),
      prisma.flat.count({ where: { societyId } }),
      prisma.user.count({ where: { societyId, role: "RESIDENT" } }),
      prisma.user.count({ where: { societyId, role: "GUARD" } }),
      prisma.complaint.count({ where: { societyId, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.visitor.count({ where: { societyId, createdAt: { gte: today } } }),
      prisma.poll.count({ where: { societyId, status: "OPEN" } }),
      prisma.visitor.count({ where: { societyId, status: "CHECKED_IN" } }),
    ]);

    res.json({
      stats: {
        towers,
        flats,
        residents,
        guards,
        openComplaints,
        visitorsToday,
        activePolls,
        onPremises,
      },
    });
  }),
);

// ── Towers ──
adminRouter.get(
  "/towers",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const towers = await prisma.tower.findMany({
      where: { societyId },
      orderBy: { name: "asc" },
      include: { _count: { select: { flats: true } } },
    });
    res.json({ towers });
  }),
);

adminRouter.post(
  "/towers",
  validate(z.object({ name: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const tower = await prisma.tower.create({ data: { name: req.body.name, societyId } });
    res.status(201).json({ tower });
  }),
);

// ── Flats ──
adminRouter.get(
  "/flats",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const towerId = req.query.towerId as string | undefined;
    const flats = await prisma.flat.findMany({
      where: { societyId, ...(towerId ? { towerId } : {}) },
      orderBy: [{ towerId: "asc" }, { number: "asc" }],
      include: {
        tower: { select: { name: true } },
        residents: {
          include: { user: { select: { id: true, name: true, phone: true } } },
        },
      },
    });
    res.json({ flats });
  }),
);

const flatSchema = z.object({
  number: z.string().min(1),
  floor: z.number().int().optional(),
  towerId: z.string().min(1),
});

adminRouter.post(
  "/flats",
  validate(flatSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof flatSchema>;
    const tower = await prisma.tower.findFirst({ where: { id: body.towerId, societyId } });
    if (!tower) throw badRequest("Tower not found in this society");
    const flat = await prisma.flat.create({
      data: { number: body.number, floor: body.floor, towerId: body.towerId, societyId },
    });
    res.status(201).json({ flat });
  }),
);

// ── Residents & staff accounts ──
adminRouter.get(
  "/residents",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const residents = await prisma.user.findMany({
      where: { societyId, role: "RESIDENT" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isActive: true,
        resident: {
          select: {
            type: true,
            flat: { select: { number: true, tower: { select: { name: true } } } },
          },
        },
      },
    });
    res.json({ residents });
  }),
);

// ── Create a resident or guard account ──
const accountSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(["RESIDENT", "GUARD"]),
  flatId: z.string().optional(),
  residentType: z.enum(["OWNER", "TENANT", "FAMILY"]).default("OWNER"),
});

adminRouter.post(
  "/accounts",
  validate(accountSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof accountSchema>;

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict("Email already registered");

    if (body.role === "RESIDENT") {
      if (!body.flatId) throw badRequest("flatId is required for residents");
      const flat = await prisma.flat.findFirst({ where: { id: body.flatId, societyId } });
      if (!flat) throw badRequest("Flat not found in this society");
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        societyId,
        ...(body.role === "RESIDENT" && body.flatId
          ? { resident: { create: { flatId: body.flatId, type: body.residentType } } }
          : {}),
      },
      select: { id: true, name: true, email: true, role: true },
    });
    res.status(201).json({ user });
  }),
);

// ── Toggle account active state ──
adminRouter.patch(
  "/accounts/:id",
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const target = await prisma.user.findFirst({ where: { id: req.params.id, societyId } });
    if (!target) throw notFound("User not found");
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: req.body.isActive },
      select: { id: true, isActive: true },
    });
    res.json({ user });
  }),
);

// ── Generate maintenance bills for every flat in a period ──
const billSchema = z.object({
  title: z.string().min(3),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
  period: z.string().optional(),
});

adminRouter.post(
  "/bills/generate",
  validate(billSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof billSchema>;
    const flats = await prisma.flat.findMany({ where: { societyId }, select: { id: true } });
    const result = await prisma.maintenanceBill.createMany({
      data: flats.map((f) => ({
        title: body.title,
        amount: body.amount,
        dueDate: body.dueDate,
        period: body.period,
        societyId,
        flatId: f.id,
      })),
    });
    res.status(201).json({ created: result.count });
  }),
);
