import { OrderService } from "@/services/orders/order-service"
import { ShippingService } from "@/services/shipping/shipping-service"
import { PaymentService } from "@/services/payment/payment-service"
import { BANK_TRANSFER_PAYMENT_TYPE } from "@/lib/utils/payment-utils"

const orderService = new OrderService()
const shippingService = new ShippingService()
const paymentService = new PaymentService()

export interface MaintenanceSummary {
  expiredOrders: number
  importsRetried: number
  importsSucceeded: number
  confirmationEmailsRetried: number
  errors: number
}

/**
 * Tareas periódicas que dejan el sistema consistente aunque un webhook, un mail
 * o la API de Correo Argentino hayan fallado en el momento.
 */
export class MaintenanceService {
  async run(): Promise<MaintenanceSummary> {
    const summary: MaintenanceSummary = {
      expiredOrders: 0,
      importsRetried: 0,
      importsSucceeded: 0,
      confirmationEmailsRetried: 0,
      errors: 0,
    }

    await this.safely(summary, () => this.expireUnpaidOrders(summary))
    await this.safely(summary, () => this.retryPendingImports(summary))
    await this.safely(summary, () => this.retryConfirmationEmails(summary))

    return summary
  }

  private async safely(
    summary: MaintenanceSummary,
    task: () => Promise<void>
  ): Promise<void> {
    try {
      await task()
    } catch (error) {
      summary.errors++
      console.error("[Maintenance]", error)
    }
  }

  /**
   * Cancela las órdenes sin pagar cuyo plazo venció (antes quedaban "pendientes"
   * para siempre y ensuciaban el dashboard). Un pago que llegue después de
   * vencida la orden igual se aprueba desde el webhook.
   */
  private async expireUnpaidOrders(summary: MaintenanceSummary): Promise<void> {
    const orders = await orderService.findExpiredUnpaidOrders(100)

    for (const order of orders) {
      const now = new Date().toISOString()

      const updated = await orderService.transitionStatus(
        order.id,
        ["pending", "in_process"],
        {
          collection_status: "cancelled",
          cancelled_at: now,
          cancellation_reason: "Venció el plazo de pago",
          expires_at: null,
          updated_at: now,
        }
      )

      if (!updated) {
        continue
      }

      summary.expiredOrders++

      await shippingService
        .updateShipping(order.id, { shipping_status: "cancelled" })
        .catch((error) => console.error("[Maintenance:expire] shipping", error))

      // Solo avisamos a quien dijo que iba a transferir.
      if (order.payment_type === BANK_TRANSFER_PAYMENT_TYPE) {
        await paymentService.notifyCustomerOrderClosed(updated, "expired")
      }
    }
  }

  /** Reintenta crear en Correo Argentino los envíos cobrados que fallaron. */
  private async retryPendingImports(summary: MaintenanceSummary): Promise<void> {
    const pending = await shippingService.findShipmentsPendingImport(20)

    for (const shipping of pending) {
      const order = await orderService.getOrderById(shipping.order_id)

      if (order.collection_status !== "approved") {
        continue
      }

      summary.importsRetried++

      const result = await paymentService.tryImportShipmentToCorreo(
        order,
        shipping
      )

      if (result.ok) {
        summary.importsSucceeded++
      }
    }
  }

  /** Reenvía el mail de confirmación si falló cuando se aprobó el pago. */
  private async retryConfirmationEmails(
    summary: MaintenanceSummary
  ): Promise<void> {
    const orders = await orderService.findApprovedWithoutConfirmationEmail(20)

    for (const order of orders) {
      await paymentService.reconcileApprovedOrder(order)
      summary.confirmationEmailsRetried++
    }
  }
}
