import { prisma } from "../lib/prisma.ts";
import type { AuthUser } from "../middleware/auth.ts";
import { badRequest, forbidden } from "./http.ts";

/** Resolve the Resident record (with flat) for the authenticated resident user. */
export async function getResidentContext(user: AuthUser) {
  const resident = await prisma.resident.findUnique({
    where: { userId: user.id },
    include: { flat: true },
  });
  if (!resident) throw badRequest("No resident profile linked to this account");
  return resident;
}

/** Ensure the authenticated user belongs to a society; return its id. */
export function requireSociety(user: AuthUser): string {
  if (!user.societyId) throw forbidden("User is not attached to a society");
  return user.societyId;
}
