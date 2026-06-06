-- 기획서 저장 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  title text not null default '제목 없음',
  content text not null,              -- 이미지 삽입 전 원본 기획서
  enriched_content text,              -- 이미지/다이어그램 삽입된 버전 (없으면 null)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_session_idx on documents (session_id, created_at desc);

-- RLS: 다른 테이블과 동일하게 anon 키로 접근 허용 (단일 사용자 도구)
alter table documents enable row level security;

drop policy if exists "documents_all_access" on documents;
create policy "documents_all_access" on documents
  for all using (true) with check (true);
