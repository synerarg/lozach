"use client"

import { ComponentType } from "react"
import {
  BellRing,
  Clock,
  Receipt,
  Truck,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  formatCurrency,
  pluralize,
} from "@/components/dashboard/format"
import { OrderKpis as OrderKpisData, StageTab } from "./order-utils"

interface KpiCardProps {
  label: string
  value: string
  hint: string
  icon: ComponentType<{ className?: string }>
  tone?: "default" | "alert"
  className?: string
  onClick?: () => void
  active?: boolean
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
  onClick,
  active,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground sm:text-sm">
          {label}
        </span>
        <span
          className={cn(
            "rounded-lg p-1.5",
            tone === "alert"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
              : "bg-muted text-foreground"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</p>
    </>
  )

  const classes = cn(
    "rounded-xl border bg-card p-3 text-left text-card-foreground shadow sm:p-4",
    tone === "alert" &&
      "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20",
    className
  )

  if (!onClick) {
    return <div className={classes}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        classes,
        "transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "ring-2 ring-ring"
      )}
    >
      {body}
    </button>
  )
}

interface OrderKpisProps {
  kpis: OrderKpisData
  activeTab: StageTab
  onSelectTab: (tab: StageTab) => void
}

export function OrderKpis({ kpis, activeTab, onSelectTab }: OrderKpisProps) {
  const actionParts = [
    kpis.proofCount > 0
      ? `${kpis.proofCount} ${pluralize(kpis.proofCount, "comprobante", "comprobantes")}`
      : null,
    kpis.prepareCount > 0 ? `${kpis.prepareCount} por preparar` : null,
  ].filter(Boolean)

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
      role="group"
      aria-label="Indicadores de ventas"
    >
      <KpiCard
        label="Para accionar"
        value={String(kpis.actionCount)}
        hint={
          actionParts.length > 0
            ? actionParts.join(" · ")
            : "Todo al día, nada para hacer"
        }
        icon={BellRing}
        tone={kpis.actionCount > 0 ? "alert" : "default"}
        className="col-span-2 sm:col-span-1"
        onClick={() => onSelectTab("action")}
        active={activeTab === "action"}
      />
      <KpiCard
        label="Pendientes de pago"
        value={String(kpis.unpaidCount)}
        hint={
          kpis.unpaidCount > 0
            ? `${formatCurrency(kpis.unpaidAmount)} por cobrar`
            : "Sin pagos pendientes"
        }
        icon={Clock}
        onClick={() => onSelectTab("awaiting")}
        active={activeTab === "awaiting"}
      />
      <KpiCard
        label="Ventas del mes"
        value={formatCurrency(kpis.monthSales)}
        hint={`${kpis.monthCount} ${pluralize(kpis.monthCount, "orden cobrada", "órdenes cobradas")}`}
        icon={TrendingUp}
      />
      <KpiCard
        label="Ticket promedio"
        value={formatCurrency(kpis.averageTicket)}
        hint="Del mes en curso"
        icon={Receipt}
      />
      <KpiCard
        label="En camino"
        value={String(kpis.shippedCount)}
        hint="Despachados con Correo Argentino"
        icon={Truck}
        onClick={() => onSelectTab("shipped")}
        active={activeTab === "shipped"}
      />
    </div>
  )
}
