"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Check,
  FileCheck2,
  Loader2,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
} from "lucide-react"

import { ClosedOrderView } from "@/components/payment/ClosedOrderView"
import { CopyButton } from "@/components/payment/CopyButton"
import { OrderLookupError } from "@/components/payment/OrderLookupError"
import {
  PaymentOrderSummary,
  SummaryList,
} from "@/components/payment/PaymentOrderSummary"
import {
  PaymentLoadingShell,
  PaymentStatusShell,
  ShellButton,
  ShellLink,
} from "@/components/payment/PaymentStatusShell"
import { ProofUploader } from "@/components/payment/ProofUploader"
import { TransferCountdown } from "@/components/payment/TransferCountdown"
import {
  buildLoginHref,
  cleanReference,
  formatDateTime,
  formatMoney,
  isBankTransferType,
  isCashStoreType,
  isUnsettledPaymentStatus,
  sanitizePaymentId,
} from "@/components/payment/payment-format"
import { useOrderSnapshot } from "@/components/payment/useOrderSnapshot"
import type { OrderPaymentSnapshot } from "@/controllers/payment/payment-controller"
import { orderShortId, STORE_PICKUP_INFO } from "@/lib/config/site"
import { cn } from "@/lib/utils"

/** Polling suave: rápido al principio y cada 15 s hasta ~10 min. */
const POLL_DELAYS_MS: readonly number[] = [
  3000,
  3000,
  5000,
  5000,
  ...Array.from({ length: 40 }, () => 15000),
]

function shouldPollPending(snapshot: OrderPaymentSnapshot): boolean {
  if (!isUnsettledPaymentStatus(snapshot.status)) return false
  // Transferencia: solo tiene sentido esperar mientras el admin revisa.
  if (isBankTransferType(snapshot.paymentType)) {
    return snapshot.proofStatus === "pending_review"
  }
  // Efectivo en tienda: lo confirma el admin al cobrar, sin apuro.
  if (isCashStoreType(snapshot.paymentType)) return false
  return true
}

interface BankDetail {
  label: string
  value: string
  copy: boolean
  mono: boolean
}

const BANK_DETAILS: BankDetail[] = [
  {
    label: "Alias",
    value: process.env.NEXT_PUBLIC_BANK_TRANSFER_ALIAS ?? "",
    copy: true,
    mono: true,
  },
  {
    label: "CBU/CVU",
    value: process.env.NEXT_PUBLIC_BANK_TRANSFER_CBU ?? "",
    copy: true,
    mono: true,
  },
  {
    label: "Titular",
    value: process.env.NEXT_PUBLIC_BANK_TRANSFER_HOLDER ?? "",
    copy: true,
    mono: false,
  },
  {
    label: "Banco",
    value: process.env.NEXT_PUBLIC_BANK_TRANSFER_BANK ?? "",
    copy: false,
    mono: false,
  },
].filter((detail) => detail.value.trim() !== "")

/** Los bancos argentinos esperan coma decimal. */
function formatAmountForCopy(amount: number): string {
  return Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(".", ",")
}

type StepState = "done" | "current" | "upcoming"

function Step({
  number,
  title,
  state,
  children,
}: {
  number: number
  title: string
  state: StepState
  children?: React.ReactNode
}) {
  return (
    <li className="group relative pb-7 pl-12 last:pb-0">
      <span
        className={cn(
          "absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
          state === "done" && "bg-emerald-600 text-white",
          state === "current" && "bg-neutral-900 text-white",
          state === "upcoming" &&
            "border border-neutral-300 bg-white text-neutral-500"
        )}
        aria-hidden="true"
      >
        {state === "done" ? <Check className="h-4 w-4" /> : number}
      </span>
      <span
        className="absolute bottom-0 left-4 top-9 w-px bg-neutral-200 group-last:hidden"
        aria-hidden="true"
      />
      <h3
        className={cn(
          "pt-1 text-base font-semibold",
          state === "upcoming" ? "text-neutral-500" : "text-neutral-900"
        )}
      >
        <span className="sr-only">
          {state === "done"
            ? "Paso completado: "
            : state === "current"
              ? "Paso actual: "
              : "Próximo paso: "}
        </span>
        {title}
      </h3>
      {children && (
        <div className="mt-2 space-y-3 text-sm text-neutral-600">
          {children}
        </div>
      )}
    </li>
  )
}

function BankDetails() {
  if (BANK_DETAILS.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
        Los datos bancarios todavía no están cargados en el sitio. Escribinos
        por mail para coordinar la transferencia.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white">
      {BANK_DETAILS.map((detail) => (
        <li
          key={detail.label}
          className="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-xs text-neutral-600">{detail.label}</p>
            <p
              className={cn(
                "break-all text-sm font-semibold text-neutral-900",
                detail.mono && "font-mono"
              )}
            >
              {detail.value}
            </p>
          </div>
          {detail.copy && (
            <CopyButton value={detail.value} label={detail.label} />
          )}
        </li>
      ))}
    </ul>
  )
}

function TransferView({
  snapshot,
  externalReference,
  onUploaded,
}: {
  snapshot: OrderPaymentSnapshot
  externalReference: string
  onUploaded: () => void
}) {
  const [replacing, setReplacing] = useState(false)

  const isRejected =
    snapshot.status === "rejected" || snapshot.proofStatus === "rejected"
  const inReview = !isRejected && snapshot.proofStatus === "pending_review"
  const showCountdown = !isRejected && !inReview && Boolean(snapshot.expiresAt)
  const uploadedAt = formatDateTime(snapshot.proofUploadedAt)

  const title = inReview
    ? "Recibimos tu comprobante"
    : isRejected
      ? "No pudimos validar tu comprobante"
      : "Transferí y subí tu comprobante"

  const description = inReview
    ? "Lo estamos revisando. Cuando lo confirmemos te llega un mail y empezamos a preparar tu pedido."
    : isRejected
      ? "Revisá el motivo y subí un comprobante nuevo para que podamos confirmar tu pedido."
      : "Reservamos tu pedido. Seguí estos tres pasos para confirmarlo."

  return (
    <PaymentStatusShell
      tone={isRejected ? "danger" : "pending"}
      icon={
        inReview ? (
          <FileCheck2 className="h-8 w-8 text-amber-600" />
        ) : undefined
      }
      size="lg"
      title={title}
      description={description}
      summary={
        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">
              Monto a transferir
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-neutral-900 sm:text-5xl">
              {formatMoney(snapshot.totalAmount, snapshot.currency)}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-neutral-600">
              <span>
                Pedido{" "}
                <span className="font-mono font-medium text-neutral-900">
                  #{orderShortId(snapshot.orderId)}
                </span>
              </span>
              <CopyButton
                value={formatAmountForCopy(snapshot.totalAmount)}
                label="monto"
              />
            </div>
          </div>
          {showCountdown && snapshot.expiresAt && (
            <TransferCountdown expiresAt={snapshot.expiresAt} />
          )}
        </div>
      }
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
      <ol aria-label="Pasos para completar el pago">
        <Step
          number={1}
          title="Transferí el monto exacto"
          state={inReview ? "done" : "current"}
        >
          {inReview ? (
            <p>Transferencia realizada.</p>
          ) : (
            <>
              <p>
                Desde tu home banking o billetera virtual, transferí{" "}
                <strong className="text-neutral-900">
                  {formatMoney(snapshot.totalAmount, snapshot.currency)}
                </strong>{" "}
                a esta cuenta:
              </p>
              <BankDetails />
            </>
          )}
        </Step>

        <Step
          number={2}
          title={isRejected ? "Subí un comprobante nuevo" : "Subí el comprobante"}
          state={inReview ? "done" : "current"}
        >
          {inReview ? (
            <>
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                Comprobante recibido{uploadedAt ? ` el ${uploadedAt}` : ""}. Lo
                estamos revisando.
              </p>
              {replacing ? (
                <ProofUploader
                  externalReference={externalReference}
                  onUploaded={() => {
                    setReplacing(false)
                    onUploaded()
                  }}
                  submitLabel="Enviar nuevo comprobante"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setReplacing(true)}
                  className="min-h-11 text-sm font-medium text-neutral-900 underline underline-offset-2"
                >
                  ¿Te equivocaste de archivo? Subir otro comprobante
                </button>
              )}
            </>
          ) : (
            <>
              {isRejected && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-900"
                >
                  <p className="font-medium">Motivo del rechazo</p>
                  <p>
                    {snapshot.proofRejectionReason ||
                      "El comprobante no pudo validarse."}
                  </p>
                </div>
              )}
              <p>
                Adjuntá la captura o el PDF del comprobante de transferencia.
              </p>
              <ProofUploader
                externalReference={externalReference}
                onUploaded={onUploaded}
                submitLabel={
                  isRejected ? "Enviar nuevo comprobante" : "Enviar comprobante"
                }
              />
            </>
          )}
        </Step>

        <Step
          number={3}
          title="Te confirmamos"
          state={inReview ? "current" : "upcoming"}
        >
          <p>
            Revisamos el comprobante y, cuando lo aprobemos, te mandamos un mail
            con la confirmación. Esta pantalla se actualiza sola.
          </p>
        </Step>
      </ol>
    </PaymentStatusShell>
  )
}

function CashView({ snapshot }: { snapshot: OrderPaymentSnapshot }) {
  return (
    <PaymentStatusShell
      tone="info"
      icon={<Store className="h-8 w-8 text-neutral-700" />}
      title="Pedido reservado para retirar"
      description="Pagás en efectivo cuando lo retirás en la tienda."
      summary={
        <SummaryList
          rows={[
            { label: "Pedido", value: `#${orderShortId(snapshot.orderId)}` },
            {
              label: "Total a pagar",
              value: formatMoney(snapshot.totalAmount, snapshot.currency),
              strong: true,
            },
            { label: "Estado", value: "Reservado" },
          ]}
        />
      }
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
      <div className="flex gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-left text-sm">
        <Store
          className="mt-0.5 h-5 w-5 shrink-0 text-neutral-700"
          aria-hidden="true"
        />
        <div>
          <p className="font-medium text-neutral-900">Retiro en tienda</p>
          <p className="text-neutral-600">{STORE_PICKUP_INFO}</p>
        </div>
      </div>
      <ol className="space-y-2 text-left text-sm text-neutral-600">
        <li>1. Preparamos tu pedido.</li>
        <li>
          2. <strong className="text-neutral-900">Te avisamos por mail</strong>{" "}
          cuando esté listo para retirar.
        </li>
        <li>
          3. Pagás el total al retirarlo. Llevá tu número de pedido.
        </li>
      </ol>
    </PaymentStatusShell>
  )
}

function MercadoPagoPendingView({
  snapshot,
  paymentId,
  isPolling,
  onRefresh,
}: {
  snapshot: OrderPaymentSnapshot
  paymentId: string | null
  isPolling: boolean
  onRefresh: () => void
}) {
  const inProcess = snapshot.status === "in_process"
  const expiresAt = formatDateTime(snapshot.expiresAt)
  const stillValid =
    snapshot.expiresAt !== null &&
    new Date(snapshot.expiresAt).getTime() > Date.now()

  return (
    <PaymentStatusShell
      tone="pending"
      title={
        inProcess
          ? "Mercado Pago está revisando tu pago"
          : "Estamos esperando que se acredite tu pago"
      }
      description={
        inProcess
          ? "Tu pago está en revisión. Suele resolverse en unos minutos y te avisamos por mail apenas se confirme."
          : "Tu pago todavía no figura como acreditado. Apenas se confirme te mandamos un mail y empezamos a preparar tu pedido."
      }
      summary={
        <PaymentOrderSummary snapshot={snapshot} paymentId={paymentId} />
      }
      actions={
        <>
          <ShellButton onClick={onRefresh} icon={<RefreshCw />}>
            Revisar estado
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
    >
      <ul className="space-y-2 rounded-xl border border-neutral-200 p-4 text-left text-sm text-neutral-600">
        <li>
          <strong className="text-neutral-900">
            Si pagaste con tarjeta o dinero en cuenta:
          </strong>{" "}
          puede estar en revisión de seguridad. No hace falta que hagas nada.
        </li>
        <li>
          <strong className="text-neutral-900">
            Si elegiste Rapipago, Pago Fácil u otro pago en efectivo:
          </strong>{" "}
          completá el pago con el cupón que te dio Mercado Pago
          {stillValid && expiresAt ? ` hasta el ${expiresAt}` : ""}. Después de
          pagar, la acreditación puede demorar un rato.
        </li>
        <li>No pagues de nuevo: si ya lo hiciste, lo vamos a registrar igual.</li>
      </ul>
      {isPolling && (
        <p className="flex items-center justify-center gap-2 text-xs text-neutral-600">
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Esta pantalla se actualiza sola cada unos segundos.
        </p>
      )}
    </PaymentStatusShell>
  )
}

export default function PaymentPendingClient() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const externalReference = cleanReference(
    searchParams.get("external_reference")
  )
  // El `amount` de la URL no se usa: el monto real viene del servidor.
  const urlMethod = searchParams.get("payment_method")
  const paymentId = sanitizePaymentId(
    searchParams.get("payment_id") ?? searchParams.get("collection_id")
  )
  const loginHref = buildLoginHref(
    `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`
  )

  const { state, isPolling, refresh } = useOrderSnapshot(externalReference, {
    shouldPoll: shouldPollPending,
    delaysMs: POLL_DELAYS_MS,
  })

  const approvedReference =
    state.phase === "ready" && state.snapshot.status === "approved"
      ? externalReference
      : null

  // Pago aprobado (el admin aprobó el comprobante, entró el webhook, etc.).
  useEffect(() => {
    if (!approvedReference) return
    router.replace(
      `/payment/success?external_reference=${encodeURIComponent(approvedReference)}`
    )
  }, [approvedReference, router])

  if (state.phase === "missing_reference") {
    return <OrderLookupError error={null} loginHref={loginHref} />
  }

  if (state.phase === "loading") {
    return <PaymentLoadingShell label="Cargando tu pedido…" />
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

  const { snapshot } = state

  if (snapshot.status === "approved") {
    return (
      <PaymentStatusShell
        tone="success"
        title="¡Pago confirmado!"
        description="Te estamos llevando al detalle de tu pedido…"
        actions={
          <ShellLink
            href={`/payment/success?external_reference=${encodeURIComponent(
              externalReference ?? ""
            )}`}
          >
            Ver mi pedido
          </ShellLink>
        }
      />
    )
  }

  const isTransfer = isBankTransferType(snapshot.paymentType ?? urlMethod)

  // Transferencia rechazada: el cliente puede volver a subir comprobante.
  if (isTransfer && snapshot.status === "rejected") {
    return (
      <TransferView
        snapshot={snapshot}
        externalReference={externalReference ?? ""}
        onUploaded={refresh}
      />
    )
  }

  if (!isUnsettledPaymentStatus(snapshot.status)) {
    return <ClosedOrderView snapshot={snapshot} paymentId={paymentId} />
  }

  if (isTransfer) {
    return (
      <TransferView
        snapshot={snapshot}
        externalReference={externalReference ?? ""}
        onUploaded={refresh}
      />
    )
  }

  if (isCashStoreType(snapshot.paymentType ?? urlMethod)) {
    return <CashView snapshot={snapshot} />
  }

  return (
    <MercadoPagoPendingView
      snapshot={snapshot}
      paymentId={paymentId}
      isPolling={isPolling}
      onRefresh={refresh}
    />
  )
}
