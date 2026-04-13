-- MemoryFix AI Human-assisted Restore workflow
-- Run this in the Supabase SQL editor before enabling the paid upload workflow.

create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'human-restore-originals',
    'human-restore-originals',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'human-restore-results',
    'human-restore-results',
    false,
    52428800,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.human_restore_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_reference text not null unique,
  status text not null default 'uploaded' check (
    status in (
      'uploaded',
      'processing',
      'ai_queued',
      'ai_failed',
      'needs_review',
      'manual_review',
      'delivered',
      'failed',
      'deleted'
    )
  ),
  checkout_email text not null,
  customer_name text,
  order_bound boolean not null default false,
  order_id text,
  order_number text,
  product_name text not null default 'Human-assisted Restore',
  receipt_url text,
  test_mode boolean not null default false,
  upload_source text not null default 'fallback_form',
  notes text,
  original_file_name text not null,
  original_file_type text not null,
  original_file_size integer not null,
  original_storage_bucket text not null,
  original_storage_path text not null,
  ai_provider text,
  ai_request_id text,
  ai_error text,
  ai_provider_payload jsonb not null default '{}'::jsonb,
  result_model text,
  result_prompt text,
  result_file_type text,
  result_storage_bucket text,
  result_storage_path text,
  review_note text,
  delivery_email_id text,
  delivered_at timestamptz,
  expires_at timestamptz not null default now() + interval '30 days',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.human_restore_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.human_restore_jobs(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.human_restore_orders (
  id uuid primary key default gen_random_uuid(),
  checkout_ref text not null unique,
  submission_reference text not null unique,
  status text not null default 'pending_payment' check (
    status in (
      'pending_payment',
      'paid',
      'uploaded',
      'processing',
      'ai_queued',
      'ai_failed',
      'needs_review',
      'manual_review',
      'delivered',
      'failed',
      'expired',
      'deleted'
    )
  ),
  payment_provider text not null default 'paddle',
  checkout_id text,
  checkout_url text,
  payment_provider_order_id text unique,
  payment_provider_order_identifier text,
  order_number text,
  checkout_email text,
  customer_name text,
  product_name text not null default 'Human-assisted Restore',
  receipt_url text,
  test_mode boolean not null default false,
  variant_id text,
  notes text,
  original_file_name text not null,
  original_file_type text not null,
  original_file_size integer not null,
  original_storage_bucket text not null,
  original_storage_path text not null,
  job_id uuid references public.human_restore_jobs(id) on delete set null,
  payment_confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '48 hours',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.human_restore_jobs
  add column if not exists human_restore_order_id uuid references public.human_restore_orders(id) on delete set null;

create index if not exists human_restore_jobs_status_created_idx
  on public.human_restore_jobs (status, created_at desc);

create index if not exists human_restore_jobs_checkout_email_idx
  on public.human_restore_jobs (checkout_email);

create index if not exists human_restore_jobs_order_id_idx
  on public.human_restore_jobs (order_id)
  where order_id is not null;

create index if not exists human_restore_jobs_local_order_idx
  on public.human_restore_jobs (human_restore_order_id)
  where human_restore_order_id is not null;

create index if not exists human_restore_jobs_expires_idx
  on public.human_restore_jobs (expires_at)
  where deleted_at is null;

create index if not exists human_restore_events_job_created_idx
  on public.human_restore_events (job_id, created_at desc);

create index if not exists human_restore_orders_status_created_idx
  on public.human_restore_orders (status, created_at desc);

create index if not exists human_restore_orders_checkout_ref_idx
  on public.human_restore_orders (checkout_ref);

create index if not exists human_restore_orders_payment_provider_order_idx
  on public.human_restore_orders (payment_provider_order_id)
  where payment_provider_order_id is not null;

create index if not exists human_restore_orders_expires_idx
  on public.human_restore_orders (expires_at)
  where deleted_at is null;

alter table public.human_restore_jobs enable row level security;
alter table public.human_restore_events enable row level security;
alter table public.human_restore_orders enable row level security;

-- The app uses SUPABASE_SERVICE_ROLE_KEY from Vercel serverless functions.
-- No public RLS policies are needed because browser clients never access these
-- tables directly.
