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
  type AuthenticatedRequest,
  type NeonVerifier,
} from "./neonAuth.js";

const EVENT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const EVENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasValidImageSignature(contentType: string, data: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return data.length >= signature.length && data.subarray(0, signature.length).equals(signature);
  }
  return data.length >= 12
    && data.subarray(0, 4).toString("ascii") === "RIFF"
    && data.subarray(8, 12).toString("ascii") === "WEBP";
}

interface CreateAppOptions {
  store: AppStateStore;
  staticDir?: string;
  neonVerifier?: NeonVerifier;
}

// The stored snapshot is shared by every user, so its `user` field is whoever
// saved last. Never serve it back as the caller's identity — overwrite the
// identity fields with the verified JWT claims.
function applyOAuthRole(
  state: AppStateSnapshot,
  email?: string,
  name?: string,
): AppStateSnapshot {
  return {
    ...state,
    user: {
      ...state.user,
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      role: roleForAuthenticatedEmail(email),
    },
  };
}

export function createApp({ store, staticDir, neonVerifier }: CreateAppOptions) {
  const app = express();
  const authenticateNeon = makeAuthenticateNeon(neonVerifier ?? createNeonVerifier());

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

  // User identity is Neon Auth only. Google-token exchange and gp_session_*
  // strings are gone; user endpoints verify a Neon Auth JWT via JWKS.

  app.get("/api/state", authenticateNeon, async (req, res, next) => {
    try {
      const state = (await store.load()) ?? createInitialAppState();
      res.json({
        state: applyOAuthRole(
          state,
          (req as AuthenticatedRequest).authEmail,
          (req as AuthenticatedRequest).authName,
        ),
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/state", authenticateNeon, async (req, res, next) => {
    try {
      const { state } = statePayloadSchema.parse(req.body);
      await store.save(
        applyOAuthRole(
          state as AppStateSnapshot,
          (req as AuthenticatedRequest).authEmail,
          (req as AuthenticatedRequest).authName,
        ),
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post(
    "/api/event-images",
    authenticateNeon,
    express.raw({ type: [...EVENT_IMAGE_TYPES], limit: EVENT_IMAGE_MAX_BYTES }),
    async (req, res, next) => {
      try {
        const contentType = req.headers["content-type"]?.split(";", 1)[0]?.toLowerCase() ?? "";
        const data = req.body;
        if (!EVENT_IMAGE_TYPES.has(contentType)) {
          throw new HttpError(415, "Use a JPEG, PNG, or WebP picture.");
        }
        if (!Buffer.isBuffer(data) || data.length === 0 || !hasValidImageSignature(contentType, data)) {
          throw new HttpError(400, "The selected file is not a valid image.");
        }
        const uploadedBy = (req as AuthenticatedRequest).authSubject;
        if (!uploadedBy) throw new HttpError(401, "Authentication required");
        const id = await store.saveEventImage(uploadedBy, contentType, data);
        const origin = `${req.protocol}://${req.get("host")}`;
        res.status(201).json({ url: `${origin}/api/event-images?id=${id}` });
      } catch (error) {
        next(error);
      }
    },
  );

  app.get("/api/event-images", async (req, res, next) => {
    try {
      const id = typeof req.query.id === "string" ? req.query.id : "";
      if (!UUID_PATTERN.test(id)) throw new HttpError(400, "Invalid image id");
      const image = await store.loadEventImage(id);
      if (!image) throw new HttpError(404, "Image not found");
      res.set({
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.send(image.data);
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
