import { Link } from "@react-email/components"
import { orderShortId, orderUrl as defaultOrderUrl } from "@/lib/config/site"
import {
  EmailButton,
  EmailCallout,
  EmailHero,
  EmailInfoCard,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailSteps,
  emailColors,
  formatMoney,
} from "./email-layout"

export interface TransferStatusEmailProps {
  name: string
  orderId: string
  totalAmount: number
  currency: string
  variant: "reserved" | "rejected"
  rejectionReason?: string | null
  supportEmail: string
  /** Link a "Mis pedidos" (donde se sube un nuevo comprobante). */
  orderUrl?: string
}

export default function TransferStatusEmail({
  name,
  orderId,
  totalAmount,
  currency,
  variant,
  rejectionReason,
  supportEmail,
  orderUrl,
}: TransferStatusEmailProps) {
  const shortId = orderShortId(orderId)
  const href = orderUrl || defaultOrderUrl()
  const total = formatMoney(totalAmount, currency)
  const reason = rejectionReason?.trim()

  const supportLink = (
    <Link
      href={`mailto:${supportEmail}`}
      style={{ color: emailColors.ink, fontWeight: 600 }}
    >
      {supportEmail}
    </Link>
  )

  if (variant === "rejected") {
    return (
      <EmailLayout
        preview={`No pudimos validar el comprobante de tu pedido #${shortId}. Subí uno nuevo para confirmarlo.`}
      >
        <EmailHero
          tone="danger"
          badge="Comprobante rechazado"
          title="No pudimos validar tu comprobante"
          subtitle={`Pedido #${shortId}`}
        />

        <EmailSection padding="28px 24px 0 24px">
          <EmailParagraph>Hola {name},</EmailParagraph>
          <EmailParagraph spacing="0 0 18px 0">
            Revisamos el comprobante de tu transferencia y no pudimos validar el
            pago. Podés subir uno nuevo y lo revisamos de inmediato.
          </EmailParagraph>
          {reason ? (
            <EmailCallout tone="danger" title="Motivo">
              {reason}
            </EmailCallout>
          ) : null}
        </EmailSection>

        <EmailSection>
          <EmailInfoCard
            rows={[
              { label: "Pedido", value: `#${shortId}` },
              { label: "Total a transferir", value: total },
            ]}
          />
        </EmailSection>

        <EmailSection padding="28px 24px 0 24px">
          <EmailButton href={href} tone="danger">
            Subir un nuevo comprobante
          </EmailButton>
        </EmailSection>

        <EmailSection padding="20px 24px 32px 24px" align="center">
          <EmailParagraph small muted align="center" spacing="0">
            Si creés que se trata de un error o querés coordinar otra forma de
            pago, escribinos a {supportLink}.
          </EmailParagraph>
        </EmailSection>
      </EmailLayout>
    )
  }

  return (
    <EmailLayout
      preview={`Recibimos tu comprobante y reservamos tu pedido #${shortId}. Lo confirmamos apenas validemos el pago.`}
    >
      <EmailHero
        tone="warning"
        badge="En revisión"
        title="¡Recibimos tu comprobante!"
        subtitle={`Pedido #${shortId}`}
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>Hola {name},</EmailParagraph>
        <EmailParagraph spacing="0 0 18px 0">
          Recibimos el comprobante de tu transferencia y reservamos tu pedido.
          Vamos a validar el pago y te avisamos por mail apenas se confirme.
        </EmailParagraph>
        <EmailInfoCard
          rows={[
            { label: "Pedido", value: `#${shortId}` },
            { label: "Total transferido", value: total },
            { label: "Estado", value: "Pendiente de validación" },
          ]}
        />
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailSteps
          steps={[
            { title: "Recibimos tu comprobante", description: "Ya lo tenemos." },
            {
              title: "Validamos el pago",
              description: "Lo revisamos lo antes posible.",
            },
            {
              title: "Confirmamos tu pedido",
              description: "Te mandamos el mail de confirmación.",
            },
          ]}
        />
      </EmailSection>

      <EmailSection padding="12px 24px 0 24px">
        <EmailButton href={href}>Ver mi pedido</EmailButton>
      </EmailSection>

      <EmailSection padding="20px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          ¿Dudas? Escribinos a {supportLink} y te ayudamos.
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}
