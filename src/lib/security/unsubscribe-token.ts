import { createHmac, timingSafeEqual } from "crypto"

function getSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE

  if (!secret) {
    throw new Error("Falta UNSUBSCRIBE_SECRET (o CRON_SECRET) para firmar bajas.")
  }

  return secret
}

export function signUnsubscribeToken(email: string): string {
  return createHmac("sha256", getSecret())
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 40)
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  try {
    const expected = Buffer.from(signUnsubscribeToken(email))
    const received = Buffer.from(token)
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    )
  } catch {
    return false
  }
}

export function buildUnsubscribeUrl(siteUrl: string, email: string): string {
  const params = new URLSearchParams({
    email: email.trim().toLowerCase(),
    token: signUnsubscribeToken(email),
  })
  return `${siteUrl}/unsubscribe?${params.toString()}`
}

/** Endpoint de baja con un clic (RFC 8058): acepta POST sin interacción. */
export function buildOneClickUnsubscribeUrl(
  siteUrl: string,
  email: string
): string {
  const params = new URLSearchParams({
    email: email.trim().toLowerCase(),
    token: signUnsubscribeToken(email),
  })
  return `${siteUrl}/api/unsubscribe?${params.toString()}`
}
