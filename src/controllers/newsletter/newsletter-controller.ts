"use server"

import { headers } from "next/headers"
import { NewsletterSubscriptionSchema } from "@/lib/validations/user-schema"
import { FormState } from "@/types/types"
import { SubscribersService } from "@/services/subscribers/subscribers-service"
import { EmailService } from "@/services/email/email-service"
import { actionHandler } from "@/lib/handlers/actionHandler"
import { rateLimit } from "@/lib/security/rate-limit"
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"

const subscribersService = new SubscribersService()
const emailService = new EmailService()

export const newsletterSubscription = async (
  _prevState: FormState,
  formData: FormData
): Promise<FormState> => {
  try {
    const rawEmail = formData.get("email")
    const validatedData = NewsletterSubscriptionSchema.safeParse({
      email: typeof rawEmail === "string" ? rawEmail.trim() : "",
    })

    if (!validatedData.success) {
      return { error: validatedData.error.errors[0].message }
    }

    const email = validatedData.data.email.toLowerCase()

    // Frena bots que usan el formulario para inundar casillas ajenas.
    const requestHeaders = await headers()
    const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim()
    const limit = rateLimit(`newsletter:${ip ?? "unknown"}`, {
      limit: 5,
      windowMs: 10 * 60 * 1000,
    })

    if (!limit.ok) {
      return { error: "Demasiados intentos. Probá de nuevo en unos minutos." }
    }

    const result = await actionHandler(() =>
      subscribersService.createSubscriber(email)
    )

    if (!result.success) {
      return { error: result.message || "Error al crear el suscriptor" }
    }

    if (result.data === "already_subscribed") {
      return {
        success: true,
        message: "¡Ya estabas suscripto/a! Gracias por seguirnos.",
      }
    }

    // Email de bienvenida solo al suscriptor (antes pasaba por un endpoint
    // público que permitía mandar mails a cualquier dirección).
    try {
      await emailService.sendNewsletterWelcomeEmail(email)
    } catch (emailError) {
      console.error("[Newsletter] welcome email error:", emailError)
    }

    return {
      success: true,
      message: "Te has suscrito correctamente a nuestro newsletter.",
    }
  } catch (err) {
    console.error("Newsletter subscription error:", err)
    return {
      error: "Hubo un error al suscribirse. Por favor intente nuevamente.",
    }
  }
}

export const unsubscribeFromNewsletter = async (
  email: string,
  token: string
): Promise<{ success: boolean; message: string }> => {
  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    return { success: false, message: "El enlace de baja no es válido." }
  }

  try {
    await subscribersService.unsubscribe(email)
    return { success: true, message: "Listo, ya no vas a recibir más mails." }
  } catch (error) {
    console.error("[Newsletter] unsubscribe error:", error)
    return {
      success: false,
      message: "No pudimos procesar tu baja. Escribinos y la hacemos a mano.",
    }
  }
}
