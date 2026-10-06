-- Permitir borrar productos del catálogo aunque ya se hayan vendido.
--
-- order_items.product_id tenía una FK sin ON DELETE, así que cualquier producto
-- con ventas no se podía eliminar ("la página no me deja borrar publicaciones").
-- Con ON DELETE SET NULL el ítem del pedido conserva nombre, SKU, talle, color y
-- precio (ya están copiados en la fila), solo pierde el vínculo al producto.
alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;

alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id)
  on delete set null;
