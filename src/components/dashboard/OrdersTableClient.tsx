"use client"

import { useCallback, useDeferredValue, useMemo, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  SearchX,
  ShoppingBag,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { OrderWithItems } from "@/types/order/order"
import { pluralize } from "@/components/dashboard/format"
import { OrderKpis } from "@/components/dashboard/orders/OrderKpis"
import {
  ORDER_ROW_GRID,
  OrderRow,
} from "@/components/dashboard/orders/OrderRow"
import {
  buildOrderView,
  computeOrderKpis,
  matchesSearch,
  matchesTab,
  PAGE_SIZE,
  PAYMENT_FILTER_OPTIONS,
  PaymentFilter,
  SHIPPING_FILTER_OPTIONS,
  ShippingFilter,
  SORT_OPTIONS,
  SortOption,
  sortViews,
  STAGE_TABS,
  StageTab,
} from "@/components/dashboard/orders/order-utils"

interface OrdersTableClientProps {
  orders: OrderWithItems[]
  initialTab?: StageTab
}

interface Filters {
  tab: StageTab
  search: string
  payment: PaymentFilter
  shipping: ShippingFilter
  sort: SortOption
}

const DEFAULT_FILTERS: Filters = {
  tab: "all",
  search: "",
  payment: "all",
  shipping: "all",
  sort: "date_desc",
}

const EMPTY_TAB_COPY: Record<StageTab, { title: string; description: string }> = {
  all: {
    title: "No hay órdenes con estos filtros",
    description: "Probá con otra búsqueda o limpiá los filtros.",
  },
  action: {
    title: "Todo al día",
    description: "No hay comprobantes por revisar ni pedidos por preparar.",
  },
  awaiting: {
    title: "No hay pagos pendientes",
    description: "Todas las órdenes ya se cobraron o se cancelaron.",
  },
  shipped: {
    title: "No hay envíos en camino",
    description: "Cuando despaches pedidos con Correo Argentino aparecen acá.",
  },
  pickup: {
    title: "Nada esperando en la tienda",
    description: "Los pedidos que avises como listos para retirar aparecen acá.",
  },
  delivered: {
    title: "Todavía no hay entregas",
    description: "Los pedidos entregados o retirados aparecen acá.",
  },
  closed: {
    title: "No hay órdenes canceladas ni reembolsadas",
    description: "Las órdenes canceladas, vencidas o reembolsadas aparecen acá.",
  },
}

export function OrdersTableClient({
  orders,
  initialTab = "all",
}: OrdersTableClientProps) {
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    tab: initialTab,
  })
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(filters.search)

  const views = useMemo(() => orders.map(buildOrderView), [orders])
  const kpis = useMemo(() => computeOrderKpis(views, new Date()), [views])

  // Filtros que no dependen de la etapa: sirven para los contadores de cada tab.
  const baseFiltered = useMemo(
    () =>
      views.filter(
        (view) =>
          (filters.payment === "all" ||
            view.order.payment_type === filters.payment) &&
          (filters.shipping === "all" ||
            view.shippingMethod === filters.shipping) &&
          matchesSearch(view, deferredSearch)
      ),
    [views, filters.payment, filters.shipping, deferredSearch]
  )

  const tabCounts = useMemo(() => {
    const counts = {} as Record<StageTab, number>
    for (const tab of STAGE_TABS) {
      counts[tab.value] = baseFiltered.filter((view) =>
        matchesTab(view, tab.value)
      ).length
    }
    return counts
  }, [baseFiltered])

  const visible = useMemo(
    () =>
      sortViews(
        baseFiltered.filter((view) => matchesTab(view, filters.tab)),
        filters.sort
      ),
    [baseFiltered, filters.tab, filters.sort]
  )

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageItems = visible.slice(pageStart, pageStart + PAGE_SIZE)

  const hasActiveFilters =
    filters.search.trim() !== "" ||
    filters.payment !== "all" ||
    filters.shipping !== "all" ||
    filters.tab !== "all"

  const updateFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }))
    setPage(1)
    setExpandedId(null)
  }, [])

  const handleToggle = useCallback((orderId: string) => {
    setExpandedId((prev) => (prev === orderId ? null : orderId))
  }, [])

  if (orders.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="mb-4 rounded-full bg-muted p-4">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">Todavía no hay órdenes</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Cuando tus clientes compren, las órdenes van a aparecer acá con
            todo lo que necesitás para cobrarlas y despacharlas.
          </p>
        </div>
      </div>
    )
  }

  const emptyCopy = EMPTY_TAB_COPY[filters.tab]
  const allClear = filters.tab === "action" && visible.length === 0 && !filters.search.trim()

  return (
    <div className="flex flex-col gap-5">
      <OrderKpis
        kpis={kpis}
        activeTab={filters.tab}
        onSelectTab={(tab) => updateFilters({ tab })}
      />

      <div className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow">
        {/* Filtros */}
        <div className="space-y-3 border-b p-3 sm:p-4">
          <Tabs
            value={filters.tab}
            onValueChange={(value) => updateFilters({ tab: value as StageTab })}
          >
            <div className="-mx-3 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
              <TabsList className="h-auto w-max flex-nowrap gap-0.5">
                {STAGE_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-1.5 px-2.5 py-1.5"
                  >
                    {tab.label}
                    <span
                      className={cn(
                        "min-w-5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                        tab.value === "action" && tabCounts[tab.value] > 0
                          ? "bg-amber-500 text-amber-950"
                          : "bg-background/70 text-muted-foreground"
                      )}
                    >
                      {tabCounts[tab.value]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </Tabs>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Buscar por nº de orden, cliente, email, teléfono, DNI o seguimiento"
                aria-label="Buscar órdenes"
                className="pl-9 pr-9"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => updateFilters({ search: "" })}
                  aria-label="Borrar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
              <Select
                value={filters.payment}
                onValueChange={(value) =>
                  updateFilters({ payment: value as PaymentFilter })
                }
              >
                <SelectTrigger aria-label="Filtrar por medio de pago" className="lg:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.shipping}
                onValueChange={(value) =>
                  updateFilters({ shipping: value as ShippingFilter })
                }
              >
                <SelectTrigger aria-label="Filtrar por método de envío" className="lg:w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHIPPING_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.sort}
                onValueChange={(value) =>
                  updateFilters({ sort: value as SortOption })
                }
              >
                <SelectTrigger
                  aria-label="Ordenar órdenes"
                  className="col-span-2 sm:col-span-1 lg:w-[150px]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <p role="status" aria-live="polite">
              {visible.length} {pluralize(visible.length, "orden", "órdenes")}
              {hasActiveFilters && visible.length !== views.length
                ? ` de ${views.length}`
                : ""}
            </p>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS)
                  setPage(1)
                  setExpandedId(null)
                }}
              >
                <X aria-hidden="true" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>

        {/* Lista */}
        {pageItems.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className={cn(
                "hidden border-b border-l-4 border-l-transparent bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground lg:grid lg:gap-x-3",
                ORDER_ROW_GRID
              )}
            >
              <span />
              <span>Orden</span>
              <span>Cliente</span>
              <span>Fecha</span>
              <span>Pago</span>
              <span>Estado</span>
              <span className="text-right">Monto</span>
            </div>
            <div className="divide-y">
              {pageItems.map((view) => (
                <OrderRow
                  key={view.order.id}
                  view={view}
                  expanded={expandedId === view.order.id}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div
              className={cn(
                "mb-3 rounded-full p-3",
                allClear
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {allClear ? (
                <CircleCheck className="h-6 w-6" aria-hidden="true" />
              ) : (
                <SearchX className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <p className="text-sm font-medium">{emptyCopy.title}</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {emptyCopy.description}
            </p>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS)
                  setPage(1)
                }}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        )}

        {/* Paginación */}
        {visible.length > PAGE_SIZE && (
          <nav
            aria-label="Paginación de órdenes"
            className="flex flex-col items-center justify-between gap-2 border-t p-3 text-sm sm:flex-row sm:px-4"
          >
            <p className="text-xs text-muted-foreground">
              Mostrando {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, visible.length)}{" "}
              de {visible.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => {
                  setPage(currentPage - 1)
                  setExpandedId(null)
                }}
              >
                <ChevronLeft aria-hidden="true" />
                Anterior
              </Button>
              <span className="min-w-24 text-center text-xs text-muted-foreground tabular-nums">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setPage(currentPage + 1)
                  setExpandedId(null)
                }}
              >
                Siguiente
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}
