import { SITE_URL } from "@/lib/config/site"
import {
  EmailButton,
  EmailHeading,
  EmailHero,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailSteps,
  isHttpUrl,
} from "@/components/email-templates/email-layout"

export interface NewsletterSubscriptionEmailProps {
  userEmail: string
  /** Link al sitio (por defecto, el de la marca). */
  websiteUrl?: string
  /** Link real de baja del newsletter. */
  unsubscribeUrl: string
}

export const NewsletterSubscriptionEmail = ({
  userEmail,
  websiteUrl,
  unsubscribeUrl,
}: NewsletterSubscriptionEmailProps) => {
  const shopUrl = isHttpUrl(websiteUrl) ? websiteUrl.trim() : SITE_URL

  return (
    <EmailLayout
      preview="¡Ya sos parte de Lozach! Te vamos a contar primero las novedades."
      unsubscribeUrl={unsubscribeUrl}
      footerNote={`Recibís este mail porque ${userEmail} se suscribió al newsletter de Lozach.`}
    >
      <EmailHero
        tone="success"
        badge="Newsletter"
        title="¡Bienvenido a Lozach!"
        subtitle="Gracias por sumarte. Ya estás en la lista."
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>
          Te suscribiste con <strong>{userEmail}</strong>. A partir de ahora
          vas a recibir en tu bandeja las novedades de la marca, antes que en
          cualquier otro lado.
        </EmailParagraph>
      </EmailSection>

      <EmailSection padding="20px 24px 0 24px">
        <EmailHeading>Qué vas a recibir</EmailHeading>
        <EmailSteps
          marker="check"
          steps={[
            {
              title: "Lanzamientos y nuevas colecciones",
              description: "Te enterás primero de lo que llega.",
            },
            {
              title: "Ofertas y beneficios para suscriptores",
              description: "Promos que no vas a encontrar en otro lado.",
            },
            {
              title: "Sin spam",
              description: "Te escribimos solo cuando hay algo que vale la pena.",
            },
          ]}
        />
      </EmailSection>

      <EmailSection padding="12px 24px 0 24px">
        <EmailButton href={shopUrl}>Ir a la tienda</EmailButton>
      </EmailSection>

      <EmailSection padding="24px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          ¿Dudas o sugerencias? Respondé este mail y te leemos.
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}

export default NewsletterSubscriptionEmail
