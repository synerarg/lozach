"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireOwnedOrder } from "@/lib/auth/session"
import { OrderItemsService } from "@/services/order-items/order-items-service"
import { OrderItem } from "@/types/order-items/order-items"

const orderItemsService = new OrderItemsService()

export const getOrderItemsByOrderId = async (orderId: string) => {
  return actionHandler(async () => {
    // Antes cualquiera podía leer los ítems de cualquier orden conociendo el id.
    await requireOwnedOrder(orderId)

    const orderItems = await orderItemsService.getOrderItemsByOrderId(orderId)

    return orderItems as OrderItem[]
  })
}
