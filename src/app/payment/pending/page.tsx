import { Suspense } from "react"
import type { Metadata } from "next"

import { PaymentLoadingShell } from "@/components/payment/PaymentStatusShell"
import PaymentPendingClient from "./PaymentPendingClient"

export const metadata: Metadata = {
  title: "Pago pendiente",
  robots: { index: false, follow: false },
}

export default function PaymentPendingPage() {
  return (
    <Suspense fallback={<PaymentLoadingShell label="Cargando tu pedido…" />}>
      <PaymentPendingClient />
    </Suspense>
  )
}
