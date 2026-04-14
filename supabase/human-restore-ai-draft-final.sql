-- MemoryFix AI v2 migration
-- Separates AI draft assets from final delivered assets while keeping
-- legacy result_* columns for backward compatibility.

alter table public.human_restore_jobs
  add column if not exists ai_draft_provider text,
  add column if not exists ai_draft_model text,
  add column if not exists ai_draft_prompt text,
  add column if not exists ai_draft_file_type text,
  add column if not exists ai_draft_storage_bucket text,
  add column if not exists ai_draft_storage_path text,
  add column if not exists ai_draft_created_at timestamptz,
  add column if not exists ai_draft_error text,
  add column if not exists ai_draft_source text,
  add column if not exists delivery_source text,
  add column if not exists final_file_type text,
  add column if not exists final_source text,
  add column if not exists final_storage_bucket text,
  add column if not exists final_storage_path text,
  add column if not exists final_uploaded_at timestamptz,
  add column if not exists final_uploaded_by text;
