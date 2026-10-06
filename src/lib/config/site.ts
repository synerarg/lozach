/**
 * Datos de marca / contacto centralizados. Todo lo que antes estaba hardcodeado
 * en templates y servicios (URLs, mails, redes) sale de acá.
 */

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://lozachurban.store"
).replace(/\/$/, "")

export const BRAND_NAME = "Lozach"

export const LOGO_URL = `${SITE_URL}/logo-big.png`

export const INSTAGRAM_URL = "https://instagram.com/lozachurban"

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "lozacharg@gmail.com"

export const ADMIN_NOTIFICATION_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL ||
  process.env.ORDER_NOTIFICATION_EMAIL ||
  "lozacharg@gmail.com"

export const EMAIL_FROM = {
  orders: `${BRAND_NAME} <compras@lozachurban.store>`,
  newsletter: `${BRAND_NAME} <newsletter@lozachurban.store>`,
  alerts: `${BRAND_NAME} Alertas <compras@lozachurban.store>`,
}

export const STORE_PICKUP_INFO =
  process.env.NEXT_PUBLIC_STORE_PICKUP_INFO ||
  "Te vamos a confirmar por mail el horario y la dirección para retirar."

/** Ventana (ms) en la que un pedido de Mercado Pago queda "pendiente" antes de expirar. */
export const MERCADO_PAGO_ORDER_WINDOW_MS = 2 * 60 * 60 * 1000

/** Máximos de carrito (defensa contra abuso / errores de cantidad). */
export const MAX_ITEM_QUANTITY = 20
export const MAX_CART_LINES = 30

export function orderShortId(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase()
}

export function orderUrl(): string {
  return `${SITE_URL}/profile/my-orders`
}

export function dashboardOrdersUrl(): string {
  return `${SITE_URL}/dashboard/orders`
}
