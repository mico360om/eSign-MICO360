import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import { env } from "./config/env";
import { dirs } from "./lib/storage";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { requestContext } from "./lib/requestContext";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import profileRoutes from "./routes/profiles";
import roleRoutes from "./routes/roles";
import signatureGroupRoutes from "./routes/signatureGroups";
import stampRoutes from "./routes/stamps";
import documentRoutes from "./routes/documents";
import notificationRoutes from "./routes/notifications";
import dashboardRoutes from "./routes/dashboard";
import reportRoutes from "./routes/reports";
import settingRoutes from "./routes/settings";
import lookupRoutes from "./routes/lookups";
import auditRoutes from "./routes/audit";
import adminRoutes from "./routes/admin";
import templateRoutes from "./routes/templates";
import accountRoutes from "./routes/account";
import approvalTypeRoutes from "./routes/approvalTypes";
import webhookRoutes from "./routes/webhooks";
import errorReportRoutes from "./routes/errorReports";

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: (origin, cb) => {
        // allow no-origin / file:// (mobile WebView, desktop native) + whitelist
        if (!origin || origin === "null" || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, env.nodeEnv !== "production"); // permissive in dev
      },
      credentials: true,
      exposedHeaders: ["X-Page-Count"],
    }),
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(morgan(env.nodeEnv === "development" ? "dev" : "combined"));

  // Capture caller IP + device for the audit log (read via AsyncLocalStorage).
  app.set("trust proxy", true);
  app.use((req, _res, next) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || req.socket.remoteAddress || "";
    const device = (req.headers["user-agent"] as string) || "";
    requestContext.run({ ip, device }, () => next());
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "eSign MICO360 API" }));

  // Company stamp images are non-sensitive and shown in the UI (img tags can't
  // send auth headers), so they are served statically. Originals / converted /
  // final PDFs are NOT exposed here — they go through authenticated routes.
  app.use("/static/stamps", express.static(dirs.stamps));
  app.use("/static/profiles", express.static(dirs.profiles));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/profiles", profileRoutes);
  app.use("/api/roles", roleRoutes);
  app.use("/api/signature-groups", signatureGroupRoutes);
  app.use("/api/stamps", stampRoutes);
  app.use("/api/documents", documentRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/settings", settingRoutes);
  app.use("/api/lookups", lookupRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/approval-types", approvalTypeRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/error-reports", errorReportRoutes);

  // Unknown /api routes -> JSON 404.
  app.use("/api", notFoundHandler);

  // Optionally serve the web SPA (desktop app / single-server deployment).
  if (env.webDist && fs.existsSync(env.webDist)) {
    app.use(express.static(env.webDist));
    app.get("*", (_req, res) => res.sendFile(path.join(env.webDist, "index.html")));
  } else {
    app.use(notFoundHandler);
  }

  app.use(errorHandler);
  return app;
}
