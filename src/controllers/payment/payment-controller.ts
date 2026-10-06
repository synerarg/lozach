"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireSessionUser } from "@/lib/auth/session"
import { CreatePreferenceValues } from "@/types/payment/payment"
import { PaymentService } from "@/services/payment/payment-service"
import { OrderService } from "@/services/orders/order-service"
import { ShippingService } from "@/services/shipping/shipping-service"

const paymentService = new PaymentService()
const orderService = new OrderService()
const shippingService = new ShippingService()

export const createPreference = async (values: CreatePreferenceValues) => {
  return actionHandler(async () => {
    const result = await paymentService.createPreference(values)

    return result
  })
}

export const createBankTransferOrder = async (
  values: CreatePreferenceValues
) => {
  return actionHandler(async () => {
    const result = await paymentService.createBankTransferOrder(values)

    return result
  })
}

export const createCashStoreOrder = async (
  values: CreatePreferenceValues
) => {
  return actionHandler(async () => {
    const result = await paymentService.createCashStoreOrder(values)

    return result
  })
}

export type OrderPaymentSnapshot = {
  /** collection_status de la orden (pending, approved, rejected, ...). */
  status: string | null
  orderId: string
  paymentType: string | null
  totalAmount: number
  currency: string
  createdAt: string
  /** Vencimiento de la reserva/pago (ISO) o null. */
  expiresAt: string | null
  proofStatus: string | null
  proofRejectionReason: string | null
  proofUploadedAt: string | null
  shippingMethod: string | null
  shippingStatus: string | null
  trackingNumber: string | null
}

/**
 * Estado de una orden para las pantallas de pago. Solo devuelve órdenes del
 * usuario logueado (antes cualquiera con la referencia podía consultarla).
 */
export const verifyPaymentStatus = async (externalReference: string) => {
  return actionHandler(async (): Promise<OrderPaymentSnapshot> => {
    const user = await requireSessionUser()
    const order = await orderService.getOrderByExternalReferenceForUser(
      externalReference,
      user.id
    )
    const shipping = await shippingService.findShippingByOrderId(order.id)

    return {
      status: order.collection_status,
      orderId: order.id,
      paymentType: order.payment_type,
      totalAmount: order.total_amount,
      currency: order.currency,
      createdAt: order.created_at,
      expiresAt: order.expires_at ?? null,
      proofStatus: order.payment_proof_status ?? null,
      proofRejectionReason: order.payment_proof_rejection_reason ?? null,
      proofUploadedAt: order.payment_proof_uploaded_at ?? null,
      shippingMethod: shipping?.shipping_method ?? null,
      shippingStatus: shipping?.shipping_status ?? null,
      trackingNumber: shipping?.tracking_number ?? null,
    }
  })
}
