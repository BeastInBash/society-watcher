import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, badRequest, notFound } from "../../utils/http.ts";
import { getResidentContext } from "../../utils/context.ts";

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

// ── Resident: my maintenance bills ──
paymentsRouter.get(
  "/bills",
  requireRole("RESIDENT"),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const bills = await prisma.maintenanceBill.findMany({
      where: { flatId: resident.flatId },
      orderBy: { dueDate: "desc" },
      include: { payments: true },
    });
    const dueTotal = bills
      .filter((b) => b.status !== "PAID" && b.status !== "WAIVED")
      .reduce((sum, b) => sum + b.amount, 0);
    res.json({ bills, dueTotal });
  })
);

// ── Resident: pay a bill (mock gateway) ──
const paySchema = z.object({
  method: z.enum(["UPI", "CARD", "NETBANKING", "CASH"]).default("UPI"),
});

paymentsRouter.post(
  "/bills/:id/pay",
  requireRole("RESIDENT"),
  validate(paySchema),
  asyncHandler(async (req, res) => {
    const resident = await getResidentContext(req.user!);
    const bill = await prisma.maintenanceBill.findFirst({
      where: { id: req.params.id, flatId: resident.flatId },
    });
    if (!bill) throw notFound("Bill not found");
    if (bill.status === "PAID") throw badRequest("Bill already paid");

    const reference = "TXN" + Date.now().toString(36).toUpperCase();
    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: {
          billId: bill.id,
          userId: req.user!.id,
          amount: bill.amount,
          method: (req.body as z.infer<typeof paySchema>).method,
          reference,
        },
      }),
      prisma.maintenanceBill.update({ where: { id: bill.id }, data: { status: "PAID" } }),
    ]);
    res.json({ payment, status: "PAID" });
  })
);
