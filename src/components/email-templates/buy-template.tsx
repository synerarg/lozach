import { Link, Text } from "@react-email/components"
import { EmailBody } from "@/types/email/email"
import { Shipping, ShippingStatus } from "@/types/shipping/shipping"
import {
  BANK_TRANSFER_DISCOUNT_PERCENT_LABEL,
  BANK_TRANSFER_PAYMENT_TYPE,
  CASH_STORE_DISCOUNT_PERCENT_LABEL,
  CASH_STORE_PAYMENT_TYPE,
  getPaymentTypeLabel,
} from "@/lib/utils/payment-utils"
import {
  STORE_PICKUP_INFO,
  orderShortId,
  orderUrl,
} from "@/lib/config/site"
import {
  EmailButton,
  EmailCallout,
  EmailHeading,
  EmailHero,
  EmailInfoCard,
  EmailItem,
  EmailItemsTable,
  EmailLayout,
  EmailParagraph,
  EmailSection,
  EmailStatusBadge,
  EmailSteps,
  EmailTone,
  EmailTotals,
  EmailTotalRow,
  emailColors,
  emailFonts,
  formatEmailDate,
  formatMoney,
} from "./email-layout"

const SHIPPING_METHOD_LABELS: Record<string, string> = {
  home: "Envío a domicilio",
  branch: "Retiro en sucursal de Correo Argentino",
  express: "Envío express",
  store: "Retiro en tienda",
}

const SHIPPING_STATUS: Record<ShippingStatus, { label: string; tone: EmailTone }> =
  {
    draft: { label: "En preparación", tone: "neutral" },
    ready: { label: "Listo para despachar", tone: "info" },
    shipped: { label: "Enviado", tone: "info" },
    delivered: { label: "Entregado", tone: "success" },
    cancelled: { label: "Cancelado", tone: "danger" },
  }

function ShippingDetails({ shipping }: { shipping: Shipping }) {
  const addressLine = `${shipping.city}, ${shipping.state} (CP ${shipping.postal_code})`
  const detailLines = (shipping.details || "")
    .split("|")
    .map((line) => line.trim())
    .filter(Boolean)

  if (shipping.shipping_method === "store") {
    return (
      <EmailCallout tone="neutral" title="Retiro en tienda">
        {STORE_PICKUP_INFO} Acordate de llevar tu DNI y el número de pedido.
      </EmailCallout>
    )
  }

  if (shipping.shipping_method === "branch") {
    return (
      <EmailInfoCard
        layout="stacked"
        rows={[
          {
            label: "Sucursal de retiro",
            value: (
              <>
                {detailLines.length
                  ? detailLines.map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < detailLines.length - 1 ? <br /> : null}
                      </span>
                    ))
                  : "Sucursal de Correo Argentino"}
              </>
            ),
          },
          { label: "Quién retira", value: `DNI/CUIT ${shipping.identifier}` },
          { label: "Teléfono", value: shipping.phone },
          {
            label: "Domicilio del destinatario",
            value: `${shipping.address}, ${addressLine}`,
          },
        ]}
      />
    )
  }

  return (
    <EmailInfoCard
      layout="stacked"
      rows={[
        {
          label: "Dirección de entrega",
          value: (
            <>
              {shipping.address}
              <br />
              {addressLine}
              {shipping.details ? (
                <>
                  <br />
                  {shipping.details}
                </>
              ) : null}
            </>
          ),
        },
        { label: "Teléfono", value: shipping.phone },
        { label: "DNI/CUIT", value: String(shipping.identifier) },
      ]}
    />
  )
}

export default function OrderConfirmationEmail({
  name,
  buyedProducts = [],
  order,
  orderItems,
  shipping,
}: EmailBody) {
  const shortId = orderShortId(order.id)
  const shippingAmount = shipping?.shipping_cost || 0
  const discountAmount = Math.max(
    0,
    order.subtotal + shippingAmount - order.total_amount
  )
  const isStorePickup = shipping?.shipping_method === "store"
  const isCashStore = order.payment_type === CASH_STORE_PAYMENT_TYPE
  const createdAt = formatEmailDate(order.created_at)

  const items: EmailItem[] = orderItems.map((item) => {
    const product = buyedProducts.find((p) => p.id === item.product_id)
    return {
      name: item.product_name,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      color: item.color,
      size: item.size,
      imageUrl: product?.image_url ?? null,
      details: [
        product?.fabric ? `Tela: ${product.fabric}` : "",
        item.sku ? `SKU: ${item.sku}` : "",
      ].filter(Boolean),
    }
  })

  const discountLabel =
    order.payment_type === BANK_TRANSFER_PAYMENT_TYPE
      ? `Descuento por transferencia (${BANK_TRANSFER_DISCOUNT_PERCENT_LABEL})`
      : isCashStore
        ? `Descuento por pago en efectivo (${CASH_STORE_DISCOUNT_PERCENT_LABEL})`
        : "Descuento"

  const totalsRows: EmailTotalRow[] = [
    {
      label: "Subtotal",
      value: formatMoney(order.subtotal, order.currency),
    },
    {
      label: isStorePickup ? "Envío (retiro en tienda)" : "Envío",
      value:
        shippingAmount > 0
          ? formatMoney(shippingAmount, order.currency)
          : "Sin cargo",
    },
  ]
  if (discountAmount > 0) {
    totalsRows.push({
      label: discountLabel,
      value: `-${formatMoney(discountAmount, order.currency)}`,
      positive: true,
    })
  }

  const steps = isStorePickup
    ? [
        {
          title: "Preparamos tu pedido",
          description: "Lo dejamos listo para que lo retires.",
        },
        {
          title: "Te avisamos cuando esté listo",
          description: "Recibís un mail con los detalles para retirarlo.",
        },
        {
          title: "Retirás en tienda",
          description: "Llevá tu DNI y el número de pedido.",
        },
      ]
    : [
        {
          title: "Preparamos tu pedido",
          description: "Lo armamos con cuidado y lo dejamos listo.",
        },
        {
          title: "Lo despachamos con Correo Argentino",
          description: "Te mandamos el número de seguimiento por mail.",
        },
        {
          title: "Entrega",
          description:
            shipping?.shipping_method === "branch"
              ? "Lo retirás en la sucursal que elegiste."
              : "Lo recibís en la dirección que nos indicaste.",
        },
      ]

  const shippingStatus = shipping ? SHIPPING_STATUS[shipping.shipping_status] : null

  return (
    <EmailLayout
      preview={
        isCashStore
          ? `${name}, reservamos tu pedido #${shortId}. Pagás en efectivo al retirar.`
          : `¡Gracias por tu compra, ${name}! Tu pedido #${shortId} está confirmado.`
      }
    >
      <EmailHero
        tone={isCashStore ? "warning" : "success"}
        badge={isCashStore ? "Pedido reservado" : "Pago confirmado"}
        title={isCashStore ? "¡Reservamos tu pedido!" : "¡Gracias por tu compra!"}
        subtitle={`Pedido #${shortId}${createdAt ? ` · ${createdAt}` : ""}`}
      />

      <EmailSection padding="28px 24px 0 24px">
        <EmailParagraph>Hola {name},</EmailParagraph>
        <EmailParagraph spacing="0 0 18px 0">
          {isCashStore
            ? "Tu pedido quedó reservado. Cuando esté listo te avisamos para que pases a retirarlo y pagarlo en efectivo."
            : "Recibimos tu pago y tu pedido ya está confirmado. Estamos preparando todo; apenas salga te mandamos el seguimiento por mail."}
        </EmailParagraph>
        <EmailButton href={orderUrl()}>Ver mi pedido</EmailButton>
      </EmailSection>

      {isCashStore ? (
        <EmailSection>
          <EmailCallout tone="warning" title="Pagás al retirar">
            Total a pagar en efectivo en la tienda:{" "}
            <strong>{formatMoney(order.total_amount, order.currency)}</strong>
          </EmailCallout>
        </EmailSection>
      ) : null}

      <EmailSection padding="32px 24px 0 24px">
        <EmailHeading>Qué sigue</EmailHeading>
        <EmailSteps steps={steps} tone="neutral" />
      </EmailSection>

      <EmailSection padding="16px 24px 0 24px">
        <EmailHeading>Resumen del pedido</EmailHeading>
        <EmailInfoCard
          rows={[
            { label: "Pedido", value: `#${shortId}` },
            ...(createdAt ? [{ label: "Fecha", value: createdAt }] : []),
            {
              label: "Método de pago",
              value: getPaymentTypeLabel(order.payment_type),
            },
          ]}
        />
      </EmailSection>

      <EmailSection padding="32px 24px 0 24px">
        <EmailHeading>Tus productos</EmailHeading>
        <EmailItemsTable items={items} currency={order.currency} />
        <EmailTotals
          rows={totalsRows}
          total={formatMoney(order.total_amount, order.currency)}
        />
      </EmailSection>

      <EmailSection padding="32px 24px 0 24px">
        <EmailHeading>
          {isStorePickup ? "Retiro" : "Información de envío"}
        </EmailHeading>
        {!shipping ? (
          <EmailParagraph muted small>
            No encontramos información de entrega asociada a este pedido. Si
            necesitás ayuda, respondé este mail.
          </EmailParagraph>
        ) : (
          <>
            <Text
              style={{
                margin: "0 0 12px 0",
                fontFamily: emailFonts.sans,
                fontSize: "15px",
                lineHeight: "24px",
                color: emailColors.text,
              }}
            >
              <strong style={{ color: emailColors.ink }}>
                {SHIPPING_METHOD_LABELS[shipping.shipping_method] ??
                  shipping.shipping_method}
              </strong>
              {isStorePickup ? "" : " · Correo Argentino"}
              {shippingStatus ? (
                <>
                  {"  "}
                  <EmailStatusBadge tone={shippingStatus.tone}>
                    {shippingStatus.label}
                  </EmailStatusBadge>
                </>
              ) : null}
            </Text>
            <ShippingDetails shipping={shipping} />
          </>
        )}
      </EmailSection>

      <EmailSection padding="28px 24px 32px 24px" align="center">
        <EmailParagraph small muted align="center" spacing="0">
          ¿Algo no está bien? Respondé este mail o mirá el estado en{" "}
          <Link
            href={orderUrl()}
            style={{ color: emailColors.ink, fontWeight: 600 }}
          >
            Mis pedidos
          </Link>
          .
        </EmailParagraph>
      </EmailSection>
    </EmailLayout>
  )
}
