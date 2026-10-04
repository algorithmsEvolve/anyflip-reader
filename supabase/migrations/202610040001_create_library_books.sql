create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  publisher_id text not null,
  book_id text not null,
  title text not null,
  page_count integer not null check (page_count > 0 and page_count <= 500),
  last_page integer not null default 1,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint library_books_last_page_check
    check (last_page >= 1 and last_page <= page_count),
  constraint library_books_owner_book_unique
    unique (user_id, publisher_id, book_id)
);

create index library_books_user_last_read_idx
  on public.library_books (user_id, last_read_at desc nulls last, created_at desc);

alter table public.library_books enable row level security;

grant select, insert, update, delete on public.library_books to authenticated;

create policy library_books_select_own
on public.library_books for select to authenticated
using (auth.uid() = user_id);

create policy library_books_insert_own
on public.library_books for insert to authenticated
with check (auth.uid() = user_id);

create policy library_books_update_own
on public.library_books for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy library_books_delete_own
on public.library_books for delete to authenticated
using (auth.uid() = user_id);
