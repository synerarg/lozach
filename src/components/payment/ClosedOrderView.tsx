import { Package, RefreshCw, ShoppingBag } from "lucide-react"

import type { OrderPaymentSnapshot } from "@/controllers/payment/payment-controller"
import { orderShortId } from "@/lib/config/site"

import { PaymentOrderSummary } from "./PaymentOrderSummary"
import { isBankTransferType } from "./payment-format"
import {
  PaymentStatusShell,
  ShellLink,
  ShellSupportLink,
} from "./PaymentStatusShell"

/**
 * Pedido en un estado final que NO es "aprobado": rechazado, reembolsado,
 * contracargo, cancelado o vencido. Lo comparten success y pending.
 */
export function ClosedOrderView({
  snapshot,
  paymentId,
}: {
  snapshot: OrderPaymentSnapshot
  paymentId?: string | null
}) {
  const shortId = orderShortId(snapshot.orderId)
  const summary = (
    <PaymentOrderSummary snapshot={snapshot} paymentId={paymentId} />
  )
  const myOrders = (
    <ShellLink href="/profile/my-orders" variant="secondary" icon={<Package />}>
      Ver mis pedidos
    </ShellLink>
  )

  if (snapshot.status === "rejected") {
    return (
      <PaymentStatusShell
        tone="danger"
        title="El pago no fue aprobado"
        description="El medio de pago fue rechazado. Podés intentar de nuevo con otra tarjeta o elegir otro medio de pago."
        summary={summary}
        actions={
          <>
            <ShellLink href="/checkout" icon={<RefreshCw />}>
              Intentar de nuevo
            </ShellLink>
            {myOrders}
          </>
        }
      />
    )
  }

  if (snapshot.status === "refunded" || snapshot.status === "charged_back") {
    return (
      <PaymentStatusShell
        tone="info"
        title="Este pago fue reembolsado"
        description="El pago de este pedido fue devuelto. Si tenés dudas sobre el reintegro, escribinos y lo revisamos juntos."
        summary={summary}
        actions={
          <>
            <ShellSupportLink
              subject={`Consulta por reintegro del pedido #${shortId}`}
            />
            {myOrders}
          </>
        }
      />
    )
  }

  const isTransfer = isBankTransferType(snapshot.paymentType)

  return (
    <PaymentStatusShell
      tone="danger"
      title={isTransfer ? "Este pedido venció" : "Este pedido fue cancelado"}
      description={
        isTransfer
          ? "Pasó el plazo para transferir y el pedido se canceló. Si ya transferiste, escribinos con tu comprobante y lo resolvemos."
          : "El pedido se canceló o venció el plazo de pago. Si ya pagaste, escribinos con tu número de pedido y lo resolvemos."
      }
      summary={summary}
      actions={
        <>
          <ShellSupportLink subject={`Consulta por el pedido #${shortId}`} />
          <ShellLink href="/products" icon={<ShoppingBag />}>
            Volver a la tienda
          </ShellLink>
        </>
      }
    />
  )
}
