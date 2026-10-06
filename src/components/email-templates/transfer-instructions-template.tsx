import { Link } from "@react-email/components"
import { BankDetail } from "@/types/email/email"
import { orderShortId } from "@/lib/config/site"
import {
  EmailAmountCard,
  EmailButton,
  EmailCallout,
  EmailHeading,
  EmailHero,
  EmailInfoCard,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailSteps,
  emailColors,
  formatMoney,
} from "./email-layout"

export interface TransferInstructionsEmailProps {
  name: string
  orderId: string
  totalAmount: number
  currency: string
  /** Descuento por transferencia ya aplicado al total (0 si no aplica). */
  discountAmount: number
  /** Minutos que tiene el cliente para transferir y subir el comprobante. */
  deadlineMinutes: number
  bankDetails: BankDetail[]
  uploadUrl: string
  supportEmail: string
}

function formatDeadline(minutes: number): string {
  const total = Math.max(1, Math.round(minutes))
  if (total < 60) return `${total} minutos`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  const hoursLabel = hours === 1 ? "1 hora" : `${hours} horas`
  return rest === 0 ? hoursLabel : `${hoursLabel} y ${rest} minutos`
}

export default function TransferInstructionsEmail({
  name,
  orderId,
  totalAmount,
  currency,
  discountAmount,
  deadlineMinutes,
  bankDetails,
  uploadUrl,
  supportEmail,
}: TransferInstructionsEmailProps) {
  const shortId = orderShortId(orderId)
  const deadline = formatDeadline(deadlineMinutes)
  const total = formatMoney(totalAmount, currency)
  const hasBankDetails = bankDetails.length > 0

  return (
    <EmailLayout
      preview={`Transferí ${total} en los próximos ${deadline} para reservar tu pedido #${shortId}.`}
    >
      <EmailHero
        tone="warning"
        badge="Pendiente de pago"
        title="Transferí y confirmamos tu pedido"
        subtitle={`Pedido #${shortId}`}
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>Hola {name},</EmailParagraph>
        <EmailParagraph spacing="0 0 18px 0">
          Elegiste pagar por transferencia bancaria. Reservamos tu pedido por{" "}
          <strong>{deadline}</strong>: hacé la transferencia y subí el
          comprobante para que podamos confirmarlo.
        </EmailParagraph>
        <EmailAmountCard
          label="Total a transferir"
          amount={totalAmount}
          currency={currency}
          tone="neutral"
          note={
            discountAmount > 0
              ? `Ya incluye tu descuento de ${formatMoney(discountAmount, currency)} por pagar con transferencia.`
              : undefined
          }
        />
      </EmailSection>

      <EmailSection>
        <EmailCallout tone="warning" title={`Tenés ${deadline}`}>
          Pasado ese tiempo sin recibir el comprobante, liberamos tu pedido y el
          stock vuelve a estar disponible para otros clientes.
        </EmailCallout>
      </EmailSection>

      <EmailSection padding="32px 24px 0 24px">
        <EmailHeading>Datos para transferir</EmailHeading>
        {hasBankDetails ? (
          <>
            <EmailInfoCard layout="stacked" rows={bankDetails.map((d) => ({
              label: d.label,
              value: d.value,
              mono: true,
            }))} />
            <EmailParagraph small muted spacing="10px 0 0 0">
              Tip: mantené apretado el dato para copiarlo. Si podés, poné{" "}
              <strong>#{shortId}</strong> en el concepto de la transferencia.
            </EmailParagraph>
          </>
        ) : (
          <EmailCallout tone="info" title="Te pasamos los datos por mail">
            Ahora mismo no podemos mostrarte los datos bancarios. Escribinos a{" "}
            <Link
              href={`mailto:${supportEmail}`}
              style={{ color: emailColors.ink, fontWeight: 700 }}
            >
              {supportEmail}
            </Link>{" "}
            indicando tu pedido #{shortId} y te los enviamos enseguida.
          </EmailCallout>
        )}
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailButton href={uploadUrl}>Subir comprobante</EmailButton>
      </EmailSection>

      <EmailSection padding="32px 24px 0 24px">
        <EmailHeading>Cómo sigue</EmailHeading>
        <EmailSteps
          steps={[
            {
              title: "Hacé la transferencia",
              description: `Por el monto exacto: ${total}.`,
            },
            {
              title: "Subí el comprobante",
              description: `Con el botón de arriba, dentro de los ${deadline}.`,
            },
            {
              title: "Validamos el pago",
              description:
                "Lo revisamos y te mandamos la confirmación por mail.",
            },
          ]}
        />
      </EmailSection>

      <EmailSection padding="12px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          ¿Problemas con la transferencia? Escribinos a{" "}
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
