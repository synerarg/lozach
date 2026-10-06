"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Mail,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react"

import type { OrderPaymentSnapshot } from "@/controllers/payment/payment-controller"
import { useCart } from "@/context/CartContext"
import { orderShortId, STORE_PICKUP_INFO } from "@/lib/config/site"
import {
  buildLoginHref,
  buildPendingHref,
  cleanReference,
  isBankTransferType,
  isCashStoreType,
  isMercadoPagoType,
  isStorePickupMethod,
  isUnsettledPaymentStatus,
  sanitizePaymentId,
} from "@/components/payment/payment-format"
import { ClosedOrderView } from "@/components/payment/ClosedOrderView"
import { OrderLookupError } from "@/components/payment/OrderLookupError"
import { PaymentOrderSummary } from "@/components/payment/PaymentOrderSummary"
import {
  PaymentLoadingShell,
  PaymentStatusShell,
  ShellButton,
  ShellLink,
} from "@/components/payment/PaymentStatusShell"
import { useOrderSnapshot } from "@/components/payment/useOrderSnapshot"

/** ~30 s de polling con backoff: el webhook de Mercado Pago puede tardar unos segundos. */
const POLL_DELAYS_MS: readonly number[] = [
  2000, 2000, 2500, 2500, 3000, 3000, 3000, 3000, 3000, 3000, 3000,
]

function shouldPollSuccess(snapshot: OrderPaymentSnapshot): boolean {
  // Transferencia / efectivo no se resuelven solos desde esta pantalla.
  return (
    isUnsettledPaymentStatus(snapshot.status) &&
    isMercadoPagoType(snapshot.paymentType)
  )
}

const CART_CLEARED_KEY_PREFIX = "lozach:cart-cleared:"

/** true si ya limpiamos el carrito para esta orden (evita vaciar un carrito nuevo al recargar). */
function markCartCleared(orderId: string): boolean {
  const key = `${CART_CLEARED_KEY_PREFIX}${orderId}`
  try {
    if (window.localStorage.getItem(key)) return false
    window.localStorage.setItem(key, "1")
  } catch {
    // Sin storage: limpiamos igual (una vez por montaje).
  }
  return true
}

function NextSteps({ snapshot }: { snapshot: OrderPaymentSnapshot }) {
  const pickup = isStorePickupMethod(snapshot.shippingMethod)

  const steps: { icon: React.ReactNode; title: string; body: React.ReactNode }[] = [
    {
      icon: <Mail className="h-5 w-5" aria-hidden="true" />,
      title: "Revisá tu mail",
      body: "Te enviamos la confirmación con el detalle de tu pedido. Si no llega en unos minutos, mirá la carpeta de spam.",
    },
    pickup
      ? {
          icon: <Store className="h-5 w-5" aria-hidden="true" />,
          title: "Retirás en la tienda",
          body: (
            <>
              Preparamos tu pedido y te avisamos por mail cuando esté listo.{" "}
              {STORE_PICKUP_INFO}
            </>
          ),
        }
      : {
          icon: <Truck className="h-5 w-5" aria-hidden="true" />,
          title: "Lo despachamos con Correo Argentino",
          body: snapshot.trackingNumber ? (
            <>
              Tu número de seguimiento es{" "}
              <span className="font-mono font-medium">
                {snapshot.trackingNumber}
              </span>
              .
            </>
          ) : (
            "Preparamos tu pedido y te mandamos el número de seguimiento por mail apenas se despache."
          ),
        },
    {
      icon: <Package className="h-5 w-5" aria-hidden="true" />,
      title: "Seguilo en Mis pedidos",
      body: "Ahí ves el estado de tu pedido paso a paso, cuando quieras.",
    },
  ]

  return (
    <section aria-labelledby="next-steps-title">
      <h2
        id="next-steps-title"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-600"
      >
        Qué sigue
      </h2>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-xl border border-neutral-200 p-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-800">
              {step.icon}
            </span>
            <div className="min-w-0 text-left">
              <p className="text-sm font-medium text-neutral-900">
                {step.title}
              </p>
              <p className="text-sm text-neutral-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { clearCart } = useCart()

  const externalReference = cleanReference(
    searchParams.get("external_reference")
  )
  const paymentId = sanitizePaymentId(
    searchParams.get("payment_id") ?? searchParams.get("collection_id")
  )
  const loginHref = buildLoginHref(
    `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
  )

  const { state, isPolling, exhausted, refresh } = useOrderSnapshot(
    externalReference,
    { shouldPoll: shouldPollSuccess, delaysMs: POLL_DELAYS_MS }
  )

  const snapshot = state.phase === "ready" ? state.snapshot : null
  const approvedOrderId =
    snapshot?.status === "approved" ? snapshot.orderId : null
  const clearedRef = useRef(false)

  // El carrito se limpia UNA sola vez, recién cuando el pago está aprobado.
  useEffect(() => {
    if (!approvedOrderId || clearedRef.current) return
    clearedRef.current = true
    if (markCartCleared(approvedOrderId)) {
      clearCart()
    }
    // clearCart cambia de identidad en cada render del provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedOrderId])

  if (state.phase === "missing_reference") {
    return <OrderLookupError error={null} loginHref={loginHref} />
  }

  if (state.phase === "loading") {
    return <PaymentLoadingShell label="Verificando tu pago…" />
  }

  if (state.phase === "error") {
    return (
      <OrderLookupError
        error={state.error}
        loginHref={loginHref}
        onRetry={refresh}
      />
    )
  }

  const { snapshot: order } = state
  const shortId = orderShortId(order.orderId)

  // --- Aprobado -----------------------------------------------------------
  if (order.status === "approved") {
    const pickup = isStorePickupMethod(order.shippingMethod)

    return (
      <PaymentStatusShell
        tone="success"
        title="¡Pago confirmado!"
        description={
          <>
            Gracias por tu compra. Tu pedido <strong>#{shortId}</strong> ya está
            confirmado
            {pickup ? " y lo vas a retirar en la tienda." : "."}
          </>
        }
        announce={`Pago confirmado. Tu pedido ${shortId} ya está confirmado.`}
        size="lg"
        summary={<PaymentOrderSummary snapshot={order} paymentId={paymentId} />}
        actions={
          <>
            <ShellLink href="/profile/my-orders" icon={<Package />}>
              Ver mis pedidos
            </ShellLink>
            <ShellLink
              href="/products"
              variant="secondary"
              icon={<ShoppingBag />}
            >
              Seguir comprando
            </ShellLink>
          </>
        }
      >
        <NextSteps snapshot={order} />
      </PaymentStatusShell>
    )
  }

  // --- Pedido que se paga por transferencia / efectivo (no es de MP) ------
  if (
    isUnsettledPaymentStatus(order.status) &&
    (isBankTransferType(order.paymentType) || isCashStoreType(order.paymentType))
  ) {
    const method = order.paymentType ?? ""
    const isTransfer = isBankTransferType(order.paymentType)

    return (
      <PaymentStatusShell
        tone="pending"
        title={
          isTransfer ? "Tu pedido espera la transferencia" : "Pedido reservado"
        }
        description={
          isTransfer
            ? "Todavía no confirmamos el pago de este pedido. Mirá los datos para transferir y subí el comprobante."
            : "Pagás en efectivo cuando retirás tu pedido en la tienda."
        }
        summary={<PaymentOrderSummary snapshot={order} />}
        actions={
          <>
            <ShellLink
              href={
                externalReference
                  ? buildPendingHref(externalReference, method)
                  : "/profile/my-orders"
              }
            >
              {isTransfer ? "Ver datos de la transferencia" : "Ver mi reserva"}
            </ShellLink>
            <ShellLink
              href="/profile/my-orders"
              variant="secondary"
              icon={<Package />}
            >
              Ver mis pedidos
            </ShellLink>
          </>
        }
      />
    )
  }

  // --- Confirmando / todavía procesando (pending / in_process) -------------
  if (isUnsettledPaymentStatus(order.status)) {
    if (isPolling || !exhausted) {
      return (
        <PaymentStatusShell
          tone="loading"
          title="Estamos confirmando tu pago"
          description="Mercado Pago nos está avisando que se acreditó. Suele tardar unos segundos, no cierres esta pantalla."
          announce="Estamos confirmando tu pago. Esto puede tardar unos segundos."
          summary={
            <PaymentOrderSummary snapshot={order} paymentId={paymentId} />
          }
          hideSupport
        />
      )
    }

    return (
      <PaymentStatusShell
        tone="pending"
        title="Todavía estamos procesando tu pago"
        description={
          <>
            Algunos pagos tardan unos minutos en acreditarse. No hace falta que
            pagues de nuevo: apenas se confirme te mandamos un mail y vas a ver
            tu pedido actualizado en Mis pedidos.
          </>
        }
        summary={<PaymentOrderSummary snapshot={order} paymentId={paymentId} />}
        actions={
          <>
            <ShellButton onClick={refresh} icon={<RefreshCw />}>
              Revisar de nuevo
            </ShellButton>
            <ShellLink
              href="/profile/my-orders"
              variant="secondary"
              icon={<Package />}
            >
              Ver mis pedidos
            </ShellLink>
          </>
        }
      />
    )
  }

  // --- Rechazado / reembolsado / cancelado / vencido -------------------------
  return <ClosedOrderView snapshot={order} paymentId={paymentId} />
}
