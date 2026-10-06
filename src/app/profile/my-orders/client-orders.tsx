"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  Mail,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react"

import {
  buildPendingHref,
  formatDate,
  formatDateTime,
  isBankTransferType,
  isCashStoreType,
  isMercadoPagoType,
} from "@/components/payment/payment-format"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { orderShortId, STORE_PICKUP_INFO, SUPPORT_EMAIL } from "@/lib/config/site"
import { cn } from "@/lib/utils"
import {
  getCustomerTimeline,
  getOrderStage,
  ORDER_STAGE_META,
  PAYMENT_STATUS_LABELS,
  type OrderStage,
  type StageTone,
} from "@/lib/utils/order-stage"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  getPaymentTypeLabel,
} from "@/lib/utils/payment-utils"
import { isStorePickup } from "@/lib/utils/shipping-utils"
import type { OrderItem } from "@/types/order-items/order-items"
import type { Order } from "@/types/order/order"
import type { Shipping } from "@/types/shipping/shipping"

import { OrderTimeline } from "./order-timeline"

/** Producto tal como lo necesita esta pantalla (la query solo trae estas columnas). */
export interface OrderProduct {
  id: number
  name: string
  image_url: string | null
  fabric: string | null
}

/** Subconjunto de la orden que viaja al cliente. */
export type CustomerOrder = Pick<
  Order,
  | "id"
  | "created_at"
  | "total_amount"
  | "subtotal"
  | "payment_type"
  | "collection_status"
  | "external_reference"
  | "currency"
  | "expires_at"
  | "payment_proof_status"
  | "payment_proof_uploaded_at"
  | "payment_proof_rejection_reason"
>

/** Subconjunto del envío que viaja al cliente (incluye seguimiento). */
export type CustomerShipping = Pick<
  Shipping,
  | "id"
  | "shipping_method"
  | "shipping_cost"
  | "shipping_status"
  | "address"
  | "details"
  | "postal_code"
  | "city"
  | "state"
  | "phone"
  | "identifier"
  | "tracking_number"
  | "tracking_url"
  | "last_tracking_status"
  | "ready_for_pickup_email_sent"
>

export interface OrderEntry {
  order: CustomerOrder
  items: { product: OrderProduct | null; orderItem: OrderItem }[]
  /** No se pudieron cargar los artículos de este pedido. */
  itemsError: boolean
  shipping: CustomerShipping | null
}

type Props = {
  orders: OrderEntry[]
  /** Mensaje si falló la carga de la lista completa. */
  loadError?: string | null
}

const shippingMethodLabels: Record<Shipping["shipping_method"], string> = {
  home: "Envío a domicilio",
  branch: "Retiro en sucursal Correo Argentino",
  express: "Envío express",
  store: "Retiro en tienda",
}

const TONE_BADGE: Record<StageTone, string> = {
  neutral: "border-neutral-200 bg-neutral-100 text-neutral-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const TONE_DOT: Record<StageTone, string> = {
  neutral: "bg-neutral-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  success: "bg-emerald-500",
  info: "bg-blue-500",
}

const TONE_PANEL: Record<StageTone, string> = {
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
}

const TONE_ICON: Record<StageTone, LucideIcon> = {
  neutral: Info,
  warning: Clock,
  danger: AlertTriangle,
  success: CheckCircle2,
  info: Info,
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `$ ${amount}`
  }
}

/** Una transferencia rechazada se muestra como tal (puede volver a subir comprobante). */
function isRejectedTransfer(order: CustomerOrder): boolean {
  return (
    isBankTransferType(order.payment_type) &&
    order.collection_status === "rejected"
  )
}

function getStageDisplay(
  order: CustomerOrder,
  shipping: CustomerShipping | null
): { stage: OrderStage; label: string; tone: StageTone } {
  const stage = getOrderStage(order, shipping)

  if (isRejectedTransfer(order)) {
    return { stage, label: "Comprobante rechazado", tone: "danger" }
  }

  const meta = ORDER_STAGE_META[stage]
  return { stage, label: meta.customerLabel, tone: meta.tone }
}

type FilterKey = "all" | "payment" | "active" | "delivered" | "closed"

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "payment", label: "Pendientes de pago" },
  { key: "active", label: "En curso" },
  { key: "delivered", label: "Entregados" },
  { key: "closed", label: "Cancelados" },
]

function getFilterGroup(
  stage: OrderStage,
  rejectedTransfer: boolean
): Exclude<FilterKey, "all"> {
  if (rejectedTransfer) return "payment"

  switch (stage) {
    case "awaiting_payment":
    case "proof_review":
    case "payment_issue":
      return "payment"
    case "to_prepare":
    case "ready_for_pickup":
    case "shipped":
      return "active"
    case "delivered":
      return "delivered"
    default:
      return "closed"
  }
}

interface OrderRow {
  entry: OrderEntry
  stage: OrderStage
  label: string
  tone: StageTone
  group: Exclude<FilterKey, "all">
}

function StageBadge({ label, tone }: { label: string; tone: StageTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 w-fit select-none items-center gap-2 rounded-full border px-3 text-sm font-medium",
        TONE_BADGE[tone]
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-2 w-2 rounded-full", TONE_DOT[tone])}
      />
      {label}
    </span>
  )
}

interface PanelConfig {
  tone: StageTone
  title: string
  body?: React.ReactNode
  cta?: { href: string; label: string; icon: LucideIcon; external?: boolean }
  support?: boolean
}

function buildPanel(
  order: CustomerOrder,
  shipping: CustomerShipping | null,
  stage: OrderStage
): PanelConfig | null {
  const reference = order.external_reference
  const pickup = shipping ? isStorePickup(shipping.shipping_method) : false
  const transfer = isBankTransferType(order.payment_type)

  // Transferencia rechazada: puede volver a subir comprobante.
  if (isRejectedTransfer(order)) {
    return {
      tone: "danger",
      title: "Tu comprobante fue rechazado",
      body: (
        <>
          {order.payment_proof_rejection_reason
            ? `Motivo: ${order.payment_proof_rejection_reason}. `
            : ""}
          Subí un comprobante nuevo y lo revisamos de nuevo.
        </>
      ),
      cta: reference
        ? {
            href: buildPendingHref(
              reference,
              BANK_TRANSFER_PAYMENT_TYPE,
              order.total_amount
            ),
            label: "Subir nuevo comprobante",
            icon: Upload,
          }
        : undefined,
      support: true,
    }
  }

  switch (stage) {
    case "awaiting_payment": {
      if (transfer) {
        const expires = formatDateTime(order.expires_at)
        const expired =
          order.expires_at != null &&
          new Date(order.expires_at).getTime() < Date.now()

        return {
          tone: "warning",
          title: "Falta tu comprobante de transferencia",
          body: expired
            ? "El plazo figura vencido. Si ya transferiste, subí el comprobante igual y lo revisamos."
            : expires
              ? `Transferí y subí el comprobante antes del ${expires} para confirmar tu pedido.`
              : "Transferí y subí el comprobante para confirmar tu pedido.",
          cta: reference
            ? {
                href: buildPendingHref(
                  reference,
                  BANK_TRANSFER_PAYMENT_TYPE,
                  order.total_amount
                ),
                label: "Subir comprobante",
                icon: Upload,
              }
            : undefined,
        }
      }

      if (isCashStoreType(order.payment_type)) {
        return {
          tone: "info",
          title: "Pedido reservado",
          body: `Pagás en efectivo cuando lo retirás en la tienda. ${STORE_PICKUP_INFO}`,
        }
      }

      if (isMercadoPagoType(order.payment_type)) {
        return {
          tone: "warning",
          title: "Esperando la confirmación del pago",
          body: (
            <>
              {order.collection_status === "in_process"
                ? "Mercado Pago está revisando tu pago. "
                : "Todavía no se acreditó tu pago. "}
              Si ya pagaste, se actualiza solo en unos minutos y te avisamos por
              mail.
            </>
          ),
          cta: reference
            ? {
                href: `/payment/success?external_reference=${encodeURIComponent(reference)}`,
                label: "Revisar estado del pago",
                icon: Clock,
              }
            : undefined,
        }
      }

      return null
    }

    case "proof_review": {
      const uploaded = formatDateTime(order.payment_proof_uploaded_at)
      return {
        tone: "warning",
        title: "Estamos revisando tu comprobante",
        body: `${uploaded ? `Lo recibimos el ${uploaded}. ` : ""}Apenas lo confirmemos te avisamos por mail y empezamos a preparar tu pedido.`,
      }
    }

    case "payment_issue":
      return {
        tone: "danger",
        title: "El pago fue rechazado",
        body: "Podés volver a comprar con otro medio de pago.",
        cta: { href: "/products", label: "Volver a la tienda", icon: ShoppingBag },
        support: true,
      }

    case "to_prepare":
      return {
        tone: "info",
        title: "Pago confirmado",
        body: pickup
          ? "Estamos preparando tu pedido y te avisamos por mail cuando esté listo para retirar."
          : "Estamos preparando tu pedido. Cuando se despache te mandamos el número de seguimiento por mail.",
      }

    case "ready_for_pickup":
      return {
        tone: "info",
        title: "Tu pedido está listo para retirar",
        body: STORE_PICKUP_INFO,
      }

    case "shipped":
      return {
        tone: "info",
        title: "Tu pedido está en camino",
        body: "Lo despachamos con Correo Argentino. Podés seguirlo con el número de seguimiento.",
      }

    case "delivered":
      return {
        tone: "success",
        title: pickup ? "Pedido retirado" : "Pedido entregado",
        body: "¡Gracias por tu compra!",
      }

    case "refunded":
      return {
        tone: "danger",
        title: "El pago fue reembolsado",
        body: "Si tenés dudas sobre el reintegro, escribinos.",
        support: true,
      }

    case "cancelled":
      return {
        tone: "neutral",
        title: "Pedido cancelado",
        body: transfer
          ? "Venció el plazo para transferir y el pedido se canceló. Si ya transferiste, escribinos con tu comprobante y lo resolvemos."
          : "El pedido se canceló o venció el plazo de pago. Si ya pagaste, escribinos y lo resolvemos.",
        support: true,
      }

    default:
      return null
  }
}

function OrderStatusPanel({
  order,
  shipping,
  stage,
}: {
  order: CustomerOrder
  shipping: CustomerShipping | null
  stage: OrderStage
}) {
  const panel = buildPanel(order, shipping, stage)
  const trackingNumber = shipping?.tracking_number ?? null
  const trackingUrl =
    shipping?.tracking_url && shipping.tracking_url.startsWith("https://")
      ? shipping.tracking_url
      : null
  const showTracking =
    Boolean(trackingNumber) && stage !== "cancelled" && stage !== "refunded"

  if (!panel && !showTracking) return null

  const Icon = panel ? TONE_ICON[panel.tone] : Truck
  const CtaIcon = panel?.cta?.icon

  return (
    <div className="space-y-3">
      {panel && (
        <div
          className={cn(
            "flex gap-3 rounded-xl border p-4 text-sm",
            TONE_PANEL[panel.tone]
          )}
        >
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-semibold">{panel.title}</p>
            {panel.body && <p className="leading-relaxed">{panel.body}</p>}
            {(panel.cta || panel.support) && (
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                {panel.cta && CtaIcon && (
                  <Button
                    asChild
                    className="h-11 w-full bg-black text-white hover:bg-neutral-800 sm:w-auto"
                  >
                    <Link href={panel.cta.href}>
                      <CtaIcon aria-hidden="true" />
                      {panel.cta.label}
                    </Link>
                  </Button>
                )}
                {panel.support && (
                  <Button
                    asChild
                    variant="outline"
                    className="h-11 w-full bg-white sm:w-auto"
                  >
                    <a
                      href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                        `Consulta por el pedido #${orderShortId(order.id)}`
                      )}`}
                    >
                      <Mail aria-hidden="true" />
                      Escribir a soporte
                    </a>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showTracking && shipping && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <Truck
              className="mt-0.5 h-5 w-5 shrink-0 text-neutral-700"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-neutral-600">Seguimiento · Correo Argentino</p>
              <p className="break-all font-mono font-semibold text-neutral-900">
                {trackingNumber}
              </p>
              {shipping.last_tracking_status && (
                <p className="mt-1 text-neutral-700">
                  Último estado:{" "}
                  <span className="font-medium">
                    {shipping.last_tracking_status}
                  </span>
                </p>
              )}
            </div>
          </div>
          {trackingUrl && (
            <Button
              asChild
              variant="outline"
              className="h-11 w-full shrink-0 sm:w-auto"
            >
              <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                Seguir envío
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">(se abre en una pestaña nueva)</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function OrderCard({ row }: { row: OrderRow }) {
  const { entry, stage, label, tone } = row
  const { order, items, shipping, itemsError } = entry

  const shippingAmount = shipping?.shipping_cost || 0
  const discountAmount = Math.max(
    0,
    order.subtotal + shippingAmount - order.total_amount
  )
  const discountLabel = isBankTransferType(order.payment_type)
    ? "Descuento por transferencia"
    : isCashStoreType(order.payment_type)
      ? "Descuento por pago en efectivo"
      : "Descuento"

  const showTimeline =
    stage !== "cancelled" && stage !== "refunded" && stage !== "payment_issue"
  const timeline = showTimeline ? getCustomerTimeline(order, shipping) : null
  const paymentStatus = order.collection_status ?? "pending"
  const pickup = shipping ? isStorePickup(shipping.shipping_method) : false

  return (
    <Card className="rounded-xl border-neutral-200 bg-white text-black shadow-sm">
      <CardHeader className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle
              role="heading"
              aria-level={2}
              className="text-xl font-semibold"
            >
              Pedido #{orderShortId(order.id)}
            </CardTitle>
            <p className="mt-1 text-sm text-neutral-600">
              {formatDate(order.created_at)}
              {order.payment_type
                ? ` · ${getPaymentTypeLabel(order.payment_type)}`
                : ""}
            </p>
          </div>
          <StageBadge label={label} tone={tone} />
        </div>

        {timeline && (
          <>
            <Separator className="bg-neutral-200" />
            <OrderTimeline steps={timeline} />
          </>
        )}
      </CardHeader>

      <CardContent className="space-y-6 p-4 pt-0 sm:p-6 sm:pt-0">
        <OrderStatusPanel order={order} shipping={shipping} stage={stage} />

        <Separator className="bg-neutral-200" />

        {/* Artículos */}
        <div>
          <h3 className="mb-4 text-lg font-semibold">Artículos pedidos</h3>
          {itemsError ? (
            <p
              role="alert"
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
            >
              No pudimos cargar los artículos de este pedido. Probá recargar la
              página.
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-neutral-600">
              Este pedido no tiene artículos registrados.
            </p>
          ) : (
            <ul className="space-y-3">
              {items.map(({ product, orderItem }) => {
                const name = orderItem.product_name || product?.name || "Producto"

                return (
                  <li
                    key={orderItem.id}
                    className="flex gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 sm:gap-4 sm:p-4"
                  >
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                      <Image
                        src={product?.image_url || "/placeholder.svg"}
                        alt={name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <h4 className="font-medium leading-tight">{name}</h4>
                        <p className="whitespace-nowrap font-semibold">
                          {formatCurrency(
                            orderItem.unit_price * orderItem.quantity,
                            order.currency
                          )}
                        </p>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-sm text-neutral-600">
                        <p>
                          Cantidad: {orderItem.quantity}
                          {orderItem.quantity > 1
                            ? ` · ${formatCurrency(orderItem.unit_price, order.currency)} c/u`
                            : ""}
                        </p>
                        <p>
                          Color: {orderItem.color} · Talle: {orderItem.size}
                        </p>
                        {product?.fabric && <p>Tela: {product.fabric}</p>}
                        <p className="text-xs text-neutral-500">
                          SKU: {orderItem.sku}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <Separator className="bg-neutral-200" />

        <div className="grid gap-6 sm:grid-cols-2">
          {/* Envío */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">
              {pickup ? "Retiro" : "Información de envío"}
            </h3>
            <div className="space-y-2 text-sm text-neutral-800">
              {shipping ? (
                <>
                  <p>
                    <span className="text-neutral-600">Método:</span>{" "}
                    {shippingMethodLabels[shipping.shipping_method] ??
                      "Método desconocido"}
                  </p>
                  {!pickup && (
                    <>
                      <p>
                        <span className="text-neutral-600">Dirección:</span>{" "}
                        {shipping.address}
                      </p>
                      <p>
                        <span className="text-neutral-600">Ciudad:</span>{" "}
                        {shipping.city}, {shipping.state}
                      </p>
                      <p>
                        <span className="text-neutral-600">CP:</span>{" "}
                        {shipping.postal_code}
                      </p>
                    </>
                  )}
                  {pickup && (
                    <p className="flex gap-2 text-neutral-700">
                      <Store
                        className="mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      {STORE_PICKUP_INFO}
                    </p>
                  )}
                  {shipping.details && (
                    <p>
                      <span className="text-neutral-600">Detalles:</span>{" "}
                      {shipping.details}
                    </p>
                  )}
                  <p>
                    <span className="text-neutral-600">Teléfono:</span>{" "}
                    {shipping.phone}
                  </p>
                </>
              ) : (
                <p className="text-neutral-600">
                  Sin información de entrega asociada.
                </p>
              )}
            </div>
          </div>

          {/* Resumen */}
          <div>
            <h3 className="mb-3 text-lg font-semibold">Resumen del pedido</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-neutral-800">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between text-neutral-800">
                <span>Envío</span>
                <span>
                  {shippingAmount === 0 && pickup
                    ? "Gratis"
                    : formatCurrency(shippingAmount, order.currency)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>{discountLabel}</span>
                  <span>-{formatCurrency(discountAmount, order.currency)}</span>
                </div>
              )}
              <Separator className="bg-neutral-200" />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total_amount, order.currency)}</span>
              </div>
              <p className="pt-2 text-neutral-600">
                Estado del pago:{" "}
                <span className="font-medium text-neutral-900">
                  {PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus}
                </span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const ORDERS_PER_PAGE = 5

export default function MyOrdersSection({ orders, loadError = null }: Props) {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<FilterKey>("all")

  const rows = useMemo<OrderRow[]>(
    () =>
      orders.map((entry) => {
        const { stage, label, tone } = getStageDisplay(
          entry.order,
          entry.shipping
        )
        return {
          entry,
          stage,
          label,
          tone,
          group: getFilterGroup(stage, isRejectedTransfer(entry.order)),
        }
      }),
    [orders]
  )

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return rows.filter((row) => {
      if (filter !== "all" && row.group !== filter) return false
      if (!term) return true

      const { order, items, shipping } = row.entry

      const haystack: (string | null | undefined)[] = [
        order.id,
        orderShortId(order.id),
        row.label,
        PAYMENT_STATUS_LABELS[order.collection_status ?? "pending"],
        getPaymentTypeLabel(order.payment_type),
        shipping ? shippingMethodLabels[shipping.shipping_method] : null,
        shipping?.identifier ? String(shipping.identifier) : null,
        shipping?.tracking_number,
        ...items.flatMap(({ product, orderItem }) => [
          orderItem.product_name,
          product?.name,
        ]),
      ]

      return haystack.some((value) => value?.toLowerCase().includes(term))
    })
  }, [rows, searchTerm, filter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ORDERS_PER_PAGE))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * ORDERS_PER_PAGE
  const endIndex = startIndex + ORDERS_PER_PAGE
  const currentRows = filteredRows.slice(startIndex, endIndex)

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const handleFilterChange = (value: FilterKey) => {
    setFilter(value)
    setCurrentPage(1)
  }

  const hasOrders = orders.length > 0

  return (
    <section className="min-h-screen bg-white px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col items-center">
          <h1 className="text-3xl font-bold tracking-tight text-black sm:text-4xl">
            Mis pedidos
          </h1>
          <p className="mt-2 text-center text-neutral-600">
            Revisá el estado y los detalles de tus compras
          </p>

          {hasOrders && (
            <>
              <div className="relative mt-6 w-full max-w-md">
                <Input
                  type="search"
                  aria-label="Buscar pedidos"
                  placeholder="Buscar por N° de pedido, producto, estado, seguimiento..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="h-11 w-full pr-10"
                />
                <Search
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black"
                  aria-hidden="true"
                />
              </div>

              <div
                role="group"
                aria-label="Filtrar pedidos por estado"
                className="mt-4 flex flex-wrap justify-center gap-2"
              >
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={filter === item.key}
                    onClick={() => handleFilterChange(item.key)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1",
                      filter === item.key
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <p
                className="mt-3 min-h-5 text-sm text-neutral-500"
                role="status"
                aria-live="polite"
              >
                {searchTerm || filter !== "all"
                  ? `${filteredRows.length} de ${orders.length} pedidos`
                  : ""}
              </p>
            </>
          )}
        </div>

        {loadError && (
          <p
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
        )}

        <div className="space-y-6">
          {currentRows.map((row) => (
            <OrderCard key={row.entry.order.id} row={row} />
          ))}
        </div>

        {filteredRows.length === 0 && !loadError && (
          <Card className="rounded-xl border-neutral-200 bg-white shadow-sm">
            <CardContent className="space-y-4 py-12 text-center">
              <p className="text-lg text-neutral-600">
                {hasOrders
                  ? "No se encontraron pedidos con ese criterio"
                  : "Todavía no tenés pedidos"}
              </p>
              {!hasOrders && (
                <Button
                  asChild
                  className="h-11 bg-black text-white hover:bg-neutral-800"
                >
                  <Link href="/products">
                    <ShoppingBag aria-hidden="true" />
                    Ir a la tienda
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Paginación de pedidos"
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
          >
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setCurrentPage(Math.max(safePage - 1, 1))}
              disabled={safePage === 1}
            >
              Anterior
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <Button
                    key={page}
                    variant={safePage === page ? "default" : "outline"}
                    size="sm"
                    aria-label={`Página ${page}`}
                    aria-current={safePage === page ? "page" : undefined}
                    onClick={() => setCurrentPage(page)}
                    className="h-11 w-11 p-0"
                  >
                    {page}
                  </Button>
                )
              )}
            </div>

            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                setCurrentPage(Math.min(safePage + 1, totalPages))
              }
              disabled={safePage === totalPages}
            >
              Siguiente
            </Button>
          </nav>
        )}

        {filteredRows.length > 0 && (
          <div className="mt-4 text-center text-sm text-neutral-500">
            Mostrando {startIndex + 1} -{" "}
            {Math.min(endIndex, filteredRows.length)} de {filteredRows.length}{" "}
            pedidos
          </div>
        )}
      </div>
    </section>
  )
}
