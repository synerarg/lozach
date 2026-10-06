import { Link } from "@react-email/components"
import {
  AdminOrderEmailVariant,
  AdminOrderNotificationBody,
} from "@/types/email/email"
import { getPaymentTypeLabel } from "@/lib/utils/payment-utils"
import { dashboardOrdersUrl, orderShortId } from "@/lib/config/site"
import {
  EmailButton,
  EmailCallout,
  EmailHeading,
  EmailHero,
  EmailInfoCard,
  EmailItem,
  EmailItemsTable,
  EmailLayout,
  EmailSection,
  EmailTone,
  EmailTotalRow,
  EmailTotals,
  emailColors,
  formatMoney,
  isHttpsUrl,
} from "./email-layout"

interface VariantCopy {
  tone: EmailTone
  badge: string
  title: string
  preview: (shortId: string, total: string, customer: string) => string
}

const VARIANTS: Record<AdminOrderEmailVariant, VariantCopy> = {
  sale_confirmed: {
    tone: "success",
    badge: "Venta confirmada",
    title: "Venta confirmada — preparar pedido",
    preview: (id, total, customer) =>
      `Venta confirmada #${id} · ${total} · ${customer}`,
  },
  transfer_proof_received: {
    tone: "warning",
    badge: "Revisar comprobante",
    title: "Comprobante recibido — revisar y aprobar",
    preview: (id, total, customer) =>
      `Comprobante recibido #${id} · ${total} · ${customer}`,
  },
  cash_pickup_reserved: {
    tone: "info",
    badge: "Cobrar en efectivo",
    title: "Pedido a retirar y cobrar en efectivo",
    preview: (id, total, customer) =>
      `Retiro + efectivo #${id} · ${total} · ${customer}`,
  },
}

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  home: "Envío a domicilio",
  branch: "Sucursal Correo Argentino",
  express: "Envío express",
  store: "Retiro en tienda",
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  in_process: "En proceso",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Contracargo",
}

export default function AdminOrderNotificationEmail({
  customerName,
  customerEmail,
  order,
  orderItems,
  shipping,
  variant = "sale_confirmed",
  proofUrl,
}: AdminOrderNotificationBody) {
  const copy = VARIANTS[variant]
  const shortId = orderShortId(order.id)
  const total = formatMoney(order.total_amount, order.currency)
  const shippingAmount = shipping?.shipping_cost || 0
  const discountAmount = Math.max(
    0,
    order.subtotal + shippingAmount - order.total_amount
  )
  const safeProofUrl =
    variant === "transfer_proof_received" && isHttpsUrl(proofUrl)
      ? proofUrl.trim()
      : null
  const paymentStatus = order.collection_status || "pending"
  const phone = order.phone || shipping?.phone || "—"

  const items: EmailItem[] = orderItems.map((item) => ({
    name: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    color: item.color,
    size: item.size,
    details: item.sku ? [`SKU: ${item.sku}`] : [],
  }))

  const totalsRows: EmailTotalRow[] = [
    { label: "Subtotal", value: formatMoney(order.subtotal, order.currency) },
    {
      label: "Envío",
      value:
        shippingAmount > 0
          ? formatMoney(shippingAmount, order.currency)
          : "Sin cargo",
    },
  ]
  if (discountAmount > 0) {
    totalsRows.push({
      label: "Descuento",
      value: `-${formatMoney(discountAmount, order.currency)}`,
      positive: true,
    })
  }

  const detailLines = (shipping?.details || "")
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)

  const shippingRows = !shipping
    ? [{ label: "Envío", value: "Sin datos de envío" }]
    : shipping.shipping_method === "store"
      ? [
          {
            label: "Envío",
            value: SHIPPING_METHOD_LABELS.store,
          },
        ]
      : [
          {
            label: "Método",
            value:
              SHIPPING_METHOD_LABELS[shipping.shipping_method] ??
              shipping.shipping_method,
          },
          ...(shipping.shipping_method === "branch"
            ? [
                {
                  label: "Sucursal",
                  value: detailLines.length ? (
                    <>
                      {detailLines.map((line, i) => (
                        <span key={i}>
                          {line}
                          {i < detailLines.length - 1 ? <br /> : null}
                        </span>
                      ))}
                    </>
                  ) : (
                    "—"
                  ),
                },
              ]
            : []),
          {
            label:
              shipping.shipping_method === "branch"
                ? "Domicilio del cliente"
                : "Dirección",
            value: `${shipping.address}, ${shipping.city}, ${shipping.state} (CP ${shipping.postal_code})`,
          },
          ...(shipping.shipping_method !== "branch" && shipping.details
            ? [{ label: "Detalles", value: shipping.details }]
            : []),
        ]

  return (
    <EmailLayout preview={copy.preview(shortId, total, customerName)}>
      <EmailHero
        tone={copy.tone}
        badge={copy.badge}
        title={copy.title}
        subtitle={`#${shortId} · ${total}`}
      />

      {/* Lo accionable, arriba */}
      {variant === "cash_pickup_reserved" ? (
        <EmailSection padding="24px 24px 0 24px">
          <EmailCallout tone="info" title="Cobrar al retirar">
            El cliente paga <strong>{total}</strong> en efectivo cuando pase por
            la tienda. Dejá el pedido listo para entregar.
          </EmailCallout>
        </EmailSection>
      ) : null}
      {variant === "transfer_proof_received" ? (
        <EmailSection padding="24px 24px 0 24px">
          <EmailCallout tone="warning" title="Falta tu aprobación">
            {safeProofUrl
              ? "Revisá el comprobante y aprobá o rechazá el pago desde el dashboard."
              : "No pudimos adjuntar el enlace del comprobante: revisalo desde el dashboard."}
          </EmailCallout>
        </EmailSection>
      ) : null}
      <EmailSection padding="18px 24px 0 24px">
        {safeProofUrl ? (
          <EmailButton href={safeProofUrl} tone="warning">
            Ver comprobante
          </EmailButton>
        ) : null}
        <EmailButton
          href={dashboardOrdersUrl()}
          variant={safeProofUrl ? "outline" : "solid"}
        >
          Abrir en el dashboard
        </EmailButton>
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailHeading level={3}>Cliente</EmailHeading>
        <EmailInfoCard
          rows={[
            { label: "Nombre", value: customerName },
            {
              label: "Email",
              value: (
                <Link
                  href={`mailto:${customerEmail}`}
                  style={{ color: emailColors.ink }}
                >
                  {customerEmail}
                </Link>
              ),
            },
            {
              label: "Teléfono",
              value:
                phone === "—" ? (
                  phone
                ) : (
                  <Link
                    href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                    style={{ color: emailColors.ink }}
                  >
                    {phone}
                  </Link>
                ),
            },
            ...(shipping
              ? [{ label: "DNI/CUIT", value: String(shipping.identifier) }]
              : []),
          ]}
        />
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailHeading level={3}>Pedido y pago</EmailHeading>
        <EmailInfoCard
          rows={[
            { label: "Pedido", value: `#${shortId}` },
            {
              label: "Estado del pago",
              value: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
            },
            {
              label: "Método de pago",
              value: getPaymentTypeLabel(order.payment_type),
            },
            { label: "Total", value: total },
          ]}
        />
      </EmailSection>

      <EmailSection padding="28px 24px 0 24px">
        <EmailHeading level={3}>Envío</EmailHeading>
        <EmailInfoCard rows={shippingRows} />
      </EmailSection>

      <EmailSection padding="28px 24px 32px 24px">
        <EmailHeading level={3}>Productos</EmailHeading>
        <EmailItemsTable items={items} currency={order.currency} />
        <EmailTotals rows={totalsRows} total={total} />
      </EmailSection>
    </EmailLayout>
  )
}
