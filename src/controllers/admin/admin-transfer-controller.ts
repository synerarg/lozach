"use server"

import { revalidatePath } from "next/cache"
import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireAdminUser } from "@/lib/auth/session"
import { PaymentService } from "@/services/payment/payment-service"
import { OrderService } from "@/services/orders/order-service"

const paymentService = new PaymentService()
const orderService = new OrderService()

function refreshOrders() {
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/orders")
}

export const approveBankTransferOrder = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.approveBankTransferOrder(orderId)
    refreshOrders()
    return { ok: true }
  })
}

export const rejectBankTransferOrder = async (
  orderId: string,
  reason: string
) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.rejectBankTransferOrder(orderId, reason)
    refreshOrders()
    return { ok: true }
  })
}

/** Efectivo en tienda: el cliente pagó al retirar. */
export const confirmCashPaymentOrder = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.confirmCashPayment(orderId)
    refreshOrders()
    return { ok: true }
  })
}

/** Retiro en tienda: avisa al cliente por mail que ya puede pasar. */
export const markOrderReadyForPickup = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.markReadyForPickup(orderId)
    refreshOrders()
    return { ok: true }
  })
}

/** Retiro en tienda: el cliente ya retiró el pedido. */
export const markOrderPickedUp = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.markPickedUp(orderId)
    refreshOrders()
    return { ok: true }
  })
}

/** Cancela un pedido que todavía no se cobró (avisa al cliente). */
export const cancelUnpaidOrder = async (orderId: string, reason?: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.cancelUnpaidOrder(orderId, reason)
    refreshOrders()
    return { ok: true }
  })
}

/** Reintenta crear el envío en Correo Argentino. */
export const retryCorreoArgentinoImport = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    const result = await paymentService.retryCorreoImport(orderId)
    refreshOrders()
    return result
  })
}

/** Carga manual del número de seguimiento de Correo Argentino. */
export const setOrderTrackingNumber = async (
  orderId: string,
  trackingNumber: string
) => {
  return actionHandler(async () => {
    await requireAdminUser()
    await paymentService.setTrackingNumber(orderId, trackingNumber)
    refreshOrders()
    return { ok: true }
  })
}

export const getOrderDetailAction = async (orderId: string) => {
  return actionHandler(async () => {
    await requireAdminUser()
    const order = await orderService.getOrderWithItemsById(orderId)
    return order
  })
}
