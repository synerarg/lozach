"use client"

import { memo } from "react"
import { ChevronDown, CreditCard } from "lucide-react"
import { badgeVariants } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { getPaymentTypeLabel } from "@/lib/utils/payment-utils"
import {
  formatCurrency,
  formatDate,
  formatTime,
  pluralize,
} from "@/components/dashboard/format"
import { OrderDetail } from "./OrderDetail"
import {
  OrderView,
  TONE_BADGE_CLASSES,
  TONE_DOT_CLASSES,
} from "./order-utils"

export const ORDER_ROW_GRID =
  "lg:grid-cols-[24px_120px_minmax(0,1.6fr)_110px_170px_170px_110px]"

interface OrderRowProps {
  view: OrderView
  expanded: boolean
  onToggle: (orderId: string) => void
}

function OrderRowComponent({ view, expanded, onToggle }: OrderRowProps) {
  const { order, meta, shortId } = view
  const itemCount = order.order_items?.length ?? 0
  const detailId = `order-detail-${order.id}`
  const needsAction = meta.needsAdminAction

  return (
    <div
      className={cn(
        "border-l-4 transition-colors",
        needsAction
          ? "border-l-amber-500"
          : "border-l-transparent",
        expanded && "bg-muted/20"
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(order.id)}
        aria-expanded={expanded}
        aria-controls={detailId}
        aria-label={`Orden ${shortId}, ${view.customerName}, ${meta.label}, ${formatCurrency(order.total_amount)}. ${expanded ? "Ocultar" : "Ver"} detalle`}
        className={cn(
          "grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4",
          "lg:gap-y-0",
          ORDER_ROW_GRID
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "col-start-1 row-start-1 row-span-3 h-4 w-4 self-center text-muted-foreground transition-transform duration-200 lg:col-auto lg:row-span-1",
            expanded && "rotate-180"
          )}
        />

        <span className="col-start-2 row-start-1 flex min-w-0 items-center gap-2 lg:col-auto lg:row-auto">
          <span className="block min-w-0">
            <span className="font-mono text-sm font-semibold">{shortId}</span>
            <span className="ml-2 text-xs text-muted-foreground lg:ml-0 lg:block">
              {itemCount} {pluralize(itemCount, "producto", "productos")}
            </span>
          </span>
          {needsAction && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
              <span
                className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-950"
                aria-hidden="true"
              />
              Acción
            </span>
          )}
        </span>

        <span className="block col-span-2 col-start-2 row-start-2 min-w-0 lg:col-auto lg:row-auto">
          <span className="block truncate text-sm font-medium">{view.customerName}</span>
          {view.customerEmail && (
            <span className="block truncate text-xs text-muted-foreground">
              {view.customerEmail}
            </span>
          )}
        </span>

        <span className="col-start-2 row-start-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground lg:contents">
          <span className="block lg:text-sm">
            <span className="text-foreground/90">{formatDate(order.created_at)}</span>
            <span className="ml-1.5 lg:ml-0 lg:block lg:text-xs lg:text-muted-foreground">
              {formatTime(order.created_at)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1 lg:text-sm">
            <CreditCard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{getPaymentTypeLabel(order.payment_type)}</span>
          </span>
        </span>

        <span className="block col-start-3 row-start-1 justify-self-end lg:col-auto lg:row-auto lg:justify-self-start">
          <span
            className={cn(
              badgeVariants({ variant: "outline" }),
              "gap-1.5 whitespace-nowrap font-medium",
              TONE_BADGE_CLASSES[meta.tone]
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT_CLASSES[meta.tone])}
              aria-hidden="true"
            />
            {meta.label}
          </span>
        </span>

        <span className="block col-start-3 row-start-3 justify-self-end text-sm font-semibold tabular-nums lg:col-auto lg:row-auto lg:justify-self-end lg:text-base">
          {formatCurrency(order.total_amount)}
        </span>
      </button>

      {expanded && (
        <div id={detailId}>
          <OrderDetail view={view} />
        </div>
      )}
    </div>
  )
}

export const OrderRow = memo(OrderRowComponent)
