import type { Metadata } from "next"
import { UnsubscribeClient } from "./UnsubscribeClient"

export const metadata: Metadata = {
  title: "Darme de baja | Lozach",
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>
}) {
  const { email = "", token = "" } = await searchParams

  return (
    <main className="min-h-screen bg-gray-50 py-24 flex items-center justify-center px-4">
      <UnsubscribeClient email={email} token={token} />
    </main>
  )
}
