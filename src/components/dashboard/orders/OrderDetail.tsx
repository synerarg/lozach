"use client"

import { useState } from "react"
import {
  CreditCard,
  ExternalLink,
  FileText,
  Mail,
  MessageCircle,
  Package,
  Phone,
  UserRound,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
  getPaymentTypeLabel,
} from "@/lib/utils/payment-utils"
import { PAYMENT_STATUS_LABELS } from "@/lib/utils/order-stage"
import { PaymentProofStatus } from "@/types/order/order"
import {
  formatCurrency,
  formatDateTime,
} from "@/components/dashboard/format"
import { DetailSection, InfoRow } from "./detail-primitives"
import { OrderActions } from "./OrderActions"
import { OrderShippingSection } from "./OrderShippingSection"
import { getWhatsAppUrl, isPdfUrl, OrderView } from "./order-utils"

const PROOF_STATUS_META: Record<
  PaymentProofStatus,
  { label: string; className: string }
> = {
  pending_review: {
    label: "Pendiente de revisión",
    className:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  },
  approved: {
    label: "Aprobado",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  rejected: {
    label: "Rechazado",
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  },
}

interface OrderDetailProps {
  view: OrderView
}

export function OrderDetail({ view }: OrderDetailProps) {
  return (
    <div className="space-y-4 border-t border-dashed bg-muted/30 p-3 sm:p-4">
      <OrderActions view={view} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ProductsSection view={view} />
          <PaymentSection view={view} />
        </div>
        <div className="space-y-4">
          <CustomerSection view={view} />
          <OrderShippingSection view={view} />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cliente y contacto
// ---------------------------------------------------------------------------

function CustomerSection({ view }: OrderDetailProps) {
  const { order, shipping, customerName, customerEmail } = view
  const phone = order.phone || shipping?.phone || ""
  const otherPhone =
    shipping?.phone && shipping.phone !== order.phone ? shipping.phone : null
  const whatsapp = getWhatsAppUrl(phone)
  const linkClass =
    "inline-flex items-center gap-1 rounded text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"

  return (
    <DetailSection title="Cliente y contacto" icon={UserRound}>
      <dl className="space-y-2.5">
        <InfoRow label="Nombre">{customerName}</InfoRow>
        <InfoRow label="Email">
          {customerEmail ? (
            <a href={`mailto:${customerEmail}`} className={linkClass}>
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {customerEmail}
            </a>
          ) : (
            <span className="text-muted-foreground">Sin email</span>
          )}
        </InfoRow>
        <InfoRow label="Teléfono">
          {phone ? (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a href={`tel:${phone}`} className={linkClass}>
                <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                {phone}
              </a>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  WhatsApp
                </a>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin teléfono</span>
          )}
          {otherPhone && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Teléfono del envío: {otherPhone}
            </span>
          )}
        </InfoRow>
        <InfoRow label="DNI">
          {shipping?.identifier ? (
            <span className="font-mono">{shipping.identifier}</span>
          ) : (
            <span className="text-muted-foreground">Sin dato</span>
          )}
        </InfoRow>
      </dl>
    </DetailSection>
  )
}

// ---------------------------------------------------------------------------
// Productos y totales
// ---------------------------------------------------------------------------

function ProductsSection({ view }: OrderDetailProps) {
  const { order, shipping } = view
  const items = order.order_items ?? []
  const shippingAmount = shipping?.shipping_cost ?? 0
  const discount = Math.max(0, order.subtotal + shippingAmount - order.total_amount)
  const discountLabel =
    order.payment_type === BANK_TRANSFER_PAYMENT_TYPE
      ? "Descuento por transferencia"
      : order.payment_type === CASH_STORE_PAYMENT_TYPE
        ? "Descuento por pago en efectivo"
        : "Descuento"

  return (
    <DetailSection
      title="Productos"
      icon={Package}
      aside={
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "ítem" : "ítems"}
        </span>
      }
    >
      {items.length > 0 ? (
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{item.product_name}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {item.color && <span>Color: {item.color}</span>}
                  {item.size && <span>Talle: {item.size}</span>}
                  {item.sku && <span className="font-mono">SKU {item.sku}</span>}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-3 text-sm sm:flex-col sm:items-end sm:gap-0.5">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {item.quantity} × {formatCurrency(item.unit_price)}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(item.unit_price * item.quantity)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay productos registrados para esta orden.
        </p>
      )}

      <dl className="mt-3 space-y-1.5 text-sm">
        <TotalRow label="Subtotal" value={formatCurrency(order.subtotal)} />
        <TotalRow
          label="Envío"
          value={shippingAmount > 0 ? formatCurrency(shippingAmount) : "Gratis"}
        />
        {discount > 0 && (
          <TotalRow
            label={discountLabel}
            value={`-${formatCurrency(discount)}`}
            className="text-emerald-700 dark:text-emerald-400"
          />
        )}
        <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatCurrency(order.total_amount)}</dd>
        </div>
      </dl>
    </DetailSection>
  )
}

function TotalRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <dt className={cn(!className && "text-muted-foreground")}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

function PaymentSection({ view }: OrderDetailProps) {
  const { order, stage } = view
  const isTransfer = order.payment_type === BANK_TRANSFER_PAYMENT_TYPE
  const status = order.collection_status ?? "pending"
  const awaiting = stage === "awaiting_payment" || stage === "proof_review"

  return (
    <DetailSection title="Pago" icon={CreditCard}>
      <dl className="space-y-2.5">
        <InfoRow label="Medio">{getPaymentTypeLabel(order.payment_type)}</InfoRow>
        <InfoRow label="Estado">
          {PAYMENT_STATUS_LABELS[status] ?? status}
          {order.payment_status_detail && (
            <span className="block text-xs text-muted-foreground">
              {order.payment_status_detail}
            </span>
          )}
        </InfoRow>
        <InfoRow label="ID de pago">
          {order.payment_id ? (
            <span className="font-mono text-xs">{order.payment_id}</span>
          ) : (
            <span className="text-muted-foreground">Sin ID todavía</span>
          )}
        </InfoRow>
        <InfoRow label="Orden creada">{formatDateTime(order.created_at)}</InfoRow>
        {awaiting && order.expires_at && (
          <InfoRow label="Vence">{formatDateTime(order.expires_at)}</InfoRow>
        )}
        {order.cancellation_reason && (
          <InfoRow label="Motivo de cancelación">
            {order.cancellation_reason}
          </InfoRow>
        )}
      </dl>

      {isTransfer && <ProofBlock view={view} />}
    </DetailSection>
  )
}

function ProofBlock({ view }: OrderDetailProps) {
  const { order } = view
  const [imageFailed, setImageFailed] = useState(false)
  const signedUrl = order.payment_proof_signed_url ?? null
  const hasProof = Boolean(order.payment_proof_url)
  const proofStatus = order.payment_proof_status
    ? PROOF_STATUS_META[order.payment_proof_status]
    : null

  return (
    <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">Comprobante de transferencia</span>
        {proofStatus && (
          <Badge variant="outline" className={cn("font-medium", proofStatus.className)}>
            {proofStatus.label}
          </Badge>
        )}
      </div>

      {!hasProof ? (
        <p className="text-sm text-muted-foreground">
          El cliente todavía no subió el comprobante.
        </p>
      ) : !signedUrl ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          El comprobante está cargado pero no se pudo generar el link para
          verlo. Refrescá la página para intentar de nuevo.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-start">
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir comprobante en tamaño completo"
            className="group flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {isPdfUrl(order.payment_proof_url ?? "") || isPdfUrl(signedUrl) ? (
              <span className="flex flex-col items-center gap-1 text-muted-foreground">
                <FileText className="h-10 w-10" aria-hidden="true" />
                <span className="text-xs">Ver PDF</span>
              </span>
            ) : imageFailed ? (
              <span className="flex flex-col items-center gap-1 px-2 text-center text-muted-foreground">
                <FileText className="h-10 w-10" aria-hidden="true" />
                <span className="text-xs">No se pudo cargar la imagen</span>
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signedUrl}
                alt="Comprobante de transferencia"
                className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
                onError={() => setImageFailed(true)}
              />
            )}
          </a>
          <div className="space-y-2 text-sm">
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
            >
              Abrir comprobante
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
            {order.payment_proof_uploaded_at && (
              <p className="text-xs text-muted-foreground">
                Subido el {formatDateTime(order.payment_proof_uploaded_at)}
              </p>
            )}
            {order.payment_proof_reviewed_at && (
              <p className="text-xs text-muted-foreground">
                Revisado el {formatDateTime(order.payment_proof_reviewed_at)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              El link del comprobante es temporal: si deja de abrir, refrescá
              la página.
            </p>
          </div>
        </div>
      )}

      {order.payment_proof_rejection_reason && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          Motivo de rechazo previo: {order.payment_proof_rejection_reason}
        </p>
      )}
    </div>
  )
}
