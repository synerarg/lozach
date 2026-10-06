import {
  OrderCreationException,
  OrderFetchException,
  OrderNotFoundException,
  OrderUpdateException,
} from "@/exceptions/orders/orders-exceptions"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@/lib/supabase/admin-client"
import {
  CreateOrderValues,
  Order,
  OrderWithItems,
  UpdateOrderValues,
} from "@/types/order/order"

export class OrderRepository {
  async createOrder(order: CreateOrderValues): Promise<Order> {
    const supabase = createAdminClient()

    const { error, data } = await supabase
      .from("orders")
      .insert(order)
      .select()
      .single()

    if (error) {
      throw new OrderCreationException(error.message, "Error al crear la orden")
    }

    return data as Order
  }

  async getOrderByExternalReference(
    external_reference: string
  ): Promise<Order> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("external_reference", external_reference)
      .single()

    if (error) {
      throw new OrderNotFoundException(error.message, "Orden no encontrada")
    }

    if (!data) {
      throw new OrderNotFoundException(
        "Orden no encontrada",
        "Orden no encontrada"
      )
    }

    return data as Order
  }

  async getOrderByExternalReferenceAdmin(
    external_reference: string
  ): Promise<Order> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("external_reference", external_reference)
      .single()

    if (error) {
      throw new OrderNotFoundException(error.message, "Orden no encontrada")
    }

    if (!data) {
      throw new OrderNotFoundException(
        "Orden no encontrada",
        "Orden no encontrada"
      )
    }

    return data as Order
  }

  async updateOrder(id: string, order: UpdateOrderValues): Promise<void> {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from("orders")
      .update(order)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      throw new OrderUpdateException(
        error.message,
        "Error al actualizar la orden"
      )
    }

    return
  }

  async getOrderById(id: string): Promise<Order> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      throw new OrderNotFoundException(error.message, "Orden no encontrada")
    }

    if (!data) {
      throw new OrderNotFoundException(
        "Orden no encontrada",
        "Orden no encontrada"
      )
    }

    return data as Order
  }

  async getOrderWithItemsById(id: string): Promise<OrderWithItems> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), shipping(*)")
      .eq("id", id)
      .single()

    if (error) {
      throw new OrderNotFoundException(error.message, "Orden no encontrada")
    }

    if (!data) {
      throw new OrderNotFoundException(
        "Orden no encontrada",
        "Orden no encontrada"
      )
    }

    return data as OrderWithItems
  }

  async getAllOrders(): Promise<OrderWithItems[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*), shipping(*)")
      .order("created_at", { ascending: false })

    if (error) {
      throw new OrderFetchException(
        error.message,
        "Error al obtener las órdenes"
      )
    }

    return (data as OrderWithItems[]) || []
  }

  async getOrders(userId: string): Promise<Order[]> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      throw new OrderFetchException(
        error.message,
        "Error al obtener las órdenes"
      )
    }

    if (!data || data.length === 0) {
      throw new OrderNotFoundException(
        "Órdenes no encontradas",
        "Órdenes no encontradas"
      )
    }

    return data as Order[]
  }

  /**
   * Marca la orden como aprobada SOLO si todavía no lo estaba. Devuelve la orden
   * actualizada si esta llamada ganó la transición, o null si otra ya la hizo
   * (webhook duplicado / carrera con aprobación manual). Evita doble envío de
   * mails y doble importación a Correo Argentino.
   */
  async claimApproval(
    id: string,
    values: UpdateOrderValues
  ): Promise<Order | null> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .update({ ...values, collection_status: "approved" })
      .eq("id", id)
      .or("collection_status.is.null,collection_status.neq.approved")
      .select()

    if (error) {
      throw new OrderUpdateException(
        error.message,
        "Error al actualizar la orden"
      )
    }

    return data && data.length > 0 ? (data[0] as Order) : null
  }

  /** Cambia el estado de pago solo si la orden sigue en alguno de `fromStatuses`. */
  async transitionStatus(
    id: string,
    fromStatuses: string[],
    values: UpdateOrderValues
  ): Promise<Order | null> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .update(values)
      .eq("id", id)
      .in("collection_status", fromStatuses)
      .select()

    if (error) {
      throw new OrderUpdateException(
        error.message,
        "Error al actualizar la orden"
      )
    }

    return data && data.length > 0 ? (data[0] as Order) : null
  }

  /** Reclama el envío del mail de confirmación (true si lo ganó esta llamada). */
  async claimConfirmationEmail(id: string): Promise<boolean> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .update({ email_sent: true })
      .eq("id", id)
      .or("email_sent.is.null,email_sent.eq.false")
      .select("id")

    if (error) {
      throw new OrderUpdateException(
        error.message,
        "Error al actualizar la orden"
      )
    }

    return Boolean(data && data.length > 0)
  }

  async releaseConfirmationEmail(id: string): Promise<void> {
    const supabase = createAdminClient()
    await supabase.from("orders").update({ email_sent: false }).eq("id", id)
  }

  /** Reclama el aviso al admin de venta confirmada (true si lo ganó esta llamada). */
  async claimAdminNotification(id: string): Promise<boolean> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .update({ admin_notified_at: new Date().toISOString() })
      .eq("id", id)
      .is("admin_notified_at", null)
      .select("id")

    if (error) {
      throw new OrderUpdateException(
        error.message,
        "Error al actualizar la orden"
      )
    }

    return Boolean(data && data.length > 0)
  }

  /** Órdenes sin pagar cuyo plazo venció (para el cron de expiración). */
  async findExpiredUnpaidOrders(limit = 100): Promise<Order[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("collection_status", ["pending", "in_process"])
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true })
      .limit(limit)

    if (error) {
      throw new OrderFetchException(
        error.message,
        "Error al obtener las órdenes vencidas"
      )
    }

    return (data as Order[]) || []
  }

  /** Orden de un usuario por referencia externa (evita IDOR en consultas del cliente). */
  async getOrderByExternalReferenceForUser(
    external_reference: string,
    userId: string
  ): Promise<Order> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("external_reference", external_reference)
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) {
      throw new OrderNotFoundException(
        error?.message || "Orden no encontrada",
        "Orden no encontrada"
      )
    }

    return data as Order
  }

  /** Órdenes aprobadas recientes a las que todavía no se les mandó el mail de confirmación. */
  async findApprovedWithoutConfirmationEmail(
    limit = 20,
    sinceDays = 3
  ): Promise<Order[]> {
    const supabase = createAdminClient()
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("collection_status", "approved")
      .or("email_sent.is.null,email_sent.eq.false")
      .gte("processed_at", since.toISOString())
      .order("processed_at", { ascending: true })
      .limit(limit)

    if (error) {
      throw new OrderFetchException(
        error.message,
        "Error al obtener las órdenes sin mail de confirmación"
      )
    }

    return (data as Order[]) || []
  }
}
