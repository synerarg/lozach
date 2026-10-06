import React from "react"
import { redirect } from "next/navigation"

import { buildLoginHref } from "@/components/payment/payment-format"
import { getUser } from "@/controllers/auth/auth-controller"
import { getOrderItemsByOrderId } from "@/controllers/order-items/order-items-controller"
import { getOrders } from "@/controllers/order/order-controller"
import { getProductsByIds } from "@/controllers/products/product-controller"
import { getShippingByOrderId } from "@/controllers/shipping/shipping-controller"
import type { OrderItem } from "@/types/order-items/order-items"
import type { Order } from "@/types/order/order"
import type { Shipping } from "@/types/shipping/shipping"

import MyOrdersSection, {
  type CustomerOrder,
  type CustomerShipping,
  type OrderEntry,
  type OrderProduct,
} from "./client-orders"

/** Solo viaja al cliente lo que la pantalla necesita (sin ids de admins ni errores internos). */
function toCustomerOrder(order: Order): CustomerOrder {
  return {
    id: order.id,
    created_at: order.created_at,
    total_amount: order.total_amount,
    subtotal: order.subtotal,
    payment_type: order.payment_type,
    collection_status: order.collection_status,
    external_reference: order.external_reference,
    currency: order.currency,
    expires_at: order.expires_at ?? null,
    payment_proof_status: order.payment_proof_status ?? null,
    payment_proof_uploaded_at: order.payment_proof_uploaded_at ?? null,
    payment_proof_rejection_reason:
      order.payment_proof_rejection_reason ?? null,
  }
}

function toCustomerShipping(shipping: Shipping): CustomerShipping {
  return {
    id: shipping.id,
    shipping_method: shipping.shipping_method,
    shipping_cost: shipping.shipping_cost,
    shipping_status: shipping.shipping_status,
    address: shipping.address,
    details: shipping.details,
    postal_code: shipping.postal_code,
    city: shipping.city,
    state: shipping.state,
    phone: shipping.phone,
    identifier: shipping.identifier,
    tracking_number: shipping.tracking_number ?? null,
    tracking_url: shipping.tracking_url ?? null,
    last_tracking_status: shipping.last_tracking_status ?? null,
    ready_for_pickup_email_sent: shipping.ready_for_pickup_email_sent ?? false,
  }
}

async function loadOrderDetails(order: Order): Promise<{
  order: Order
  items: OrderItem[] | null
  shipping: Shipping | null
}> {
  // Items y envío en paralelo; si uno falla, el pedido igual se muestra.
  const [itemsResult, shippingResult] = await Promise.allSettled([
    getOrderItemsByOrderId(order.id),
    getShippingByOrderId(order.id),
  ])

  const items =
    itemsResult.status === "fulfilled" &&
    itemsResult.value.success &&
    itemsResult.value.data
      ? itemsResult.value.data
      : null

  const shipping =
    shippingResult.status === "fulfilled" &&
    shippingResult.value.success &&
    shippingResult.value.data
      ? shippingResult.value.data
      : null

  return { order, items, shipping }
}

async function loadProducts(
  productIds: number[]
): Promise<Map<number, OrderProduct>> {
  const products = new Map<number, OrderProduct>()
  if (productIds.length === 0) return products

  try {
    // Una sola consulta para todos los pedidos (antes: una por ítem, en serie).
    const result = await getProductsByIds(productIds)

    if (result.success && result.data) {
      for (const product of result.data) {
        products.set(product.id, {
          id: product.id,
          name: product.name,
          image_url: product.image_url ?? null,
          fabric: product.fabric || null,
        })
      }
    }
  } catch (error) {
    // Sin productos igual se muestran los ítems con los datos guardados en el pedido.
    console.error("[my-orders] No se pudieron cargar los productos", error)
  }

  return products
}

const ServerMyOrders = async () => {
  const user = await getUser()

  if (!user.success || !user.data) {
    redirect(buildLoginHref("/profile/my-orders"))
  }

  const ordersResult = await getOrders(user.data.id)

  // "getOrders" responde 404 cuando el usuario todavía no compró nada.
  const hasNoOrders = !ordersResult.success && ordersResult.statusCode === 404
  const loadError =
    !ordersResult.success && !hasNoOrders
      ? "No pudimos cargar tus pedidos en este momento. Probá de nuevo en unos minutos."
      : null

  const orders = ordersResult.success && ordersResult.data ? ordersResult.data : []

  const details = await Promise.all(orders.map(loadOrderDetails))

  const productIds = Array.from(
    new Set(
      details.flatMap(({ items }) => (items ?? []).map((item) => item.product_id))
    )
  )
  const products = await loadProducts(productIds)

  const entries: OrderEntry[] = details.map(({ order, items, shipping }) => ({
    order: toCustomerOrder(order),
    items: (items ?? []).map((orderItem) => ({
      orderItem,
      product: products.get(orderItem.product_id) ?? null,
    })),
    itemsError: items === null,
    shipping: shipping ? toCustomerShipping(shipping) : null,
  }))

  return <MyOrdersSection orders={entries} loadError={loadError} />
}

export default ServerMyOrders
