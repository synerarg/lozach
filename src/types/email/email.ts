import { OrderItem } from "../order-items/order-items"
import { Order } from "../order/order"
import { CreateShippingValues, Shipping } from "../shipping/shipping"
import { Product } from "../types"

export interface EmailBody {
  name: string
  email: string
  buyedProducts: Product[]
  order: Order
  shipping: Shipping | null
  orderItems: OrderItem[]
}

/** Qué evento dispara el aviso al admin (cambia el título y el call-to-action). */
export type AdminOrderEmailVariant =
  | "sale_confirmed" // pago aprobado (MP o transferencia): hay que preparar el pedido
  | "transfer_proof_received" // el cliente subió el comprobante: hay que revisarlo
  | "cash_pickup_reserved" // pedido a pagar en efectivo al retirar

export interface AdminOrderNotificationBody {
  customerName: string
  customerEmail: string
  order: Order
  orderItems: OrderItem[]
  shipping: CreateShippingValues | Shipping | null
  variant?: AdminOrderEmailVariant
  /** URL firmada del comprobante (solo variant transfer_proof_received). */
  proofUrl?: string | null
}

export type AdminAlertSeverity = "critical" | "warning" | "info"

export interface AdminAlertEmailProps {
  title: string
  severity: AdminAlertSeverity
  summary: string
  details?: Array<{ label: string; value: string }>
  ctaLabel?: string
  ctaUrl?: string
}

export interface BankDetail {
  label: string
  value: string
}

export type OrderCancelledVariant = "expired" | "cancelled" | "refunded"

export interface CampaignProduct {
  name: string
  price: number
  imageUrl: string | null
  url: string
}

export interface CampaignContent {
  /** Asunto del mail. */
  subject: string
  /** Texto corto que se ve en la bandeja de entrada. */
  preheader?: string
  headline: string
  /** Un string por párrafo. */
  paragraphs: string[]
  imageUrl?: string | null
  ctaLabel?: string
  ctaUrl?: string
  products?: CampaignProduct[]
}

/** Lo que completa el admin en el compositor de campañas del dashboard. */
export interface CampaignInput {
  subject: string
  preheader?: string
  headline: string
  /** Texto libre: los párrafos se separan por línea en blanco. */
  body: string
  imageUrl?: string
  ctaLabel?: string
  ctaUrl?: string
  /** IDs de productos a destacar (máx. 4). Nombre, precio e imagen salen de la base. */
  productIds?: number[]
}

export interface CampaignResult {
  total: number
  sent: number
  failed: number
  testOnly: boolean
}
