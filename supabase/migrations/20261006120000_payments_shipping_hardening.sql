-- Pagos / envíos / comprobantes + reintentos de Correo Argentino.
-- Autocontenido e idempotente: incluye las columnas de las migraciones
-- 20260506 (comprobantes) y 20260616 (tracking) por si no se habían aplicado.
-- Aplicar justo ANTES de desplegar el código nuevo.

-- ---------------------------------------------------------------------------
-- 0) Valores nuevos de enums (el código nuevo usa estos estados).
--    Van primero y sin usarse en este mismo script.
-- ---------------------------------------------------------------------------
alter type public.pay_status add value if not exists 'pending';
alter type public.pay_status add value if not exists 'in_process';
alter type public.pay_status add value if not exists 'approved';
alter type public.pay_status add value if not exists 'rejected';
alter type public.pay_status add value if not exists 'cancelled';
alter type public.pay_status add value if not exists 'refunded';
alter type public.pay_status add value if not exists 'charged_back';

alter type public.shipment_status add value if not exists 'draft';
alter type public.shipment_status add value if not exists 'ready';
alter type public.shipment_status add value if not exists 'shipped';
alter type public.shipment_status add value if not exists 'delivered';
alter type public.shipment_status add value if not exists 'cancelled';

-- ---------------------------------------------------------------------------
-- 1) Órdenes: comprobante de transferencia + auditoría.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_proof_url text,
  add column if not exists payment_proof_uploaded_at timestamptz,
  add column if not exists payment_proof_status text,
  add column if not exists payment_proof_reviewed_at timestamptz,
  add column if not exists payment_proof_reviewed_by uuid,
  add column if not exists payment_proof_rejection_reason text,
  add column if not exists reserved_at timestamptz,
  add column if not exists admin_notified_at timestamptz,
  add column if not exists payment_status_detail text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_payment_proof_status_check'
  ) then
    alter table public.orders
      add constraint orders_payment_proof_status_check
      check (
        payment_proof_status is null
        or payment_proof_status in ('pending_review', 'approved', 'rejected')
      );
  end if;
end $$;

comment on column public.orders.payment_proof_url is
  'Ruta del comprobante en el bucket PRIVADO payment-proofs (o URL legada). Se firma en el servidor.';
comment on column public.orders.admin_notified_at is
  'Momento en que se avisó al admin de la venta confirmada (idempotencia).';
comment on column public.orders.payment_status_detail is
  'status_detail devuelto por Mercado Pago (motivo de rechazo / pendiente).';

-- ---------------------------------------------------------------------------
-- 2) Envíos: tracking + reintentos de importación a MiCorreo.
-- ---------------------------------------------------------------------------
alter table public.shipping
  add column if not exists tracking_number text,
  add column if not exists tracking_url text,
  add column if not exists imported_at timestamptz,
  add column if not exists last_synced_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_tracking_status text,
  add column if not exists in_transit_email_sent boolean not null default false,
  add column if not exists delivered_email_sent boolean not null default false,
  add column if not exists import_attempts integer not null default 0,
  add column if not exists import_error text,
  add column if not exists import_alert_sent boolean not null default false,
  add column if not exists ready_for_pickup_email_sent boolean not null default false;

comment on column public.shipping.import_error is
  'Último error al importar el envío a Correo Argentino (si falló).';
comment on column public.shipping.import_alert_sent is
  'Evita enviar más de una alerta al admin por un envío que no se pudo importar.';

-- ---------------------------------------------------------------------------
-- 3) Bucket de comprobantes: PRIVADO (datos bancarios y personales).
--    Solo el servidor (service role) sube y firma URLs temporales.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 4) Integridad e índices.
-- ---------------------------------------------------------------------------

-- Un envío por orden (el código usa maybeSingle()). Solo se crea si no hay
-- duplicados; si los hay, avisa en vez de fallar.
do $$
begin
  if exists (
    select order_id from public.shipping
    where order_id is not null group by order_id having count(*) > 1
  ) then
    raise notice 'Hay órdenes con más de un envío: revisalas antes de crear shipping_order_id_uidx';
  else
    create unique index if not exists shipping_order_id_uidx
      on public.shipping (order_id);
  end if;
end $$;

create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_expiry_idx
  on public.orders (expires_at)
  where expires_at is not null;
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists addresses_user_id_idx on public.addresses (user_id);
create index if not exists favorites_user_id_idx on public.favorites (user_id);
create index if not exists user_recent_views_user_idx
  on public.user_recent_views (user_id, viewed_at desc);
create index if not exists user_recent_cart_user_idx
  on public.user_recent_cart (user_id, added_at desc);

-- Índices parciales para los crons (solo columnas, sin valores de enum nuevos).
create index if not exists shipping_tracking_sync_idx
  on public.shipping (last_synced_at)
  where tracking_number is not null;
create index if not exists shipping_pending_import_idx
  on public.shipping (created_at)
  where imported_at is null;

-- ---------------------------------------------------------------------------
-- 5) Newsletter: sin duplicados (case-insensitive) y sin altas directas desde
--    el cliente (el alta pasa por el servidor, que valida y manda el mail).
-- ---------------------------------------------------------------------------
delete from public.subscribers s
 using public.subscribers d
 where lower(s.email) = lower(d.email)
   and (s.created_at, s.id) > (d.created_at, d.id);

create unique index if not exists subscribers_email_lower_uidx
  on public.subscribers (lower(email));

drop policy if exists "allow users to subscribe" on public.subscribers;
