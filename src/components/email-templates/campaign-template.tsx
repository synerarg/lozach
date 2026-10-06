import { Column, Heading, Img, Link, Row, Section, Text } from "@react-email/components"
import { CampaignContent, CampaignProduct } from "@/types/email/email"
import { SITE_URL } from "@/lib/config/site"
import {
  EmailButton,
  EmailHero,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  emailColors,
  emailFonts,
  formatMoney,
  isHttpUrl,
} from "./email-layout"

/** Contenido de la campaña (sin el asunto, que lo usa el servicio) + link real de baja. */
export type CampaignEmailProps = Omit<CampaignContent, "subject"> & {
  unsubscribeUrl: string
}

const MAX_PRODUCTS = 4

function chunkPairs<T>(list: T[]): Array<[T, T | null]> {
  const rows: Array<[T, T | null]> = []
  for (let i = 0; i < list.length; i += 2) {
    rows.push([list[i], list[i + 1] ?? null])
  }
  return rows
}

function ProductCard({ product }: { product: CampaignProduct }) {
  const href = isHttpUrl(product.url) ? product.url.trim() : SITE_URL
  return (
    <>
      {isHttpUrl(product.imageUrl) ? (
        <Link href={href} style={{ textDecoration: "none" }}>
          <Img
            src={product.imageUrl}
            alt={product.name}
            width="250"
            height="250"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              maxWidth: "100%",
              borderRadius: "6px",
              border: `1px solid ${emailColors.border}`,
            }}
          />
        </Link>
      ) : null}
      <Text
        style={{
          margin: "10px 0 2px 0",
          fontFamily: emailFonts.sans,
          fontSize: "15px",
          lineHeight: "20px",
          fontWeight: 700,
          color: emailColors.ink,
        }}
      >
        {product.name}
      </Text>
      <Text
        style={{
          margin: "0 0 6px 0",
          fontFamily: emailFonts.sans,
          fontSize: "15px",
          lineHeight: "20px",
          color: emailColors.text,
        }}
      >
        {formatMoney(product.price, "ARS")}
      </Text>
      <Link
        href={href}
        style={{
          fontFamily: emailFonts.sans,
          fontSize: "14px",
          fontWeight: 700,
          color: emailColors.ink,
          textDecoration: "underline",
        }}
      >
        Ver producto
      </Link>
    </>
  )
}

export default function CampaignEmail({
  preheader,
  headline,
  paragraphs,
  imageUrl,
  ctaLabel,
  ctaUrl,
  products,
  unsubscribeUrl,
}: CampaignEmailProps) {
  const hasImage = isHttpUrl(imageUrl)
  const safeCtaUrl = isHttpUrl(ctaUrl) ? ctaUrl.trim() : null
  const featured = (products ?? []).slice(0, MAX_PRODUCTS)
  const cleanParagraphs = paragraphs.map((p) => p.trim()).filter(Boolean)

  return (
    <EmailLayout
      preview={preheader?.trim() || headline}
      unsubscribeUrl={unsubscribeUrl}
      footerNote="Recibís este mail porque te suscribiste a las novedades de Lozach."
    >
      {hasImage ? (
        <Section>
          <Row>
            <Column style={{ padding: 0, lineHeight: 0, fontSize: 0 }}>
              <Img
                src={imageUrl}
                alt={headline}
                width="600"
                height="400"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  maxWidth: "100%",
                  border: 0,
                }}
              />
            </Column>
          </Row>
        </Section>
      ) : (
        <EmailHero tone="neutral" title={headline} />
      )}

      <EmailSection padding="32px 24px 0 24px">
        {hasImage ? (
          <Heading
            as="h1"
            style={{
              margin: "0 0 16px 0",
              fontFamily: emailFonts.sans,
              fontSize: "30px",
              lineHeight: "36px",
              fontWeight: 800,
              letterSpacing: "-0.4px",
              color: emailColors.ink,
            }}
          >
            {headline}
          </Heading>
        ) : null}
        {cleanParagraphs.map((paragraph, index) => (
          <EmailParagraph key={index}>{paragraph}</EmailParagraph>
        ))}
      </EmailSection>

      {safeCtaUrl && ctaLabel?.trim() ? (
        <EmailSection padding="12px 24px 0 24px">
          <EmailButton href={safeCtaUrl}>{ctaLabel.trim()}</EmailButton>
        </EmailSection>
      ) : null}

      {featured.length > 0 ? (
        <EmailSection padding="40px 18px 8px 18px">
          <Text
            style={{
              margin: "0 6px 16px 6px",
              fontFamily: emailFonts.sans,
              fontSize: "13px",
              lineHeight: "18px",
              fontWeight: 800,
              letterSpacing: "1px",
              textTransform: "uppercase",
              color: emailColors.muted,
            }}
          >
            Lo más nuevo
          </Text>
          <Section>
            {chunkPairs(featured).map(([left, right], index) => (
              <Row key={index}>
                <Column
                  style={{
                    width: "50%",
                    verticalAlign: "top",
                    padding: "0 6px 24px 6px",
                  }}
                >
                  <ProductCard product={left} />
                </Column>
                <Column
                  style={{
                    width: "50%",
                    verticalAlign: "top",
                    padding: "0 6px 24px 6px",
                  }}
                >
                  {right ? <ProductCard product={right} /> : null}
                </Column>
              </Row>
            ))}
          </Section>
        </EmailSection>
      ) : null}
    </EmailLayout>
  )
}
