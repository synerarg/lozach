import { createHmac, timingSafeEqual } from "crypto"

/**
 * Valida el header `x-signature` de los webhooks de Mercado Pago.
 * https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 *
 * manifest = `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
 * v1 = HMAC-SHA256(manifest, secret) en hexa.
 */
export function verifyMercadoPagoSignature(params: {
  secret: string
  signatureHeader: string | null
  requestId: string | null
  dataId: string | null
  maxAgeMs?: number
}): boolean {
  const { secret, signatureHeader, requestId, dataId } = params
  const maxAgeMs = params.maxAgeMs ?? 15 * 60 * 1000

  if (!signatureHeader || !dataId) {
    return false
  }

  let ts: string | null = null
  let v1: string | null = null

  for (const part of signatureHeader.split(",")) {
    const [key, value] = part.split("=", 2).map((item) => item?.trim())
    if (key === "ts") ts = value
    if (key === "v1") v1 = value
  }

  if (!ts || !v1) {
    return false
  }

  // Evita replays de notificaciones viejas.
  const tsNumber = Number(ts)
  if (Number.isFinite(tsNumber)) {
    const tsMs = tsNumber < 1e12 ? tsNumber * 1000 : tsNumber
    if (Math.abs(Date.now() - tsMs) > maxAgeMs) {
      return false
    }
  }

  // MP exige el id en minúsculas cuando es alfanumérico.
  const normalizedId = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId

  let manifest = `id:${normalizedId};`
  if (requestId) {
    manifest += `request-id:${requestId};`
  }
  manifest += `ts:${ts};`

  const expected = createHmac("sha256", secret).update(manifest).digest("hex")

  const expectedBuffer = Buffer.from(expected, "utf8")
  const receivedBuffer = Buffer.from(v1, "utf8")

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}
