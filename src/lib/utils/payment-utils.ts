export const MERCADO_PAGO_PAYMENT_TYPE = "mercadopago"
export const BANK_TRANSFER_PAYMENT_TYPE = "bank_transfer"
export const CASH_STORE_PAYMENT_TYPE = "cash_store"
export const BANK_TRANSFER_DISCOUNT_RATE = 0.1
export const CASH_STORE_DISCOUNT_RATE = 0.2

/** Tiempo que tiene el cliente para transferir y subir el comprobante (configurable). */
export const TRANSFER_PAYMENT_WINDOW_MS =
  (Number(process.env.NEXT_PUBLIC_TRANSFER_WINDOW_MINUTES) || 60) * 60 * 1000

export const BANK_TRANSFER_DISCOUNT_PERCENT_LABEL = `${Math.round(
  BANK_TRANSFER_DISCOUNT_RATE * 100
)}%`
export const CASH_STORE_DISCOUNT_PERCENT_LABEL = `${Math.round(
  CASH_STORE_DISCOUNT_RATE * 100
)}%`

export function calculateBankTransferDiscount(subtotal: number): number {
  return Math.round(Math.max(0, subtotal) * BANK_TRANSFER_DISCOUNT_RATE)
}

export function calculateBankTransferTotal(
  subtotal: number,
  shippingCost: number
): number {
  const discount = calculateBankTransferDiscount(subtotal)

  return Math.max(0, subtotal - discount + Math.max(0, shippingCost))
}

export function calculateCashStoreDiscount(subtotal: number): number {
  return Math.round(Math.max(0, subtotal) * CASH_STORE_DISCOUNT_RATE)
}

export function calculateCashStoreTotal(subtotal: number): number {
  const discount = calculateCashStoreDiscount(subtotal)

  return Math.max(0, subtotal - discount)
}

export function getPaymentTypeLabel(paymentType?: string | null): string {
  if (paymentType === MERCADO_PAGO_PAYMENT_TYPE) {
    return "Mercado Pago"
  }

  if (paymentType === BANK_TRANSFER_PAYMENT_TYPE) {
    return "Transferencia bancaria"
  }

  if (paymentType === CASH_STORE_PAYMENT_TYPE) {
    return "Efectivo en tienda"
  }

  return paymentType || "Sin método"
}
