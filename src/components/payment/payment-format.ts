import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
  MERCADO_PAGO_PAYMENT_TYPE,
} from "@/lib/utils/payment-utils"

const ARGENTINA_TZ = "America/Argentina/Buenos_Aires"

export function formatMoney(amount: number, currency = "ARS"): string {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `$ ${amount}`
  }
}

/** "6 oct 2026, 15:30" en hora argentina (evita desfasajes server/cliente). */
export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: ARGENTINA_TZ,
  }).format(date)
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: ARGENTINA_TZ,
  }).format(date)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** mm:ss, o h:mm:ss cuando falta más de una hora. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, "0")
  const ss = String(seconds).padStart(2, "0")

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * Los query params los arma cualquiera: solo mostramos IDs numéricos de pago,
 * nunca texto arbitrario.
 */
export function sanitizePaymentId(value: string | null | undefined): string | null {
  if (!value) return null
  return /^\d{1,20}$/.test(value) ? value : null
}

/** Referencia de la orden desde la URL (solo se usa para consultar al servidor). */
export function cleanReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > 200) return null
  return trimmed
}

export function shippingMethodLabel(method: string | null | undefined): string | null {
  switch (method) {
    case "home":
    case "express":
      return "Envío a domicilio (Correo Argentino)"
    case "branch":
      return "Retiro en sucursal de Correo Argentino"
    case "store":
      return "Retiro en tienda"
    default:
      return null
  }
}

export function isStorePickupMethod(method: string | null | undefined): boolean {
  return method === "store"
}

/** Estados en los que el pago todavía puede resolverse solo (no son finales). */
export function isUnsettledPaymentStatus(status: string | null | undefined): boolean {
  return status == null || status === "pending" || status === "in_process"
}

export function isMercadoPagoType(paymentType: string | null | undefined): boolean {
  return paymentType == null || paymentType === MERCADO_PAGO_PAYMENT_TYPE
}

export function isBankTransferType(paymentType: string | null | undefined): boolean {
  return paymentType === BANK_TRANSFER_PAYMENT_TYPE
}

export function isCashStoreType(paymentType: string | null | undefined): boolean {
  return paymentType === CASH_STORE_PAYMENT_TYPE
}

/** Link a login que vuelve a la pantalla actual (el login valida que sea un path interno). */
export function buildLoginHref(returnPath: string): string {
  const safePath =
    returnPath.startsWith("/") && !returnPath.startsWith("//")
      ? returnPath
      : "/"
  return `/login?redirect=${encodeURIComponent(safePath)}&reason=auth`
}

export function buildPendingHref(externalReference: string, method: string, amount?: number): string {
  const params = new URLSearchParams({
    payment_method: method,
    external_reference: externalReference,
  })
  if (amount !== undefined && Number.isFinite(amount)) {
    params.set("amount", String(amount))
  }
  return `/payment/pending?${params.toString()}`
}
