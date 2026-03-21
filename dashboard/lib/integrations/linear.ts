/**
 * Linear webhook signature validation helper.
 */
import { createHmac } from "crypto";

/**
 * Verify Linear webhook HMAC-SHA256 signature.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function verifyLinearWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;

  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Linear webhook event types we handle.
 */
export type LinearWebhookAction = "create" | "update" | "remove";
export type LinearWebhookType = "Issue" | "Comment" | "Document";

export interface LinearWebhookPayload {
  action: LinearWebhookAction;
  type: LinearWebhookType;
  data: Record<string, unknown>;
  url?: string;
  createdAt?: string;
  webhookId?: string;
  updatedFrom?: Record<string, unknown>;
  actor?: {
    id: string;
    name: string;
    type: string;
  };
}
