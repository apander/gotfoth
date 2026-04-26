alter table if exists public.app_users
    add column if not exists password_plaintext text;

update public.app_users
set password_plaintext = password_hash
where password_plaintext is null
  and password_hash is not null
  and btrim(password_hash) <> '';
