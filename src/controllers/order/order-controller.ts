"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireSelfOrAdmin } from "@/lib/auth/session"
import { OrderService } from "@/services/orders/order-service"
import { Order } from "@/types/order/order"

const orderService = new OrderService()

export const getOrders = async (userId: string) => {
  return actionHandler(async () => {
    await requireSelfOrAdmin(userId)

    const orders = await orderService.getOrders(userId)

    return orders as Order[]
  })
}
