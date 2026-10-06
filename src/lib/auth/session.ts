import { AuthService } from "@/services/auth/auth-service"
import { OrderService } from "@/services/orders/order-service"
import {
  ForbiddenException,
  UnauthorizedException,
} from "@/exceptions/base/base-exceptions"
import { PublicUser } from "@/types/auth/types"
import { Order } from "@/types/order/order"

const authService = new AuthService()
const orderService = new OrderService()

/** Usuario logueado o 401. Las server actions son endpoints públicos: siempre validar acá. */
export async function requireSessionUser(): Promise<PublicUser> {
  try {
    return await authService.getUser()
  } catch {
    throw new UnauthorizedException(
      "No active session",
      "Tenés que iniciar sesión para continuar."
    )
  }
}

export async function requireAdminUser(): Promise<PublicUser> {
  const user = await requireSessionUser()

  if (user.role !== "admin") {
    throw new ForbiddenException(
      "Admin role required",
      "Solo los administradores pueden realizar esta acción."
    )
  }

  return user
}

/** Garantiza que `userId` sea el del usuario logueado (o que sea admin). */
export async function requireSelfOrAdmin(userId: string): Promise<PublicUser> {
  const user = await requireSessionUser()

  if (user.id !== userId && user.role !== "admin") {
    throw new ForbiddenException(
      "Access to another user's data",
      "No tenés permiso para ver esta información."
    )
  }

  return user
}

/** Devuelve la orden solo si es del usuario logueado (o si es admin). */
export async function requireOwnedOrder(orderId: string): Promise<Order> {
  const user = await requireSessionUser()
  const order = await orderService.getOrderById(orderId)

  if (order.user_id !== user.id && user.role !== "admin") {
    throw new ForbiddenException(
      "Order does not belong to user",
      "No tenés permiso para ver este pedido."
    )
  }

  return order
}
