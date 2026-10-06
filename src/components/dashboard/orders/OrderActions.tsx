"use client"

import { useState } from "react"
import {
  BellRing,
  Banknote,
  CircleCheck,
  CircleX,
  PackageCheck,
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { FormTextarea } from "@/components/dashboard/FormTextarea"
import { ConfirmActionDialog } from "@/components/dashboard/ConfirmActionDialog"
import {
  approveBankTransferOrder,
  cancelUnpaidOrder,
  confirmCashPaymentOrder,
  markOrderPickedUp,
  markOrderReadyForPickup,
  rejectBankTransferOrder,
} from "@/controllers/admin/admin-transfer-controller"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
} from "@/lib/utils/payment-utils"
import { formatCurrency } from "@/components/dashboard/format"
import {
  canCancelUnpaid,
  isPickupShipping,
  needsCorreoImport,
  OrderView,
} from "./order-utils"
import { OrderActionKey, useOrderAction } from "./use-order-action"

type DialogKey = Extract<
  OrderActionKey,
  "approve" | "reject" | "cash" | "ready" | "pickedUp" | "cancel"
>

interface OrderActionsProps {
  view: OrderView
}

export function OrderActions({ view }: OrderActionsProps) {
  const { order, shipping, stage, meta } = view
  const { busy, run } = useOrderAction()
  const [dialog, setDialog] = useState<DialogKey | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [cancelReason, setCancelReason] = useState("")

  const isTransfer = order.payment_type === BANK_TRANSFER_PAYMENT_TYPE
  const isCash = order.payment_type === CASH_STORE_PAYMENT_TYPE
  const pickup = isPickupShipping(shipping)
  const readyNotified = Boolean(shipping?.ready_for_pickup_email_sent)
  const shortId = view.shortId

  const canReviewProof = isTransfer && stage === "proof_review"
  const canConfirmCash = isCash && stage === "awaiting_payment"
  const canNotifyPickup =
    pickup &&
    !readyNotified &&
    (stage === "to_prepare" || (isCash && stage === "awaiting_payment"))
  const canMarkPickedUp = pickup && (stage === "to_prepare" || stage === "ready_for_pickup")
  const canCancel = canCancelUnpaid(stage)
  const correoPending = needsCorreoImport(view)

  const hasActions =
    canReviewProof ||
    canConfirmCash ||
    canNotifyPickup ||
    canMarkPickedUp ||
    canCancel

  const closeDialog = () => setDialog(null)

  const handleApprove = async () => {
    const ok = await run(
      "approve",
      () => approveBankTransferOrder(order.id),
      "Pago aprobado. Se le envió el mail de confirmación al cliente.",
      "No se pudo aprobar el pago."
    )
    if (ok) closeDialog()
  }

  const handleReject = async () => {
    const reason = rejectReason.trim()
    if (!reason) return
    const ok = await run(
      "reject",
      () => rejectBankTransferOrder(order.id, reason),
      "Comprobante rechazado. Se le avisó al cliente con el motivo.",
      "No se pudo rechazar el comprobante."
    )
    if (ok) {
      setRejectReason("")
      closeDialog()
    }
  }

  const handleCash = async () => {
    const ok = await run(
      "cash",
      () => confirmCashPaymentOrder(order.id),
      "Cobro en efectivo registrado.",
      "No se pudo registrar el cobro."
    )
    if (ok) closeDialog()
  }

  const handleReady = async () => {
    const ok = await run(
      "ready",
      () => markOrderReadyForPickup(order.id),
      "Listo. Se le avisó al cliente que puede retirar.",
      "No se pudo avisar al cliente."
    )
    if (ok) closeDialog()
  }

  const handlePickedUp = async () => {
    const ok = await run(
      "pickedUp",
      () => markOrderPickedUp(order.id),
      "Pedido marcado como retirado.",
      "No se pudo marcar el pedido como retirado."
    )
    if (ok) closeDialog()
  }

  const handleCancel = async () => {
    const reason = cancelReason.trim()
    const ok = await run(
      "cancel",
      () => cancelUnpaidOrder(order.id, reason || undefined),
      "Orden cancelada. Se le avisó al cliente.",
      "No se pudo cancelar la orden."
    )
    if (ok) {
      setCancelReason("")
      closeDialog()
    }
  }

  const isBusy = busy !== null
  const buttonClass = "w-full sm:w-auto"

  return (
    <section
      aria-label={`Acciones de la orden ${shortId}`}
      className={cn(
        "rounded-xl border p-4",
        meta.needsAdminAction
          ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/20"
          : "bg-background"
      )}
    >
      <div className="mb-3 flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">Acciones</h3>
        <p className="text-xs text-muted-foreground">{meta.description}</p>
      </div>

      {hasActions ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {canReviewProof && (
            <>
              <Button
                type="button"
                className={cn(buttonClass, "bg-emerald-600 text-white hover:bg-emerald-700")}
                disabled={isBusy}
                onClick={() => setDialog("approve")}
              >
                <CircleCheck aria-hidden="true" />
                Aprobar pago
              </Button>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  buttonClass,
                  "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                )}
                disabled={isBusy}
                onClick={() => setDialog("reject")}
              >
                <CircleX aria-hidden="true" />
                Rechazar comprobante
              </Button>
            </>
          )}

          {canConfirmCash && (
            <Button
              type="button"
              className={cn(buttonClass, "bg-emerald-600 text-white hover:bg-emerald-700")}
              disabled={isBusy}
              onClick={() => setDialog("cash")}
            >
              <Banknote aria-hidden="true" />
              Cobrado en efectivo
            </Button>
          )}

          {canNotifyPickup && (
            <Button
              type="button"
              variant={canConfirmCash ? "outline" : "default"}
              className={buttonClass}
              disabled={isBusy}
              onClick={() => setDialog("ready")}
            >
              <BellRing aria-hidden="true" />
              {canConfirmCash ? "Marcar listo para retirar" : "Avisar que está listo"}
            </Button>
          )}

          {canMarkPickedUp && (
            <Button
              type="button"
              variant={stage === "ready_for_pickup" ? "default" : "outline"}
              className={buttonClass}
              disabled={isBusy}
              onClick={() => setDialog("pickedUp")}
            >
              <PackageCheck aria-hidden="true" />
              Ya retiró
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              variant="outline"
              className={cn(
                buttonClass,
                "border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              )}
              disabled={isBusy}
              onClick={() => setDialog("cancel")}
            >
              <CircleX aria-hidden="true" />
              Cancelar orden
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No hay acciones pendientes para esta orden.
        </p>
      )}

      {pickup && readyNotified && stage !== "delivered" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
          Ya le avisaste al cliente que puede retirar.
        </p>
      )}

      {correoPending && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
          <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          El envío todavía no se creó en Correo Argentino. Resolvelo en la
          sección Envío.
        </p>
      )}

      <ConfirmActionDialog
        open={dialog === "approve"}
        onOpenChange={(open) => !open && closeDialog()}
        title="¿Aprobar el pago?"
        description={`Vas a confirmar la transferencia de la orden ${shortId} por ${formatCurrency(order.total_amount)}. Se le envía el mail de confirmación al cliente.`}
        confirmLabel="Sí, aprobar pago"
        busy={busy === "approve"}
        onConfirm={handleApprove}
      />

      <ConfirmActionDialog
        open={dialog === "reject"}
        onOpenChange={(open) => !open && closeDialog()}
        title="Rechazar comprobante"
        description={`El motivo se le envía por mail al cliente (orden ${shortId}) para que pueda corregirlo.`}
        confirmLabel="Rechazar y avisar"
        destructive
        busy={busy === "reject"}
        confirmDisabled={!rejectReason.trim()}
        onConfirm={handleReject}
      >
        <div className="space-y-2">
          <Label htmlFor={`reject-reason-${order.id}`}>
            Motivo <span className="text-red-600">*</span>
          </Label>
          <FormTextarea
            id={`reject-reason-${order.id}`}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Ej: el monto no coincide, comprobante ilegible, no figura acreditado…"
            disabled={busy === "reject"}
            maxLength={500}
          />
        </div>
      </ConfirmActionDialog>

      <ConfirmActionDialog
        open={dialog === "cash"}
        onOpenChange={(open) => !open && closeDialog()}
        title="¿Registrar el cobro en efectivo?"
        description={`Confirmás que cobraste ${formatCurrency(order.total_amount)} de la orden ${shortId}. La orden pasa a pagada y se avisa al cliente.`}
        confirmLabel="Sí, ya cobré"
        busy={busy === "cash"}
        onConfirm={handleCash}
      />

      <ConfirmActionDialog
        open={dialog === "ready"}
        onOpenChange={(open) => !open && closeDialog()}
        title="¿Avisar que el pedido está listo?"
        description={`Se le manda un mail a ${view.customerName} avisando que ya puede retirar la orden ${shortId} por la tienda.${
          canConfirmCash ? " Recordale que paga en efectivo al retirar." : ""
        }`}
        confirmLabel="Sí, avisar"
        busy={busy === "ready"}
        onConfirm={handleReady}
      />

      <ConfirmActionDialog
        open={dialog === "pickedUp"}
        onOpenChange={(open) => !open && closeDialog()}
        title="¿El cliente ya retiró el pedido?"
        description={`La orden ${shortId} pasa a entregada. Esto no se puede deshacer desde el panel.`}
        confirmLabel="Sí, ya retiró"
        busy={busy === "pickedUp"}
        onConfirm={handlePickedUp}
      />

      <ConfirmActionDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && closeDialog()}
        title="¿Cancelar la orden?"
        description={`La orden ${shortId} no se cobró todavía. Se cancela y se le avisa por mail a ${view.customerName}.`}
        confirmLabel="Sí, cancelar orden"
        destructive
        busy={busy === "cancel"}
        onConfirm={handleCancel}
      >
        <div className="space-y-2">
          <Label htmlFor={`cancel-reason-${order.id}`}>
            Motivo <span className="text-muted-foreground">(opcional, se envía al cliente)</span>
          </Label>
          <FormTextarea
            id={`cancel-reason-${order.id}`}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Ej: sin stock del talle, pedido duplicado…"
            disabled={busy === "cancel"}
            maxLength={500}
          />
        </div>
      </ConfirmActionDialog>

      {busy && (
        <p className="sr-only" role="status" aria-live="polite">
          Procesando…
        </p>
      )}
    </section>
  )
}
