import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env.ts";
import { errorHandler, notFoundHandler } from "./middleware/error.ts";

import { authRouter } from "./modules/auth/auth.routes.ts";
import { publicRouter } from "./modules/public/public.routes.ts";
import { visitorsRouter } from "./modules/visitors/visitors.routes.ts";
import { preApprovalsRouter } from "./modules/preapprovals/preapprovals.routes.ts";
import { guardRouter } from "./modules/guard/guard.routes.ts";
import { complaintsRouter } from "./modules/complaints/complaints.routes.ts";
import { amenitiesRouter } from "./modules/amenities/amenities.routes.ts";
import { noticesRouter } from "./modules/notices/notices.routes.ts";
import { pollsRouter } from "./modules/polls/polls.routes.ts";
import { directoryRouter } from "./modules/directory/directory.routes.ts";
import { paymentsRouter } from "./modules/payments/payments.routes.ts";
import { notificationsRouter } from "./modules/notifications/notifications.routes.ts";
import { adminRouter } from "./modules/admin/admin.routes.ts";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === "*" ? true : env.corsOrigin.split(","),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  if (!env.isProd) app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ ok: true, service: "portl-api" }));

  const api = express.Router();
  api.use("/auth", authRouter);
  api.use("/public", publicRouter);
  api.use("/visitors", visitorsRouter);
  api.use("/preapprovals", preApprovalsRouter);
  api.use("/guard", guardRouter);
  api.use("/complaints", complaintsRouter);
  api.use("/amenities", amenitiesRouter);
  api.use("/notices", noticesRouter);
  api.use("/polls", pollsRouter);
  api.use("/directory", directoryRouter);
  api.use("/payments", paymentsRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/admin", adminRouter);

  app.use("/api", api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
