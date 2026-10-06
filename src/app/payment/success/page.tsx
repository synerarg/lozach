import { Suspense } from "react"
import type { Metadata } from "next"

import { PaymentLoadingShell } from "@/components/payment/PaymentStatusShell"
import PaymentSuccessClient from "./PaymentSuccessClient"

export const metadata: Metadata = {
  title: "Estado de tu pago",
  robots: { index: false, follow: false },
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<PaymentLoadingShell label="Verificando tu pago…" />}>
      <PaymentSuccessClient />
    </Suspense>
  )
}
