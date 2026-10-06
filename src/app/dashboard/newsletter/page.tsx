import { CalendarPlus, Mail, UserPlus } from "lucide-react"
import { getAllSubscribersAction } from "@/controllers/admin/admin-subscribers-api-controller"
import { getAllProductsAction } from "@/controllers/admin/admin-products-api-controller"
import { getUser } from "@/controllers/auth/auth-controller"
import { redirect } from "next/navigation"
import { AdminShell } from "@/components/dashboard/AdminShell"
import { CampaignComposer } from "@/components/dashboard/CampaignComposer"
import { SubscribersTableClient } from "@/components/dashboard/SubscribersTableClient"
import { Card, CardContent } from "@/components/ui/card"
import { formatDate, monthKey } from "@/components/dashboard/format"

export default async function NewsletterPage() {
  const userResult = await getUser()
  if (
    !userResult.success ||
    !userResult.data ||
    userResult.data.role !== "admin"
  ) {
    redirect("/login")
  }

  const user = userResult.data
  const [subscribersResult, productsResult] = await Promise.all([
    getAllSubscribersAction(),
    getAllProductsAction(),
  ])
  const subscribers =
    subscribersResult.status === 200 && subscribersResult.data
      ? subscribersResult.data
      : []
  const products =
    productsResult.status === 200 && productsResult.data
      ? productsResult.data
      : []

  const currentMonth = monthKey(new Date())
  const newThisMonth = subscribers.filter(
    (subscriber) => monthKey(subscriber.created_at) === currentMonth
  ).length
  const latest = subscribers.reduce<string | null>(
    (acc, subscriber) =>
      !acc || new Date(subscriber.created_at) > new Date(acc)
        ? subscriber.created_at
        : acc,
    null
  )

  const stats = [
    {
      label: "Suscriptores",
      value: String(subscribers.length),
      hint: "Reciben tus campañas",
      icon: Mail,
    },
    {
      label: "Altas este mes",
      value: String(newThisMonth),
      hint: "Nuevos suscriptores del mes",
      icon: UserPlus,
    },
    {
      label: "Última alta",
      value: latest ? formatDate(latest) : "-",
      hint: "Fecha de registro más reciente",
      icon: CalendarPlus,
    },
  ]

  const sidebarUser = {
    name: user.name,
    email: user.email,
    avatar: "/avatars/admin.jpg",
  }

  return (
    <AdminShell user={sidebarUser}>
      <div className="flex w-full flex-col gap-5 px-3 py-5 sm:px-6 sm:py-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Armá una campaña, probala en tu mail y enviala a tus suscriptores.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat, index) => (
            <Card
              key={stat.label}
              className={index === 0 ? "col-span-2 sm:col-span-1" : undefined}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                    {stat.label}
                  </span>
                  <span className="rounded-lg bg-muted p-1.5">
                    <stat.icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {stat.value}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{stat.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <section aria-labelledby="campaign-heading" className="space-y-3">
          <div>
            <h2 id="campaign-heading" className="text-base font-semibold">
              Nueva campaña
            </h2>
            <p className="text-sm text-muted-foreground">
              Cada mail incluye un link de baja automático.
            </p>
          </div>
          <CampaignComposer
            subscriberCount={subscribers.length}
            products={products}
          />
        </section>

        <SubscribersTableClient subscribers={subscribers} />
      </div>
    </AdminShell>
  )
}
