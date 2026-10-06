import { Link } from "@react-email/components"
import { OrderCancelledVariant } from "@/types/email/email"
import { orderShortId } from "@/lib/config/site"
import {
  EmailButton,
  EmailCallout,
  EmailHero,
  EmailInfoCard,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailTone,
  emailColors,
  formatMoney,
} from "./email-layout"

export interface OrderCancelledEmailProps {
  name: string
  orderId: string
  variant: OrderCancelledVariant
  /** Motivo de la cancelación / reembolso (opcional). */
  reason?: string | null
  totalAmount: number
  currency: string
  supportEmail: string
  shopUrl: string
}

interface VariantCopy {
  tone: EmailTone
  badge: string
  title: string
  preview: (shortId: string) => string
  body: string
  cta: string
}

const COPY: Record<OrderCancelledVariant, VariantCopy> = {
  expired: {
    tone: "warning",
    badge: "Reserva vencida",
    title: "Tu reserva venció",
    preview: (id) =>
      `Liberamos tu pedido #${id} porque no recibimos el pago a tiempo.`,
    body: "Liberamos tu pedido porque no recibimos el pago dentro del plazo de reserva. Si todavía lo querés, podés volver a hacerlo cuando quieras. Ojo que el stock puede cambiar.",
    cta: "Volver a la tienda",
  },
  cancelled: {
    tone: "danger",
    badge: "Pedido cancelado",
    title: "Cancelamos tu pedido",
    preview: (id) => `Tu pedido #${id} fue cancelado.`,
    body: "Tu pedido fue cancelado. Si ya habías pagado o creés que se trata de un error, escribinos y lo revisamos juntos.",
    cta: "Volver a la tienda",
  },
  refunded: {
    tone: "success",
    badge: "Reembolso realizado",
    title: "Te devolvimos el pago",
    preview: (id) => `Reembolsamos el pago de tu pedido #${id}.`,
    body: "Procesamos la devolución del pago de tu pedido. El tiempo en que se refleja depende del medio de pago: puede acreditarse al instante o demorar algunos días hábiles (con tarjeta, a veces hasta el próximo resumen).",
    cta: "Seguir comprando",
  },
}

export default function OrderCancelledEmail({
  name,
  orderId,
  variant,
  reason,
  totalAmount,
  currency,
  supportEmail,
  shopUrl,
}: OrderCancelledEmailProps) {
  const copy = COPY[variant]
  const shortId = orderShortId(orderId)
  const cleanReason = reason?.trim()
  const amountLabel = variant === "refunded" ? "Monto reembolsado" : "Total del pedido"

  return (
    <EmailLayout preview={copy.preview(shortId)}>
      <EmailHero
        tone={copy.tone}
        badge={copy.badge}
        title={copy.title}
        subtitle={`Pedido #${shortId}`}
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>Hola {name},</EmailParagraph>
        <EmailParagraph spacing="0 0 18px 0">{copy.body}</EmailParagraph>
        {cleanReason ? (
          <EmailCallout
            tone={variant === "refunded" ? "neutral" : copy.tone}
            title="Motivo"
          >
            {cleanReason}
          </EmailCallout>
        ) : null}
      </EmailSection>

      <EmailSection>
        <EmailInfoCard
          rows={[
            { label: "Pedido", value: `#${shortId}` },
            { label: amountLabel, value: formatMoney(totalAmount, currency) },
          ]}
        />
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailButton href={shopUrl}>{copy.cta}</EmailButton>
      </EmailSection>

      <EmailSection padding="20px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          ¿Tenés dudas? Escribinos a{" "}
          <Link
            href={`mailto:${supportEmail}`}
            style={{ color: emailColors.ink, fontWeight: 600 }}
          >
            {supportEmail}
          </Link>
          .
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}
