"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Landmark, Package, RefreshCw } from "lucide-react"

import {
  PaymentStatusShell,
  ShellLink,
  ShellSupportLink,
} from "@/components/payment/PaymentStatusShell"
import {
  SummaryList,
  type SummaryRow,
} from "@/components/payment/PaymentOrderSummary"
import { sanitizePaymentId } from "@/components/payment/payment-format"
import { BANK_TRANSFER_DISCOUNT_PERCENT_LABEL } from "@/lib/utils/payment-utils"

const COMMON_CAUSES: { title: string; body: string }[] = [
  {
    title: "Fondos o límite insuficientes",
    body: "Revisá que la tarjeta tenga saldo o cupo disponible para el total de la compra.",
  },
  {
    title: "Datos de la tarjeta incorrectos",
    body: "Verificá el número, la fecha de vencimiento y el código de seguridad.",
  },
  {
    title: "El banco rechazó la operación",
    body: "A veces el banco bloquea compras online por seguridad. Probá con otra tarjeta, otro medio de pago, o consultá con tu banco.",
  },
]

/**
 * Nunca mostramos texto que venga en la URL (`error`, etc.): lo puede armar
 * cualquiera. Solo el N° de operación, y únicamente si son dígitos.
 */
export default function PaymentFailureClient() {
  const searchParams = useSearchParams()
  const paymentId = sanitizePaymentId(
    searchParams.get("payment_id") ?? searchParams.get("collection_id")
  )

  const summaryRows: SummaryRow[] = paymentId
    ? [
        {
          label: "N° de operación",
          value: <span className="font-mono">{paymentId}</span>,
        },
      ]
    : []

  return (
    <PaymentStatusShell
      tone="danger"
      size="lg"
      title="No pudimos procesar tu pago"
      description="El pago no se completó. Tu carrito sigue guardado, así que podés intentar de nuevo cuando quieras."
      summary={
        summaryRows.length > 0 ? <SummaryList rows={summaryRows} /> : undefined
      }
      actions={
        <>
          <ShellLink href="/checkout" icon={<RefreshCw />}>
            Intentar de nuevo
          </ShellLink>
          <ShellLink href="/checkout" variant="secondary" icon={<Landmark />}>
            Pagar por transferencia
          </ShellLink>
          <ShellSupportLink subject="Problema con mi pago" />
        </>
      }
    >
      <section aria-labelledby="failure-causes-title">
        <h2
          id="failure-causes-title"
          className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-600"
        >
          Causas más comunes
        </h2>
        <ul className="space-y-3">
          {COMMON_CAUSES.map((cause) => (
            <li
              key={cause.title}
              className="rounded-xl border border-neutral-200 p-3 text-left"
            >
              <p className="text-sm font-medium text-neutral-900">
                {cause.title}
              </p>
              <p className="text-sm text-neutral-600">{cause.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
        <strong className="font-semibold text-neutral-900">
          ¿Preferís transferir?
        </strong>{" "}
        Pagando por transferencia bancaria tenés{" "}
        {BANK_TRANSFER_DISCOUNT_PERCENT_LABEL} de descuento en los productos.
        Elegila en el checkout.
      </p>

      <p className="text-center text-sm text-neutral-600">
        <Package
          className="mr-1 inline h-4 w-4 align-text-bottom"
          aria-hidden="true"
        />
        Si creés que el pago se hizo, revisá{" "}
        <Link
          href="/profile/my-orders"
          className="font-medium text-neutral-900 underline underline-offset-2"
        >
          Mis pedidos
        </Link>{" "}
        antes de intentar de nuevo.
      </p>
    </PaymentStatusShell>
  )
}
