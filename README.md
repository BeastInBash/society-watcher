# Portl 🐾

A mobile-first **society management app** — visitor approvals, resident
communication and community operations in one place. Built with **Expo + React
Native** (mobile) and **Express + TypeScript + Prisma + PostgreSQL** on **Bun**
(backend).

> See [`PLAN.md`](./PLAN.md) for the full architecture, data model, API surface
> and roadmap.

## Monorepo

```
gaurd-dog/
├── PLAN.md              # project plan
├── docker-compose.yml   # local Postgres
├── backend/             # Express + Prisma API (Bun runtime)
└── mobile/              # Expo React Native app
```

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- Docker (for Postgres) — or a local Postgres instance
- Expo Go app / Android or iOS simulator for the mobile app

## 1. Database

```bash
docker compose up -d        # Postgres on localhost:5433
```

## 2. Backend

```bash
cd backend
cp .env.example .env         # defaults already point at the docker DB
bun install
bun run prisma:migrate       # apply schema
bun run prisma:generate      # generate client
bun run dev                  # http://localhost:4000  (GET /health)
```

Roles are enforced with JWT auth + `requireRole()` middleware. API is served
under `/api` (see `PLAN.md` §6 for the endpoint map).

## 3. Mobile

```bash
cd mobile
cp .env.example .env         # set EXPO_PUBLIC_API_URL (use your LAN IP on device)
bun install
bun run start                # Expo dev server
```

The app foundation is in place: Expo Router, Zustand auth store, React Query,
an Axios client with token-refresh, and secure token storage.

## Status

Backend API and both project scaffolds are set up. Mobile feature screens,
seed/demo data, and push wiring are the next milestones — tracked in `PLAN.md` §9.
