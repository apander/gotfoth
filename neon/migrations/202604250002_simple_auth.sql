create table if not exists public.app_users (
    id text primary key,
    username text not null unique,
    password_hash text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
    id text primary key,
    user_id text not null references public.app_users(id) on delete cascade,
    token_hash text not null unique,
    remember_me boolean not null default false,
    expires_at timestamptz not null,
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx on public.app_sessions(user_id);
create index if not exists app_sessions_expires_at_idx on public.app_sessions(expires_at);
