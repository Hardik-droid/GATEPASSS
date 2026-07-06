import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState";
import { config } from "./config";
import { errorHandler, HttpError, notFoundHandler } from "./errors";
import type { AppStateStore } from "./store";
import { statePayloadSchema } from "./validation";

interface CreateAppOptions {
  store: AppStateStore;
  staticDir?: string;
}

export function createApp({ store, staticDir }: CreateAppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.NODE_ENV === "production" ? config.CORS_ORIGIN.split(",") : true,
      methods: ["GET", "PUT", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept"],
    }),
  );
  app.use(
    rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      limit: config.RATE_LIMIT_MAX,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "2mb", strict: true }));
  app.use(pinoHttp({ enabled: config.NODE_ENV !== "test" }));

  app.get("/api/health", async (_req, res, next) => {
    try {
      const db = await store.health();
      res.json({ ok: true, db });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/auth/google-login", async (req, res, next) => {
    try {
      const { idToken } = req.body;
      if (!idToken) {
        throw new HttpError(400, "idToken is required");
      }

      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
      if (!response.ok) {
        throw new HttpError(401, "Invalid Google ID token");
      }

      const payload = (await response.json()) as {
        aud: string;
        sub: string;
        email: string;
        name?: string;
        picture?: string;
      };

      if (config.GOOGLE_CLIENT_ID && payload.aud !== config.GOOGLE_CLIENT_ID) {
        throw new HttpError(401, "Audience mismatch");
      }

      // Gating login to authorized email (Issue #3)
      const allowedEmail = "hardik.jain@college.edu";
      if (payload.email.toLowerCase() !== allowedEmail.toLowerCase()) {
        throw new HttpError(403, "Access Forbidden: This Google account is not authorized to access this profile.");
      }

      const user = {
        id: payload.sub,
        name: payload.name || "Google User",
        email: payload.email,
        avatarUrl: payload.picture || "",
      };

      res.json({
        success: true,
        user,
        token: `gp_session_${payload.sub}`,
      });
    } catch (error) {
      next(error);
    }
  });

  const authenticateSession = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      next(new HttpError(401, "Unauthorized: Session token is missing. Please sign in with Google."));
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token.startsWith("gp_session_")) {
      next(new HttpError(403, "Forbidden: Invalid session token."));
      return;
    }

    next();
  };

  app.get("/api/state", authenticateSession, async (_req, res, next) => {
    try {
      const state = await store.load();
      res.json({ state: state ?? createInitialAppState() });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/state", authenticateSession, async (req, res, next) => {
    try {
      const { state } = statePayloadSchema.parse(req.body);
      await store.save(state as AppStateSnapshot);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  if (staticDir) {
    app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next(new HttpError(404, "Route not found"));
        return;
      }
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
