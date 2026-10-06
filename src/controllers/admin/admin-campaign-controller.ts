"use server"

import { z } from "zod"
import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireAdminUser } from "@/lib/auth/session"
import {
  ValidationException,
} from "@/exceptions/base/base-exceptions"
import { EmailService } from "@/services/email/email-service"
import { SubscribersService } from "@/services/subscribers/subscribers-service"
import { ProductService } from "@/services/products/product-service"
import { SITE_URL } from "@/lib/config/site"
import { rateLimit } from "@/lib/security/rate-limit"
import {
  CampaignContent,
  CampaignInput,
  CampaignProduct,
  CampaignResult,
} from "@/types/email/email"

const emailService = new EmailService()
const subscribersService = new SubscribersService()
const productService = new ProductService()

const httpsUrl = z
  .string()
  .trim()
  .url("La URL no es válida")
  .refine((value) => value.startsWith("https://"), "La URL debe empezar con https://")

const campaignSchema = z.object({
  subject: z.string().trim().min(3, "El asunto es muy corto").max(120),
  preheader: z.string().trim().max(160).optional(),
  headline: z.string().trim().min(3, "El título es muy corto").max(120),
  body: z.string().trim().min(10, "Escribí un mensaje un poco más largo").max(5000),
  imageUrl: httpsUrl.optional().or(z.literal("").transform(() => undefined)),
  ctaLabel: z.string().trim().max(40).optional(),
  ctaUrl: httpsUrl.optional().or(z.literal("").transform(() => undefined)),
  productIds: z.array(z.number().int().positive()).max(4).optional(),
})

async function buildContent(input: CampaignInput): Promise<CampaignContent> {
  const parsed = campaignSchema.safeParse(input)

  if (!parsed.success) {
    throw new ValidationException(
      parsed.error.message,
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
      parsed.error.issues[0]?.message || "Revisá los datos de la campaña"
    )
  }

  const data = parsed.data

  if ((data.ctaLabel && !data.ctaUrl) || (!data.ctaLabel && data.ctaUrl)) {
    throw new ValidationException(
      "CTA incomplete",
      undefined,
      "El botón necesita texto y enlace (o ninguno de los dos)."
    )
  }

  const products: CampaignProduct[] = []

  if (data.productIds && data.productIds.length > 0) {
    const found = await productService.getProductsByIds(data.productIds)
    const byId = new Map(found.map((product) => [product.id, product]))

    for (const id of data.productIds) {
      const product = byId.get(id)
      if (product) {
        products.push({
          name: product.name,
          price: product.price,
          imageUrl: product.image_url,
          url: `${SITE_URL}/products/${product.id}`,
        })
      }
    }
  }

  return {
    subject: data.subject,
    preheader: data.preheader || undefined,
    headline: data.headline,
    paragraphs: data.body
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    imageUrl: data.imageUrl,
    ctaLabel: data.ctaLabel || undefined,
    ctaUrl: data.ctaUrl,
    products,
  }
}

/** Manda la campaña solo al mail del admin logueado para revisar cómo se ve. */
export const sendCampaignTest = async (input: CampaignInput) => {
  return actionHandler(async (): Promise<CampaignResult> => {
    const admin = await requireAdminUser()
    const content = await buildContent(input)

    const result = await emailService.sendCampaign({
      content: { ...content, subject: `[PRUEBA] ${content.subject}` },
      recipients: [admin.email],
    })

    if (result.sent === 0) {
      throw new ValidationException(
        "Test campaign failed",
        undefined,
        "No se pudo enviar el mail de prueba. Revisá la configuración de Resend."
      )
    }

    return { total: 1, ...result, testOnly: true }
  })
}

/** Envía la campaña a todos los suscriptores (con link de baja individual). */
export const sendCampaignToSubscribers = async (input: CampaignInput) => {
  return actionHandler(async (): Promise<CampaignResult> => {
    const admin = await requireAdminUser()

    // Evita doble clic / reenvíos accidentales a toda la base.
    const limit = rateLimit(`campaign:${admin.id}`, {
      limit: 1,
      windowMs: 60 * 1000,
    })
    if (!limit.ok) {
      throw new ValidationException(
        "Campaign rate limit",
        undefined,
        "Ya enviaste una campaña hace instantes. Esperá un minuto antes de volver a enviar."
      )
    }

    const content = await buildContent(input)
    const subscribers = await subscribersService.getAllSubscribers()
    const recipients = Array.from(
      new Set(subscribers.map((subscriber) => subscriber.email.toLowerCase()))
    )

    if (recipients.length === 0) {
      throw new ValidationException(
        "No subscribers",
        undefined,
        "Todavía no hay suscriptores para enviar la campaña."
      )
    }

    const result = await emailService.sendCampaign({ content, recipients })

    return { total: recipients.length, ...result, testOnly: false }
  })
}
