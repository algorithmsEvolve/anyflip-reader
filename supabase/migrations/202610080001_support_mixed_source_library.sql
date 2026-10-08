alter table public.library_books
  add column if not exists source_type text not null default 'anyflip',
  add column if not exists cover_url text,
  add column if not exists blob_url text,
  add column if not exists file_name text;

alter table public.library_books
  drop constraint if exists library_books_source_type_check;

alter table public.library_books
  add constraint library_books_source_type_check
  check (source_type in ('anyflip', 'pdf', 'epub'));

-- Uploaded PDFs can exceed the AnyFlip 500-page ceiling.
alter table public.library_books
  drop constraint if exists library_books_page_count_check;

alter table public.library_books
  add constraint library_books_page_count_check
  check (page_count > 0);

-- AnyFlip keeps the old compound identity; uploads key on their blob path.
alter table public.library_books
  drop constraint if exists library_books_owner_book_unique;

alter table public.library_books
  add constraint library_books_owner_book_unique
  unique (user_id, source_type, publisher_id, book_id);

drop index if exists library_books_user_last_read_idx;
create index library_books_user_last_read_idx
  on public.library_books (user_id, last_read_at desc nulls last, created_at desc);

alter table public.library_books enable row level security;

grant select, insert, update, delete on public.library_books to authenticated;

drop policy if exists library_books_select_own on public.library_books;
create policy library_books_select_own
on public.library_books for select to authenticated
using (auth.uid() = user_id);

drop policy if exists library_books_insert_own on public.library_books;
create policy library_books_insert_own
on public.library_books for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists library_books_update_own on public.library_books;
create policy library_books_update_own
on public.library_books for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists library_books_delete_own on public.library_books;
create policy library_books_delete_own
on public.library_books for delete to authenticated
using (auth.uid() = user_id);
