import { OrderItem } from "@/types/order-items/order-items"
import { Shipping } from "@/types/shipping/shipping"

export interface OrderCustomer {
  name: string
  email: string
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
  shipping?: Shipping[]
  customer?: OrderCustomer | null
  /** URL firmada (temporal) del comprobante, solo para admins. */
  payment_proof_signed_url?: string | null
}

export type PaymentProofStatus = "pending_review" | "approved" | "rejected"

export interface Order {
  id: string
  created_at: string
  updated_at: string
  total_amount: number
  subtotal: number
  user_id: string
  payment_id: string | null
  payment_type: string | null
  collection_id: string | null
  collection_status: string | null
  external_reference: string | null
  currency: string
  phone: string
  email_sent?: boolean
  processed_at?: string | null
  expires_at?: string | null
  payment_proof_url?: string | null
  payment_proof_uploaded_at?: string | null
  payment_proof_status?: PaymentProofStatus | null
  payment_proof_reviewed_at?: string | null
  payment_proof_reviewed_by?: string | null
  payment_proof_rejection_reason?: string | null
  reserved_at?: string | null
  admin_notified_at?: string | null
  payment_status_detail?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string | null
}

export interface CreateOrderValues {
  total_amount: number
  subtotal: number
  user_id: string
  payment_id: string | null
  payment_type: string | null
  collection_id: string | null
  collection_status: string | null
  external_reference: string | null
  currency: string
  phone: string
  expires_at?: string | null
}

export interface UpdateOrderValues {
  total_amount?: number
  subtotal?: number
  payment_id?: string
  payment_type?: string
  collection_id?: string
  collection_status?: string
  external_reference?: string
  phone?: string
  email_sent?: boolean
  processed_at?: string | null
  expires_at?: string | null
  updated_at?: string | null
  payment_proof_url?: string | null
  payment_proof_uploaded_at?: string | null
  payment_proof_status?: PaymentProofStatus | null
  payment_proof_reviewed_at?: string | null
  payment_proof_reviewed_by?: string | null
  payment_proof_rejection_reason?: string | null
  reserved_at?: string | null
  admin_notified_at?: string | null
  payment_status_detail?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string | null
}

/** Estados de pago que puede tener una orden (collection_status). */
export type OrderPaymentStatus =
  | "pending"
  | "in_process"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back"

/** Estados en los que la orden ya no puede volver a "approved" por error. */
export const FINAL_PAYMENT_STATUSES: ReadonlyArray<string> = [
  "approved",
  "refunded",
  "charged_back",
]
