import { Router } from "express";
import { prisma } from "../../lib/prisma.ts";
import { asyncHandler, notFound } from "../../utils/http.ts";

// Unauthenticated lookups used by the signup flow.
export const publicRouter = Router();

publicRouter.get(
  "/societies",
  asyncHandler(async (_req, res) => {
    const societies = await prisma.society.findMany({
      select: { id: true, name: true, city: true, code: true },
      orderBy: { name: "asc" },
    });
    res.json({ societies });
  })
);

// Flats for a society (by join code) so a new resident can pick their home.
publicRouter.get(
  "/societies/:code/flats",
  asyncHandler(async (req, res) => {
    const society = await prisma.society.findUnique({
      where: { code: req.params.code.toUpperCase() },
    });
    if (!society) throw notFound("Society not found");
    const flats = await prisma.flat.findMany({
      where: { societyId: society.id },
      orderBy: [{ towerId: "asc" }, { number: "asc" }],
      include: { tower: { select: { name: true } } },
    });
    res.json({ society: { id: society.id, name: society.name, code: society.code }, flats });
  })
);
