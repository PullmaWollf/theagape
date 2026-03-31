-- ═══════════════════════════════════════════════════════════════
-- Célula Ágape — Schema Supabase
-- Execute este SQL no SQL Editor do Supabase Dashboard
-- ═══════════════════════════════════════════════════════════════

-- ── Habilitar extensão UUID ──
create extension if not exists "uuid-ossp";

-- ── Tabela de Usuários ──
create table if not exists public.usuarios (
  id          uuid primary key default uuid_generate_v4(),
  nome        text not null,
  login       text not null unique,
  senha_hash  text not null,
  role        text not null default 'membro' check (role in ('adm', 'membro')),
  push_sub    jsonb,           -- Web Push subscription object
  criado_em   timestamptz default now()
);

-- ── Tabela de Posts ──
create table if not exists public.posts (
  id          uuid primary key default uuid_generate_v4(),
  tipo        text not null default 'mensagem' check (tipo in ('versiculo', 'mensagem', 'aviso')),
  texto       text not null,
  autor_id    uuid references public.usuarios(id) on delete set null,
  autor_nome  text not null,
  criado_em   timestamptz default now()
);

-- ── Tabela de Escala de Lanche ──
create table if not exists public.escala (
  id          uuid primary key default uuid_generate_v4(),
  data_celula date not null,
  criado_em   timestamptz default now()
);

-- ── Tabela de Membros da Escala (relação N:N) ──
create table if not exists public.escala_membros (
  escala_id   uuid references public.escala(id) on delete cascade,
  usuario_id  uuid references public.usuarios(id) on delete cascade,
  primary key (escala_id, usuario_id)
);

-- ── Tabela de Alarmes da Escala ──
create table if not exists public.escala_alarmes (
  id          uuid primary key default uuid_generate_v4(),
  escala_id   uuid references public.escala(id) on delete cascade unique,
  ts          bigint not null,          -- timestamp Unix em ms
  extra_1d    boolean default false,
  extra_3h    boolean default false,
  extra_30m   boolean default false,
  criado_em   timestamptz default now()
);

-- ── View para buscar escala com membros ──
create or replace view public.escala_completa as
select
  e.id,
  e.data_celula,
  e.criado_em,
  coalesce(
    json_agg(
      json_build_object('id', u.id, 'nome', u.nome)
      order by u.nome
    ) filter (where u.id is not null),
    '[]'::json
  ) as membros,
  row_to_json(a.*) as alarme
from public.escala e
left join public.escala_membros em on em.escala_id = e.id
left join public.usuarios u on u.id = em.usuario_id
left join public.escala_alarmes a on a.escala_id = e.id
group by e.id, e.data_celula, e.criado_em, a.id, a.escala_id, a.ts, a.extra_1d, a.extra_3h, a.extra_30m, a.criado_em
order by e.data_celula;

-- ── Row Level Security ──
alter table public.usuarios enable row level security;
alter table public.posts enable row level security;
alter table public.escala enable row level security;
alter table public.escala_membros enable row level security;
alter table public.escala_alarmes enable row level security;

-- Políticas de leitura pública (todos podem ler)
create policy "Leitura pública de usuários" on public.usuarios
  for select using (true);

create policy "Leitura pública de posts" on public.posts
  for select using (true);

create policy "Leitura pública de escala" on public.escala
  for select using (true);

create policy "Leitura pública de membros da escala" on public.escala_membros
  for select using (true);

create policy "Leitura pública de alarmes" on public.escala_alarmes
  for select using (true);

-- Políticas de escrita (qualquer usuário autenticado via anon key pode escrever)
-- O controle de permissão (admin) é feito no frontend
create policy "Inserção anônima de posts" on public.posts
  for insert with check (true);

create policy "Exclusão anônima de posts" on public.posts
  for delete using (true);

create policy "Inserção anônima de usuários" on public.usuarios
  for insert with check (true);

create policy "Atualização anônima de usuários" on public.usuarios
  for update using (true);

create policy "Exclusão anônima de usuários" on public.usuarios
  for delete using (true);

create policy "Inserção anônima de escala" on public.escala
  for insert with check (true);

create policy "Exclusão anônima de escala" on public.escala
  for delete using (true);

create policy "Inserção anônima de membros" on public.escala_membros
  for insert with check (true);

create policy "Inserção anônima de alarmes" on public.escala_alarmes
  for insert with check (true);

create policy "Atualização anônima de alarmes" on public.escala_alarmes
  for update using (true);

create policy "Exclusão anônima de alarmes" on public.escala_alarmes
  for delete using (true);

-- ── Inserir usuário administrador padrão ──
-- Senha: agape2024 (armazenada como texto simples por simplicidade)
-- Em produção, use bcrypt ou similar
insert into public.usuarios (id, nome, login, senha_hash, role)
values (
  '00000000-0000-0000-0000-000000000001',
  'Administrador',
  'admin',
  'agape2024',
  'adm'
) on conflict (login) do nothing;

-- ── Post inicial de boas-vindas ──
insert into public.posts (tipo, texto, autor_id, autor_nome)
values (
  'versiculo',
  '"O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha." — 1 Coríntios 13:4',
  '00000000-0000-0000-0000-000000000001',
  'Administrador'
) on conflict do nothing;
