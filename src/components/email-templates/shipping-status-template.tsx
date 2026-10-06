import { Link } from "@react-email/components"
import {
  STORE_PICKUP_INFO,
  orderShortId,
  orderUrl as defaultOrderUrl,
} from "@/lib/config/site"
import {
  EmailButton,
  EmailCallout,
  EmailHero,
  EmailInfoCard,
  EmailLayout,
  EmailParagraph,
  EmailProgress,
  EmailSection,
  EmailTone,
  emailColors,
  formatMoney,
  isHttpsUrl,
} from "./email-layout"

export type ShippingEmailVariant = "in_transit" | "delivered" | "ready_for_pickup"

export interface ShippingStatusEmailProps {
  name: string
  orderId: string
  variant: ShippingEmailVariant
  trackingNumber?: string | null
  trackingUrl?: string | null
  supportEmail: string
  /** Link a "Mis pedidos". Si no viene, se usa el de la tienda. */
  orderUrl?: string
  /** Solo ready_for_pickup: monto a cobrar en efectivo al retirar. */
  cashDue?: number | null
  /** Solo ready_for_pickup: dónde y cuándo retirar. */
  pickupInfo?: string
}

interface VariantCopy {
  tone: EmailTone
  badge: string
  title: string
  preview: (shortId: string) => string
  summary: string
  progress: string[]
  progressIndex: number
  closing: string
}

const COPY: Record<ShippingEmailVariant, VariantCopy> = {
  in_transit: {
    tone: "info",
    badge: "En camino",
    title: "¡Tu pedido está en camino!",
    preview: (id) =>
      `Despachamos tu pedido #${id} con Correo Argentino. Seguilo desde acá.`,
    summary:
      "Despachamos tu pedido y ya está viajando con Correo Argentino. Podés seguirlo con el número de seguimiento.",
    progress: ["Pedido confirmado", "Despachado", "Entregado"],
    progressIndex: 1,
    closing:
      "Te volvemos a escribir cuando el pedido sea entregado. ¡Gracias por tu compra!",
  },
  delivered: {
    tone: "success",
    badge: "Entregado",
    title: "Tu pedido fue entregado",
    preview: (id) =>
      `Correo Argentino marcó tu pedido #${id} como entregado. ¡Que lo disfrutes!`,
    summary:
      "Correo Argentino nos informó que tu pedido fue entregado. ¡Esperamos que lo disfrutes!",
    progress: ["Pedido confirmado", "Despachado", "Entregado"],
    progressIndex: 2,
    closing:
      "Si no recibiste el pedido o tenés algún inconveniente, respondé este mail y lo resolvemos.",
  },
  ready_for_pickup: {
    tone: "success",
    badge: "Listo para retirar",
    title: "Tu pedido está listo para retirar",
    preview: (id) => `Tu pedido #${id} ya está listo para que lo retires.`,
    summary: "Ya preparamos tu pedido y te está esperando.",
    progress: ["Pedido confirmado", "Listo para retirar", "Retirado"],
    progressIndex: 1,
    closing: "¡Te esperamos! Cualquier duda, respondé este mail.",
  },
}

export default function ShippingStatusEmail({
  name,
  orderId,
  variant,
  trackingNumber,
  trackingUrl,
  supportEmail,
  orderUrl,
  cashDue,
  pickupInfo,
}: ShippingStatusEmailProps) {
  const copy = COPY[variant]
  const shortId = orderShortId(orderId)
  const ordersHref = orderUrl || defaultOrderUrl()
  // La URL de seguimiento viene de una API externa: solo se acepta https.
  const safeTrackingUrl = isHttpsUrl(trackingUrl) ? trackingUrl.trim() : null
  const isPickup = variant === "ready_for_pickup"
  const hasCashDue = typeof cashDue === "number" && cashDue > 0
  const cleanTracking = trackingNumber?.trim()
  const showTrackingButton = !isPickup && safeTrackingUrl !== null

  const rows = [
    { label: "Pedido", value: `#${shortId}` },
    ...(!isPickup && cleanTracking
      ? [
          {
            label: "N° de seguimiento",
            value: cleanTracking,
            mono: true,
          },
        ]
      : []),
    ...(!isPickup ? [{ label: "Correo", value: "Correo Argentino" }] : []),
  ]

  return (
    <EmailLayout preview={copy.preview(shortId)}>
      <EmailHero
        tone={copy.tone}
        badge={copy.badge}
        title={copy.title}
        subtitle={`Pedido #${shortId}`}
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailProgress
          steps={copy.progress}
          currentIndex={copy.progressIndex}
          tone={copy.tone}
        />
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>Hola {name},</EmailParagraph>
        <EmailParagraph spacing="0 0 18px 0">{copy.summary}</EmailParagraph>

        {isPickup ? (
          <>
            {hasCashDue ? (
              <EmailCallout tone="warning" title="Pagás en efectivo al retirar">
                Llevá{" "}
                <strong>{formatMoney(cashDue ?? 0, "ARS")}</strong> en efectivo
                para abonar tu pedido en la tienda.
              </EmailCallout>
            ) : null}
            <EmailInfoCard
              layout="stacked"
              title="Dónde y cuándo retirar"
              rows={[
                {
                  label: "Retiro",
                  value: pickupInfo?.trim() || STORE_PICKUP_INFO,
                },
                {
                  label: "Qué llevar",
                  value: `Tu DNI y el número de pedido #${shortId}`,
                },
              ]}
            />
          </>
        ) : (
          <EmailInfoCard rows={rows} />
        )}
      </EmailSection>

      {!isPickup && !safeTrackingUrl && cleanTracking ? (
        <EmailSection>
          <EmailParagraph small muted spacing="0">
            Podés consultar el estado en{" "}
            <Link
              href="https://www.correoargentino.com.ar"
              style={{ color: emailColors.ink, fontWeight: 600 }}
            >
              correoargentino.com.ar
            </Link>{" "}
            con ese número.
          </EmailParagraph>
        </EmailSection>
      ) : null}

      <EmailSection padding="24px 24px 0 24px">
        {showTrackingButton && safeTrackingUrl ? (
          <EmailButton href={safeTrackingUrl} tone={copy.tone}>
            {variant === "in_transit" ? "Seguí tu envío" : "Ver detalle del envío"}
          </EmailButton>
        ) : null}
        <EmailButton
          href={ordersHref}
          variant={showTrackingButton ? "outline" : "solid"}
          tone={showTrackingButton ? "neutral" : isPickup ? copy.tone : "neutral"}
        >
          Ver mi pedido
        </EmailButton>
      </EmailSection>

      <EmailSection padding="20px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0 0 6px 0">
          {copy.closing}
        </EmailParagraph>
        <EmailParagraph small muted align="center" spacing="0">
          Soporte:{" "}
          <Link
            href={`mailto:${supportEmail}`}
            style={{ color: emailColors.ink, fontWeight: 600 }}
          >
            {supportEmail}
          </Link>
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}
