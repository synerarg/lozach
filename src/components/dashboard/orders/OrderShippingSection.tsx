"use client"

import { useState } from "react"
import {
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Store,
  Truck,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  retryCorreoArgentinoImport,
  setOrderTrackingNumber,
} from "@/controllers/admin/admin-transfer-controller"
import { formatCurrency, formatDateTime } from "@/components/dashboard/format"
import { DetailSection, InfoRow } from "./detail-primitives"
import {
  getShippingMethodLabel,
  isPickupShipping,
  needsCorreoImport,
  OrderView,
  parseShippingDetails,
  safeHttpsUrl,
  SHIPPING_STATUS_LABELS,
} from "./order-utils"
import { useOrderAction } from "./use-order-action"

const TRACKING_PATTERN = /^[A-Z0-9-]{6,30}$/

interface OrderShippingSectionProps {
  view: OrderView
}

export function OrderShippingSection({ view }: OrderShippingSectionProps) {
  const { shipping, order, stage } = view

  if (!shipping) {
    return (
      <DetailSection title="Envío" icon={Truck}>
        <p className="text-sm text-muted-foreground">
          Esta orden no tiene un envío registrado.
        </p>
      </DetailSection>
    )
  }

  const pickup = isPickupShipping(shipping)
  const details = parseShippingDetails(shipping.details)
  const trackingUrl = safeHttpsUrl(shipping.tracking_url)
  const isPaid = order.collection_status === "approved"
  const activeStage = stage === "to_prepare" || stage === "shipped"

  const showImportError =
    !pickup && isPaid && Boolean(shipping.import_error) && stage !== "delivered"
  const showMissingImport = needsCorreoImport(view) && !showImportError
  const showMissingTracking =
    !pickup &&
    isPaid &&
    activeStage &&
    Boolean(shipping.imported_at) &&
    !shipping.tracking_number &&
    !showImportError

  const addressLine = [shipping.address, shipping.city, shipping.state]
    .filter(Boolean)
    .join(", ")

  return (
    <DetailSection
      title="Envío"
      icon={pickup ? Store : Truck}
      aside={
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {SHIPPING_STATUS_LABELS[shipping.shipping_status] ??
            shipping.shipping_status}
        </span>
      }
    >
      <dl className="space-y-2.5">
        <InfoRow label="Método">{getShippingMethodLabel(shipping)}</InfoRow>

        {pickup ? (
          <InfoRow label="Retiro">
            {shipping.ready_for_pickup_email_sent
              ? "Cliente avisado: listo para retirar"
              : "Todavía no avisaste al cliente"}
          </InfoRow>
        ) : (
          <>
            {details.branchName || details.branchCode ? (
              <InfoRow label="Sucursal">
                <span className="block font-medium">
                  {details.branchName ?? "Sucursal Correo Argentino"}
                </span>
                {details.branchCode && (
                  <span className="block font-mono text-xs text-muted-foreground">
                    Código {details.branchCode}
                  </span>
                )}
                {details.branchAddress && (
                  <span className="block text-muted-foreground">
                    {details.branchAddress}
                  </span>
                )}
              </InfoRow>
            ) : null}
            <InfoRow label={details.branchName ? "Cliente en" : "Dirección"}>
              <span className="flex items-start gap-1">
                <MapPin
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  {addressLine || "Sin dirección"}
                  {shipping.postal_code ? ` (CP ${shipping.postal_code})` : ""}
                </span>
              </span>
            </InfoRow>
            {details.notes.length > 0 && (
              <InfoRow label="Detalles">{details.notes.join(" · ")}</InfoRow>
            )}
            <InfoRow label="Costo de envío">
              {shipping.shipping_cost > 0
                ? formatCurrency(shipping.shipping_cost)
                : "Gratis"}
            </InfoRow>
          </>
        )}

        {!pickup && shipping.tracking_number && (
          <InfoRow label="Seguimiento">
            {trackingUrl ? (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded font-mono text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-sky-300"
              >
                {shipping.tracking_number}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ) : (
              <span className="font-mono">{shipping.tracking_number}</span>
            )}
          </InfoRow>
        )}

        {!pickup && shipping.last_tracking_status && (
          <InfoRow label="Último evento">
            {shipping.last_tracking_status}
            {shipping.last_synced_at && (
              <span className="block text-xs text-muted-foreground">
                Actualizado {formatDateTime(shipping.last_synced_at)}
              </span>
            )}
          </InfoRow>
        )}

        {shipping.delivered_at && (
          <InfoRow label="Entregado">{formatDateTime(shipping.delivered_at)}</InfoRow>
        )}
      </dl>

      {showImportError && (
        <CorreoImportPanel
          orderId={order.id}
          variant="error"
          errorMessage={shipping.import_error ?? ""}
          attempts={shipping.import_attempts ?? 0}
        />
      )}
      {showMissingImport && (
        <CorreoImportPanel
          orderId={order.id}
          variant="missing"
          attempts={shipping.import_attempts ?? 0}
        />
      )}
      {showMissingTracking && (
        <CorreoImportPanel orderId={order.id} variant="no-tracking" attempts={0} />
      )}
    </DetailSection>
  )
}

interface CorreoImportPanelProps {
  orderId: string
  variant: "error" | "missing" | "no-tracking"
  errorMessage?: string
  attempts: number
}

function CorreoImportPanel({
  orderId,
  variant,
  errorMessage,
  attempts,
}: CorreoImportPanelProps) {
  const { busy, run } = useOrderAction()
  const [tracking, setTracking] = useState("")
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const inputId = `tracking-${orderId}`

  const handleRetry = async () => {
    await run(
      "retry",
      () => retryCorreoArgentinoImport(orderId),
      (data) =>
        data?.trackingNumber
          ? `Envío creado en Correo Argentino. Seguimiento: ${data.trackingNumber}`
          : "Envío creado, pero Correo Argentino todavía no devolvió el seguimiento. Podés cargarlo a mano.",
      "No se pudo crear el envío en Correo Argentino."
    )
  }

  const handleSaveTracking = async () => {
    const clean = tracking.trim().toUpperCase()
    if (!TRACKING_PATTERN.test(clean)) {
      setTrackingError("Ingresá entre 6 y 30 letras, números o guiones.")
      return
    }
    setTrackingError(null)
    const ok = await run(
      "tracking",
      () => setOrderTrackingNumber(orderId, clean),
      "Número de seguimiento guardado.",
      "No se pudo guardar el seguimiento."
    )
    if (ok) setTracking("")
  }

  const title =
    variant === "error"
      ? "No se pudo crear el envío en Correo Argentino"
      : variant === "missing"
        ? "Envío sin crear en Correo Argentino"
        : "Falta el número de seguimiento"

  return (
    <div
      role="alert"
      className="mt-4 space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1 text-sm">
          <p className="font-medium">{title}</p>
          {variant === "error" && errorMessage && (
            <p className="break-words text-xs opacity-90">{errorMessage}</p>
          )}
          {variant === "missing" && (
            <p className="text-xs opacity-90">
              La orden está paga pero el envío todavía no figura en MiCorreo.
              El sistema reintenta solo; también podés hacerlo ahora.
            </p>
          )}
          {variant === "no-tracking" && (
            <p className="text-xs opacity-90">
              El envío se creó pero la API no devolvió el seguimiento.
              Cargalo a mano para que el cliente pueda rastrearlo.
            </p>
          )}
          {attempts > 0 && variant !== "no-tracking" && (
            <p className="text-xs opacity-75">
              Intentos: {attempts}
            </p>
          )}
        </div>
      </div>

      {variant !== "no-tracking" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full border-amber-400 bg-transparent hover:bg-amber-100 sm:w-auto dark:border-amber-700 dark:hover:bg-amber-900/40"
          disabled={busy !== null}
          onClick={handleRetry}
        >
          {busy === "retry" ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          Reintentar envío en Correo Argentino
        </Button>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={inputId} className="text-xs">
          Cargar nº de seguimiento manual
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            value={tracking}
            onChange={(event) => {
              setTracking(event.target.value)
              if (trackingError) setTrackingError(null)
            }}
            placeholder="Ej: CU123456789AR"
            autoComplete="off"
            maxLength={30}
            aria-invalid={Boolean(trackingError)}
            aria-describedby={trackingError ? `${inputId}-error` : undefined}
            disabled={busy !== null}
            className="bg-background font-mono uppercase"
          />
          <Button
            type="button"
            size="sm"
            className="h-9 w-full sm:w-auto"
            disabled={busy !== null || !tracking.trim()}
            onClick={handleSaveTracking}
          >
            {busy === "tracking" && (
              <Loader2 className="animate-spin" aria-hidden="true" />
            )}
            Guardar
          </Button>
        </div>
        {trackingError && (
          <p id={`${inputId}-error`} className="text-xs text-red-700 dark:text-red-300">
            {trackingError}
          </p>
        )}
      </div>
    </div>
  )
}
