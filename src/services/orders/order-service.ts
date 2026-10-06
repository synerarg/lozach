import { OrderRepository } from "@/repositories/orders/order-repository"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"
import { StorageService } from "@/services/storage/storage-service"
import {
  CreateOrderValues,
  Order,
  OrderCustomer,
  OrderWithItems,
  UpdateOrderValues,
} from "@/types/order/order"

export class OrderService {
  private readonly orderRepository: OrderRepository
  private readonly storageService: StorageService

  constructor(orderRepository?: OrderRepository) {
    this.orderRepository = orderRepository || new OrderRepository()
    this.storageService = new StorageService()
  }

  async createOrder(order: CreateOrderValues): Promise<Order> {
    const orderData = await this.orderRepository.createOrder(order)

    return orderData as Order
  }

  async getOrderByExternalReference(
    external_reference: string
  ): Promise<Order> {
    const orderData = await this.orderRepository.getOrderByExternalReference(
      external_reference
    )

    return orderData
  }

  async getOrderByExternalReferenceAdmin(
    external_reference: string
  ): Promise<Order> {
    return await this.orderRepository.getOrderByExternalReferenceAdmin(
      external_reference
    )
  }

  /** Orden por referencia, garantizando que pertenece al usuario indicado. */
  async getOrderByExternalReferenceForUser(
    external_reference: string,
    userId: string
  ): Promise<Order> {
    return await this.orderRepository.getOrderByExternalReferenceForUser(
      external_reference,
      userId
    )
  }

  async getOrderById(id: string): Promise<Order> {
    return await this.orderRepository.getOrderById(id)
  }

  async getOrderWithItemsById(id: string): Promise<OrderWithItems> {
    const order = await this.orderRepository.getOrderWithItemsById(id)
    const [enriched] = await this.enrichForAdmin([order])
    return enriched
  }

  async updateOrder(id: string, order: UpdateOrderValues): Promise<void> {
    return await this.orderRepository.updateOrder(id, order)
  }

  async claimApproval(
    id: string,
    values: UpdateOrderValues
  ): Promise<Order | null> {
    return await this.orderRepository.claimApproval(id, values)
  }

  async transitionStatus(
    id: string,
    fromStatuses: string[],
    values: UpdateOrderValues
  ): Promise<Order | null> {
    return await this.orderRepository.transitionStatus(id, fromStatuses, values)
  }

  async claimConfirmationEmail(id: string): Promise<boolean> {
    return await this.orderRepository.claimConfirmationEmail(id)
  }

  async releaseConfirmationEmail(id: string): Promise<void> {
    return await this.orderRepository.releaseConfirmationEmail(id)
  }

  async claimAdminNotification(id: string): Promise<boolean> {
    return await this.orderRepository.claimAdminNotification(id)
  }

  async findExpiredUnpaidOrders(limit?: number): Promise<Order[]> {
    return await this.orderRepository.findExpiredUnpaidOrders(limit)
  }

  async findApprovedWithoutConfirmationEmail(limit?: number): Promise<Order[]> {
    return await this.orderRepository.findApprovedWithoutConfirmationEmail(limit)
  }

  /** Todas las órdenes con cliente y comprobante firmado (solo uso admin). */
  async getAllOrders(): Promise<OrderWithItems[]> {
    const orders = await this.orderRepository.getAllOrders()
    return await this.enrichForAdmin(orders)
  }

  async getOrders(userId: string): Promise<Order[]> {
    const orders = await this.orderRepository.getOrders(userId)

    return orders as Order[]
  }

  /**
   * Agrega datos del cliente (nombre/email) y reemplaza el comprobante por una
   * URL firmada temporal: el bucket es privado y no se expone la ruta cruda.
   */
  private async enrichForAdmin(
    orders: OrderWithItems[]
  ): Promise<OrderWithItems[]> {
    if (orders.length === 0) {
      return orders
    }

    const customers = new Map<string, OrderCustomer>()
    const userIds = Array.from(new Set(orders.map((order) => order.user_id)))

    try {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", userIds)

      for (const user of data ?? []) {
        customers.set(user.id as string, {
          name: user.name as string,
          email: user.email as string,
        })
      }
    } catch (error) {
      console.error("[OrderService] error loading customers", error)
    }

    return await Promise.all(
      orders.map(async (order) => ({
        ...order,
        customer: customers.get(order.user_id) ?? null,
        payment_proof_signed_url: await this.storageService.getPaymentProofSignedUrl(
          order.payment_proof_url
        ),
      }))
    )
  }
}
