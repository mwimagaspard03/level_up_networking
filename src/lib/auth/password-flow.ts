import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PASSWORD_FLOW_COOKIE = 'nlu-password-flow';
export type PasswordFlowIntent = 'recovery' | 'invitation';

const FLOW_TTL_SECONDS = 30 * 60;
const SUBJECT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FlowPayload = {
  version: 1;
  intent: PasswordFlowIntent;
  subject: string;
  issuedAt: number;
  expiresAt: number;
};

function getSigningKey(): string | null {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function createPasswordFlowToken(
  intent: PasswordFlowIntent,
  subject: string,
  now = Date.now(),
): string | null {
  const signingKey = getSigningKey();
  if (!signingKey || !SUBJECT_PATTERN.test(subject)) return null;

  const issuedAt = Math.floor(now / 1000);
  const payload: FlowPayload = {
    version: 1,
    intent,
    subject,
    issuedAt,
    expiresAt: issuedAt + FLOW_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyPasswordFlowToken(
  token: string | undefined,
  expectedIntent: PasswordFlowIntent,
  subject: string,
  now = Date.now(),
): boolean {
  const signingKey = getSigningKey();
  if (!signingKey || !token || token.length > 2048 || !SUBJECT_PATTERN.test(subject)) return false;

  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
    return false;
  }

  const expectedSignature = createHmac('sha256', signingKey).update(parts[0]).digest();
  const suppliedSignature = Buffer.from(parts[1], 'base64url');
  if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as Partial<FlowPayload>;
    const nowSeconds = Math.floor(now / 1000);
    return (
      payload.version === 1 &&
      payload.intent === expectedIntent &&
      payload.subject === subject &&
      Number.isSafeInteger(payload.issuedAt) &&
      Number.isSafeInteger(payload.expiresAt) &&
      (payload.issuedAt as number) <= nowSeconds + 60 &&
      payload.expiresAt === (payload.issuedAt as number) + FLOW_TTL_SECONDS &&
      (payload.expiresAt as number) > nowSeconds
    );
  } catch {
    return false;
  }
}
