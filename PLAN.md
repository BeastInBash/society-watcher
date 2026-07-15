# Portl — Project Plan

A mobile-first society management app that moves the conversations that used to
happen at the society gate into one community app. Residents, Security Guards and
Society Admins each get their own dashboards, permissions and workflows.

---

## 1. Goal

Replace gate calls, WhatsApp groups and paper registers with a single product that
handles visitor approvals, resident communication and day-to-day society operations.

**Core promise:** _The conversation that used to happen at the gate now happens in the app._

---

## 2. Tech Stack

| Layer            | Choice                                                        |
| ---------------- | ------------------------------------------------------------- |
| Mobile           | Expo + React Native, Expo Router (file-based navigation)      |
| Mobile state     | Zustand (session/auth) + TanStack React Query (server state)  |
| Secure storage   | `expo-secure-store` for JWT tokens                            |
| Push             | `expo-notifications` + Expo Push (server sends via Expo SDK)  |
| Backend runtime  | Bun                                                           |
| Backend framework| Express + TypeScript                                          |
| ORM / DB         | Prisma + PostgreSQL                                           |
| Auth             | JWT access + refresh tokens, bcrypt password hashing          |
| Validation       | Zod                                                           |
| Local infra      | Docker Compose (Postgres 16)                                  |

---

## 3. Repository Layout (monorepo)

```
gaurd-dog/
├── PLAN.md                 # this document
├── README.md               # setup + demo credentials
├── docker-compose.yml      # Postgres
├── backend/                # Express + Prisma API (Bun)
│   ├── prisma/schema.prisma
│   └── src/
│       ├── index.ts        # server bootstrap
│       ├── app.ts          # express app + route wiring
│       ├── env.ts
│       ├── lib/            # prisma, jwt, password, push
│       ├── middleware/     # auth, rbac, validate, error
│       ├── utils/          # http helpers, request context
│       └── modules/        # one folder per feature (routes)
└── mobile/                 # Expo React Native app
    ├── app/                # expo-router routes
    │   ├── (auth)/         # login / register
    │   ├── (resident)/     # resident tab group
    │   ├── (guard)/        # guard tab group
    │   └── (admin)/        # admin tab group
    └── src/                # api client, stores, components, theme
```

---

## 4. User Roles & Permissions

| Capability                        | Resident | Guard | Admin |
| --------------------------------- | :------: | :---: | :---: |
| Approve / deny visitors           |    ✅    |       |       |
| Pre-approve guests (gate pass)    |    ✅    |       |       |
| Register visitor at gate          |          |  ✅   |  ✅   |
| Mark entry / exit                 |          |  ✅   |  ✅   |
| Search residents / flats          |          |  ✅   |  ✅   |
| Verify pre-approval code          |          |  ✅   |  ✅   |
| Raise complaint                   |    ✅    |       |       |
| Manage / assign complaints        |          |       |  ✅   |
| Book amenities                    |    ✅    |       |       |
| View notices & vote in polls      |    ✅    |       |       |
| Pay maintenance dues              |    ✅    |       |       |
| Publish notices / create polls    |          |       |  ✅   |
| Manage towers / flats / accounts  |          |       |  ✅   |
| Manage staff & providers          |          |       |  ✅   |

Access is enforced server-side with `authenticate` (JWT) + `requireRole(...)`
middleware. The mobile app routes each role into its own tab group after login.

---

## 5. Data Model (Prisma)

Core entities and their relationships:

- **Society** → has many **Tower** → has many **Flat**
- **User** (role: RESIDENT | GUARD | ADMIN) belongs to a Society
- **Resident** links a User to a Flat (OWNER / TENANT / FAMILY)
- **Visitor** (kind: GUEST | DELIVERY | CAB | SERVICE | STAFF) with lifecycle
  `PENDING → APPROVED → CHECKED_IN → CHECKED_OUT` (or `DENIED / EXPIRED`)
- **VisitorLog** — audit trail of every visitor state change
- **PreApproval** — resident-issued gate pass code with validity + usage limit
- **Amenity** + **AmenityBooking** (slot-based, overlap-checked)
- **Notice** (categories, pinned)
- **Poll** + **PollOption** + **PollVote** (single/multiple choice)
- **Complaint** + **ComplaintComment** (status + priority + assignee)
- **MaintenanceBill** + **Payment** (mock gateway)
- **Staff** and **ServiceProvider** directories
- **PushToken** and **Notification** (in-app + Expo push)

Full schema lives in `backend/prisma/schema.prisma`.

---

## 6. API Surface (`/api`)

| Module          | Base path         | Key endpoints                                                       |
| --------------- | ----------------- | ------------------------------------------------------------------- |
| Auth            | `/auth`           | `register`, `login`, `refresh`, `logout`, `me`, `push-token`        |
| Public          | `/public`         | `societies`, `societies/:code/flats` (for signup)                   |
| Visitors (res.) | `/visitors`       | list, `pending`, `history`, `:id/approve`, `:id/deny`               |
| Pre-approvals   | `/preapprovals`   | list, create, `:id/cancel`                                          |
| Guard ops       | `/guard`          | `search-residents`, `visitors`, `:code` verify, `active`, `history`, checkin/checkout |
| Complaints      | `/complaints`     | list, create, `:id`, comments, `PATCH :id` (admin)                  |
| Amenities       | `/amenities`      | list, `:id/bookings`, `bookings`, `bookings/mine`, cancel           |
| Notices         | `/notices`        | list, create (admin), delete (admin)                                |
| Polls           | `/polls`          | list, `:id/vote`, create/close (admin)                              |
| Directory       | `/directory`      | `staff`, `providers` (+ admin create)                               |
| Payments        | `/payments`       | `bills`, `bills/:id/pay`                                             |
| Notifications   | `/notifications`  | list, `read-all`, `:id/read`                                        |
| Admin           | `/admin`          | `overview`, towers, flats, residents, accounts, `bills/generate`    |

All routes except `/auth/*` and `/public/*` require a Bearer token.

---

## 7. Mobile App Structure

- **Auth flow** — login + resident self-signup (society code → pick flat).
  On success, tokens go to SecureStore and the user is routed by role.
- **Resident tabs** — Home (pending approvals + quick actions), Visitors
  (pre-approve / history), Community (notices, polls), Helpdesk (complaints),
  More (amenities, dues, directory, profile).
- **Guard tabs** — Gate (register visitor, verify pass), Active (on-premises),
  Log (movement history), Profile.
- **Admin tabs** — Dashboard (stats), Society (towers/flats/residents),
  Community (notices/polls/complaints), Directory, Profile.
- Shared: Axios client with token refresh interceptor, React Query hooks per
  module, reusable UI (cards, buttons, empty/loading/error states), theme tokens.

---

## 8. Key Flows

**Visitor at the gate**
1. Guard searches the flat and registers the visitor (`POST /guard/visitors`).
2. Server notifies the flat's residents (push + in-app).
3. Resident approves/denies (`POST /visitors/:id/approve`).
4. Guard sees the update and marks entry, later exit.
5. Every step is written to `VisitorLog` and appears in history.

**Pre-approved guest**
1. Resident creates a pre-approval → gets a code.
2. Guard enters the code at the gate → visitor is auto-approved on registration.

---

## 9. Build Milestones

- [x] **M0 — Infra:** Docker Postgres, monorepo, `.gitignore`.
- [x] **M1 — Backend foundation:** Bun + Express + TS, Prisma schema + migration,
      JWT auth, RBAC, error handling.
- [x] **M2 — Backend features:** visitor, guard, complaint, amenity, notice,
      poll, directory, payment, notification, admin modules.
- [ ] **M3 — Seed data:** demo society, admin/guard/resident accounts, samples.
- [ ] **M4 — Mobile foundation:** Expo + Router, auth store, API client, theme.
- [ ] **M5 — Role dashboards & feature screens** with loading/empty/error states.
- [ ] **M6 — Push notifications** wired end-to-end.
- [ ] **M7 — Polish + submission:** README, screenshots, demo video, APK/Expo build.

---

## 10. Demo Credentials (after seeding)

To be finalised with the seed script. Planned accounts:

| Role     | Email                 | Password    |
| -------- | --------------------- | ----------- |
| Admin    | `admin@portl.app`     | `password`  |
| Guard    | `guard@portl.app`     | `password`  |
| Resident | `resident@portl.app`  | `password`  |

Society join code: `PORTL01` (planned).

---

## 11. Submission Checklist

- [ ] Public GitHub repository
- [ ] Expo project (and/or APK build)
- [ ] Demo video
- [ ] README with setup instructions
- [ ] Screenshots
- [ ] Demo credentials
