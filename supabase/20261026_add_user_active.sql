-- A tabela public.utilizador é a origem dos utilizadores da aplicação.
-- Esta coluna suporta o estado Ativo/Inativo mostrado no painel.
alter table public.utilizador
  add column if not exists active boolean not null default true;
