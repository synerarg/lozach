import { OrderWithItems } from "@/types/order/order"
import {
  CheckoutShippingMethod,
  Shipping,
  ShippingStatus,
} from "@/types/shipping/shipping"
import {
  getOrderStage,
  ORDER_STAGE_META,
  OrderStage,
  StageMeta,
  StageTone,
} from "@/lib/utils/order-stage"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
  MERCADO_PAGO_PAYMENT_TYPE,
} from "@/lib/utils/payment-utils"
import {
  isStorePickup,
  normalizeShippingMethod,
} from "@/lib/utils/shipping-utils"
import { monthKey } from "@/components/dashboard/format"

export const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Vista derivada de una orden
// ---------------------------------------------------------------------------

export interface OrderView {
  order: OrderWithItems
  shipping: Shipping | undefined
  stage: OrderStage
  meta: StageMeta
  shortId: string
  customerName: string
  customerEmail: string
  shippingMethod: CheckoutShippingMethod | null
  timestamp: number
  /** Texto en minúsculas para buscar. */
  haystack: string
  /** Solo dígitos de teléfonos y DNI para buscar números. */
  digitsHaystack: string
}

export function getOrderShipping(order: OrderWithItems): Shipping | undefined {
  return Array.isArray(order.shipping) ? order.shipping[0] : undefined
}

export function getShortId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

export function digitsOnly(value: string | number | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "")
}

export function buildOrderView(order: OrderWithItems): OrderView {
  const shipping = getOrderShipping(order)
  const stage = getOrderStage(order, shipping)
  const customerName = order.customer?.name?.trim() || "Cliente sin nombre"
  const customerEmail = order.customer?.email?.trim() || ""
  const phones = [order.phone, shipping?.phone].filter(Boolean).join(" ")
  const dni = shipping?.identifier ? String(shipping.identifier) : ""

  return {
    order,
    shipping,
    stage,
    meta: ORDER_STAGE_META[stage],
    shortId: getShortId(order.id),
    customerName,
    customerEmail,
    shippingMethod: shipping
      ? normalizeShippingMethod(shipping.shipping_method)
      : null,
    timestamp: new Date(order.created_at).getTime(),
    haystack: [
      order.id,
      getShortId(order.id),
      customerName,
      customerEmail,
      phones,
      dni,
      shipping?.tracking_number ?? "",
    ]
      .join(" ")
      .toLowerCase(),
    digitsHaystack: `${digitsOnly(phones)} ${digitsOnly(dni)}`,
  }
}

// ---------------------------------------------------------------------------
// Tabs / filtros
// ---------------------------------------------------------------------------

export type StageTab =
  | "all"
  | "action"
  | "awaiting"
  | "shipped"
  | "pickup"
  | "delivered"
  | "closed"

export const STAGE_TABS: Array<{ value: StageTab; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "action", label: "Para accionar" },
  { value: "awaiting", label: "Pendientes de pago" },
  { value: "shipped", label: "En camino" },
  { value: "pickup", label: "Listo para retirar" },
  { value: "delivered", label: "Entregadas" },
  { value: "closed", label: "Canceladas / Reembolsadas" },
]

export function matchesTab(view: OrderView, tab: StageTab): boolean {
  switch (tab) {
    case "all":
      return true
    case "action":
      return view.meta.needsAdminAction
    case "awaiting":
      return (
        view.stage === "awaiting_payment" ||
        view.stage === "proof_review" ||
        view.stage === "payment_issue"
      )
    case "shipped":
      return view.stage === "shipped"
    case "pickup":
      return view.stage === "ready_for_pickup"
    case "delivered":
      return view.stage === "delivered"
    case "closed":
      return view.stage === "cancelled" || view.stage === "refunded"
  }
}

export type PaymentFilter = "all" | "mercadopago" | "bank_transfer" | "cash_store"
export type ShippingFilter = "all" | CheckoutShippingMethod
export type SortOption = "date_desc" | "date_asc" | "amount_desc" | "amount_asc"

export const PAYMENT_FILTER_OPTIONS: Array<{
  value: PaymentFilter
  label: string
}> = [
  { value: "all", label: "Todos los medios" },
  { value: MERCADO_PAGO_PAYMENT_TYPE as PaymentFilter, label: "Mercado Pago" },
  {
    value: BANK_TRANSFER_PAYMENT_TYPE as PaymentFilter,
    label: "Transferencia",
  },
  { value: CASH_STORE_PAYMENT_TYPE as PaymentFilter, label: "Efectivo en tienda" },
]

export const SHIPPING_FILTER_OPTIONS: Array<{
  value: ShippingFilter
  label: string
}> = [
  { value: "all", label: "Todos los envíos" },
  { value: "home", label: "A domicilio" },
  { value: "branch", label: "A sucursal" },
  { value: "store", label: "Retiro en tienda" },
]

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "date_desc", label: "Más recientes" },
  { value: "date_asc", label: "Más antiguas" },
  { value: "amount_desc", label: "Mayor monto" },
  { value: "amount_asc", label: "Menor monto" },
]

export function matchesSearch(view: OrderView, query: string): boolean {
  const text = query.trim().toLowerCase()
  if (!text) return true
  if (view.haystack.includes(text)) return true

  const numericQuery = /^[\d\s+()-]+$/.test(text)
  const digits = digitsOnly(text)
  return numericQuery && digits.length >= 3 && view.digitsHaystack.includes(digits)
}

export function sortViews(views: OrderView[], sort: SortOption): OrderView[] {
  const copy = [...views]
  switch (sort) {
    case "date_asc":
      return copy.sort((a, b) => a.timestamp - b.timestamp)
    case "amount_desc":
      return copy.sort((a, b) => b.order.total_amount - a.order.total_amount)
    case "amount_asc":
      return copy.sort((a, b) => a.order.total_amount - b.order.total_amount)
    case "date_desc":
    default:
      return copy.sort((a, b) => b.timestamp - a.timestamp)
  }
}

// ---------------------------------------------------------------------------
// KPIs
// ---------------------------------------------------------------------------

export interface OrderKpis {
  actionCount: number
  proofCount: number
  prepareCount: number
  unpaidCount: number
  unpaidAmount: number
  monthSales: number
  monthCount: number
  averageTicket: number
  shippedCount: number
}

/**
 * Los ingresos cuentan solo órdenes con pago `approved`: los reembolsos y
 * contracargos tienen otro `collection_status`, así que quedan afuera.
 */
export function computeOrderKpis(views: OrderView[], now: Date): OrderKpis {
  const currentMonth = monthKey(now)
  let actionCount = 0
  let proofCount = 0
  let prepareCount = 0
  let unpaidCount = 0
  let unpaidAmount = 0
  let monthSales = 0
  let monthCount = 0
  let shippedCount = 0

  for (const view of views) {
    if (view.meta.needsAdminAction) actionCount += 1
    if (view.stage === "proof_review") proofCount += 1
    if (view.stage === "to_prepare") prepareCount += 1
    if (matchesTab(view, "awaiting")) {
      unpaidCount += 1
      unpaidAmount += view.order.total_amount
    }
    if (view.stage === "shipped") shippedCount += 1

    if (
      view.order.collection_status === "approved" &&
      monthKey(view.order.created_at) === currentMonth
    ) {
      monthSales += view.order.total_amount
      monthCount += 1
    }
  }

  return {
    actionCount,
    proofCount,
    prepareCount,
    unpaidCount,
    unpaidAmount,
    monthSales,
    monthCount,
    averageTicket: monthCount > 0 ? Math.round(monthSales / monthCount) : 0,
    shippedCount,
  }
}

// ---------------------------------------------------------------------------
// Presentación
// ---------------------------------------------------------------------------

export const TONE_BADGE_CLASSES: Record<StageTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  warning:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  info: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
}

export const TONE_DOT_CLASSES: Record<StageTone, string> = {
  neutral: "bg-muted-foreground",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  success: "bg-emerald-500",
  info: "bg-sky-500",
}

export const SHIPPING_METHOD_LABELS: Record<CheckoutShippingMethod, string> = {
  home: "Envío a domicilio",
  branch: "Retiro en sucursal de Correo Argentino",
  store: "Retiro en tienda",
}

export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  draft: "Sin preparar",
  ready: "Preparado",
  shipped: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
}

export function getShippingMethodLabel(shipping: Shipping): string {
  return SHIPPING_METHOD_LABELS[normalizeShippingMethod(shipping.shipping_method)]
}

export function isPickupShipping(shipping: Shipping | undefined): boolean {
  return shipping ? isStorePickup(shipping.shipping_method) : false
}

export interface ParsedShippingDetails {
  branchName: string | null
  branchCode: string | null
  branchAddress: string | null
  notes: string[]
}

/** `details` puede traer "Sucursal Correo Argentino: X | Código: Y | Dirección sucursal: Z". */
export function parseShippingDetails(
  details: string | null | undefined
): ParsedShippingDetails {
  const parsed: ParsedShippingDetails = {
    branchName: null,
    branchCode: null,
    branchAddress: null,
    notes: [],
  }

  if (!details) return parsed

  for (const rawPart of details.split("|")) {
    const part = rawPart.trim()
    if (!part) continue

    const branch = part.match(/^Sucursal Correo Argentino:\s*(.*)$/i)
    const code = part.match(/^C[oó]digo:\s*(.*)$/i)
    const address = part.match(/^Direcci[oó]n sucursal:\s*(.*)$/i)

    if (branch) parsed.branchName = branch[1].trim() || null
    else if (code) parsed.branchCode = code[1].trim() || null
    else if (address) parsed.branchAddress = address[1].trim() || null
    else parsed.notes.push(part)
  }

  return parsed
}

/** Solo permitimos links https:// como destino de seguimiento. */
export function safeHttpsUrl(url: string | null | undefined): string | null {
  return url && url.startsWith("https://") ? url : null
}

export function getWhatsAppUrl(phone: string | null | undefined): string | null {
  let digits = digitsOnly(phone)
  if (!digits) return null
  // Número argentino sin código de país (10 dígitos): se agrega 549.
  if (digits.length === 10) digits = `549${digits}`
  return `https://wa.me/${digits}`
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url)
}

/** Etapas en las que el cliente todavía no pagó y se puede cancelar sin cobrar. */
export function canCancelUnpaid(stage: OrderStage): boolean {
  return stage === "awaiting_payment" || stage === "payment_issue"
}

/** Pagada, con envío por Correo Argentino que todavía no se creó. */
export function needsCorreoImport(view: OrderView): boolean {
  const { order, shipping, stage } = view
  if (!shipping || isPickupShipping(shipping)) return false
  if (order.collection_status !== "approved") return false
  if (stage === "delivered" || stage === "cancelled" || stage === "refunded") {
    return false
  }
  return !shipping.imported_at
}
