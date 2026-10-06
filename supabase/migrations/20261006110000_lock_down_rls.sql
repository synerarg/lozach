-- URGENTE: cierra agujeros de RLS detectados en la auditoría.
-- Es independiente del código nuevo: se puede aplicar YA, antes de desplegar.
--
-- Contexto: la app escribe SIEMPRE con service role (admin client) las tablas
-- orders / order_items / shipping / addresses / users. Las policies de
-- INSERT/UPDATE abiertas a `authenticated`/`public` permitían, usando la anon
-- key pública directamente contra PostgREST (sin pasar por la app):
--   * leer TODAS las órdenes (incluso sin login),
--   * marcarse a sí mismo una orden como "approved" o cambiar su monto,
--   * cambiar el estado/tracking de su envío,
--   * crearse una fila en `users` con role = 'admin' (escalada de privilegios),
--   * leer nombre/email/rol de TODOS los usuarios,
--   * leer los favoritos de todos.

begin;

-- ---------------------------------------------------------------------------
-- users: cada uno ve solo su fila; nadie crea filas desde el cliente.
-- (el alta del perfil la hace el servidor con service role)
-- ---------------------------------------------------------------------------
drop policy if exists "allow users to create users" on public.users;
drop policy if exists "allow users to see their own data" on public.users;

create policy "users can read own row"
  on public.users for select
  to authenticated
  using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- orders: lectura solo del dueño; escritura solo con service role.
-- ---------------------------------------------------------------------------
drop policy if exists "allow all users to create orders" on public.orders;
drop policy if exists "allow users to update orders" on public.orders;
drop policy if exists "orders owner can read" on public.orders;

create policy "orders owner can read"
  on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
drop policy if exists "allow users to insert" on public.order_items;
drop policy if exists "order_items by owner can read" on public.order_items;

create policy "order_items by owner can read"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.user_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- shipping: el cliente solo puede leer su envío (no cambiar estado/tracking).
-- ---------------------------------------------------------------------------
drop policy if exists "allow users to create rows" on public.shipping;
drop policy if exists "allow users to update their shippings" on public.shipping;
drop policy if exists "allow users to get their shippings" on public.shipping;

create policy "shipping owner can read"
  on public.shipping for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- addresses: insert solo desde el servidor (evita crear direcciones a nombre de otro).
-- ---------------------------------------------------------------------------
drop policy if exists "allow users to insert addresses" on public.addresses;
drop policy if exists "allow users to get their addresses" on public.addresses;

create policy "addresses owner can read"
  on public.addresses for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- favorites (user_id es text): solo las propias. Antes no existía DELETE, así
-- que "quitar de favoritos" no hacía nada.
-- ---------------------------------------------------------------------------
drop policy if exists "allow auth users to insert favorites" on public.favorites;
drop policy if exists "allow users to see their own favorites" on public.favorites;

create policy "favorites owner can read"
  on public.favorites for select
  to authenticated
  using (user_id = (select auth.uid())::text);

create policy "favorites owner can insert"
  on public.favorites for insert
  to authenticated
  with check (user_id = (select auth.uid())::text);

create policy "favorites owner can delete"
  on public.favorites for delete
  to authenticated
  using (user_id = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Recientes: la PK era solo (product_id), o sea UNA fila por producto para
-- TODOS los usuarios (el segundo usuario que veía un producto pisaba/rompía al
-- primero). Pasa a ser (user_id, product_id), que además es el conflicto que
-- usa el upsert del código.
-- ---------------------------------------------------------------------------
alter table public.user_recent_views
  drop constraint if exists user_recent_views_pkey;
alter table public.user_recent_views
  add constraint user_recent_views_pkey primary key (user_id, product_id);

alter table public.user_recent_cart
  drop constraint if exists user_recent_cart_pkey;
alter table public.user_recent_cart
  add constraint user_recent_cart_pkey primary key (user_id, product_id);

alter table public.user_recent_cart
  alter column created_at set default now();

-- user_recent_views (user_id uuid)
drop policy if exists "Enable delete for users based on user_id" on public.user_recent_views;
drop policy if exists "Enable insert for authenticated users only" on public.user_recent_views;
drop policy if exists "Enable users to view their own data only" on public.user_recent_views;

create policy "recent_views owner can read"
  on public.user_recent_views for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "recent_views owner can insert"
  on public.user_recent_views for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "recent_views owner can update"
  on public.user_recent_views for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "recent_views owner can delete"
  on public.user_recent_views for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- user_recent_cart (user_id text)
drop policy if exists "Enable insert for authenticated users only" on public.user_recent_cart;
drop policy if exists "Enable users to view their own data only" on public.user_recent_cart;

create policy "recent_cart owner can read"
  on public.user_recent_cart for select
  to authenticated
  using (user_id = (select auth.uid())::text);

create policy "recent_cart owner can insert"
  on public.user_recent_cart for insert
  to authenticated
  with check (user_id = (select auth.uid())::text);

create policy "recent_cart owner can update"
  on public.user_recent_cart for update
  to authenticated
  using (user_id = (select auth.uid())::text)
  with check (user_id = (select auth.uid())::text);

create policy "recent_cart owner can delete"
  on public.user_recent_cart for delete
  to authenticated
  using (user_id = (select auth.uid())::text);

commit;

-- Verificación rápida (debería devolver solo políticas de lectura propias en
-- orders/order_items/shipping/addresses/users):
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' and tablename in
--   ('orders','order_items','shipping','addresses','users') order by 1, 2;
