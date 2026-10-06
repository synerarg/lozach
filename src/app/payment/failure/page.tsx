import { Suspense } from "react"
import type { Metadata } from "next"

import { PaymentLoadingShell } from "@/components/payment/PaymentStatusShell"
import PaymentFailureClient from "./PaymentFailureClient"

export const metadata: Metadata = {
  title: "Pago no completado",
  robots: { index: false, follow: false },
}

export default function PaymentFailurePage() {
  return (
    <Suspense fallback={<PaymentLoadingShell label="Cargando…" />}>
      <PaymentFailureClient />
    </Suspense>
  )
}
