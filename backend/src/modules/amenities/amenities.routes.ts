import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, conflict, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";

export const amenitiesRouter = Router();
amenitiesRouter.use(authenticate);

// ── List amenities in my society ──
amenitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const amenities = await prisma.amenity.findMany({
      where: { societyId, isActive: true },
      orderBy: { name: "asc" },
    });
    res.json({ amenities });
  })
);

// ── Bookings for an amenity on a date (to show taken slots) ──
amenitiesRouter.get(
  "/:id/bookings",
  asyncHandler(async (req, res) => {
    const date = req.query.date ? new Date(req.query.date as string) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const bookings = await prisma.amenityBooking.findMany({
      where: {
        amenityId: req.params.id,
        date: { gte: start, lt: end },
        status: { in: ["CONFIRMED", "PENDING"] },
      },
      select: { id: true, startTime: true, endTime: true, userId: true },
    });
    res.json({ bookings });
  })
);

// ── My bookings ──
amenitiesRouter.get(
  "/bookings/mine",
  asyncHandler(async (req, res) => {
    const bookings = await prisma.amenityBooking.findMany({
      where: { userId: req.user!.id },
      orderBy: { date: "desc" },
      include: { amenity: { select: { id: true, name: true } } },
    });
    res.json({ bookings });
  })
);

// ── Book a slot ──
const bookSchema = z.object({
  amenityId: z.string().min(1),
  date: z.coerce.date(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  note: z.string().optional(),
});

amenitiesRouter.post(
  "/bookings",
  validate(bookSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bookSchema>;
    const day = new Date(body.date);
    day.setHours(0, 0, 0, 0);
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);

    // Reject overlapping bookings for the same amenity/slot.
    const clash = await prisma.amenityBooking.findFirst({
      where: {
        amenityId: body.amenityId,
        date: { gte: day, lt: nextDay },
        status: { in: ["CONFIRMED", "PENDING"] },
        startTime: { lt: body.endTime },
        endTime: { gt: body.startTime },
      },
    });
    if (clash) throw conflict("That slot is already booked");

    const booking = await prisma.amenityBooking.create({
      data: {
        amenityId: body.amenityId,
        userId: req.user!.id,
        date: day,
        startTime: body.startTime,
        endTime: body.endTime,
        note: body.note,
      },
      include: { amenity: { select: { name: true } } },
    });
    res.status(201).json({ booking });
  })
);

// ── Cancel my booking ──
amenitiesRouter.post(
  "/bookings/:id/cancel",
  asyncHandler(async (req, res) => {
    const existing = await prisma.amenityBooking.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!existing) throw notFound("Booking not found");
    const booking = await prisma.amenityBooking.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
    res.json({ booking });
  })
);

// ── Admin: create / update amenity ──
const amenitySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  openTime: z.string().default("06:00"),
  closeTime: z.string().default("22:00"),
  slotMinutes: z.number().int().positive().default(60),
  chargePerSlot: z.number().min(0).default(0),
});

amenitiesRouter.post(
  "/",
  requireRole("ADMIN"),
  validate(amenitySchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const amenity = await prisma.amenity.create({
      data: { ...(req.body as z.infer<typeof amenitySchema>), societyId },
    });
    res.status(201).json({ amenity });
  })
);
