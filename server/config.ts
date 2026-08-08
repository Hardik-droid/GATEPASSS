import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().optional(),
  PGHOST: z.string().default("127.0.0.1"),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGDATABASE: z.string().default("gatepass"),
  PGUSER: z.string().default("postgres"),
  PGPASSWORD: z.string().default(""),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  GOOGLE_CLIENT_ID: z.string().default(process.env.GOOGLE_CLIENT_ID || process.env.GoogleAuth__ClientId || process.env.VITE_GOOGLE_CLIENT_ID || ""),
  NEON_AUTH_URL: z.string().default(process.env.NEON_AUTH_URL || process.env.VITE_NEON_AUTH_URL || ""),
  NEON_AUTH_AUDIENCE: z.string().default(""),
  GATEPASS_OWNER_EMAIL: z.string().email().default("ophardik001@gmail.com"),
  GATEPASS_ADMIN_EMAILS: z.string().default(""),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
}).superRefine((env, ctx) => {
  if (env.NODE_ENV === "production" && !env.NEON_AUTH_AUDIENCE) {
    ctx.addIssue({
      code: "custom",
      path: ["NEON_AUTH_AUDIENCE"],
      message: "NEON_AUTH_AUDIENCE is required in production",
    });
  }
});

export const config = envSchema.parse(process.env);
