import { createElement, type ReactElement } from "react"
import { render } from "@react-email/components"
import { Resend } from "resend"
import { EmailSendingException } from "@/exceptions/email/email-exceptions"
import {
  AdminAlertEmailProps,
  AdminOrderNotificationBody,
  BankDetail,
  CampaignContent,
  EmailBody,
  OrderCancelledVariant,
} from "@/types/email/email"
import { Order } from "@/types/order/order"
import OrderConfirmationEmail from "@/components/email-templates/buy-template"
import AdminOrderNotificationEmail from "@/components/email-templates/admin-order-template"
import AdminAlertEmail from "@/components/email-templates/admin-alert-template"
import TransferStatusEmail from "@/components/email-templates/transfer-status-template"
import TransferInstructionsEmail from "@/components/email-templates/transfer-instructions-template"
import ShippingStatusEmail from "@/components/email-templates/shipping-status-template"
import OrderCancelledEmail from "@/components/email-templates/order-cancelled-template"
import CampaignEmail from "@/components/email-templates/campaign-template"
import { NewsletterSubscriptionEmail } from "@/components/email-template"
import {
  ADMIN_NOTIFICATION_EMAIL,
  EMAIL_FROM,
  SITE_URL,
  SUPPORT_EMAIL,
  orderShortId,
  orderUrl,
} from "@/lib/config/site"
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribeUrl,
} from "@/lib/security/unsubscribe-token"
import {
  TRANSFER_PAYMENT_WINDOW_MS,
  calculateBankTransferDiscount,
} from "@/lib/utils/payment-utils"

type SendParams = {
  from: string
  to: string | string[]
  subject: string
  react: ReactElement
  replyTo?: string
  headers?: Record<string, string>
  tags?: Array<{ name: string; value: string }>
  idempotencyKey?: string
}

const BATCH_SIZE = 100

function getBankDetails(): BankDetail[] {
  return [
    { label: "Alias", value: process.env.NEXT_PUBLIC_BANK_TRANSFER_ALIAS },
    { label: "CBU/CVU", value: process.env.NEXT_PUBLIC_BANK_TRANSFER_CBU },
    { label: "Titular", value: process.env.NEXT_PUBLIC_BANK_TRANSFER_HOLDER },
    { label: "Banco", value: process.env.NEXT_PUBLIC_BANK_TRANSFER_BANK },
  ].filter((item): item is BankDetail => Boolean(item.value))
}

export class EmailService {
  private readonly resend: Resend

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY)
  }

  /**
   * Punto único de envío: agrega versión texto plano (mejora entregabilidad),
   * reply-to, tags para métricas y un reintento ante errores transitorios.
   */
  private async send(params: SendParams): Promise<void> {
    const text = await render(params.react, { plainText: true })

    const payload = {
      from: params.from,
      to: params.to,
      subject: params.subject,
      react: params.react,
      text,
      replyTo: params.replyTo ?? SUPPORT_EMAIL,
      headers: params.headers,
      tags: params.tags,
    }
    const options = params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : undefined

    let lastError: { message: string } | null = null

    for (let attempt = 0; attempt < 2; attempt++) {
      const { error } = await this.resend.emails.send(payload, options)

      if (!error) {
        return
      }

      lastError = error
      const transient =
        error.name === "rate_limit_exceeded" ||
        error.name === "application_error" ||
        error.name === "internal_server_error"

      if (!transient) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 800))
    }

    throw new EmailSendingException(lastError?.message || "Error al enviar email")
  }

  // ---------------------------------------------------------------------------
  // Cliente: compra / pago
  // ---------------------------------------------------------------------------

  async sendOrderConfirmationEmail(emailBody: EmailBody): Promise<void> {
    const { email, name, buyedProducts, order, shipping, orderItems } = emailBody

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: `¡Compra confirmada! Pedido #${orderShortId(order.id)}`,
      react: createElement(OrderConfirmationEmail, {
        email,
        name,
        buyedProducts,
        order,
        shipping,
        orderItems,
      }),
      tags: [{ name: "type", value: "order_confirmation" }],
      idempotencyKey: `order-confirmation/${order.id}`,
    })
  }

  /** Instrucciones de pago apenas el cliente elige transferencia bancaria. */
  async sendTransferInstructionsEmail(args: {
    email: string
    name: string
    order: Order
  }): Promise<void> {
    const { email, name, order } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: `Pedido #${orderShortId(order.id)}: datos para tu transferencia`,
      react: createElement(TransferInstructionsEmail, {
        name,
        orderId: order.id,
        totalAmount: order.total_amount,
        currency: order.currency,
        discountAmount: calculateBankTransferDiscount(order.subtotal),
        deadlineMinutes: Math.round(TRANSFER_PAYMENT_WINDOW_MS / 60000),
        bankDetails: getBankDetails(),
        uploadUrl: orderUrl(),
        supportEmail: SUPPORT_EMAIL,
      }),
      tags: [{ name: "type", value: "transfer_instructions" }],
      idempotencyKey: `transfer-instructions/${order.id}`,
    })
  }

  async sendTransferReservedEmail(args: {
    email: string
    name: string
    order: Order
  }): Promise<void> {
    const { email, name, order } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: "Reservamos tu pedido — recibimos tu comprobante",
      react: createElement(TransferStatusEmail, {
        name,
        orderId: order.id,
        totalAmount: order.total_amount,
        currency: order.currency,
        variant: "reserved",
        supportEmail: SUPPORT_EMAIL,
        orderUrl: orderUrl(),
      }),
      tags: [{ name: "type", value: "transfer_reserved" }],
    })
  }

  async sendTransferRejectedEmail(args: {
    email: string
    name: string
    order: Order
    reason?: string | null
  }): Promise<void> {
    const { email, name, order, reason } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: "No pudimos validar tu comprobante",
      react: createElement(TransferStatusEmail, {
        name,
        orderId: order.id,
        totalAmount: order.total_amount,
        currency: order.currency,
        variant: "rejected",
        rejectionReason: reason,
        supportEmail: SUPPORT_EMAIL,
        orderUrl: orderUrl(),
      }),
      tags: [{ name: "type", value: "transfer_rejected" }],
    })
  }

  async sendOrderCancelledEmail(args: {
    email: string
    name: string
    order: Order
    variant: OrderCancelledVariant
    reason?: string | null
  }): Promise<void> {
    const { email, name, order, variant, reason } = args

    const subjects: Record<OrderCancelledVariant, string> = {
      expired: `Venció la reserva de tu pedido #${orderShortId(order.id)}`,
      cancelled: `Cancelamos tu pedido #${orderShortId(order.id)}`,
      refunded: `Te devolvimos el pago del pedido #${orderShortId(order.id)}`,
    }

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: subjects[variant],
      react: createElement(OrderCancelledEmail, {
        name,
        orderId: order.id,
        variant,
        reason,
        totalAmount: order.total_amount,
        currency: order.currency,
        supportEmail: SUPPORT_EMAIL,
        shopUrl: `${SITE_URL}/products`,
      }),
      tags: [{ name: "type", value: `order_${variant}` }],
      idempotencyKey: `order-${variant}/${order.id}`,
    })
  }

  // ---------------------------------------------------------------------------
  // Cliente: avance del envío
  // ---------------------------------------------------------------------------

  async sendShipmentInTransitEmail(args: {
    email: string
    name: string
    order: Order
    trackingNumber?: string | null
    trackingUrl?: string | null
  }): Promise<void> {
    const { email, name, order, trackingNumber, trackingUrl } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: `Tu pedido #${orderShortId(order.id)} está en camino 🚚`,
      react: createElement(ShippingStatusEmail, {
        name,
        orderId: order.id,
        variant: "in_transit",
        trackingNumber,
        trackingUrl,
        supportEmail: SUPPORT_EMAIL,
        orderUrl: orderUrl(),
      }),
      tags: [{ name: "type", value: "shipment_in_transit" }],
      idempotencyKey: `shipment-in-transit/${order.id}`,
    })
  }

  async sendShipmentDeliveredEmail(args: {
    email: string
    name: string
    order: Order
    trackingNumber?: string | null
    trackingUrl?: string | null
  }): Promise<void> {
    const { email, name, order, trackingNumber, trackingUrl } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: `Tu pedido #${orderShortId(order.id)} fue entregado ✅`,
      react: createElement(ShippingStatusEmail, {
        name,
        orderId: order.id,
        variant: "delivered",
        trackingNumber,
        trackingUrl,
        supportEmail: SUPPORT_EMAIL,
        orderUrl: orderUrl(),
      }),
      tags: [{ name: "type", value: "shipment_delivered" }],
      idempotencyKey: `shipment-delivered/${order.id}`,
    })
  }

  /** Retiro en tienda: el pedido está listo (y, si es efectivo, cuánto pagar). */
  async sendReadyForPickupEmail(args: {
    email: string
    name: string
    order: Order
    cashDue?: number | null
  }): Promise<void> {
    const { email, name, order, cashDue } = args

    await this.send({
      from: EMAIL_FROM.orders,
      to: email,
      subject: `Tu pedido #${orderShortId(order.id)} está listo para retirar 🛍️`,
      react: createElement(ShippingStatusEmail, {
        name,
        orderId: order.id,
        variant: "ready_for_pickup",
        supportEmail: SUPPORT_EMAIL,
        orderUrl: orderUrl(),
        cashDue: cashDue ?? null,
      }),
      tags: [{ name: "type", value: "ready_for_pickup" }],
      idempotencyKey: `ready-for-pickup/${order.id}`,
    })
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async sendAdminOrderNotificationEmail(
    emailBody: AdminOrderNotificationBody
  ): Promise<void> {
    const variant = emailBody.variant ?? "sale_confirmed"
    const id = orderShortId(emailBody.order.id)

    const subjects = {
      sale_confirmed: `💰 Venta confirmada #${id}`,
      transfer_proof_received: `🧾 Comprobante para revisar #${id}`,
      cash_pickup_reserved: `🛍️ Pedido a retirar y cobrar #${id}`,
    } as const

    await this.send({
      from: EMAIL_FROM.alerts,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: subjects[variant],
      react: createElement(AdminOrderNotificationEmail, emailBody),
      tags: [{ name: "type", value: `admin_${variant}` }],
    })
  }

  async sendAdminAlertEmail(props: AdminAlertEmailProps): Promise<void> {
    const prefix =
      props.severity === "critical"
        ? "🚨"
        : props.severity === "warning"
          ? "⚠️"
          : "ℹ️"

    await this.send({
      from: EMAIL_FROM.alerts,
      to: ADMIN_NOTIFICATION_EMAIL,
      subject: `${prefix} ${props.title}`,
      react: createElement(AdminAlertEmail, props),
      tags: [{ name: "type", value: "admin_alert" }],
    })
  }

  // ---------------------------------------------------------------------------
  // Newsletter / marketing
  // ---------------------------------------------------------------------------

  async sendNewsletterWelcomeEmail(email: string): Promise<void> {
    await this.send({
      from: EMAIL_FROM.newsletter,
      to: email,
      subject: "¡Bienvenido/a al newsletter de Lozach!",
      react: createElement(NewsletterSubscriptionEmail, {
        userEmail: email,
        websiteUrl: SITE_URL,
        unsubscribeUrl: buildUnsubscribeUrl(SITE_URL, email),
      }),
      headers: this.buildListUnsubscribeHeaders(email),
      tags: [{ name: "type", value: "newsletter_welcome" }],
    })
  }

  /**
   * Envía una campaña a una lista de destinatarios en lotes de 100 (Resend batch).
   * Cada mail lleva su propio link de baja firmado y los headers List-Unsubscribe
   * (requeridos por Gmail/Yahoo para envíos masivos).
   */
  async sendCampaign(args: {
    content: CampaignContent
    recipients: string[]
  }): Promise<{ sent: number; failed: number }> {
    const { content, recipients } = args
    let sent = 0
    let failed = 0

    for (let index = 0; index < recipients.length; index += BATCH_SIZE) {
      const chunk = recipients.slice(index, index + BATCH_SIZE)

      const messages = await Promise.all(
        chunk.map(async (email) => {
          const unsubscribeUrl = buildUnsubscribeUrl(SITE_URL, email)
          const react = createElement(CampaignEmail, {
            ...content,
            unsubscribeUrl,
          })

          return {
            from: EMAIL_FROM.newsletter,
            to: [email],
            subject: content.subject,
            react,
            text: await render(react, { plainText: true }),
            replyTo: SUPPORT_EMAIL,
            headers: this.buildListUnsubscribeHeaders(email),
            tags: [{ name: "type", value: "campaign" }],
          }
        })
      )

      try {
        const { error } = await this.resend.batch.send(messages)

        if (error) {
          console.error("[Email:campaign] batch error", error)
          failed += chunk.length
        } else {
          sent += chunk.length
        }
      } catch (error) {
        console.error("[Email:campaign] batch exception", error)
        failed += chunk.length
      }
    }

    return { sent, failed }
  }

  private buildListUnsubscribeHeaders(email: string): Record<string, string> {
    return {
      "List-Unsubscribe": `<${buildOneClickUnsubscribeUrl(SITE_URL, email)}>, <mailto:${SUPPORT_EMAIL}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
  }
}
