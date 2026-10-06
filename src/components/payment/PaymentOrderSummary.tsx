import type { ReactNode } from "react"

import type { OrderPaymentSnapshot } from "@/controllers/payment/payment-controller"
import { orderShortId } from "@/lib/config/site"
import { getPaymentTypeLabel } from "@/lib/utils/payment-utils"
import { cn } from "@/lib/utils"

import { formatMoney, shippingMethodLabel } from "./payment-format"

export interface SummaryRow {
  label: string
  value: ReactNode
  /** Resalta la fila (monto total). */
  strong?: boolean
}

/** Lista de pares etiqueta/valor con semántica de <dl>. */
export function SummaryList({
  rows,
  className,
}: {
  rows: SummaryRow[]
  className?: string
}) {
  return (
    <dl
      className={cn(
        "divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-neutral-50 text-sm",
        className
      )}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between gap-4 px-4 py-3"
        >
          <dt className="text-neutral-600">{row.label}</dt>
          <dd
            className={cn(
              "min-w-0 break-words text-right text-neutral-900",
              row.strong ? "text-lg font-bold" : "font-medium"
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

type SnapshotLike = Pick<
  OrderPaymentSnapshot,
  | "orderId"
  | "totalAmount"
  | "currency"
  | "paymentType"
  | "shippingMethod"
  | "trackingNumber"
>

/** Resumen del pedido para las pantallas de pago. Todos los datos vienen del servidor. */
export function PaymentOrderSummary({
  snapshot,
  paymentId,
  totalLabel = "Total",
  extraRows = [],
}: {
  snapshot: SnapshotLike
  /** N° de operación de Mercado Pago (ya saneado, solo dígitos). */
  paymentId?: string | null
  totalLabel?: string
  extraRows?: SummaryRow[]
}) {
  const shipping = shippingMethodLabel(snapshot.shippingMethod)

  const rows: SummaryRow[] = [
    { label: "Pedido", value: `#${orderShortId(snapshot.orderId)}` },
    {
      label: totalLabel,
      value: formatMoney(snapshot.totalAmount, snapshot.currency),
      strong: true,
    },
  ]

  if (snapshot.paymentType) {
    rows.push({
      label: "Medio de pago",
      value: getPaymentTypeLabel(snapshot.paymentType),
    })
  }

  if (shipping) {
    rows.push({ label: "Entrega", value: shipping })
  }

  if (snapshot.trackingNumber) {
    rows.push({
      label: "Seguimiento",
      value: <span className="font-mono">{snapshot.trackingNumber}</span>,
    })
  }

  if (paymentId) {
    rows.push({
      label: "N° de operación",
      value: <span className="font-mono">{paymentId}</span>,
    })
  }

  return <SummaryList rows={[...rows, ...extraRows]} />
}
