import { getAllOrdersAction } from "@/controllers/admin/admin-orders-api-controller"
import { getUser } from "@/controllers/auth/auth-controller"
import { redirect } from "next/navigation"
import { OrdersTableClient } from "@/components/dashboard/OrdersTableClient"
import { AdminShell } from "@/components/dashboard/AdminShell"
import { STAGE_TABS, StageTab } from "@/components/dashboard/orders/order-utils"

interface OrdersPageProps {
  searchParams: Promise<{ tab?: string | string[] }>
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const userResult = await getUser()
  if (
    !userResult.success ||
    !userResult.data ||
    userResult.data.role !== "admin"
  ) {
    redirect("/login")
  }

  const user = userResult.data
  const { tab } = await searchParams
  const tabParam = Array.isArray(tab) ? tab[0] : tab
  const initialTab: StageTab =
    STAGE_TABS.find((option) => option.value === tabParam)?.value ?? "all"
  const ordersResult = await getAllOrdersAction()
  const orders =
    ordersResult.status === 200 && ordersResult.data ? ordersResult.data : []
  const loadFailed = ordersResult.status !== 200

  const sidebarUser = {
    name: user.name,
    email: user.email,
    avatar: "/avatars/admin.jpg",
  }

  return (
    <AdminShell user={sidebarUser}>
      <div className="flex w-full flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cobrá, prepará y seguí cada pedido desde un solo lugar.
          </p>
        </div>

        {loadFailed && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            No se pudieron cargar las órdenes
            {ordersResult.error ? `: ${ordersResult.error}` : "."} Refrescá la
            página para intentar de nuevo.
          </div>
        )}

        <OrdersTableClient
          key={initialTab}
          orders={orders}
          initialTab={initialTab}
        />
      </div>
    </AdminShell>
  )
}
