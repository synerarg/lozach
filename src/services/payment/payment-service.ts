import {
  InvalidPreferenceDataException,
  PaymentCreationException,
} from "@/exceptions/payment/payment-exceptions"
import {
  CreateBankTransferOrderSchema,
  CreatePreferenceSchema,
} from "@/lib/validations/payment-schema"
import {
  CreateBankTransferOrderResponse,
  CreateCashStoreOrderResponse,
  CreatePreferenceResponse,
  CreatePreferenceValues,
} from "@/types/payment/payment"
import MercadoPagoConfig, { Preference } from "mercadopago"
import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes"
import { AuthService } from "../auth/auth-service"
import { AuthMissingUserException } from "@/exceptions/auth/auth-exceptions"
import {
  ForbiddenException,
  ValidationException,
} from "@/exceptions/base/base-exceptions"
import { ProductService } from "../products/product-service"
import { ProductNotFoundException } from "@/exceptions/products/product-exceptions"
import { PreferenceResponse } from "mercadopago/dist/clients/preference/commonTypes"
import { OrderService } from "../orders/order-service"
import { AddressesService } from "../addresses/addresses-service"
import { OrderItemsService } from "../order-items/order-items-service"
import {
  OrderItemsCreationException,
  OrderItemsFetchException,
} from "@/exceptions/order-items/order-items-exceptions"
import { ShippingService } from "../shipping/shipping-service"
import {
  FINAL_PAYMENT_STATUSES,
  Order,
  OrderPaymentStatus,
} from "@/types/order/order"
import { EmailService } from "../email/email-service"
import { StorageService } from "../storage/storage-service"
import { Product } from "@/types/types"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"
import { CreateShippingValues, Shipping } from "@/types/shipping/shipping"
import { CorreoArgentinoService } from "../shipping/correo-argentino-service"
import {
  buildShippingDetails,
  isStorePickup,
  shouldUseCorreoArgentino,
} from "@/lib/utils/shipping-utils"
import {
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_PAYMENT_TYPE,
  MERCADO_PAGO_PAYMENT_TYPE,
  TRANSFER_PAYMENT_WINDOW_MS,
  calculateBankTransferDiscount,
  calculateBankTransferTotal,
  calculateCashStoreDiscount,
  calculateCashStoreTotal,
} from "@/lib/utils/payment-utils"
import {
  MAX_CART_LINES,
  MAX_ITEM_QUANTITY,
  MERCADO_PAGO_ORDER_WINDOW_MS,
  dashboardOrdersUrl,
  orderShortId,
} from "@/lib/config/site"
import { rateLimit } from "@/lib/security/rate-limit"

const userService = new AuthService()
const productService = new ProductService()
const orderService = new OrderService()
const addressesService = new AddressesService()
const orderItemsService = new OrderItemsService()
const shippingService = new ShippingService()
const emailService = new EmailService()
const correoArgentinoService = new CorreoArgentinoService()
const storageService = new StorageService()

const MAX_IMPORT_ATTEMPTS_BEFORE_ALERT = 2

type CartLine = CreatePreferenceValues["products"][number]

type PreparedCart = {
  subtotal: number
  mpItems: Array<{
    id: string
    title: string
    quantity: number
    unit_price: number
    currency_id: string
  }>
  orderItems: Array<{
    product_id: number
    product_name: string
    sku: string
    quantity: number
    unit_price: number
    color: string
    size: string
  }>
}

type SessionUser = Awaited<ReturnType<AuthService["getUser"]>>

/** Traduce el status de Mercado Pago al estado de pago interno de la orden. */
export function mapMercadoPagoStatus(status?: string | null): OrderPaymentStatus {
  switch (status) {
    case "approved":
      return "approved"
    case "authorized":
    case "in_process":
    case "in_mediation":
      return "in_process"
    case "rejected":
      return "rejected"
    case "cancelled":
      return "cancelled"
    case "refunded":
      return "refunded"
    case "charged_back":
      return "charged_back"
    default:
      return "pending"
  }
}

export type MercadoPagoPaymentOutcome =
  | "approved"
  | "already_approved"
  | "updated"
  | "ignored"
  | "amount_mismatch"
  | "order_not_found"

export class PaymentService {
  private client: Preference | null = null

  private getMercadoPagoClient(): Preference {
    if (this.client) {
      return this.client
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN as string
    if (!accessToken) {
      throw new Error("MERCADO_PAGO_ACCESS_TOKEN is not set")
    }

    const config = new MercadoPagoConfig({ accessToken })

    this.client = new Preference(config)

    return this.client
  }

  // ===========================================================================
  // Creación de órdenes
  // ===========================================================================

  async createPreference(
    body: CreatePreferenceValues
  ): Promise<CreatePreferenceResponse> {
    const validatedData = CreatePreferenceSchema.safeParse(body)

    if (!validatedData.success) {
      throw new InvalidPreferenceDataException(
        validatedData.error.message,
        "Revisa la información de los campos",
        validatedData.error.flatten().fieldErrors as Record<string, string[]>
      )
    }

    const user = await this.requireUser()
    const cart = await this.prepareCart(body.products)
    const shippingCost = await this.resolveShippingCost(body, cart)
    const request_id = this.buildExternalReference(user.id)

    let createdOrderId: string | null = null

    try {
      const appUrl = (
        process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
      ).replace(/\/$/, "")
      const isHttps = appUrl.startsWith("https://")
      const expiresAt = new Date(Date.now() + MERCADO_PAGO_ORDER_WINDOW_MS)
      // Mercado Pago espera la fecha con offset de Argentina (-03:00).
      const mpExpirationDate = new Date(expiresAt.getTime() - 3 * 60 * 60 * 1000)
        .toISOString()
        .replace("Z", "-03:00")

      const result = (await this.getMercadoPagoClient().create({
        body: {
          items: cart.mpItems,
          payer: {
            email: user.email,
          },
          back_urls: {
            success: `${appUrl}/payment/success`,
            failure: `${appUrl}/payment/failure`,
            pending: `${appUrl}/payment/pending`,
          },
          shipments:
            shippingCost > 0
              ? {
                  mode: "not_specified",
                  cost: shippingCost,
                  free_shipping: false,
                }
              : {
                  local_pickup: body.shipping_method === "store",
                  cost: 0,
                  free_shipping: true,
                },
          notification_url: `${appUrl}/api/mercadopago/webhook`,
          // auto_return only works with HTTPS — omit on localhost/HTTP to avoid MP errors
          ...(isHttps ? { auto_return: "approved" } : {}),
          external_reference: request_id,
          statement_descriptor: "LOZACH",
          expires: true,
          expiration_date_to: mpExpirationDate,
          metadata: {
            request_id,
          },
        },
      })) as PreferenceResponse

      if (!result || !result.init_point || !result.id) {
        throw new PaymentCreationException(
          "Error al crear la preferencia",
          "Error al crear la preferencia"
        )
      }

      const order = await orderService.createOrder({
        user_id: user.id,
        total_amount: cart.subtotal + shippingCost,
        subtotal: cart.subtotal,
        payment_id: result.id,
        payment_type: MERCADO_PAGO_PAYMENT_TYPE,
        collection_id: result.id,
        collection_status: "pending",
        external_reference: request_id,
        currency: "ARS",
        phone: body.phone,
        expires_at: expiresAt.toISOString(),
      })
      createdOrderId = order.id

      await this.persistOrderRecords({
        user,
        order,
        body,
        cart,
        shippingCost,
        shippingStatus: "draft",
      })

      // Para Mercado Pago el aviso al admin se manda recién cuando el pago se
      // aprueba (antes llegaba un mail por cada intento de compra sin pagar).

      return {
        init_point: result.init_point,
      }
    } catch (error) {
      this.logMercadoPagoError("create_preference", error, {
        userId: user.id,
        shippingMethod: body.shipping_method,
      })

      if (createdOrderId) {
        await this.cleanupFailedOrderCreation(createdOrderId)
      }

      if (error instanceof PaymentCreationException) {
        throw error
      }

      throw new PaymentCreationException(
        (error as Error).message,
        "Error al crear la preferencia. Por favor intente nuevamente."
      )
    }
  }

  async createBankTransferOrder(
    body: CreatePreferenceValues
  ): Promise<CreateBankTransferOrderResponse> {
    const validatedData = CreateBankTransferOrderSchema.safeParse(body)

    if (!validatedData.success) {
      throw new InvalidPreferenceDataException(
        validatedData.error.message,
        "Revisa la información de los campos",
        validatedData.error.flatten().fieldErrors as Record<string, string[]>
      )
    }

    const user = await this.requireUser()
    const cart = await this.prepareCart(body.products)
    const shippingCost = await this.resolveShippingCost(body, cart)

    const discountAmount = calculateBankTransferDiscount(cart.subtotal)
    const finalTotalAmount = calculateBankTransferTotal(
      cart.subtotal,
      shippingCost
    )
    const request_id = this.buildExternalReference(user.id)

    let createdOrderId: string | null = null

    try {
      const order = await orderService.createOrder({
        user_id: user.id,
        total_amount: finalTotalAmount,
        subtotal: cart.subtotal,
        payment_id: null,
        payment_type: BANK_TRANSFER_PAYMENT_TYPE,
        collection_id: null,
        collection_status: "pending",
        external_reference: request_id,
        currency: "ARS",
        phone: body.phone,
        expires_at: new Date(
          Date.now() + TRANSFER_PAYMENT_WINDOW_MS
        ).toISOString(),
      })
      createdOrderId = order.id

      await this.persistOrderRecords({
        user,
        order,
        body,
        cart,
        shippingCost,
        shippingStatus: "draft",
      })

      // Instrucciones de transferencia por mail (queda como referencia aunque
      // el cliente cierre la pestaña).
      try {
        await emailService.sendTransferInstructionsEmail({
          email: user.email,
          name: user.name,
          order,
        })
      } catch (error) {
        console.error("[BankTransfer:instructionsEmail]", error)
      }

      const params = new URLSearchParams({
        payment_method: BANK_TRANSFER_PAYMENT_TYPE,
        external_reference: request_id,
        amount: String(finalTotalAmount),
      })

      return {
        redirect_url: `/payment/pending?${params.toString()}`,
        external_reference: request_id,
        total_amount: finalTotalAmount,
        discount_amount: discountAmount,
      }
    } catch (error) {
      if (createdOrderId) {
        await this.cleanupFailedOrderCreation(createdOrderId)
      }

      console.error("[BankTransfer:create_order]", {
        userId: user.id,
        shippingMethod: body.shipping_method,
        error,
      })

      throw new PaymentCreationException(
        (error as Error).message,
        "Error al crear la orden por transferencia. Por favor intente nuevamente."
      )
    }
  }

  async createCashStoreOrder(
    body: CreatePreferenceValues
  ): Promise<CreateCashStoreOrderResponse> {
    if (body.shipping_method !== "store") {
      throw new InvalidPreferenceDataException(
        "El pago en efectivo requiere retiro en tienda",
        "El pago en efectivo solo está disponible con retiro en tienda."
      )
    }

    const validatedData = CreateBankTransferOrderSchema.safeParse(body)

    if (!validatedData.success) {
      throw new InvalidPreferenceDataException(
        validatedData.error.message,
        "Revisa la información de los campos",
        validatedData.error.flatten().fieldErrors as Record<string, string[]>
      )
    }

    const user = await this.requireUser()
    const cart = await this.prepareCart(body.products)

    const discountAmount = calculateCashStoreDiscount(cart.subtotal)
    const finalTotalAmount = calculateCashStoreTotal(cart.subtotal)
    const request_id = this.buildExternalReference(user.id)

    let createdOrderId: string | null = null

    try {
      const order = await orderService.createOrder({
        user_id: user.id,
        total_amount: finalTotalAmount,
        subtotal: cart.subtotal,
        payment_id: null,
        payment_type: CASH_STORE_PAYMENT_TYPE,
        collection_id: null,
        collection_status: "pending",
        external_reference: request_id,
        currency: "ARS",
        phone: body.phone,
        expires_at: null,
      })
      createdOrderId = order.id

      await this.persistOrderRecords({
        user,
        order,
        body,
        cart,
        shippingCost: 0,
        shippingStatus: "ready",
      })

      // El pedido en efectivo no pasa por ningún pago online: el admin tiene
      // que enterarse ahora para prepararlo y avisar cuando esté listo.
      await this.notifyAdminAboutOrder(order, "cash_pickup_reserved")

      const params = new URLSearchParams({
        payment_method: CASH_STORE_PAYMENT_TYPE,
        external_reference: request_id,
        amount: String(finalTotalAmount),
      })

      return {
        redirect_url: `/payment/pending?${params.toString()}`,
        external_reference: request_id,
        total_amount: finalTotalAmount,
        discount_amount: discountAmount,
      }
    } catch (error) {
      if (createdOrderId) {
        await this.cleanupFailedOrderCreation(createdOrderId)
      }

      console.error("[CashStore:create_order]", {
        userId: user.id,
        shippingMethod: body.shipping_method,
        error,
      })

      throw new PaymentCreationException(
        (error as Error).message,
        "Error al crear el pedido. Por favor intente nuevamente."
      )
    }
  }

  // ===========================================================================
  // Webhook de Mercado Pago
  // ===========================================================================

  /**
   * Procesa un pago ya verificado contra la API de Mercado Pago. Es idempotente
   * (el webhook se reintenta y puede llegar duplicado/desordenado):
   *  - la aprobación se "reclama" con un UPDATE condicional → una sola vez;
   *  - un pago aprobado nunca se degrada por una notificación vieja;
   *  - se valida que el monto cobrado cubra el total de la orden.
   */
  async handleMercadoPagoPayment(
    payment: PaymentResponse
  ): Promise<MercadoPagoPaymentOutcome> {
    const externalReference = payment.external_reference
    const paymentId = payment.id ? String(payment.id) : null

    if (!externalReference || !paymentId) {
      console.warn("[MP:webhook] pago sin external_reference/id", paymentId)
      return "ignored"
    }

    let order: Order
    try {
      order = await orderService.getOrderByExternalReferenceAdmin(
        externalReference
      )
    } catch {
      console.warn("[MP:webhook] orden no encontrada", { externalReference })
      return "order_not_found"
    }

    if (order.payment_type !== MERCADO_PAGO_PAYMENT_TYPE) {
      console.warn("[MP:webhook] la orden no es de Mercado Pago", order.id)
      return "ignored"
    }

    const status = mapMercadoPagoStatus(payment.status)
    const statusDetail = payment.status_detail ?? null
    const nowIso = new Date().toISOString()

    // --- Aprobado -----------------------------------------------------------
    if (status === "approved") {
      if (order.collection_status === "approved") {
        await this.reconcileApprovedOrder(order)
        return "already_approved"
      }

      const paid = Number(payment.transaction_amount ?? 0)
      const currencyOk = !payment.currency_id || payment.currency_id === order.currency

      // Tolerancia de $1 por redondeos; cobrar de más no bloquea la orden.
      if (!currencyOk || paid + 1 < order.total_amount) {
        console.error("[MP:webhook] monto/moneda no coinciden", {
          orderId: order.id,
          paid,
          expected: order.total_amount,
          currency: payment.currency_id,
        })

        await orderService.updateOrder(order.id, {
          payment_id: paymentId,
          payment_status_detail: "amount_mismatch",
          updated_at: nowIso,
        })

        await this.sendAdminAlert({
          title: `Pago de Mercado Pago con monto distinto (#${orderShortId(order.id)})`,
          severity: "critical",
          summary:
            "Mercado Pago informó un pago aprobado, pero no coincide con el total de la orden. No se aprobó automáticamente: revisalo en Mercado Pago antes de despachar.",
          details: [
            { label: "Orden", value: orderShortId(order.id) },
            { label: "ID de pago MP", value: paymentId },
            { label: "Cobrado", value: `${currencyLabel(payment.currency_id)} ${paid}` },
            { label: "Total de la orden", value: `ARS ${order.total_amount}` },
          ],
          ctaLabel: "Abrir ventas",
          ctaUrl: dashboardOrdersUrl(),
        })

        return "amount_mismatch"
      }

      const claimed = await orderService.claimApproval(order.id, {
        payment_id: paymentId,
        collection_id: paymentId,
        payment_status_detail: statusDetail,
        processed_at: nowIso,
        expires_at: null,
        updated_at: nowIso,
      })

      if (!claimed) {
        // Otra ejecución (webhook duplicado) ya aprobó la orden.
        return "already_approved"
      }

      await this.runApprovalSideEffects(claimed, "mercadopago")
      return "approved"
    }

    // --- Reembolso / contracargo (solo tiene sentido sobre una orden pagada) --
    if (status === "refunded" || status === "charged_back") {
      const updated = await orderService.transitionStatus(
        order.id,
        ["approved"],
        {
          collection_status: status,
          payment_status_detail: statusDetail,
          updated_at: nowIso,
        }
      )

      if (!updated) {
        return "ignored"
      }

      const shipping = await shippingService.findShippingByOrderId(order.id)

      await this.sendAdminAlert({
        title:
          status === "refunded"
            ? `Pago reembolsado (#${orderShortId(order.id)})`
            : `Contracargo recibido (#${orderShortId(order.id)})`,
        severity: status === "charged_back" ? "critical" : "warning",
        summary:
          status === "refunded"
            ? "Se reembolsó el pago de esta orden en Mercado Pago. Verificá que no se despache."
            : "El comprador desconoció el pago (contracargo). Reuní la documentación del envío para la disputa.",
        details: [
          { label: "Orden", value: orderShortId(order.id) },
          { label: "ID de pago MP", value: paymentId },
          { label: "Total", value: `ARS ${order.total_amount}` },
          {
            label: "Envío",
            value: shipping
              ? `${shipping.shipping_status}${
                  shipping.tracking_number
                    ? ` · seguimiento ${shipping.tracking_number}`
                    : ""
                }`
              : "sin registro",
          },
        ],
        ctaLabel: "Abrir ventas",
        ctaUrl: dashboardOrdersUrl(),
      })

      if (status === "refunded") {
        await this.notifyCustomerOrderClosed(updated, "refunded")
      }

      return "updated"
    }

    // --- Pendiente / en proceso / rechazado / cancelado ----------------------
    // Una orden ya cobrada no se degrada por notificaciones atrasadas de otros
    // intentos de pago.
    if (FINAL_PAYMENT_STATUSES.includes(order.collection_status ?? "")) {
      return "ignored"
    }

    if (
      order.collection_status !== status ||
      order.payment_id !== paymentId ||
      order.payment_status_detail !== statusDetail
    ) {
      await orderService.updateOrder(order.id, {
        payment_id: paymentId,
        collection_id: paymentId,
        collection_status: status,
        payment_status_detail: statusDetail ?? undefined,
        updated_at: nowIso,
      })
    }

    return "updated"
  }

  /** Reintenta lo que pudo quedar pendiente de una orden ya aprobada. */
  async reconcileApprovedOrder(order: Order): Promise<void> {
    if (!order.email_sent) {
      await this.sendConfirmationOnce(order)
    }
  }

  /**
   * Efectos de una aprobación (se ejecutan una única vez por orden, gracias a
   * claimApproval). Ninguno debe tirar: el pago ya está registrado y un 500 al
   * webhook solo generaría reintentos de algo que ya quedó hecho.
   */
  private async runApprovalSideEffects(
    order: Order,
    source: "mercadopago" | "bank_transfer" | "cash_store"
  ): Promise<void> {
    try {
      const shipping = await shippingService.findShippingByOrderId(order.id)

      if (shipping) {
        await shippingService.updateShipping(order.id, {
          order_id: order.id,
          shipping_status: "ready",
        })

        if (shouldUseCorreoArgentino(shipping.shipping_method)) {
          await this.tryImportShipmentToCorreo(order, {
            ...shipping,
            shipping_status: "ready",
          })
        }
      }
    } catch (error) {
      console.error("[Payment:approvalShipping]", { orderId: order.id, error })
    }

    await this.sendConfirmationOnce(order)

    // Venta online confirmada → aviso al admin (una sola vez).
    if (source === "mercadopago") {
      try {
        if (await orderService.claimAdminNotification(order.id)) {
          await this.notifyAdminAboutOrder(order, "sale_confirmed")
        }
      } catch (error) {
        console.error("[Payment:adminSaleEmail]", { orderId: order.id, error })
      }
    }
  }

  /** Manda el mail de confirmación una sola vez; si falla, lo libera para reintentar. */
  private async sendConfirmationOnce(order: Order): Promise<void> {
    let claimed = false

    try {
      claimed = await orderService.claimConfirmationEmail(order.id)
      if (!claimed) {
        return
      }

      await this.sendOrderConfirmationEmail(order)
    } catch (error) {
      console.error("[Payment:confirmationEmail]", { orderId: order.id, error })

      if (claimed) {
        await orderService.releaseConfirmationEmail(order.id).catch(() => {})
      }
    }
  }

  private async sendOrderConfirmationEmail(order: Order): Promise<void> {
    const orderItems = await orderItemsService.getOrderItemsByOrderId(
      order.id
    )

    if (!orderItems) {
      throw new OrderItemsFetchException(
        "Items de la orden no encontrados",
        "Items de la orden no encontrados"
      )
    }

    const productIds = Array.from(
      new Set(orderItems.map((item) => item.product_id))
    )
    const buyedProducts = [] as Product[]

    if (productIds.length > 0) {
      try {
        buyedProducts.push(...(await productService.getProductsByIds(productIds)))
      } catch (error) {
        console.error("[Payment] no se pudieron cargar productos del mail", error)
      }
    }

    const shipping = await shippingService.findShippingByOrderId(order.id)

    const user = await userService.getUserById(order.user_id)

    if (!user) {
      throw new AuthMissingUserException(
        "Email no encontrado",
        "Email no encontrado"
      )
    }

    await emailService.sendOrderConfirmationEmail({
      email: user.email,
      name: user.name,
      buyedProducts,
      orderItems,
      order,
      shipping,
    })
  }

  // ===========================================================================
  // Transferencia bancaria
  // ===========================================================================

  async uploadBankTransferProof(
    externalReference: string,
    file: File
  ): Promise<{ proof_url: string; order_id: string }> {
    const user = await this.requireUser()

    const limit = rateLimit(`proof:${user.id}`, {
      limit: 6,
      windowMs: 10 * 60 * 1000,
    })
    if (!limit.ok) {
      throw new ValidationException(
        "Too many proof uploads",
        undefined,
        "Subiste varios comprobantes en poco tiempo. Esperá unos minutos."
      )
    }

    const order = await orderService.getOrderByExternalReferenceAdmin(
      externalReference
    )

    if (order.user_id !== user.id) {
      throw new ForbiddenException(
        "Order does not belong to user",
        "No podés modificar esta orden."
      )
    }

    if (order.payment_type !== BANK_TRANSFER_PAYMENT_TYPE) {
      throw new ValidationException(
        "Not a bank transfer order",
        undefined,
        "Esta orden no se paga por transferencia bancaria."
      )
    }

    if (
      order.payment_proof_status === "approved" ||
      order.collection_status === "approved"
    ) {
      throw new ValidationException(
        "Order already approved",
        undefined,
        "Esta orden ya fue aprobada."
      )
    }

    if (order.collection_status === "cancelled") {
      throw new ValidationException(
        "Order cancelled",
        undefined,
        "Esta orden fue cancelada. Si ya transferiste, escribinos y lo resolvemos."
      )
    }

    const { proof_url } = await storageService.uploadPaymentProof(
      order.id,
      file
    )

    const now = new Date().toISOString()

    await orderService.updateOrder(order.id, {
      payment_proof_url: proof_url,
      payment_proof_uploaded_at: now,
      payment_proof_status: "pending_review",
      payment_proof_reviewed_at: null,
      payment_proof_reviewed_by: null,
      payment_proof_rejection_reason: null,
      // Si venía rechazada, vuelve a quedar pendiente de revisión.
      collection_status: "pending",
      reserved_at: order.reserved_at ?? now,
      expires_at: null,
      updated_at: now,
    })

    const reservedOrder = { ...order, reserved_at: order.reserved_at ?? now }

    try {
      const customer = await userService.getUserById(order.user_id)
      await emailService.sendTransferReservedEmail({
        email: customer.email,
        name: customer.name,
        order: reservedOrder,
      })
    } catch (error) {
      console.error("[BankTransfer:reservedEmail]", error)
    }

    // El admin tiene que revisar el comprobante: antes no se enteraba.
    const proofUrl = await storageService.getPaymentProofSignedUrl(
      proof_url,
      60 * 60 * 24
    )
    await this.notifyAdminAboutOrder(
      reservedOrder,
      "transfer_proof_received",
      proofUrl
    )

    return { proof_url, order_id: order.id }
  }

  async approveBankTransferOrder(orderId: string): Promise<void> {
    const adminUser = await this.requireAdmin()

    const order = await orderService.getOrderById(orderId)

    if (order.payment_type !== BANK_TRANSFER_PAYMENT_TYPE) {
      throw new ValidationException(
        "Not a bank transfer order",
        undefined,
        "Esta orden no se paga por transferencia bancaria."
      )
    }

    if (!order.payment_proof_url) {
      throw new ValidationException(
        "Missing proof",
        undefined,
        "La orden no tiene comprobante cargado."
      )
    }

    if (order.collection_status === "approved") {
      throw new ValidationException(
        "Already approved",
        undefined,
        "Esta orden ya estaba aprobada."
      )
    }

    const now = new Date().toISOString()

    const claimed = await orderService.claimApproval(order.id, {
      payment_proof_status: "approved",
      payment_proof_reviewed_at: now,
      payment_proof_reviewed_by: adminUser.id,
      payment_proof_rejection_reason: null,
      processed_at: now,
      expires_at: null,
      cancelled_at: null,
      cancellation_reason: null,
      updated_at: now,
    })

    if (!claimed) {
      throw new ValidationException(
        "Already approved",
        undefined,
        "Esta orden ya fue aprobada por otro proceso."
      )
    }

    await this.runApprovalSideEffects(claimed, "bank_transfer")
  }

  async rejectBankTransferOrder(
    orderId: string,
    reason?: string
  ): Promise<void> {
    const adminUser = await this.requireAdmin()

    const cleanReason = reason?.trim()
    if (!cleanReason) {
      throw new ValidationException(
        "Missing reason",
        undefined,
        "Tenés que indicar un motivo para cancelar la orden. El motivo se le envía al cliente."
      )
    }

    const order = await orderService.getOrderById(orderId)

    if (order.payment_type !== BANK_TRANSFER_PAYMENT_TYPE) {
      throw new ValidationException(
        "Not a bank transfer order",
        undefined,
        "Esta orden no se paga por transferencia bancaria."
      )
    }

    if (FINAL_PAYMENT_STATUSES.includes(order.collection_status ?? "")) {
      throw new ValidationException(
        "Order already paid",
        undefined,
        "La orden ya fue aprobada o reembolsada: no se puede rechazar. Si hay que devolver el dinero, hacelo desde tu banco."
      )
    }

    const now = new Date().toISOString()

    await orderService.updateOrder(order.id, {
      payment_proof_status: "rejected",
      payment_proof_reviewed_at: now,
      payment_proof_reviewed_by: adminUser.id,
      payment_proof_rejection_reason: cleanReason,
      collection_status: "rejected",
      updated_at: now,
    })

    try {
      const customer = await userService.getUserById(order.user_id)
      await emailService.sendTransferRejectedEmail({
        email: customer.email,
        name: customer.name,
        order,
        reason: cleanReason,
      })
    } catch (error) {
      console.error("[BankTransfer:rejectedEmail]", error)
    }
  }

  // ===========================================================================
  // Acciones de admin sobre pedidos
  // ===========================================================================

  /** Efectivo en tienda: el cliente pagó al retirar → se aprueba la orden. */
  async confirmCashPayment(orderId: string): Promise<void> {
    const adminUser = await this.requireAdmin()
    const order = await orderService.getOrderById(orderId)

    if (order.payment_type !== CASH_STORE_PAYMENT_TYPE) {
      throw new ValidationException(
        "Not a cash order",
        undefined,
        "Esta orden no es de pago en efectivo."
      )
    }

    const now = new Date().toISOString()

    const claimed = await orderService.claimApproval(order.id, {
      processed_at: now,
      expires_at: null,
      payment_status_detail: `cash_confirmed_by:${adminUser.id}`,
      updated_at: now,
    })

    if (!claimed) {
      throw new ValidationException(
        "Already approved",
        undefined,
        "Esta orden ya estaba cobrada."
      )
    }

    await this.runApprovalSideEffects(claimed, "cash_store")
  }

  /** Retiro en tienda: avisa al cliente que el pedido está listo. */
  async markReadyForPickup(orderId: string): Promise<void> {
    await this.requireAdmin()
    const order = await orderService.getOrderById(orderId)
    const shipping = await shippingService.findShippingByOrderId(order.id)

    if (!shipping || !isStorePickup(shipping.shipping_method)) {
      throw new ValidationException(
        "Not a store pickup",
        undefined,
        "Este pedido no es de retiro en tienda."
      )
    }

    if (["cancelled", "rejected", "refunded", "charged_back"].includes(order.collection_status ?? "")) {
      throw new ValidationException(
        "Order closed",
        undefined,
        "La orden está cancelada o reembolsada."
      )
    }

    if (shipping.ready_for_pickup_email_sent) {
      throw new ValidationException(
        "Already notified",
        undefined,
        "Ya le avisaste al cliente que puede retirar."
      )
    }

    const customer = await userService.getUserById(order.user_id)
    const cashDue =
      order.payment_type === CASH_STORE_PAYMENT_TYPE &&
      order.collection_status !== "approved"
        ? order.total_amount
        : null

    await emailService.sendReadyForPickupEmail({
      email: customer.email,
      name: customer.name,
      order,
      cashDue,
    })

    await shippingService.updateShipping(order.id, {
      shipping_status: "ready",
      ready_for_pickup_email_sent: true,
    })
  }

  /** Retiro en tienda: el cliente ya retiró el pedido. */
  async markPickedUp(orderId: string): Promise<void> {
    await this.requireAdmin()
    const order = await orderService.getOrderById(orderId)
    const shipping = await shippingService.findShippingByOrderId(order.id)

    if (!shipping || !isStorePickup(shipping.shipping_method)) {
      throw new ValidationException(
        "Not a store pickup",
        undefined,
        "Este pedido no es de retiro en tienda."
      )
    }

    if (order.collection_status !== "approved") {
      throw new ValidationException(
        "Not paid",
        undefined,
        "Primero tenés que confirmar el pago de la orden."
      )
    }

    await shippingService.updateShipping(order.id, {
      shipping_status: "delivered",
      delivered_at: new Date().toISOString(),
      delivered_email_sent: true,
      in_transit_email_sent: true,
    })
  }

  /** Cancela una orden que todavía no se cobró (con aviso al cliente). */
  async cancelUnpaidOrder(orderId: string, reason?: string): Promise<void> {
    await this.requireAdmin()
    const order = await orderService.getOrderById(orderId)

    if (FINAL_PAYMENT_STATUSES.includes(order.collection_status ?? "")) {
      throw new ValidationException(
        "Order already paid",
        undefined,
        "La orden ya fue cobrada: la cancelación y el reembolso se hacen desde Mercado Pago o tu banco."
      )
    }

    const now = new Date().toISOString()
    const cleanReason = reason?.trim() || null

    const updated = await orderService.transitionStatus(
      order.id,
      ["pending", "in_process", "rejected", "cancelled"],
      {
        collection_status: "cancelled",
        cancelled_at: now,
        cancellation_reason: cleanReason,
        expires_at: null,
        updated_at: now,
      }
    )

    if (!updated) {
      throw new ValidationException(
        "Order not cancellable",
        undefined,
        "La orden cambió de estado, refrescá la página."
      )
    }

    await shippingService
      .updateShipping(order.id, { shipping_status: "cancelled" })
      .catch((error) => console.error("[Payment:cancelShipping]", error))

    await this.notifyCustomerOrderClosed(updated, "cancelled", cleanReason)
  }

  /** Reintenta manualmente la creación del envío en Correo Argentino. */
  async retryCorreoImport(
    orderId: string
  ): Promise<{ trackingNumber: string | null }> {
    await this.requireAdmin()
    const order = await orderService.getOrderById(orderId)

    if (order.collection_status !== "approved") {
      throw new ValidationException(
        "Not paid",
        undefined,
        "La orden todavía no está aprobada."
      )
    }

    const shipping = await shippingService.findShippingByOrderId(order.id)

    if (!shipping || !shouldUseCorreoArgentino(shipping.shipping_method)) {
      throw new ValidationException(
        "No CA shipment",
        undefined,
        "Esta orden no lleva envío por Correo Argentino."
      )
    }

    const result = await this.tryImportShipmentToCorreo(order, shipping, {
      throwOnError: true,
    })

    return { trackingNumber: result.trackingNumber }
  }

  /** Carga manual del número de seguimiento (si la API no lo devolvió). */
  async setTrackingNumber(
    orderId: string,
    trackingNumber: string
  ): Promise<void> {
    await this.requireAdmin()

    const clean = trackingNumber.trim().toUpperCase()

    if (!/^[A-Z0-9-]{6,30}$/.test(clean)) {
      throw new ValidationException(
        "Invalid tracking",
        undefined,
        "El número de seguimiento no parece válido (6 a 30 letras o números)."
      )
    }

    const shipping = await shippingService.getShippingByOrderId(orderId)

    await shippingService.updateShipping(orderId, {
      tracking_number: clean,
      tracking_url:
        shipping.tracking_url && shipping.tracking_url.startsWith("https://")
          ? shipping.tracking_url
          : "https://www.correoargentino.com.ar/formularios/ondnc",
      imported_at: shipping.imported_at ?? new Date().toISOString(),
      import_error: null,
    })
  }

  // ===========================================================================
  // Correo Argentino
  // ===========================================================================

  /**
   * Importa el envío a MiCorreo. Registra intentos y errores en `shipping` para
   * que el cron reintente y el admin vea qué pasó; avisa por mail al admin si
   * el problema persiste.
   */
  async tryImportShipmentToCorreo(
    order: Order,
    shipping: Shipping,
    options: { throwOnError?: boolean } = {}
  ): Promise<{ ok: boolean; trackingNumber: string | null; error?: string }> {
    const attempts = (shipping.import_attempts ?? 0) + 1

    try {
      const [user, orderItems] = await Promise.all([
        userService.getUserById(order.user_id),
        orderItemsService.getOrderItemsByOrderId(order.id),
      ])

      const result = await correoArgentinoService.importShipment({
        order,
        shipping,
        orderItems,
        recipientName: user.name,
        recipientEmail: user.email,
      })

      // Si MiCorreo no devuelve tracking en el alta, el envío igual quedó
      // importado: se marca para no duplicarlo y el admin puede cargar el
      // número a mano desde el dashboard.
      await shippingService.updateShipping(order.id, {
        tracking_number: result?.trackingNumber ?? shipping.tracking_number ?? null,
        tracking_url: result?.trackingUrl ?? shipping.tracking_url ?? null,
        imported_at: new Date().toISOString(),
        import_attempts: attempts,
        import_error: null,
      })

      return { ok: true, trackingNumber: result?.trackingNumber ?? null }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)

      console.error("[CorreoArgentino:importShipment]", {
        orderId: order.id,
        shippingMethod: shipping.shipping_method,
        attempts,
        error,
      })

      await shippingService
        .updateShipping(order.id, {
          import_attempts: attempts,
          import_error: message,
        })
        .catch((updateError) =>
          console.error("[CorreoArgentino:importShipment] update", updateError)
        )

      if (
        attempts >= MAX_IMPORT_ATTEMPTS_BEFORE_ALERT &&
        !shipping.import_alert_sent
      ) {
        await this.sendAdminAlert({
          title: `No se pudo crear el envío en Correo Argentino (#${orderShortId(order.id)})`,
          severity: "critical",
          summary:
            "El pago está aprobado pero el envío no se pudo importar a MiCorreo. Podés reintentarlo desde el dashboard o cargarlo manualmente en MiCorreo.",
          details: [
            { label: "Orden", value: orderShortId(order.id) },
            { label: "Intentos", value: String(attempts) },
            { label: "Error", value: message },
          ],
          ctaLabel: "Abrir ventas",
          ctaUrl: dashboardOrdersUrl(),
        })

        await shippingService
          .updateShipping(order.id, { import_alert_sent: true })
          .catch(() => {})
      }

      if (options.throwOnError) {
        throw new ValidationException(
          message,
          undefined,
          `Correo Argentino rechazó el envío: ${message}`
        )
      }

      return { ok: false, trackingNumber: null, error: message }
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async requireUser(): Promise<SessionUser> {
    const user = await userService.getUser()

    if (!user) {
      throw new AuthMissingUserException(
        "No hay una sesión iniciada",
        "No hay una sesión iniciada"
      )
    }

    return user
  }

  private async requireAdmin(): Promise<SessionUser> {
    const user = await this.requireUser()

    if (user.role !== "admin") {
      throw new ForbiddenException(
        "Admin role required",
        "Solo los administradores pueden realizar esta acción."
      )
    }

    return user
  }

  private buildExternalReference(userId: string): string {
    return `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
  }

  /**
   * Arma el carrito SOLO con datos de la base (precio, nombre, SKU): nunca se
   * confía en lo que manda el navegador salvo id, cantidad, color y talle.
   */
  private async prepareCart(lines: CartLine[]): Promise<PreparedCart> {
    if (lines.length === 0 || lines.length > MAX_CART_LINES) {
      throw new ValidationException(
        "Invalid cart size",
        undefined,
        "El carrito está vacío o tiene demasiados productos."
      )
    }

    const cart: PreparedCart = { subtotal: 0, mpItems: [], orderItems: [] }

    for (const cartItem of lines) {
      if (!cartItem.id) {
        throw new ValidationException(
          "Missing product id",
          undefined,
          "ID de producto no proporcionado"
        )
      }

      if (
        !Number.isInteger(cartItem.quantity) ||
        cartItem.quantity < 1 ||
        cartItem.quantity > MAX_ITEM_QUANTITY
      ) {
        throw new ValidationException(
          "Invalid quantity",
          undefined,
          `La cantidad por producto debe estar entre 1 y ${MAX_ITEM_QUANTITY}.`
        )
      }

      const product = await productService.getProductById(cartItem.id)

      if (!product) {
        throw new ProductNotFoundException(
          "Producto no encontrado",
          "Producto no encontrado"
        )
      }

      if (!Number.isFinite(product.price) || product.price <= 0) {
        throw new ValidationException(
          `Invalid price for product ${product.id}`,
          undefined,
          `"${product.name}" no está disponible para la compra en este momento.`
        )
      }

      this.assertVariantExists(product, cartItem)

      cart.subtotal += product.price * cartItem.quantity

      cart.mpItems.push({
        id: `${product.id}-${Date.now()}`,
        title: product.name,
        quantity: cartItem.quantity,
        unit_price: product.price,
        currency_id: "ARS",
      })

      cart.orderItems.push({
        product_id: product.id,
        color: cartItem.color,
        size: cartItem.size,
        product_name: product.name,
        quantity: cartItem.quantity,
        unit_price: product.price,
        sku: product.sku,
      })
    }

    return cart
  }

  /** El color/talle del carrito tiene que existir en el producto. */
  private assertVariantExists(product: Product, line: CartLine): void {
    const normalize = (value: string) => value.trim().toLowerCase()

    const colors = Array.isArray(product.color) ? product.color : []
    const sizes = Array.isArray(product.size?.talles) ? product.size.talles : []

    if (
      colors.length > 0 &&
      !colors.some((color) => normalize(color) === normalize(line.color))
    ) {
      throw new ValidationException(
        `Invalid color ${line.color} for product ${product.id}`,
        undefined,
        `El color elegido de "${product.name}" ya no está disponible.`
      )
    }

    if (
      sizes.length > 0 &&
      !sizes.some((size) => normalize(size) === normalize(line.size))
    ) {
      throw new ValidationException(
        `Invalid size ${line.size} for product ${product.id}`,
        undefined,
        `El talle elegido de "${product.name}" ya no está disponible.`
      )
    }
  }

  /**
   * El costo de envío SIEMPRE lo calcula el servidor. El valor que manda el
   * navegador (`shipping_cost`) se ignora: antes cualquiera podía pagar $0 de envío.
   */
  private async resolveShippingCost(
    body: CreatePreferenceValues,
    cart: PreparedCart
  ): Promise<number> {
    if (isStorePickup(body.shipping_method)) {
      return 0
    }

    const quote = await correoArgentinoService.quoteShipping({
      deliveryMethod: body.shipping_method,
      destinationPostalCode: String(body.postal_code),
      items: cart.orderItems.map((item) => ({
        id: item.product_id,
        quantity: item.quantity,
      })),
    })

    return Math.max(0, Math.round(quote.cost))
  }

  /** Dirección, ítems y envío de una orden recién creada. */
  private async persistOrderRecords(params: {
    user: SessionUser
    order: Order
    body: CreatePreferenceValues
    cart: PreparedCart
    shippingCost: number
    shippingStatus: Shipping["shipping_status"]
  }): Promise<void> {
    const { user, order, body, cart, shippingCost, shippingStatus } = params
    const store = isStorePickup(body.shipping_method)

    if (body.save_info && !store) {
      await addressesService.createAddress({
        address: body.address,
        details: body.details,
        postal_code: Number(body.postal_code),
        city: body.city,
        state: body.state,
        phone: body.phone,
        identifier: Number(body.identifier),
        order_id: order.id,
        user_id: user.id,
      })
    }

    for (const item of cart.orderItems) {
      try {
        await orderItemsService.createOrderItem({
          order_id: order.id,
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          currency: "ARS" as const,
          quantity: item.quantity,
          unit_price: item.unit_price,
          color: item.color,
          size: item.size,
        })
      } catch (error) {
        throw new OrderItemsCreationException(
          (error as Error).message,
          "Error al crear el item de la orden. Por favor intente nuevamente."
        )
      }
    }

    const shippingPayload: CreateShippingValues = store
      ? {
          address: "Retiro en tienda",
          details:
            body.shipping_method === "store" && order.payment_type === CASH_STORE_PAYMENT_TYPE
              ? "Pago en efectivo al retirar"
              : "Retiro en tienda",
          postal_code: 0,
          city: "",
          state: "",
          phone: body.phone,
          identifier: Number(body.identifier),
          order_id: order.id,
          user_id: user.id,
          shipping_method: body.shipping_method,
          shipping_cost: 0,
          shipping_status: shippingStatus,
          provider: "CA",
        }
      : {
          address: body.address,
          details: buildShippingDetails(body.details, {
            code: body.agency_code || "",
            name: body.agency_name || body.agency_code || "",
            address: body.agency_address || "",
          }),
          postal_code: Number(body.postal_code),
          city: body.city,
          state: body.state,
          phone: body.phone,
          identifier: Number(body.identifier),
          order_id: order.id,
          user_id: user.id,
          shipping_method: body.shipping_method,
          shipping_cost: shippingCost,
          shipping_status: shippingStatus,
          provider: "CA",
        }

    await shippingService.createShipping(shippingPayload)
  }

  /** Mail al admin con los datos reales (items y envío) leídos de la base. */
  private async notifyAdminAboutOrder(
    order: Order,
    variant: "sale_confirmed" | "transfer_proof_received" | "cash_pickup_reserved",
    proofUrl?: string | null
  ): Promise<void> {
    try {
      const [customer, orderItems, shipping] = await Promise.all([
        userService.getUserById(order.user_id),
        orderItemsService.getOrderItemsByOrderId(order.id),
        shippingService.findShippingByOrderId(order.id),
      ])

      await emailService.sendAdminOrderNotificationEmail({
        customerName: customer.name,
        customerEmail: customer.email,
        order,
        orderItems,
        shipping,
        variant,
        proofUrl,
      })
    } catch (error) {
      console.error("[Payment:adminEmail]", { orderId: order.id, variant, error })
    }
  }

  private async sendAdminAlert(
    props: Parameters<EmailService["sendAdminAlertEmail"]>[0]
  ): Promise<void> {
    try {
      await emailService.sendAdminAlertEmail(props)
    } catch (error) {
      console.error("[Payment:adminAlert]", { title: props.title, error })
    }
  }

  async notifyCustomerOrderClosed(
    order: Order,
    variant: "expired" | "cancelled" | "refunded",
    reason?: string | null
  ): Promise<void> {
    try {
      const customer = await userService.getUserById(order.user_id)
      await emailService.sendOrderCancelledEmail({
        email: customer.email,
        name: customer.name,
        order,
        variant,
        reason,
      })
    } catch (error) {
      console.error("[Payment:orderClosedEmail]", {
        orderId: order.id,
        variant,
        error,
      })
    }
  }

  private async cleanupFailedOrderCreation(orderId: string): Promise<void> {
    const supabase = createAdminClient()

    const cleanups = [
      supabase.from("addresses").delete().eq("order_id", orderId),
      supabase.from("order_items").delete().eq("order_id", orderId),
      supabase.from("shipping").delete().eq("order_id", orderId),
    ]

    for (const cleanup of cleanups) {
      const { error } = await cleanup
      if (error) {
        console.error("Error cleaning up order resources:", orderId, error)
      }
    }

    const { error } = await supabase.from("orders").delete().eq("id", orderId)
    if (error) {
      console.error("Error cleaning up order:", orderId, error)
    }
  }

  private logMercadoPagoError(
    context: string,
    error: unknown,
    extra: Record<string, unknown> = {}
  ): void {
    const mpError = error as {
      message?: string
      status?: number
      cause?: unknown
      response?: { status?: number; data?: unknown }
    }

    console.error(`[MercadoPago:${context}]`, {
      message: mpError?.message || "Unknown MercadoPago error",
      status: mpError?.status || mpError?.response?.status || null,
      cause: mpError?.cause || null,
      response: mpError?.response?.data || null,
      ...extra,
    })
  }
}

function currencyLabel(currency?: string | null): string {
  return currency || "ARS"
}
