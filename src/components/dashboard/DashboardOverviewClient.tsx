import Link from "next/link"
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CircleCheck,
  FileSearch,
  ImageOff,
  Mail,
  Package,
  PackageCheck,
  Plus,
  ShoppingCart,
  TextCursorInput,
  TrendingUp,
  Truck,
  Users,
  Boxes,
  Receipt,
} from "lucide-react"
import type { ComponentType } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Product } from "@/types/products/types"
import { OrderWithItems } from "@/types/order/order"
import { Subscriber } from "@/repositories/subscribers/subscribers-repository"
import {
  dayKey,
  formatCurrency,
  formatShortDate,
  monthKey,
  pluralize,
  previousMonthKey,
} from "@/components/dashboard/format"
import {
  buildOrderView,
  needsCorreoImport,
  OrderView,
  TONE_BADGE_CLASSES,
  TONE_DOT_CLASSES,
} from "@/components/dashboard/orders/order-utils"
import {
  SalesChart,
  SalesChartPoint,
} from "@/components/dashboard/SalesChart"

const CHART_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

interface DashboardOverviewClientProps {
  products: Product[]
  orders: OrderWithItems[]
  subscribers: Subscriber[]
}

function variationPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export function DashboardOverviewClient({
  products,
  orders,
  subscribers,
}: DashboardOverviewClientProps) {
  const now = new Date()
  const currentMonth = monthKey(now)
  const previousMonth = previousMonthKey(currentMonth)

  const views = orders.map(buildOrderView)

  // --- Qué hacer hoy -------------------------------------------------------
  const proofCount = views.filter((view) => view.stage === "proof_review").length
  const prepareCount = views.filter((view) => view.stage === "to_prepare").length
  const correoPending = views.filter(needsCorreoImport)
  const correoWithError = correoPending.filter(
    (view) => view.shipping?.import_error
  ).length
  const todoTotal = proofCount + prepareCount + correoPending.length

  // --- Ventas: solo órdenes con pago aprobado (excluye reembolsos/contracargos)
  const approved = orders.filter((order) => order.collection_status === "approved")
  const salesFor = (month: string) => {
    const monthOrders = approved.filter(
      (order) => monthKey(order.created_at) === month
    )
    const total = monthOrders.reduce((sum, order) => sum + order.total_amount, 0)
    return { total, count: monthOrders.length }
  }
  const currentSales = salesFor(currentMonth)
  const previousSales = salesFor(previousMonth)
  const salesVariation = variationPercent(currentSales.total, previousSales.total)
  const ordersVariation = variationPercent(currentSales.count, previousSales.count)
  const averageTicket =
    currentSales.count > 0 ? Math.round(currentSales.total / currentSales.count) : 0
  const previousAverageTicket =
    previousSales.count > 0
      ? Math.round(previousSales.total / previousSales.count)
      : 0
  const ticketVariation = variationPercent(averageTicket, previousAverageTicket)
  const newSubscribers = subscribers.filter(
    (subscriber) => monthKey(subscriber.created_at) === currentMonth
  ).length

  // --- Gráfico: últimos 30 días ---------------------------------------------
  const byDay = new Map<string, { total: number; orders: number }>()
  for (const order of approved) {
    const key = dayKey(order.created_at)
    const entry = byDay.get(key) ?? { total: 0, orders: 0 }
    entry.total += order.total_amount
    entry.orders += 1
    byDay.set(key, entry)
  }
  const chartData: SalesChartPoint[] = []
  for (let offset = CHART_DAYS - 1; offset >= 0; offset -= 1) {
    const key = dayKey(new Date(now.getTime() - offset * DAY_MS))
    const entry = byDay.get(key)
    chartData.push({ day: key, total: entry?.total ?? 0, orders: entry?.orders ?? 0 })
  }
  const chartTotal = chartData.reduce((sum, point) => sum + point.total, 0)
  const chartOrders = chartData.reduce((sum, point) => sum + point.orders, 0)
  const chartSummary = `Ventas de los últimos ${CHART_DAYS} días: ${formatCurrency(chartTotal)} en ${chartOrders} ${pluralize(chartOrders, "orden", "órdenes")}.`

  // --- Catálogo ---------------------------------------------------------------
  const missingCover = products.filter((product) => !product.image_url).length
  const missingDescription = products.filter((product) => !product.description).length
  const reviewStock = products.filter(
    (product) =>
      !product.stock || product.stock.trim().toLowerCase() === "consultar"
  ).length
  const catalogAlerts = [
    {
      label: "Productos sin foto principal",
      helper: "Afecta la conversión y la imagen de la tienda.",
      value: missingCover,
      icon: ImageOff,
    },
    {
      label: "Productos sin descripción",
      helper: "Conviene completar el texto de venta.",
      value: missingDescription,
      icon: TextCursorInput,
    },
    {
      label: "Stock a revisar",
      helper: "Marcados como “consultar” o sin dato.",
      value: reviewStock,
      icon: Boxes,
    },
  ]
  const catalogIssues = catalogAlerts.reduce((sum, alert) => sum + alert.value, 0)

  const recentOrders = [...views]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 6)

  const quickLinks = [
    {
      title: "Controlar ventas",
      description: "Órdenes, pagos y envíos.",
      href: "/dashboard/orders",
      icon: ShoppingCart,
    },
    {
      title: "Ver catálogo",
      description: "Buscar y editar productos.",
      href: "/dashboard/catalog",
      icon: Package,
    },
    {
      title: "Nuevo producto",
      description: "Cargar una prenda nueva.",
      href: "/dashboard/products",
      icon: Plus,
    },
    {
      title: "Newsletter",
      description: "Suscriptores y campañas.",
      href: "/dashboard/newsletter",
      icon: Mail,
    },
  ]

  return (
    <div className="flex w-full flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resumen operativo
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Qué hacer hoy, cómo viene el mes y el estado del catálogo.
        </p>
      </div>

      {/* Qué hacer hoy */}
      <section
        aria-labelledby="todo-heading"
        className={cn(
          "rounded-xl border p-4 shadow sm:p-5",
          todoTotal > 0
            ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20"
            : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/20"
        )}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="todo-heading"
            className="flex items-center gap-2 text-base font-semibold"
          >
            {todoTotal > 0 ? (
              <BellRing className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            ) : (
              <CircleCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            )}
            Qué hacer hoy
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/orders?tab=action">
              Ir a ventas <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>

        {todoTotal > 0 ? (
          <ul className="grid gap-3 md:grid-cols-3">
            <TodoItem
              icon={FileSearch}
              label="Comprobantes por revisar"
              hint="Transferencias esperando tu aprobación."
              count={proofCount}
            />
            <TodoItem
              icon={PackageCheck}
              label="Pedidos por preparar"
              hint="Ya pagados: falta despachar o avisar."
              count={prepareCount}
            />
            <TodoItem
              icon={Truck}
              label="Envíos sin crear en Correo Argentino"
              hint={
                correoWithError > 0
                  ? `${correoWithError} con error al crearse.`
                  : "Pagados y todavía sin seguimiento."
              }
              count={correoPending.length}
              danger={correoWithError > 0}
            />
          </ul>
        ) : (
          <p className="text-sm text-emerald-800 dark:text-emerald-200">
            Todo al día: no hay comprobantes por revisar, pedidos por preparar
            ni envíos sin crear.
          </p>
        )}
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label="Ventas del mes"
          value={formatCurrency(currentSales.total)}
          icon={TrendingUp}
          variation={salesVariation}
          hint={`Mes anterior: ${formatCurrency(previousSales.total)}`}
        />
        <KpiCard
          label="Pedidos del mes"
          value={String(currentSales.count)}
          icon={ShoppingCart}
          variation={ordersVariation}
          hint={`Mes anterior: ${previousSales.count}`}
        />
        <KpiCard
          label="Ticket promedio"
          value={formatCurrency(averageTicket)}
          icon={Receipt}
          variation={ticketVariation}
          hint={
            previousAverageTicket > 0
              ? `Mes anterior: ${formatCurrency(previousAverageTicket)}`
              : "Sin ventas el mes anterior"
          }
        />
        <KpiCard
          label="Suscriptores"
          value={String(subscribers.length)}
          icon={Users}
          hint={
            newSubscribers > 0
              ? `+${newSubscribers} este mes`
              : "Sin altas este mes"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Gráfico */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ventas de los últimos 30 días</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatCurrency(chartTotal)} en {chartOrders}{" "}
              {pluralize(chartOrders, "orden cobrada", "órdenes cobradas")}
            </p>
          </CardHeader>
          <CardContent>
            {chartOrders > 0 ? (
              <SalesChart data={chartData} summary={chartSummary} />
            ) : (
              <div className="flex h-[220px] flex-col items-center justify-center rounded-lg border border-dashed text-center sm:h-[260px]">
                <TrendingUp className="mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">Todavía no hay ventas en este período</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cuando se cobren órdenes, las vas a ver día por día acá.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Catálogo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Catálogo</CardTitle>
            <p className="text-sm text-muted-foreground">
              {products.length} {pluralize(products.length, "producto cargado", "productos cargados")}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {catalogIssues === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Catálogo en orden: nada para completar.
              </div>
            ) : (
              catalogAlerts.map((alert) => (
                <Link
                  key={alert.label}
                  href="/dashboard/catalog"
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <alert.icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        alert.value > 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{alert.label}</span>
                      <span className="block text-xs text-muted-foreground">{alert.helper}</span>
                    </span>
                  </span>
                  <span
                    className={cn(
                      "min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
                      alert.value > 0
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {alert.value}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Últimas órdenes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
            <div className="space-y-1">
              <CardTitle className="text-base">Últimas órdenes</CardTitle>
              <p className="text-sm text-muted-foreground">Los últimos movimientos de la tienda</p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/orders">
                Ver todas <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentOrders.length > 0 ? (
              <ul className="divide-y rounded-lg border">
                {recentOrders.map((view) => (
                  <RecentOrderRow key={view.order.id} view={view} />
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Todavía no hay órdenes registradas.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Accesos rápidos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Accesos rápidos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {quickLinks.map((link) => (
              <Link
                key={link.title}
                href={link.href}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="rounded-lg bg-muted p-2">
                  <link.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{link.title}</span>
                  <span className="block text-xs text-muted-foreground">{link.description}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

interface TodoItemProps {
  icon: ComponentType<{ className?: string }>
  label: string
  hint: string
  count: number
  danger?: boolean
}

function TodoItem({ icon: Icon, label, hint, count, danger }: TodoItemProps) {
  return (
    <li>
      <Link
        href="/dashboard/orders?tab=action"
        className={cn(
          "flex h-full items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          count === 0 && "opacity-60"
        )}
      >
        <span
          className={cn(
            "flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-lg font-bold tabular-nums",
            count === 0
              ? "bg-muted text-muted-foreground"
              : danger
                ? "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
          )}
          aria-hidden="true"
        >
          {count}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <span className="sr-only">{count} </span>
              {label}
            </span>
          </span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </Link>
    </li>
  )
}

interface KpiCardProps {
  label: string
  value: string
  hint: string
  icon: ComponentType<{ className?: string }>
  variation?: number | null
}

function KpiCard({ label, value, hint, icon: Icon, variation }: KpiCardProps) {
  const hasVariation = variation !== undefined && variation !== null
  const positive = hasVariation && variation >= 0

  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground sm:text-sm">
            {label}
          </span>
          <span className="rounded-lg bg-muted p-1.5">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {hasVariation && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                positive
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              )}
            >
              {positive ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              )}
              {positive ? "+" : ""}
              {Math.round(variation)}%
              <span className="sr-only"> respecto del mes anterior</span>
            </span>
          )}
          <span>{hint}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function RecentOrderRow({ view }: { view: OrderView }) {
  const { order, meta } = view

  return (
    <li>
      <Link
        href="/dashboard/orders"
        className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">{view.shortId}</span>
            <span className="truncate text-sm">{view.customerName}</span>
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatShortDate(order.created_at)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium",
              TONE_BADGE_CLASSES[meta.tone]
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT_CLASSES[meta.tone])}
              aria-hidden="true"
            />
            {meta.label}
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(order.total_amount)}
          </span>
        </span>
      </Link>
    </li>
  )
}
