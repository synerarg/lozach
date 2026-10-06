import { Order } from "@/types/order/order"
import { Shipping } from "@/types/shipping/shipping"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
} from "@/lib/utils/payment-utils"
import { isStorePickup } from "@/lib/utils/shipping-utils"

/**
 * Etapa de un pedido, derivada de pago + envío. Es la ÚNICA fuente de verdad
 * para filtros del dashboard, badges y la línea de tiempo del cliente.
 */
export type OrderStage =
  | "awaiting_payment" // pendiente de pago (MP sin completar / transferencia sin comprobante / efectivo)
  | "proof_review" // transferencia con comprobante por revisar
  | "payment_issue" // pago rechazado
  | "to_prepare" // pagado: hay que preparar / despachar
  | "ready_for_pickup" // retiro en tienda listo
  | "shipped" // en camino con Correo Argentino
  | "delivered" // entregado / retirado
  | "cancelled" // cancelado o vencido
  | "refunded" // reembolsado o contracargo

export type StageTone = "neutral" | "warning" | "danger" | "success" | "info"

export interface StageMeta {
  label: string
  /** Texto para el cliente (mis pedidos). */
  customerLabel: string
  description: string
  tone: StageTone
  /** Requiere una acción del admin. */
  needsAdminAction: boolean
}

export const ORDER_STAGE_META: Record<OrderStage, StageMeta> = {
  awaiting_payment: {
    label: "Pendiente de pago",
    customerLabel: "Esperando tu pago",
    description: "Todavía no se acreditó el pago.",
    tone: "warning",
    needsAdminAction: false,
  },
  proof_review: {
    label: "Revisar comprobante",
    customerLabel: "Revisando tu comprobante",
    description: "El cliente subió el comprobante de transferencia.",
    tone: "warning",
    needsAdminAction: true,
  },
  payment_issue: {
    label: "Pago rechazado",
    customerLabel: "Pago rechazado",
    description: "El pago fue rechazado.",
    tone: "danger",
    needsAdminAction: false,
  },
  to_prepare: {
    label: "Preparar pedido",
    customerLabel: "Preparando tu pedido",
    description: "Pago confirmado: falta preparar y despachar.",
    tone: "info",
    needsAdminAction: true,
  },
  ready_for_pickup: {
    label: "Listo para retirar",
    customerLabel: "Listo para retirar",
    description: "El pedido espera al cliente en la tienda.",
    tone: "info",
    needsAdminAction: false,
  },
  shipped: {
    label: "En camino",
    customerLabel: "En camino",
    description: "Despachado con Correo Argentino.",
    tone: "info",
    needsAdminAction: false,
  },
  delivered: {
    label: "Entregado",
    customerLabel: "Entregado",
    description: "El pedido llegó al cliente.",
    tone: "success",
    needsAdminAction: false,
  },
  cancelled: {
    label: "Cancelado",
    customerLabel: "Cancelado",
    description: "El pedido fue cancelado o venció.",
    tone: "neutral",
    needsAdminAction: false,
  },
  refunded: {
    label: "Reembolsado",
    customerLabel: "Reembolsado",
    description: "El pago fue reembolsado o desconocido por el comprador.",
    tone: "danger",
    needsAdminAction: false,
  },
}

type StageOrder = Pick<
  Order,
  "collection_status" | "payment_type" | "payment_proof_status" | "payment_proof_url"
>

type StageShipping = Pick<
  Shipping,
  "shipping_method" | "shipping_status"
> &
  Partial<Pick<Shipping, "ready_for_pickup_email_sent" | "tracking_number" | "imported_at" | "import_error">>

export function getOrderStage(
  order: StageOrder,
  shipping?: StageShipping | null
): OrderStage {
  const status = order.collection_status ?? "pending"

  if (status === "refunded" || status === "charged_back") {
    return "refunded"
  }

  if (status === "cancelled") {
    return "cancelled"
  }

  if (status === "rejected") {
    // Transferencia rechazada: el cliente puede volver a subir comprobante,
    // así que sigue "pendiente de pago" (el admin puede cancelarla).
    return order.payment_type === BANK_TRANSFER_PAYMENT_TYPE
      ? "awaiting_payment"
      : "payment_issue"
  }

  if (status !== "approved") {
    if (
      order.payment_type === BANK_TRANSFER_PAYMENT_TYPE &&
      order.payment_proof_status === "pending_review"
    ) {
      return "proof_review"
    }

    return "awaiting_payment"
  }

  // Pagado: el estado depende del envío.
  const shippingStatus = shipping?.shipping_status

  if (shippingStatus === "delivered") {
    return "delivered"
  }

  if (shippingStatus === "cancelled") {
    return "cancelled"
  }

  if (shippingStatus === "shipped") {
    return "shipped"
  }

  if (
    shipping &&
    isStorePickup(shipping.shipping_method) &&
    shipping.ready_for_pickup_email_sent
  ) {
    return "ready_for_pickup"
  }

  return "to_prepare"
}

export interface TimelineStep {
  key: string
  label: string
  state: "done" | "current" | "upcoming"
}

/** Línea de tiempo para "Mis pedidos" (4 pasos, cambia el último según retiro/envío). */
export function getCustomerTimeline(
  order: StageOrder,
  shipping?: StageShipping | null
): TimelineStep[] {
  const stage = getOrderStage(order, shipping)
  const pickup = shipping ? isStorePickup(shipping.shipping_method) : false
  const cash = order.payment_type === CASH_STORE_PAYMENT_TYPE

  const steps = [
    { key: "ordered", label: "Pedido recibido" },
    { key: "paid", label: cash ? "Reservado" : "Pago confirmado" },
    {
      key: "prepared",
      label: pickup ? "Listo para retirar" : "En camino",
    },
    { key: "done", label: pickup ? "Retirado" : "Entregado" },
  ]

  // índice del paso "actual" según la etapa
  const currentIndex: Record<OrderStage, number> = {
    awaiting_payment: 1,
    proof_review: 1,
    payment_issue: 1,
    to_prepare: 2,
    ready_for_pickup: 2,
    shipped: 2,
    delivered: 4,
    cancelled: -1,
    refunded: -1,
  }

  const current = currentIndex[stage]

  // Cancelado / reembolsado: no hay progreso que mostrar.
  if (current === -1) {
    return steps.map((step, index) => ({
      ...step,
      state: index === 0 ? "done" : "upcoming",
    }))
  }

  // Pedido a retirar/efectivo: "reservado" ya cuenta como hecho.
  const paidDone =
    stage === "to_prepare" ||
    stage === "ready_for_pickup" ||
    stage === "shipped" ||
    stage === "delivered" ||
    (cash && stage === "awaiting_payment")

  return steps.map((step, index) => {
    if (index === 0) {
      return { ...step, state: "done" as const }
    }
    if (index === 1) {
      return {
        ...step,
        state: paidDone ? ("done" as const) : ("current" as const),
      }
    }
    if (index < current) {
      return { ...step, state: "done" as const }
    }
    if (index === current && paidDone) {
      return { ...step, state: "current" as const }
    }
    return { ...step, state: "upcoming" as const }
  })
}

/** Texto corto de estado de pago para badges (collection_status). */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Contracargo",
}
