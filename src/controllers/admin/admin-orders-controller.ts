"use server"

import { actionHandler } from "@/lib/handlers/actionHandler"
import { requireAdminUser } from "@/lib/auth/session"
import { OrderService } from "@/services/orders/order-service"
import { OrderWithItems } from "@/types/order/order"

const orderService = new OrderService()

export const getAllOrders = async () => {
  return actionHandler(async () => {
    await requireAdminUser()
    const orders = await orderService.getAllOrders()
    return orders as OrderWithItems[]
  })
}
