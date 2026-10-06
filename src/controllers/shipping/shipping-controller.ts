"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireOwnedOrder } from "@/lib/auth/session"
import { ShippingService } from "@/services/shipping/shipping-service"
import { Shipping } from "@/types/shipping/shipping"

const shippingService = new ShippingService()

export const getShippingByOrderId = async (orderId: string) => {
  return actionHandler(async () => {
    // El envío contiene dirección, DNI y teléfono: solo dueño de la orden o admin.
    await requireOwnedOrder(orderId)

    const shipping = await shippingService.getShippingByOrderId(orderId)
    return shipping as Shipping
  })
}
