import { CoverUploadLinkConfig } from "./types";

export function generateCoverToken(): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36).substring(4);
  return `${randomPart}${timePart}`;
}

export interface CreateCoverConfigOptions {
  expiryHours?: number | null; // null for Never
  password?: string | null;
  allowReplace?: boolean;
  hasCustomCover?: boolean;
  lastUpdated?: string;
}

export function createCoverConfig(options?: CreateCoverConfigOptions): CoverUploadLinkConfig {
  const token = generateCoverToken();
  const createdAt = new Date().toISOString();
  let expiresAt: string | null = null;

  if (options?.expiryHours && options.expiryHours > 0) {
    const expDate = new Date();
    expDate.setHours(expDate.getHours() + options.expiryHours);
    expiresAt = expDate.toISOString();
  }

  return {
    token,
    createdAt,
    expiresAt,
    password: options?.password?.trim() || null,
    isDisabled: false,
    allowReplace: options?.allowReplace ?? true,
    hasCustomCover: options?.hasCustomCover ?? false,
    lastUpdated: options?.lastUpdated ?? createdAt,
  };
}

export function getShareableCoverUploadUrl(eventId: string, token?: string): string {
  const origin = window.location.origin;
  const baseUrl = `${origin}/event/${encodeURIComponent(eventId)}/cover-upload`;
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
}

export interface LinkValidationResult {
  isValid: boolean;
  requiresPassword?: boolean;
  errorReason?: "disabled" | "expired" | "invalid_password" | "not_found";
}

export function validateCoverLink(
  config?: CoverUploadLinkConfig,
  passwordAttempt?: string
): LinkValidationResult {
  if (!config) {
    return { isValid: true };
  }

  if (config.isDisabled) {
    return { isValid: false, errorReason: "disabled" };
  }

  if (config.expiresAt) {
    const expiryTime = new Date(config.expiresAt).getTime();
    if (Date.now() > expiryTime) {
      return { isValid: false, errorReason: "expired" };
    }
  }

  if (config.password && config.password.trim().length > 0) {
    if (!passwordAttempt || passwordAttempt.trim() !== config.password.trim()) {
      return { isValid: false, requiresPassword: true, errorReason: "invalid_password" };
    }
  }

  return { isValid: true };
}

export function formatExpiryLabel(expiresAt?: string | null): string {
  if (!expiresAt) return "Never";
  const expDate = new Date(expiresAt);
  const now = new Date();
  const diffHours = Math.round((expDate.getTime() - now.getTime()) / (1000 * 60 * 60));
  
  if (diffHours <= 0) return "Expired";
  if (diffHours < 24) return `In ${diffHours} hours`;
  const diffDays = Math.round(diffHours / 24);
  return `In ${diffDays} day${diffDays > 1 ? "s" : ""}`;
}
