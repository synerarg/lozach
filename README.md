# Lozach

Tienda online (Next.js 15 + Supabase + Mercado Pago + Correo Argentino + Resend).

```bash
pnpm install
pnpm dev
```

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE` | ✅ | Supabase (el service role **solo** en el servidor) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pública (https en producción): back_urls de MP, links de mails |
| `MERCADO_PAGO_ACCESS_TOKEN` | ✅ | Credencial de Mercado Pago (servidor) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | ✅ prod | "Clave secreta" del webhook (Mercado Pago → Tu integración → Webhooks). Con ella se valida `x-signature` |
| `RESEND_API_KEY` | ✅ | Envío de mails |
| `CRON_SECRET` | ✅ | Autoriza los crons de Vercel (`Authorization: Bearer …`) |
| `UNSUBSCRIBE_SECRET` | recomendado | Firma de links de baja del newsletter (si falta usa `CRON_SECRET`) |
| `ADMIN_NOTIFICATION_EMAIL` | recomendado | Casilla que recibe ventas, comprobantes y alertas |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | opcional | Mail de soporte visible para clientes |
| `NEXT_PUBLIC_BANK_TRANSFER_ALIAS` / `_CBU` / `_HOLDER` / `_BANK` | si hay transferencia | Datos bancarios (pantalla de pago y mail de instrucciones) |
| `NEXT_PUBLIC_TRANSFER_WINDOW_MINUTES` | opcional (60) | Plazo para transferir y subir el comprobante |
| `NEXT_PUBLIC_STORE_PICKUP_INFO` | opcional | Texto de retiro en tienda (dirección/horarios) |
| `CORREO_ARGENTINO_USER`, `_PASSWORD`, `_CUSTOMER_ID` | ✅ | Credenciales apiMiCorreo |
| `CORREO_ARGENTINO_SENDER_*` (`NAME`, `STREET`, `STREET_NUMBER`, `CITY`, `STATE`, `ZIP_CODE`, `PHONE`, `CELLPHONE`, `EMAIL`, `FLOOR`, `DEPARTMENT`) | ✅ | Remitente del envío (`STREET`, `STREET_NUMBER`, `CITY`, `STATE` y `ZIP_CODE` son necesarios para importar) |
| `CORREO_ARGENTINO_DEFAULT_*` (`WEIGHT_GRAMS`, `HEIGHT_CM`, `WIDTH_CM`, `LENGTH_CM`) | opcional | Medidas por defecto si el producto no las define |
| `CORREO_ARGENTINO_API_URL` | opcional | Por defecto prod/test según `NODE_ENV` |

## Mercado Pago

1. Webhook: `https://TU-DOMINIO/api/mercadopago/webhook`, evento **Pagos**.
2. Copiá la *clave secreta* a `MERCADO_PAGO_WEBHOOK_SECRET`.
3. El webhook verifica la firma, consulta el pago a la API de MP, valida monto/moneda y aprueba la orden **una sola vez** (idempotente).

## Crons (vercel.json)

- `/api/cron/shipping-tracking` — cada hora: sincroniza tracking y avisa "en camino" / "entregado".
- `/api/cron/order-maintenance` — cada 15 min: vence órdenes sin pagar, reintenta envíos que no se pudieron crear en Correo Argentino y reenvía mails de confirmación fallidos.

## Base de datos

Las migraciones están en `supabase/migrations`. **Aplicá la migración antes de desplegar** (agrega columnas de reintentos de envío, auditoría de órdenes, hace privado el bucket `payment-proofs` y evita suscriptores duplicados).
