/**
 * Portl — database seed
 *
 * Creates a full demo society so every dashboard (resident / guard / admin)
 * has realistic data on first run.
 *
 *   Society join code : PORTL01
 *   Admin             : admin@portl.app    / password
 *   Guard             : guard@portl.app    / password
 *   Resident          : resident@portl.app / password
 *
 * Run with:  bun run db:seed   (or `bun run db:reset` to wipe + reseed)
 */
import { PrismaClient } from "@db";
import {
  Role,
  ResidentType,
  VisitorKind,
  VisitorStatus,
  PreApprovalStatus,
  ComplaintCategory,
  ComplaintStatus,
  Priority,
  BookingStatus,
  NoticeCategory,
  PollStatus,
  BillStatus,
  PaymentMethod,
  NotificationType,
} from "@db/enums";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const PASSWORD = "password";

// ── date helpers ────────────────────────────────────────────────
const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);
const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000);
const period = () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

/**
 * Wipe existing data in FK-safe order so the seed is idempotent even when
 * run against a database that already has rows (outside of `migrate reset`).
 */
async function reset() {
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.maintenanceBill.deleteMany(),
    prisma.pollVote.deleteMany(),
    prisma.pollOption.deleteMany(),
    prisma.poll.deleteMany(),
    prisma.notice.deleteMany(),
    prisma.complaintComment.deleteMany(),
    prisma.complaint.deleteMany(),
    prisma.amenityBooking.deleteMany(),
    prisma.amenity.deleteMany(),
    prisma.visitorLog.deleteMany(),
    prisma.visitor.deleteMany(),
    prisma.preApproval.deleteMany(),
    prisma.serviceProvider.deleteMany(),
    prisma.staff.deleteMany(),
    prisma.pushToken.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.resident.deleteMany(),
    prisma.flat.deleteMany(),
    prisma.tower.deleteMany(),
    prisma.user.deleteMany(),
    prisma.society.deleteMany(),
  ]);
}

async function main() {
  console.log("🌱  Seeding Portl demo data…");
  await reset();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ── Society ───────────────────────────────────────────────────
  const society = await prisma.society.create({
    data: {
      name: "Portl Residency",
      address: "42 Palm Grove Road, Whitefield",
      city: "Bengaluru",
      code: "PORTL01",
    },
  });

  // ── Towers ────────────────────────────────────────────────────
  const [towerA, towerB, towerC] = await Promise.all(
    ["Tower A", "Tower B", "Tower C"].map((name) =>
      prisma.tower.create({ data: { name, societyId: society.id } }),
    ),
  );

  // ── Flats ─────────────────────────────────────────────────────
  // A handful per tower across a few floors.
  const flatSpecs: { tower: typeof towerA; number: string; floor: number }[] = [
    { tower: towerA, number: "A-101", floor: 1 },
    { tower: towerA, number: "A-102", floor: 1 },
    { tower: towerA, number: "A-201", floor: 2 },
    { tower: towerA, number: "A-202", floor: 2 },
    { tower: towerB, number: "B-301", floor: 3 },
    { tower: towerB, number: "B-302", floor: 3 },
    { tower: towerB, number: "B-401", floor: 4 },
    { tower: towerC, number: "C-501", floor: 5 },
    { tower: towerC, number: "C-502", floor: 5 },
    { tower: towerC, number: "C-601", floor: 6 },
  ];

  const flats: Record<string, { id: string }> = {};
  for (const spec of flatSpecs) {
    const flat = await prisma.flat.create({
      data: {
        number: spec.number,
        floor: spec.floor,
        societyId: society.id,
        towerId: spec.tower.id,
      },
    });
    flats[spec.number] = flat;
  }

  // ── Admin ─────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      name: "Anita Rao",
      email: "admin@portl.app",
      phone: "+91 90000 10001",
      passwordHash,
      role: Role.ADMIN,
      societyId: society.id,
    },
  });

  // ── Guards ────────────────────────────────────────────────────
  const guard = await prisma.user.create({
    data: {
      name: "Ramesh Kumar",
      email: "guard@portl.app",
      phone: "+91 90000 20001",
      passwordHash,
      role: Role.GUARD,
      societyId: society.id,
    },
  });
  const guard2 = await prisma.user.create({
    data: {
      name: "Suresh Yadav",
      email: "guard2@portl.app",
      phone: "+91 90000 20002",
      passwordHash,
      role: Role.GUARD,
      societyId: society.id,
    },
  });

  // ── Residents ─────────────────────────────────────────────────
  // Each entry becomes a User + a Resident row linked to a flat.
  const residentSpecs = [
    {
      name: "Priya Sharma",
      email: "resident@portl.app",
      phone: "+91 98000 30001",
      flat: "A-101",
      type: ResidentType.OWNER,
      primary: true,
    },
    {
      name: "Arjun Mehta",
      email: "arjun@portl.app",
      phone: "+91 98000 30002",
      flat: "A-102",
      type: ResidentType.OWNER,
      primary: true,
    },
    {
      name: "Fatima Sheikh",
      email: "fatima@portl.app",
      phone: "+91 98000 30003",
      flat: "A-201",
      type: ResidentType.TENANT,
      primary: true,
    },
    {
      name: "Vikram Nair",
      email: "vikram@portl.app",
      phone: "+91 98000 30004",
      flat: "B-301",
      type: ResidentType.OWNER,
      primary: true,
    },
    {
      name: "Neha Gupta",
      email: "neha@portl.app",
      phone: "+91 98000 30005",
      flat: "B-401",
      type: ResidentType.TENANT,
      primary: true,
    },
    {
      name: "Karthik Reddy",
      email: "karthik@portl.app",
      phone: "+91 98000 30006",
      flat: "C-501",
      type: ResidentType.OWNER,
      primary: true,
    },
    {
      name: "Sana Iqbal",
      email: "sana@portl.app",
      phone: "+91 98000 30007",
      flat: "C-601",
      type: ResidentType.FAMILY,
      primary: false,
    },
  ];

  const residents: Record<string, { userId: string; residentId: string; flatId: string }> = {};
  for (const spec of residentSpecs) {
    const user = await prisma.user.create({
      data: {
        name: spec.name,
        email: spec.email,
        phone: spec.phone,
        passwordHash,
        role: Role.RESIDENT,
        societyId: society.id,
        resident: {
          create: {
            flatId: flats[spec.flat].id,
            type: spec.type,
            isPrimary: spec.primary,
          },
        },
      },
      include: { resident: true },
    });
    residents[spec.email] = {
      userId: user.id,
      residentId: user.resident!.id,
      flatId: flats[spec.flat].id,
    };
  }

  const priya = residents["resident@portl.app"];
  const arjun = residents["arjun@portl.app"];
  const vikram = residents["vikram@portl.app"];

  // ── Amenities ─────────────────────────────────────────────────
  const [clubhouse, pool, gym, tennis, partyHall] = await Promise.all(
    [
      {
        name: "Clubhouse",
        description: "Community hall for gatherings",
        capacity: 100,
        openTime: "08:00",
        closeTime: "22:00",
        slotMinutes: 120,
        chargePerSlot: 500,
      },
      {
        name: "Swimming Pool",
        description: "Outdoor pool, lifeguard 6am–8pm",
        capacity: 30,
        openTime: "06:00",
        closeTime: "20:00",
        slotMinutes: 60,
        chargePerSlot: 0,
      },
      {
        name: "Gymnasium",
        description: "Fully equipped fitness center",
        capacity: 20,
        openTime: "05:00",
        closeTime: "23:00",
        slotMinutes: 60,
        chargePerSlot: 0,
      },
      {
        name: "Tennis Court",
        description: "Floodlit hard court",
        capacity: 4,
        openTime: "06:00",
        closeTime: "21:00",
        slotMinutes: 60,
        chargePerSlot: 200,
      },
      {
        name: "Party Hall",
        description: "Rooftop hall for private events",
        capacity: 60,
        openTime: "10:00",
        closeTime: "23:00",
        slotMinutes: 180,
        chargePerSlot: 1500,
      },
    ].map((a) => prisma.amenity.create({ data: { ...a, societyId: society.id } })),
  );

  // A couple of bookings for the demo resident.
  await prisma.amenityBooking.createMany({
    data: [
      {
        amenityId: clubhouse.id,
        userId: priya.userId,
        date: days(2),
        startTime: "18:00",
        endTime: "20:00",
        status: BookingStatus.CONFIRMED,
        note: "Birthday party",
      },
      {
        amenityId: tennis.id,
        userId: priya.userId,
        date: days(1),
        startTime: "07:00",
        endTime: "08:00",
        status: BookingStatus.CONFIRMED,
      },
      {
        amenityId: gym.id,
        userId: arjun.userId,
        date: days(1),
        startTime: "06:00",
        endTime: "07:00",
        status: BookingStatus.CONFIRMED,
      },
    ],
  });
  void [pool, partyHall];

  // ── Notices ───────────────────────────────────────────────────
  await prisma.notice.createMany({
    data: [
      {
        title: "Water supply interruption",
        body: "Water will be shut off on the 20th from 10am–2pm for tank cleaning. Please store water in advance.",
        category: NoticeCategory.MAINTENANCE,
        pinned: true,
        societyId: society.id,
        authorId: admin.id,
      },
      {
        title: "Independence Day celebrations",
        body: "Join us at the clubhouse lawn on Aug 15 at 8am for flag hoisting followed by breakfast.",
        category: NoticeCategory.EVENT,
        societyId: society.id,
        authorId: admin.id,
      },
      {
        title: "Maintenance dues for this month",
        body: "Monthly maintenance bills are now available in the app. Kindly clear dues before the 10th.",
        category: NoticeCategory.FINANCE,
        societyId: society.id,
        authorId: admin.id,
      },
      {
        title: "Fire drill scheduled",
        body: "A mandatory fire safety drill will be conducted this Saturday at 11am. Participation is requested from all residents.",
        category: NoticeCategory.EMERGENCY,
        pinned: true,
        societyId: society.id,
        authorId: admin.id,
      },
    ],
  });

  // ── Poll ──────────────────────────────────────────────────────
  const poll = await prisma.poll.create({
    data: {
      question: "Which weekend should we host the community festival?",
      status: PollStatus.OPEN,
      multiple: false,
      closesAt: days(7),
      societyId: society.id,
      authorId: admin.id,
      options: {
        create: [
          { text: "First weekend of next month" },
          { text: "Second weekend of next month" },
          { text: "Last weekend of next month" },
        ],
      },
    },
    include: { options: true },
  });

  await prisma.pollVote.createMany({
    data: [
      { pollId: poll.id, optionId: poll.options[0].id, userId: priya.userId },
      { pollId: poll.id, optionId: poll.options[1].id, userId: arjun.userId },
      { pollId: poll.id, optionId: poll.options[1].id, userId: vikram.userId },
    ],
  });

  // ── Complaints ────────────────────────────────────────────────
  const complaint1 = await prisma.complaint.create({
    data: {
      title: "Leaking tap in kitchen",
      description:
        "The kitchen tap has been dripping continuously for two days. Please send a plumber.",
      category: ComplaintCategory.PLUMBING,
      status: ComplaintStatus.IN_PROGRESS,
      priority: Priority.MEDIUM,
      societyId: society.id,
      raisedById: priya.userId,
      assigneeId: admin.id,
      comments: {
        create: [
          { authorId: admin.id, body: "Noted. A plumber will visit tomorrow between 10am–12pm." },
          { authorId: priya.userId, body: "Thank you, I'll be home." },
        ],
      },
    },
  });

  const complaint2 = await prisma.complaint.create({
    data: {
      title: "Elevator in Tower B making noise",
      description: "The Tower B elevator makes a grinding sound between floors 3 and 4.",
      category: ComplaintCategory.ELEVATOR,
      status: ComplaintStatus.OPEN,
      priority: Priority.HIGH,
      societyId: society.id,
      raisedById: vikram.userId,
    },
  });

  await prisma.complaint.create({
    data: {
      title: "Streetlight near gate not working",
      description:
        "The streetlight near the main gate has been off for a week, making it dark at night.",
      category: ComplaintCategory.ELECTRICAL,
      status: ComplaintStatus.RESOLVED,
      priority: Priority.LOW,
      societyId: society.id,
      raisedById: arjun.userId,
      assigneeId: admin.id,
      resolvedAt: days(-1),
      comments: {
        create: [
          { authorId: admin.id, body: "Electrician replaced the fixture. Marking as resolved." },
        ],
      },
    },
  });
  void [complaint1, complaint2];

  // ── Staff & service providers ─────────────────────────────────
  await prisma.staff.createMany({
    data: [
      {
        name: "Ramesh Kumar",
        role: "Security Guard",
        phone: "+91 90000 20001",
        shift: "Day (6am–6pm)",
        societyId: society.id,
      },
      {
        name: "Suresh Yadav",
        role: "Security Guard",
        phone: "+91 90000 20002",
        shift: "Night (6pm–6am)",
        societyId: society.id,
      },
      {
        name: "Lakshmi Devi",
        role: "Housekeeping",
        phone: "+91 90000 40001",
        shift: "Day (7am–4pm)",
        societyId: society.id,
      },
      {
        name: "Mohan Das",
        role: "Gardener",
        phone: "+91 90000 40002",
        shift: "Morning (6am–11am)",
        societyId: society.id,
      },
      {
        name: "Ganesh Pillai",
        role: "Electrician",
        phone: "+91 90000 40003",
        shift: "On-call",
        societyId: society.id,
      },
    ],
  });

  await prisma.serviceProvider.createMany({
    data: [
      {
        name: "QuickFix Plumbing",
        category: "Plumber",
        phone: "+91 91000 50001",
        rating: 4.5,
        verified: true,
        societyId: society.id,
      },
      {
        name: "BrightSpark Electricals",
        category: "Electrician",
        phone: "+91 91000 50002",
        rating: 4.2,
        verified: true,
        societyId: society.id,
      },
      {
        name: "Amma's Kitchen",
        category: "Maid / Cook",
        phone: "+91 91000 50003",
        rating: 4.8,
        verified: true,
        societyId: society.id,
      },
      {
        name: "Daily Fresh Milk",
        category: "Milk",
        phone: "+91 91000 50004",
        rating: 4.0,
        verified: false,
        societyId: society.id,
      },
      {
        name: "Morning Herald",
        category: "Newspaper",
        phone: "+91 91000 50005",
        rating: 3.9,
        verified: false,
        societyId: society.id,
      },
    ],
  });

  // ── Pre-approvals ─────────────────────────────────────────────
  const preApproval = await prisma.preApproval.create({
    data: {
      code: "GUEST-8421",
      name: "Rahul Verma",
      phone: "+91 99000 60001",
      kind: VisitorKind.GUEST,
      status: PreApprovalStatus.ACTIVE,
      validUntil: days(3),
      maxUses: 1,
      residentId: priya.residentId,
    },
  });

  await prisma.preApproval.create({
    data: {
      code: "MAID-2205",
      name: "Sunita (House help)",
      phone: "+91 99000 60002",
      kind: VisitorKind.STAFF,
      status: PreApprovalStatus.ACTIVE,
      validUntil: days(30),
      maxUses: 60,
      usedCount: 12,
      residentId: arjun.residentId,
    },
  });

  // ── Visitors (across the lifecycle) ───────────────────────────
  // PENDING — awaiting approval from Priya
  await prisma.visitor.create({
    data: {
      name: "Amazon Delivery",
      phone: "+91 99000 70001",
      kind: VisitorKind.DELIVERY,
      company: "Amazon",
      purpose: "Package delivery",
      status: VisitorStatus.PENDING,
      societyId: society.id,
      flatId: priya.flatId,
      residentId: priya.residentId,
      registeredById: guard.id,
      logs: {
        create: [{ action: "REGISTERED", actorId: guard.id, note: "Registered at main gate" }],
      },
    },
  });

  // APPROVED — pre-approved guest, not yet arrived/checked-in
  await prisma.visitor.create({
    data: {
      name: "Rahul Verma",
      phone: "+91 99000 60001",
      kind: VisitorKind.GUEST,
      purpose: "Visiting friend",
      status: VisitorStatus.APPROVED,
      approvedAt: hours(-1),
      expectedAt: hours(2),
      societyId: society.id,
      flatId: priya.flatId,
      residentId: priya.residentId,
      preApprovalId: preApproval.id,
      registeredById: guard.id,
      logs: {
        create: [
          { action: "REGISTERED", actorId: guard.id, note: "Pre-approval code GUEST-8421" },
          { action: "APPROVED", actorId: guard.id, note: "Auto-approved via gate pass" },
        ],
      },
    },
  });

  // CHECKED_IN — currently inside the society
  await prisma.visitor.create({
    data: {
      name: "Ola Cab",
      phone: "+91 99000 70002",
      kind: VisitorKind.CAB,
      company: "Ola",
      purpose: "Pickup",
      vehicleNo: "KA 05 AB 1234",
      status: VisitorStatus.CHECKED_IN,
      approvedAt: hours(-2),
      checkInAt: hours(-1),
      societyId: society.id,
      flatId: arjun.flatId,
      residentId: arjun.residentId,
      registeredById: guard.id,
      logs: {
        create: [
          { action: "REGISTERED", actorId: guard.id },
          { action: "APPROVED", actorId: arjun.userId },
          { action: "CHECKED_IN", actorId: guard.id, note: "Entered at gate" },
        ],
      },
    },
  });

  // CHECKED_OUT — completed visit (history)
  await prisma.visitor.create({
    data: {
      name: "Vikram's Guest",
      phone: "+91 99000 70003",
      kind: VisitorKind.GUEST,
      purpose: "Dinner",
      status: VisitorStatus.CHECKED_OUT,
      approvedAt: days(-1),
      checkInAt: days(-1),
      checkOutAt: hours(-20),
      societyId: society.id,
      flatId: vikram.flatId,
      residentId: vikram.residentId,
      registeredById: guard2.id,
      logs: {
        create: [
          { action: "REGISTERED", actorId: guard2.id },
          { action: "APPROVED", actorId: vikram.userId },
          { action: "CHECKED_IN", actorId: guard2.id },
          { action: "CHECKED_OUT", actorId: guard2.id, note: "Exited at gate" },
        ],
      },
    },
  });

  // DENIED — resident rejected
  await prisma.visitor.create({
    data: {
      name: "Unknown Salesman",
      phone: "+91 99000 70004",
      kind: VisitorKind.SERVICE,
      purpose: "Product demo",
      status: VisitorStatus.DENIED,
      deniedAt: hours(-5),
      societyId: society.id,
      flatId: priya.flatId,
      residentId: priya.residentId,
      registeredById: guard.id,
      logs: {
        create: [
          { action: "REGISTERED", actorId: guard.id },
          { action: "DENIED", actorId: priya.userId, note: "Not expecting anyone" },
        ],
      },
    },
  });

  // ── Maintenance bills + a payment ─────────────────────────────
  const billPeriod = period();
  const flatIds = Object.values(flats).map((f) => f.id);
  await prisma.maintenanceBill.createMany({
    data: flatIds.map((flatId) => ({
      title: `Maintenance — ${billPeriod}`,
      amount: 3500,
      dueDate: days(10),
      status: BillStatus.PENDING,
      period: billPeriod,
      societyId: society.id,
      flatId,
    })),
  });

  // Priya pays her bill.
  const priyaBill = await prisma.maintenanceBill.findFirst({
    where: { flatId: priya.flatId },
  });
  if (priyaBill) {
    await prisma.payment.create({
      data: {
        billId: priyaBill.id,
        userId: priya.userId,
        amount: priyaBill.amount,
        method: PaymentMethod.UPI,
        reference: `MOCK-${Date.now()}`,
      },
    });
    await prisma.maintenanceBill.update({
      where: { id: priyaBill.id },
      data: { status: BillStatus.PAID },
    });
  }

  // ── Notifications ─────────────────────────────────────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: priya.userId,
        type: NotificationType.VISITOR_REQUEST,
        title: "Visitor at the gate",
        body: "Amazon Delivery is waiting for your approval.",
        read: false,
      },
      {
        userId: priya.userId,
        type: NotificationType.COMPLAINT_UPDATE,
        title: "Complaint update",
        body: "Your complaint 'Leaking tap in kitchen' is now In Progress.",
        read: false,
      },
      {
        userId: priya.userId,
        type: NotificationType.NOTICE,
        title: "New notice",
        body: "Water supply interruption on the 20th.",
        read: true,
      },
      {
        userId: arjun.userId,
        type: NotificationType.VISITOR_UPDATE,
        title: "Visitor checked in",
        body: "Ola Cab has entered the society.",
        read: false,
      },
      {
        userId: admin.id,
        type: NotificationType.GENERAL,
        title: "New complaint raised",
        body: "Vikram Nair raised a complaint about the Tower B elevator.",
        read: false,
      },
    ],
  });

  // ── Summary ───────────────────────────────────────────────────
  const counts = {
    societies: await prisma.society.count(),
    towers: await prisma.tower.count(),
    flats: await prisma.flat.count(),
    users: await prisma.user.count(),
    residents: await prisma.resident.count(),
    visitors: await prisma.visitor.count(),
    preApprovals: await prisma.preApproval.count(),
    amenities: await prisma.amenity.count(),
    bookings: await prisma.amenityBooking.count(),
    notices: await prisma.notice.count(),
    polls: await prisma.poll.count(),
    complaints: await prisma.complaint.count(),
    staff: await prisma.staff.count(),
    serviceProviders: await prisma.serviceProvider.count(),
    bills: await prisma.maintenanceBill.count(),
    notifications: await prisma.notification.count(),
  };

  console.log("✅  Seed complete:", counts);
  console.log("\n   Society code : PORTL01");
  console.log("   Admin        : admin@portl.app    / password");
  console.log("   Guard        : guard@portl.app    / password");
  console.log("   Resident     : resident@portl.app / password\n");
}

main()
  .catch((err) => {
    console.error("❌  Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
