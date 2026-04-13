-- Retoucher Portal: external retoucher collaboration workflow
-- Run this in the Supabase SQL editor after human-restore.sql.

-- 1. Retouchers table
create table if not exists public.human_restore_retouchers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists human_restore_retouchers_active_idx
  on public.human_restore_retouchers (active)
  where active = true;

alter table public.human_restore_retouchers enable row level security;

-- 2. Extend jobs table with retoucher tracking and delivery audit fields
alter table public.human_restore_jobs
  add column if not exists retoucher_id uuid references public.human_restore_retouchers(id) on delete set null,
  add column if not exists retoucher_name text,
  add column if not exists retoucher_assigned_at timestamptz,
  add column if not exists retoucher_uploaded_at timestamptz,
  add column if not exists auto_delivered boolean not null default false,
  add column if not exists delivery_method text default 'manual' check (
    delivery_method in ('manual', 'auto_retoucher', 'auto_ai')
  );

-- Add 'assigned' status to jobs
alter table public.human_restore_jobs
  drop constraint if exists human_restore_jobs_status_check;

alter table public.human_restore_jobs
  add constraint human_restore_jobs_status_check check (
    status in (
      'uploaded',
      'processing',
      'ai_queued',
      'ai_failed',
      'needs_review',
      'manual_review',
      'assigned',
      'delivered',
      'failed',
      'deleted'
    )
  );

create index if not exists human_restore_jobs_retoucher_idx
  on public.human_restore_jobs (retoucher_id, status)
  where retoucher_id is not null;
