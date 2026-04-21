-- Mamãe Me Ajuda — Atomic power-up consumption.
--
-- Problem: the route at src/app/api/gamification/power-ups/[code]/use/route.ts
-- previously did SELECT qty → check qty > 0 → UPDATE qty - 1 in two
-- round-trips. Under concurrent requests (rapid double-tap, offline queue
-- flush, duplicate fetch retries) a child could consume the same item twice
-- — giving them unlimited uses of rare items until the next catalog refresh.
--
-- Fix: push the guard into a single UPDATE ... WHERE qty > 0 RETURNING.
-- Postgres row-level locks make this atomic; only one transaction wins.
--
-- This RPC is SECURITY DEFINER but enforces ownership via auth.uid() so a
-- logged-in parent can only consume items that belong to their children.
-- Returns NULL when no row was decremented (either qty=0 or ownership fail)
-- so the caller can distinguish success from "already empty" with a single
-- nullability check.
--
-- Idempotent: CREATE OR REPLACE FUNCTION; safe to re-run.

create or replace function public.consume_power_up(
  p_child_id uuid,
  p_code     text
) returns table (
  inventory_id  uuid,
  remaining_qty integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent uuid;
begin
  -- Ownership guard: fail fast if the child doesn't belong to the caller.
  select parent_id into v_parent from public.children where id = p_child_id;
  if v_parent is null then
    raise exception 'Unknown child_id';
  end if;
  if v_parent <> auth.uid() then
    raise exception 'Forbidden';
  end if;

  -- Atomic decrement. The WHERE qty > 0 predicate + row lock held by UPDATE
  -- guarantees that two concurrent consumers can never both succeed. The
  -- second caller sees 0 affected rows and the RETURNING yields no row.
  return query
  update public.user_inventory
     set qty = qty - 1
   where child_id      = p_child_id
     and power_up_code = p_code
     and qty           > 0
  returning id, qty;
end;
$$;

grant execute on function public.consume_power_up(uuid, text) to authenticated;
