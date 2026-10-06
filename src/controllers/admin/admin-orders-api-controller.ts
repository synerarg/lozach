import { OrderService } from "@/services/orders/order-service"
import { requireAdminUser } from "@/lib/auth/session"
import { OrderWithItems } from "@/types/order/order"
import { ApiResponse } from "@/types/base/types"

const orderService = new OrderService()

async function verifyAdminRole() {
  return await requireAdminUser()
}

export async function getAllOrdersAction(): Promise<ApiResponse<OrderWithItems[]>> {
  try {
    await verifyAdminRole()
    const orders = await orderService.getAllOrders()
    return {
      status: 200,
      data: orders,
      message: "Órdenes obtenidas exitosamente",
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Error desconocido"
    return {
      status: 500,
      error: errorMessage,
    }
  }
}
