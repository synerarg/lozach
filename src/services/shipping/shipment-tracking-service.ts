import { AuthService } from "@/services/auth/auth-service"
import {
  CorreoArgentinoService,
  STATUS_RANK,
} from "@/services/shipping/correo-argentino-service"
import { EmailService } from "@/services/email/email-service"
import { OrderService } from "@/services/orders/order-service"
import { ShippingService } from "@/services/shipping/shipping-service"
import { Shipping, UpdateShippingValues } from "@/types/shipping/shipping"
import { dashboardOrdersUrl, orderShortId } from "@/lib/config/site"

const shippingService = new ShippingService()
const correoArgentinoService = new CorreoArgentinoService()
const orderService = new OrderService()
const userService = new AuthService()
const emailService = new EmailService()

export interface ShipmentSyncSummary {
  checked: number
  statusUpdated: number
  inTransitEmails: number
  deliveredEmails: number
  returnedAlerts: number
  errors: number
}

type CustomerEmailKind = "in_transit" | "delivered"

export class ShipmentTrackingService {
  /**
   * Recorre los envíos con tracking que todavía no están en un estado final,
   * consulta Correo Argentino y, ante la primera transición, avanza el estado
   * del envío y notifica al cliente ("en camino" / "entregado"). Si el paquete
   * vuelve al remitente, avisa al admin.
   */
  async syncPendingShipments(limit = 25): Promise<ShipmentSyncSummary> {
    const summary: ShipmentSyncSummary = {
      checked: 0,
      statusUpdated: 0,
      inTransitEmails: 0,
      deliveredEmails: 0,
      returnedAlerts: 0,
      errors: 0,
    }

    const shipments = await shippingService.findShipmentsToSync(limit)

    for (const shipment of shipments) {
      summary.checked++

      try {
        const tracking = await correoArgentinoService.getTracking({
          trackingNumber: shipment.tracking_number as string,
        })

        const now = new Date().toISOString()
        const updates: UpdateShippingValues = { last_synced_at: now }

        if (tracking?.lastEventText) {
          updates.last_tracking_status = tracking.lastEventText
        }

        const mapped = tracking?.status ?? null

        // Avanzar el estado solo hacia adelante (nunca retroceder).
        if (
          mapped &&
          STATUS_RANK[mapped] > STATUS_RANK[shipment.shipping_status]
        ) {
          updates.shipping_status = mapped
          if (mapped === "delivered") {
            updates.delivered_at = now
          }
          summary.statusUpdated++
        }

        // Guardamos primero el estado y recién después avisamos: si un mail
        // falla no se pierde el avance del envío.
        await shippingService.updateShipping(shipment.order_id, updates)

        if (mapped === "cancelled" && shipment.shipping_status !== "cancelled") {
          await this.alertShipmentReturned(shipment)
          summary.returnedAlerts++
        }

        if (mapped === "delivered" && !shipment.delivered_email_sent) {
          if (await this.notifyCustomer(shipment, "delivered")) {
            summary.deliveredEmails++
          }
        } else if (mapped === "shipped" && !shipment.in_transit_email_sent) {
          if (await this.notifyCustomer(shipment, "in_transit")) {
            summary.inTransitEmails++
          }
        }
      } catch (error) {
        summary.errors++
        console.error("[ShipmentTracking:sync]", {
          orderId: shipment.order_id,
          trackingNumber: shipment.tracking_number,
          error,
        })
      }
    }

    return summary
  }

  /**
   * Avisa al cliente del avance del envío. El flag se marca ANTES de mandar el
   * mail (evita duplicados si dos ejecuciones se pisan) y se revierte si falla.
   */
  private async notifyCustomer(
    shipment: Shipping,
    kind: CustomerEmailKind
  ): Promise<boolean> {
    const order = await orderService.getOrderById(shipment.order_id)

    // Solo notificamos pedidos con el pago aprobado.
    if (order.collection_status !== "approved") {
      return false
    }

    const flagUpdate: UpdateShippingValues =
      kind === "delivered"
        ? // Evita un "en camino" tardío si saltó directo a entregado.
          { delivered_email_sent: true, in_transit_email_sent: true }
        : { in_transit_email_sent: true }

    const revertUpdate: UpdateShippingValues =
      kind === "delivered"
        ? {
            delivered_email_sent: false,
            in_transit_email_sent: shipment.in_transit_email_sent ?? false,
          }
        : { in_transit_email_sent: false }

    await shippingService.updateShipping(shipment.order_id, flagUpdate)

    try {
      const customer = await userService.getUserById(shipment.user_id)
      const args = {
        email: customer.email,
        name: customer.name,
        order,
        trackingNumber: shipment.tracking_number,
        trackingUrl: shipment.tracking_url,
      }

      if (kind === "delivered") {
        await emailService.sendShipmentDeliveredEmail(args)
      } else {
        await emailService.sendShipmentInTransitEmail(args)
      }

      return true
    } catch (error) {
      console.error("[ShipmentTracking:email]", {
        orderId: shipment.order_id,
        kind,
        error,
      })
      await shippingService
        .updateShipping(shipment.order_id, revertUpdate)
        .catch(() => {})
      return false
    }
  }

  private async alertShipmentReturned(shipment: Shipping): Promise<void> {
    try {
      await emailService.sendAdminAlertEmail({
        title: `Envío devuelto o cancelado (#${orderShortId(shipment.order_id)})`,
        severity: "warning",
        summary:
          "Correo Argentino informó que el envío fue devuelto, cancelado o no pudo entregarse. Contactá al cliente para coordinar un reenvío.",
        details: [
          { label: "Orden", value: orderShortId(shipment.order_id) },
          { label: "Seguimiento", value: shipment.tracking_number ?? "-" },
        ],
        ctaLabel: "Abrir ventas",
        ctaUrl: dashboardOrdersUrl(),
      })
    } catch (error) {
      console.error("[ShipmentTracking:returnedAlert]", error)
    }
  }
}
