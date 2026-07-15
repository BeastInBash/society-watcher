import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.ts";
import { authenticate } from "../../middleware/auth.ts";
import { requireRole } from "../../middleware/rbac.ts";
import { validate } from "../../middleware/validate.ts";
import { asyncHandler, badRequest, forbidden, notFound } from "../../utils/http.ts";
import { requireSociety } from "../../utils/context.ts";
import { notifyUsers } from "../../lib/push.ts";

export const pollsRouter = Router();
pollsRouter.use(authenticate);

// Shape a poll with vote counts and the caller's own selections.
async function serialisePoll(pollId: string, userId: string) {
  const poll = await prisma.poll.findUnique({
    where: { id: pollId },
    include: {
      options: { include: { _count: { select: { votes: true } } } },
      votes: { where: { userId }, select: { optionId: true } },
      _count: { select: { votes: true } },
    },
  });
  if (!poll) return null;
  const myOptionIds = poll.votes.map((v) => v.optionId);
  return {
    id: poll.id,
    question: poll.question,
    status: poll.status,
    multiple: poll.multiple,
    closesAt: poll.closesAt,
    createdAt: poll.createdAt,
    totalVotes: poll._count.votes,
    hasVoted: myOptionIds.length > 0,
    options: poll.options.map((o) => ({
      id: o.id,
      text: o.text,
      votes: o._count.votes,
      selected: myOptionIds.includes(o.id),
    })),
  };
}

// ── List polls ──
pollsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const rows = await prisma.poll.findMany({
      where: { societyId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const polls = (
      await Promise.all(rows.map((r) => serialisePoll(r.id, req.user!.id)))
    ).filter(Boolean);
    res.json({ polls });
  })
);

pollsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const poll = await serialisePoll(req.params.id, req.user!.id);
    if (!poll) throw notFound("Poll not found");
    res.json({ poll });
  })
);

// ── Vote ──
const voteSchema = z.object({ optionIds: z.array(z.string().min(1)).min(1) });

pollsRouter.post(
  "/:id/vote",
  validate(voteSchema),
  asyncHandler(async (req, res) => {
    const { optionIds } = req.body as z.infer<typeof voteSchema>;
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.id },
      include: { options: true },
    });
    if (!poll) throw notFound("Poll not found");
    if (poll.status !== "OPEN") throw forbidden("Poll is closed");
    if (poll.closesAt && poll.closesAt < new Date()) throw forbidden("Poll has ended");
    if (!poll.multiple && optionIds.length > 1) throw badRequest("Only one option allowed");

    const valid = new Set(poll.options.map((o) => o.id));
    if (!optionIds.every((id) => valid.has(id))) throw badRequest("Invalid option");

    // Replace any previous votes by this user for this poll.
    await prisma.$transaction([
      prisma.pollVote.deleteMany({ where: { pollId: poll.id, userId: req.user!.id } }),
      prisma.pollVote.createMany({
        data: optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: req.user!.id })),
      }),
    ]);

    const result = await serialisePoll(poll.id, req.user!.id);
    res.json({ poll: result });
  })
);

// ── Admin: create poll ──
const createSchema = z.object({
  question: z.string().min(3),
  options: z.array(z.string().min(1)).min(2).max(10),
  multiple: z.boolean().default(false),
  closesAt: z.coerce.date().optional(),
});

pollsRouter.post(
  "/",
  requireRole("ADMIN"),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const societyId = requireSociety(req.user!);
    const body = req.body as z.infer<typeof createSchema>;
    const poll = await prisma.poll.create({
      data: {
        question: body.question,
        multiple: body.multiple,
        closesAt: body.closesAt,
        societyId,
        authorId: req.user!.id,
        options: { create: body.options.map((text) => ({ text })) },
      },
    });

    const residents = await prisma.user.findMany({
      where: { societyId, role: "RESIDENT" },
      select: { id: true },
    });
    await notifyUsers({
      userIds: residents.map((r) => r.id),
      type: "POLL",
      title: "New community poll",
      body: poll.question,
      data: { pollId: poll.id },
    });

    const result = await serialisePoll(poll.id, req.user!.id);
    res.status(201).json({ poll: result });
  })
);

// ── Admin: close poll ──
pollsRouter.post(
  "/:id/close",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.poll.update({ where: { id: req.params.id }, data: { status: "CLOSED" } });
    const result = await serialisePoll(req.params.id, req.user!.id);
    res.json({ poll: result });
  })
);
