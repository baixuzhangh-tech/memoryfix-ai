-- AI HD preview rate-limit + status migration
--
-- Apply this once in the Supabase SQL editor before the
-- /api/ai-hd-preview endpoint is deployed.
--
-- 1) ai_hd_preview_attempts: stores hashed-IP -> created_at rows
--    so the public API can rate-limit free previews to a small
--    number per 24h per IP. The IP itself is never stored — only
--    HMAC-SHA256(salt, ip).
--
-- 2) The existing `human_restore_orders.status` text column is
--    reused for the preview-first lifecycle. We DO NOT add a
--    constraint here because the existing app already writes
--    free-form status strings ('pending_payment', 'paid',
--    'needs_review', 'delivered', etc.) and adding an enum now
--    would break running deploys.

create table if not exists public.ai_hd_preview_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  order_id uuid null,
  succeeded boolean not null default true
);

create index if not exists ai_hd_preview_attempts_ip_created
  on public.ai_hd_preview_attempts (ip_hash, created_at desc);

-- The service role key already bypasses RLS, but enable RLS so
-- nothing in the anon/public path can ever read these IP hashes.
alter table public.ai_hd_preview_attempts enable row level security;
