import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { createInitialAppState, type AppStateSnapshot } from "../src/appState.js";
import { roleForAuthenticatedEmail } from "../src/permissions.js";
import { config } from "./config.js";
import { errorHandler, HttpError, notFoundHandler } from "./errors.js";
import type { AppStateStore } from "./store.js";
import { statePayloadSchema } from "./validation.js";
import {
  createNeonVerifier,
  makeAuthenticateNeon,
  makeOptionalAuthenticateNeon,
  type AuthenticatedRequest,
  type NeonVerifier,
} from "./neonAuth.js";

interface CreateAppOptions {
  store: AppStateStore;
  staticDir?: string;
  neonVerifier?: NeonVerifier;
}

function applyOAuthRole(state: AppStateSnapshot, email?: string): AppStateSnapshot {
  return {
    ...state,
    user: {
      ...state.user,
      ...(email ? { email } : {}),
      role: roleForAuthenticatedEmail(email),
    },
  };
}

export function createApp({ store, staticDir, neonVerifier }: CreateAppOptions) {
  const app = express();
  const verifier = neonVerifier ?? createNeonVerifier();
  const authenticateNeon = makeAuthenticateNeon(verifier);
  const optionalAuthenticateNeon = makeOptionalAuthenticateNeon(verifier);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: config.NODE_ENV === "production" ? config.CORS_ORIGIN.split(",") : true,
      methods: ["GET", "POST", "PUT", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Accept", "Authorization"],
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

  app.get("/api/state", optionalAuthenticateNeon, async (req, res, next) => {
    try {
      const state = (await store.load()) ?? createInitialAppState();
      res.json({
        state: applyOAuthRole(state, (req as AuthenticatedRequest).authEmail),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/state", optionalAuthenticateNeon, async (req, res, next) => {
    try {
      const { state } = statePayloadSchema.parse(req.body);
      await store.save(
        applyOAuthRole(
          state as AppStateSnapshot,
          (req as AuthenticatedRequest).authEmail,
        ),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", async (_req, res, next) => {
    try {
      const state = (await store.load()) ?? createInitialAppState();
      res.json({ events: state.events });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/events", optionalAuthenticateNeon, async (req, res, next) => {
    try {
      const result = await store.createEvent(req.body.event);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // QR and scanner endpoints are served exclusively by the FastAPI scanner
  // service (the sole QR/scan authority). The former Node mock routes
  // (gp:v1:mock_token_payload, hardcoded pairing code, fixed session token)
  // have been removed intentionally.

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
