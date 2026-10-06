import type { CSSProperties, ReactNode } from "react"
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"
import {
  BRAND_NAME,
  INSTAGRAM_URL,
  LOGO_URL,
  SITE_URL,
  SUPPORT_EMAIL,
} from "@/lib/config/site"

/* -------------------------------------------------------------------------- */
/* Sistema visual                                                              */
/* -------------------------------------------------------------------------- */

export type EmailTone = "neutral" | "success" | "warning" | "danger" | "info"

interface ToneColors {
  /** Color de acento (botones, barras, badges). Contraste >= 4.5:1 con blanco. */
  accent: string
  /** Fondo suave para tarjetas / avisos. */
  soft: string
  /** Borde suave. */
  border: string
  /** Texto legible sobre el fondo suave. */
  text: string
}

const tones: Record<EmailTone, ToneColors> = {
  neutral: {
    accent: "#0F0F0F",
    soft: "#F4F4F5",
    border: "#E5E5E5",
    text: "#27272A",
  },
  success: {
    accent: "#15803D",
    soft: "#F0FDF4",
    border: "#BBF7D0",
    text: "#14532D",
  },
  warning: {
    accent: "#B45309",
    soft: "#FFFBEB",
    border: "#FDE68A",
    text: "#78350F",
  },
  danger: {
    accent: "#B91C1C",
    soft: "#FEF2F2",
    border: "#FECACA",
    text: "#7F1D1D",
  },
  info: {
    accent: "#1D4ED8",
    soft: "#EFF6FF",
    border: "#BFDBFE",
    text: "#1E3A8A",
  },
}

export const emailColors = {
  black: "#0F0F0F",
  ink: "#111111",
  text: "#3F3F46",
  muted: "#6B7280",
  faint: "#9CA3AF",
  border: "#E5E5E5",
  surface: "#F4F4F5",
  white: "#FFFFFF",
  /** Gris claro para texto sobre fondo negro. */
  onDark: "#D4D4D8",
  tones,
} as const

export const emailFonts = {
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
} as const

const sansBase: CSSProperties = {
  fontFamily: emailFonts.sans,
}

/* -------------------------------------------------------------------------- */
/* Utilidades                                                                  */
/* -------------------------------------------------------------------------- */

export function formatMoney(amount: number, currency: string): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(safeAmount)
  } catch {
    return `${safeAmount} ${currency}`
  }
}

export function formatEmailDate(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  })
}

/** true solo para URLs que empiezan con https:// y son parseables. */
export function isHttpsUrl(url: string | null | undefined): url is string {
  if (!url) return false
  const value = url.trim()
  if (!value.toLowerCase().startsWith("https://")) return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

/** true para http(s) parseables (links de contenido administrable). */
export function isHttpUrl(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const protocol = new URL(url.trim()).protocol
    return protocol === "https:" || protocol === "http:"
  } catch {
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export interface EmailLayoutProps {
  preview: string
  children: ReactNode
  unsubscribeUrl?: string
  /** Texto extra sobre el motivo del mail (ej. "Te suscribiste al newsletter"). */
  footerNote?: string
}

export function EmailLayout({
  preview,
  children,
  unsubscribeUrl,
  footerNote,
}: EmailLayoutProps) {
  const siteHost = SITE_URL.replace(/^https?:\/\//, "")

  return (
    <Html lang="es">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          ...sansBase,
          backgroundColor: emailColors.surface,
          margin: 0,
          padding: 0,
          color: emailColors.text,
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            width: "100%",
            margin: "0 auto",
            backgroundColor: emailColors.white,
          }}
        >
          {/* Header */}
          <Section>
            <Row>
              <Column
                align="center"
                style={{ padding: "28px 24px 24px 24px", textAlign: "center" }}
              >
                <Link href={SITE_URL} style={{ textDecoration: "none" }}>
                  <Img
                    src={LOGO_URL}
                    alt={BRAND_NAME}
                    width="150"
                    height="56"
                    style={{
                      display: "block",
                      margin: "0 auto",
                      border: 0,
                      outline: "none",
                    }}
                  />
                </Link>
              </Column>
            </Row>
          </Section>

          {children}

          {/* Footer */}
          <Section>
            <Row>
              <Column
                align="center"
                style={{
                  padding: "32px 24px 36px 24px",
                  textAlign: "center",
                  borderTop: `1px solid ${emailColors.border}`,
                }}
              >
                <Text
                  style={{
                    ...sansBase,
                    margin: "0 0 12px 0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: emailColors.muted,
                  }}
                >
                  ¿Necesitás ayuda? Escribinos a{" "}
                  <Link
                    href={`mailto:${SUPPORT_EMAIL}`}
                    style={{
                      color: emailColors.ink,
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                  >
                    {SUPPORT_EMAIL}
                  </Link>
                </Text>
                <Text
                  style={{
                    ...sansBase,
                    margin: "0 0 12px 0",
                    fontSize: "14px",
                    lineHeight: "22px",
                    color: emailColors.faint,
                  }}
                >
                  <Link href={INSTAGRAM_URL} style={footerLink}>
                    Instagram
                  </Link>
                  {"  ·  "}
                  <Link href={SITE_URL} style={footerLink}>
                    {siteHost}
                  </Link>
                </Text>
                {footerNote ? (
                  <Text style={footerSmall}>{footerNote}</Text>
                ) : null}
                {unsubscribeUrl ? (
                  <Text style={footerSmall}>
                    Si no querés recibir más estos mails podés{" "}
                    <Link
                      href={unsubscribeUrl}
                      style={{
                        color: emailColors.muted,
                        textDecoration: "underline",
                      }}
                    >
                      Desuscribirme
                    </Link>
                    .
                  </Text>
                ) : null}
                <Text style={footerSmall}>
                  © {new Date().getFullYear()} {BRAND_NAME} · {siteHost}
                </Text>
              </Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const footerLink: CSSProperties = {
  color: emailColors.ink,
  fontWeight: 600,
  textDecoration: "none",
}

const footerSmall: CSSProperties = {
  ...sansBase,
  margin: "0 0 6px 0",
  fontSize: "12px",
  lineHeight: "18px",
  color: emailColors.muted,
}

/* -------------------------------------------------------------------------- */
/* Bloques de estructura                                                       */
/* -------------------------------------------------------------------------- */

/** Bloque de contenido con padding lateral (24px) seguro para Outlook. */
export function EmailSection({
  children,
  padding = "24px 24px 0 24px",
  background,
  align,
}: {
  children: ReactNode
  padding?: string
  background?: string
  align?: "left" | "center" | "right"
}) {
  return (
    <Section style={background ? { backgroundColor: background } : undefined}>
      <Row>
        <Column
          align={align}
          style={{
            padding,
            textAlign: align,
            ...(background ? { backgroundColor: background } : {}),
          }}
        >
          {children}
        </Column>
      </Row>
    </Section>
  )
}

/** Caja con fondo/borde redondeado. */
function Box({
  children,
  tone = "neutral",
  padding = "20px",
  accentLeft = false,
}: {
  children: ReactNode
  tone?: EmailTone
  padding?: string
  accentLeft?: boolean
}) {
  const t = tones[tone]
  return (
    <Section
      style={{
        backgroundColor: t.soft,
        border: `1px solid ${t.border}`,
        ...(accentLeft ? { borderLeft: `4px solid ${t.accent}` } : {}),
        borderRadius: "8px",
        borderCollapse: "separate",
      }}
    >
      <Row>
        <Column style={{ padding }}>{children}</Column>
      </Row>
    </Section>
  )
}

/** Banda oscura con badge, título y subtítulo. Es la "cabeza" de cada mail. */
export function EmailHero({
  tone = "neutral",
  badge,
  title,
  subtitle,
}: {
  tone?: EmailTone
  badge?: string
  title: string
  subtitle?: ReactNode
}) {
  const accent = tones[tone].accent
  return (
    <Section
      style={{
        backgroundColor: emailColors.black,
        borderTop: `4px solid ${accent}`,
      }}
    >
      <Row>
        <Column
          align="center"
          style={{
            padding: "40px 24px 40px 24px",
            textAlign: "center",
            backgroundColor: emailColors.black,
          }}
        >
          {badge ? (
            <p style={{ margin: "0 0 16px 0", textAlign: "center" }}>
              <EmailStatusBadge tone={tone} solid>
                {badge}
              </EmailStatusBadge>
            </p>
          ) : null}
          <Heading
            as="h1"
            style={{
              ...sansBase,
              margin: "0",
              fontSize: "28px",
              lineHeight: "34px",
              fontWeight: 800,
              letterSpacing: "-0.3px",
              color: emailColors.white,
            }}
          >
            {title}
          </Heading>
          {subtitle ? (
            <Text
              style={{
                ...sansBase,
                margin: "12px 0 0 0",
                fontSize: "16px",
                lineHeight: "24px",
                color: emailColors.onDark,
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </Column>
      </Row>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Tipografía y botones                                                        */
/* -------------------------------------------------------------------------- */

export function EmailHeading({
  children,
  level = 2,
  align,
}: {
  children: ReactNode
  level?: 1 | 2 | 3
  align?: "left" | "center" | "right"
}) {
  const sizes = {
    1: { fontSize: "28px", lineHeight: "34px", margin: "0 0 12px 0" },
    2: { fontSize: "20px", lineHeight: "26px", margin: "0 0 14px 0" },
    3: { fontSize: "16px", lineHeight: "22px", margin: "0 0 8px 0" },
  }[level]
  return (
    <Heading
      as={`h${level + 1}` as "h2" | "h3" | "h4"}
      style={{
        ...sansBase,
        ...sizes,
        fontWeight: 700,
        color: emailColors.ink,
        textAlign: align,
      }}
    >
      {children}
    </Heading>
  )
}

export function EmailParagraph({
  children,
  muted = false,
  small = false,
  align,
  spacing = "0 0 14px 0",
}: {
  children: ReactNode
  muted?: boolean
  small?: boolean
  align?: "left" | "center" | "right"
  spacing?: string
}) {
  return (
    <Text
      style={{
        ...sansBase,
        margin: spacing,
        fontSize: small ? "13px" : "16px",
        lineHeight: small ? "20px" : "26px",
        color: muted ? emailColors.muted : emailColors.text,
        textAlign: align,
      }}
    >
      {children}
    </Text>
  )
}

export function EmailButton({
  href,
  children,
  tone = "neutral",
  variant = "solid",
}: {
  href: string
  children: ReactNode
  tone?: EmailTone
  variant?: "solid" | "outline"
}) {
  const accent = tones[tone].accent
  const solid = variant === "solid"
  return (
    <Section>
      <Row>
        <Column align="center" style={{ padding: "6px 0", textAlign: "center" }}>
          <Button
            href={href}
            style={{
              ...sansBase,
              backgroundColor: solid ? accent : emailColors.white,
              color: solid ? emailColors.white : accent,
              border: `2px solid ${accent}`,
              borderRadius: "6px",
              padding: "14px 28px",
              fontSize: "15px",
              fontWeight: 700,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            {children}
          </Button>
        </Column>
      </Row>
    </Section>
  )
}

export function EmailStatusBadge({
  children,
  tone = "neutral",
  solid = false,
}: {
  children: ReactNode
  tone?: EmailTone
  /** solid = fondo de acento con texto blanco; si no, fondo suave. */
  solid?: boolean
}) {
  const t = tones[tone]
  return (
    <span
      style={{
        ...sansBase,
        display: "inline-block",
        padding: "5px 12px",
        borderRadius: "999px",
        fontSize: "12px",
        lineHeight: "16px",
        fontWeight: 700,
        letterSpacing: "0.6px",
        textTransform: "uppercase",
        backgroundColor: solid ? t.accent : t.soft,
        color: solid ? emailColors.white : t.text,
        border: `1px solid ${solid ? t.accent : t.border}`,
      }}
    >
      {children}
    </span>
  )
}

export function EmailDivider({ spacing = "8px 0" }: { spacing?: string }) {
  return (
    <Hr
      style={{
        border: "none",
        borderTop: `1px solid ${emailColors.border}`,
        margin: spacing,
        width: "100%",
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Tarjetas de información                                                     */
/* -------------------------------------------------------------------------- */

export interface EmailInfoRow {
  label: string
  value: ReactNode
  /** Tipografía monoespaciada y grande: ideal para CBU, alias, tracking. */
  mono?: boolean
}

export function EmailInfoCard({
  rows,
  tone = "neutral",
  title,
  layout = "inline",
}: {
  rows: EmailInfoRow[]
  tone?: EmailTone
  title?: string
  /** inline: etiqueta a la izquierda; stacked: etiqueta arriba del valor. */
  layout?: "inline" | "stacked"
}) {
  const t = tones[tone]
  const labelStyle: CSSProperties = {
    ...sansBase,
    margin: 0,
    fontSize: layout === "stacked" ? "11px" : "13px",
    lineHeight: "18px",
    color: emailColors.muted,
    textTransform: layout === "stacked" ? "uppercase" : undefined,
    letterSpacing: layout === "stacked" ? "0.8px" : undefined,
    fontWeight: layout === "stacked" ? 700 : 400,
  }

  return (
    <Box tone={tone}>
      {title ? (
        <Text
          style={{
            ...sansBase,
            margin: "0 0 10px 0",
            fontSize: "13px",
            lineHeight: "18px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            color: t.text,
          }}
        >
          {title}
        </Text>
      ) : null}
      {rows.map((row, index) => {
        const isLast = index === rows.length - 1
        const valueStyle: CSSProperties = {
          fontFamily: row.mono ? emailFonts.mono : emailFonts.sans,
          margin: 0,
          fontSize: row.mono ? "17px" : "15px",
          lineHeight: row.mono ? "24px" : "22px",
          fontWeight: row.mono ? 700 : 600,
          color: emailColors.ink,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          userSelect: row.mono ? "all" : undefined,
        }
        const rowBorder: CSSProperties = isLast
          ? {}
          : { borderBottom: `1px solid ${t.border}` }

        if (layout === "stacked") {
          return (
            <Row key={`${row.label}-${index}`}>
              <Column
                style={{
                  padding: isLast ? "10px 0 0 0" : "10px 0",
                  ...rowBorder,
                }}
              >
                <Text style={labelStyle}>{row.label}</Text>
                <Text style={{ ...valueStyle, marginTop: "2px" }}>
                  {row.value}
                </Text>
              </Column>
            </Row>
          )
        }

        return (
          <Row key={`${row.label}-${index}`}>
            <Column
              style={{
                width: "40%",
                verticalAlign: "top",
                padding: isLast ? "8px 12px 0 0" : "8px 12px 8px 0",
                ...rowBorder,
              }}
            >
              <Text style={labelStyle}>{row.label}</Text>
            </Column>
            <Column
              style={{
                verticalAlign: "top",
                padding: isLast ? "8px 0 0 0" : "8px 0",
                ...rowBorder,
              }}
            >
              <Text style={valueStyle}>{row.value}</Text>
            </Column>
          </Row>
        )
      })}
    </Box>
  )
}

/** Aviso destacado con barra de color a la izquierda. */
export function EmailCallout({
  tone = "info",
  title,
  children,
}: {
  tone?: EmailTone
  title?: string
  children: ReactNode
}) {
  const t = tones[tone]
  return (
    <Box tone={tone} accentLeft padding="16px 18px">
      {title ? (
        <Text
          style={{
            ...sansBase,
            margin: "0 0 4px 0",
            fontSize: "16px",
            lineHeight: "22px",
            fontWeight: 700,
            color: t.text,
          }}
        >
          {title}
        </Text>
      ) : null}
      <Text
        style={{
          ...sansBase,
          margin: 0,
          fontSize: "15px",
          lineHeight: "23px",
          color: t.text,
        }}
      >
        {children}
      </Text>
    </Box>
  )
}

/** Total destacado ("Total a transferir", "Total", etc.). */
export function EmailAmountCard({
  label,
  amount,
  currency,
  note,
  tone = "neutral",
}: {
  label: string
  amount: number
  currency: string
  note?: ReactNode
  tone?: EmailTone
}) {
  const t = tones[tone]
  return (
    <Box tone={tone} padding="22px 20px">
      <Text
        style={{
          ...sansBase,
          margin: "0 0 4px 0",
          fontSize: "12px",
          lineHeight: "16px",
          fontWeight: 700,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          color: t.text,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          ...sansBase,
          margin: 0,
          fontSize: "34px",
          lineHeight: "40px",
          fontWeight: 800,
          letterSpacing: "-0.5px",
          color: emailColors.ink,
          textAlign: "center",
        }}
      >
        {formatMoney(amount, currency)}
      </Text>
      {note ? (
        <Text
          style={{
            ...sansBase,
            margin: "6px 0 0 0",
            fontSize: "13px",
            lineHeight: "19px",
            color: t.text,
            textAlign: "center",
          }}
        >
          {note}
        </Text>
      ) : null}
    </Box>
  )
}

/* -------------------------------------------------------------------------- */
/* Productos y totales                                                         */
/* -------------------------------------------------------------------------- */

export interface EmailItem {
  name: string
  quantity: number
  unitPrice: number
  color?: string | null
  size?: string | null
  imageUrl?: string | null
  /** Líneas extra debajo de color/talle (tela, SKU, etc.). */
  details?: string[]
}

const IMAGE_SIZE = 72

export function EmailItemsTable({
  items,
  currency,
}: {
  items: EmailItem[]
  currency: string
}) {
  const showImages = items.some((item) => isHttpUrl(item.imageUrl))

  return (
    <Section>
      {items.map((item, index) => {
        const cell: CSSProperties = {
          verticalAlign: "top",
          padding: "14px 0",
          borderBottom: `1px solid ${emailColors.border}`,
        }
        const variant = [
          item.color ? `Color: ${item.color}` : null,
          item.size ? `Talle: ${item.size}` : null,
        ]
          .filter(Boolean)
          .join("  ·  ")
        const lineTotal = item.unitPrice * item.quantity

        return (
          <Row key={`${item.name}-${index}`}>
            {showImages ? (
              <Column style={{ ...cell, width: `${IMAGE_SIZE + 14}px` }}>
                {isHttpUrl(item.imageUrl) ? (
                  <Img
                    src={item.imageUrl}
                    alt={item.name}
                    width={IMAGE_SIZE}
                    height={IMAGE_SIZE}
                    style={{
                      display: "block",
                      borderRadius: "6px",
                      border: `1px solid ${emailColors.border}`,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <Section
                    style={{
                      width: `${IMAGE_SIZE}px`,
                      height: `${IMAGE_SIZE}px`,
                      backgroundColor: emailColors.surface,
                      borderRadius: "6px",
                    }}
                  >
                    <Row>
                      <Column
                        align="center"
                        style={{
                          height: `${IMAGE_SIZE}px`,
                          textAlign: "center",
                          verticalAlign: "middle",
                          fontFamily: emailFonts.sans,
                          fontSize: "11px",
                          color: emailColors.faint,
                        }}
                      >
                        {BRAND_NAME}
                      </Column>
                    </Row>
                  </Section>
                )}
              </Column>
            ) : null}
            <Column style={{ ...cell, paddingRight: "10px" }}>
              <Text
                style={{
                  ...sansBase,
                  margin: "0 0 4px 0",
                  fontSize: "15px",
                  lineHeight: "20px",
                  fontWeight: 700,
                  color: emailColors.ink,
                }}
              >
                {item.name}
              </Text>
              {variant ? (
                <Text style={itemDetail}>{variant}</Text>
              ) : null}
              {(item.details ?? []).map((line) => (
                <Text key={line} style={itemDetail}>
                  {line}
                </Text>
              ))}
              <Text style={itemDetail}>Cantidad: {item.quantity}</Text>
            </Column>
            <Column
              align="right"
              style={{ ...cell, width: "96px", textAlign: "right" }}
            >
              <Text
                style={{
                  ...sansBase,
                  margin: "0",
                  fontSize: "15px",
                  lineHeight: "20px",
                  fontWeight: 700,
                  color: emailColors.ink,
                  whiteSpace: "nowrap",
                }}
              >
                {formatMoney(lineTotal, currency)}
              </Text>
              {item.quantity > 1 ? (
                <Text
                  style={{
                    ...itemDetail,
                    whiteSpace: "nowrap",
                    textAlign: "right",
                  }}
                >
                  {formatMoney(item.unitPrice, currency)} c/u
                </Text>
              ) : null}
            </Column>
          </Row>
        )
      })}
    </Section>
  )
}

const itemDetail: CSSProperties = {
  ...sansBase,
  margin: "0 0 2px 0",
  fontSize: "13px",
  lineHeight: "19px",
  color: emailColors.muted,
}

export interface EmailTotalRow {
  label: string
  value: string
  /** Descuentos: se muestran en verde. */
  positive?: boolean
}

export function EmailTotals({
  rows,
  total,
  totalLabel = "Total",
}: {
  rows: EmailTotalRow[]
  total: string
  totalLabel?: string
}) {
  return (
    <Section>
      {rows.map((row, index) => (
        <Row key={`${row.label}-${index}`}>
          <Column style={{ padding: index === 0 ? "12px 0 4px 0" : "4px 0" }}>
            <Text
              style={{
                ...sansBase,
                margin: 0,
                fontSize: "14px",
                lineHeight: "20px",
                color: row.positive ? tones.success.accent : emailColors.muted,
              }}
            >
              {row.label}
            </Text>
          </Column>
          <Column
            align="right"
            style={{
              padding: index === 0 ? "12px 0 4px 0" : "4px 0",
              textAlign: "right",
            }}
          >
            <Text
              style={{
                ...sansBase,
                margin: 0,
                fontSize: "14px",
                lineHeight: "20px",
                color: row.positive ? tones.success.accent : emailColors.ink,
                whiteSpace: "nowrap",
              }}
            >
              {row.value}
            </Text>
          </Column>
        </Row>
      ))}
      <Row>
        <Column
          style={{
            padding: "12px 0 0 0",
            borderTop: `2px solid ${emailColors.ink}`,
          }}
        >
          <Text
            style={{
              ...sansBase,
              margin: 0,
              fontSize: "17px",
              lineHeight: "24px",
              fontWeight: 800,
              color: emailColors.ink,
            }}
          >
            {totalLabel}
          </Text>
        </Column>
        <Column
          align="right"
          style={{
            padding: "12px 0 0 0",
            borderTop: `2px solid ${emailColors.ink}`,
            textAlign: "right",
          }}
        >
          <Text
            style={{
              ...sansBase,
              margin: 0,
              fontSize: "17px",
              lineHeight: "24px",
              fontWeight: 800,
              color: emailColors.ink,
              whiteSpace: "nowrap",
            }}
          >
            {total}
          </Text>
        </Column>
      </Row>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Pasos y progreso                                                            */
/* -------------------------------------------------------------------------- */

export interface EmailStep {
  title: string
  description?: string
}

/** Lista numerada vertical ("Qué sigue"). */
export function EmailSteps({
  steps,
  tone = "neutral",
  marker = "number",
}: {
  steps: EmailStep[]
  tone?: EmailTone
  /** number: 1, 2, 3 (pasos en orden); check: tildes (listas de beneficios). */
  marker?: "number" | "check"
}) {
  const accent = tones[tone].accent
  return (
    <Section>
      {steps.map((step, index) => (
        <Row key={`${step.title}-${index}`}>
          <Column
            style={{
              width: "44px",
              verticalAlign: "top",
              padding: "0 0 16px 0",
            }}
          >
            <Section
              style={{
                width: "30px",
                height: "30px",
                backgroundColor: accent,
                borderRadius: "15px",
              }}
            >
              <Row>
                <Column
                  align="center"
                  style={{
                    width: "30px",
                    height: "30px",
                    textAlign: "center",
                    verticalAlign: "middle",
                    fontFamily: emailFonts.sans,
                    fontSize: "14px",
                    lineHeight: "30px",
                    fontWeight: 700,
                    color: emailColors.white,
                  }}
                >
                  {marker === "check" ? "✓" : index + 1}
                </Column>
              </Row>
            </Section>
          </Column>
          <Column style={{ verticalAlign: "top", padding: "0 0 16px 0" }}>
            <Text
              style={{
                ...sansBase,
                margin: "0",
                fontSize: "15px",
                lineHeight: "30px",
                fontWeight: 700,
                color: emailColors.ink,
              }}
            >
              {step.title}
            </Text>
            {step.description ? (
              <Text
                style={{
                  ...sansBase,
                  margin: "0",
                  fontSize: "14px",
                  lineHeight: "21px",
                  color: emailColors.muted,
                }}
              >
                {step.description}
              </Text>
            ) : null}
          </Column>
        </Row>
      ))}
    </Section>
  )
}

/** Barra de progreso horizontal: los pasos <= currentIndex quedan resaltados. */
export function EmailProgress({
  steps,
  currentIndex,
  tone = "success",
}: {
  steps: string[]
  currentIndex: number
  tone?: EmailTone
}) {
  const accent = tones[tone].accent
  return (
    <Section>
      <Row>
        {steps.map((label, index) => {
          const done = index <= currentIndex
          const current = index === currentIndex
          return (
            <Column
              key={`${label}-${index}`}
              style={{
                width: `${100 / steps.length}%`,
                padding: "0 3px",
                verticalAlign: "top",
              }}
            >
              <div
                style={{
                  height: "6px",
                  lineHeight: "6px",
                  fontSize: "0",
                  backgroundColor: done ? accent : emailColors.border,
                  borderRadius: "3px",
                }}
              >
                {" "}
              </div>
              <Text
                style={{
                  ...sansBase,
                  margin: "8px 0 0 0",
                  fontSize: "12px",
                  lineHeight: "16px",
                  fontWeight: current ? 800 : 500,
                  color: current
                    ? emailColors.ink
                    : done
                      ? emailColors.text
                      : emailColors.faint,
                  textAlign: "center",
                }}
              >
                {done && !current ? "✓ " : ""}
                {label}
              </Text>
            </Column>
          )
        })}
      </Row>
    </Section>
  )
}

export default EmailLayout
