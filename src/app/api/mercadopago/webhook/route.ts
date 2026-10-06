import { NextRequest } from "next/server"
import { MercadoPagoConfig, Payment } from "mercadopago"
import { PaymentService } from "@/services/payment/payment-service"
import { verifyMercadoPagoSignature } from "@/lib/security/mercadopago-signature"

export const dynamic = "force-dynamic"

// GET endpoint for MercadoPago webhook verification ping
export async function GET(): Promise<Response> {
  return new Response("OK", { status: 200 })
}

type MercadoPagoErrorShape = {
  message?: string
  status?: number
  cause?: unknown
  response?: { status?: number; data?: unknown }
}

export async function POST(req: NextRequest): Promise<Response> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN
  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET

  try {
    if (!accessToken) {
      console.error("MercadoPago webhook: missing access token")
      return new Response("Webhook misconfigured", { status: 500 })
    }

    let body: { type?: string; topic?: string; data?: { id?: string | number } }
    try {
      body = await req.json()
    } catch {
      return new Response("Invalid JSON", { status: 400 })
    }

    const topic = String(body.type ?? body.topic ?? "")
    const dataId =
      req.nextUrl.searchParams.get("data.id") ??
      (body.data?.id !== undefined ? String(body.data.id) : null)

    // Firma x-signature: autentica que la notificación la envió Mercado Pago.
    // (Aun sin secreto configurado, el pago se verifica contra la API de MP con
    // nuestro access token, por lo que una notificación falsa no puede aprobar
    // ninguna orden; la firma agrega protección contra replays y ruido.)
    if (webhookSecret) {
      const valid = verifyMercadoPagoSignature({
        secret: webhookSecret,
        signatureHeader: req.headers.get("x-signature"),
        requestId: req.headers.get("x-request-id"),
        dataId,
      })

      if (!valid) {
        console.warn("MercadoPago webhook: firma inválida", { dataId })
        return new Response("Invalid signature", { status: 401 })
      }
    } else if (process.env.NODE_ENV === "production") {
      console.warn(
        "MercadoPago webhook: MERCADO_PAGO_WEBHOOK_SECRET no configurado, no se valida la firma"
      )
    }

    if (!dataId || !topic) {
      console.error("Invalid webhook payload:", body)
      return new Response("Invalid webhook payload", { status: 400 })
    }

    if (!topic.includes("payment")) {
      return new Response("OK", { status: 200 })
    }

    const client = new MercadoPagoConfig({ accessToken })
    const payment = new Payment(client)

    let paymentDetails
    try {
      paymentDetails = await payment.get({ id: dataId })
    } catch (error) {
      const mpError = error as MercadoPagoErrorShape
      const status = mpError?.status ?? mpError?.response?.status

      // Notificaciones de prueba / pagos de otra cuenta: no tiene sentido reintentar.
      if (status === 404) {
        console.warn("MercadoPago webhook: pago inexistente", { dataId })
        return new Response("OK", { status: 200 })
      }

      throw error
    }

    if (!paymentDetails) {
      console.error("Payment not found for id:", dataId)
      return new Response("Payment not found", { status: 500 })
    }

    const outcome = await new PaymentService().handleMercadoPagoPayment(
      paymentDetails
    )

    console.info("MercadoPago webhook procesado", {
      paymentId: dataId,
      status: paymentDetails.status,
      outcome,
    })

    return new Response("OK", { status: 200 })
  } catch (error) {
    const mpError = error as MercadoPagoErrorShape

    console.error("Webhook processing error:", {
      message: mpError?.message || "Unknown webhook error",
      status: mpError?.status || mpError?.response?.status || null,
      cause: mpError?.cause || null,
      response: mpError?.response?.data || null,
    })
    return new Response("Webhook processing error", { status: 500 })
  }
}
