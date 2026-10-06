import { AdminAlertEmailProps, AdminAlertSeverity } from "@/types/email/email"
import {
  EmailButton,
  EmailHeading,
  EmailInfoCard,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailStatusBadge,
  EmailTone,
  emailColors,
  emailFonts,
  isHttpUrl,
} from "./email-layout"
import { Heading, Row, Column, Section, Text } from "@react-email/components"

const SEVERITY: Record<
  AdminAlertSeverity,
  { tone: EmailTone; label: string }
> = {
  critical: { tone: "danger", label: "Crítico" },
  warning: { tone: "warning", label: "Advertencia" },
  info: { tone: "info", label: "Informativo" },
}

export default function AdminAlertEmail({
  title,
  severity,
  summary,
  details,
  ctaLabel,
  ctaUrl,
}: AdminAlertEmailProps) {
  const { tone, label } = SEVERITY[severity]
  const accent = emailColors.tones[tone].accent
  const safeCtaUrl = isHttpUrl(ctaUrl) ? ctaUrl.trim() : null
  const rows = (details ?? []).filter(
    (d) => d.label.trim() !== "" || d.value.trim() !== ""
  )

  return (
    <EmailLayout preview={`[${label}] ${title}`}>
      {/* Banner de severidad */}
      <Section
        style={{
          backgroundColor: accent,
        }}
      >
        <Row>
          <Column
            style={{
              padding: "12px 24px",
              backgroundColor: accent,
              textAlign: "center",
            }}
          >
            <Text
              style={{
                margin: 0,
                fontFamily: emailFonts.sans,
                fontSize: "12px",
                lineHeight: "16px",
                fontWeight: 800,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: emailColors.white,
              }}
            >
              Alerta {label}
            </Text>
          </Column>
        </Row>
      </Section>

      <EmailSection padding="28px 24px 0 24px">
        <p style={{ margin: "0 0 14px 0" }}>
          <EmailStatusBadge tone={tone}>{label}</EmailStatusBadge>
        </p>
        <Heading
          as="h1"
          style={{
            margin: "0 0 12px 0",
            fontFamily: emailFonts.sans,
            fontSize: "24px",
            lineHeight: "30px",
            fontWeight: 800,
            color: emailColors.ink,
          }}
        >
          {title}
        </Heading>
        <EmailParagraph spacing="0">{summary}</EmailParagraph>
      </EmailSection>

      {rows.length > 0 ? (
        <EmailSection padding="24px 24px 0 24px">
          <EmailHeading level={3}>Detalles</EmailHeading>
          <EmailInfoCard
            tone={tone}
            rows={rows.map((d) => ({ label: d.label, value: d.value }))}
          />
        </EmailSection>
      ) : null}

      {safeCtaUrl ? (
        <EmailSection padding="28px 24px 0 24px">
          <EmailButton href={safeCtaUrl} tone={tone}>
            {ctaLabel?.trim() || "Abrir en el dashboard"}
          </EmailButton>
        </EmailSection>
      ) : null}

      <EmailSection padding="24px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          Aviso automático del sistema de la tienda.
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}
