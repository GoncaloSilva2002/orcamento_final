-- Campos comerciais usados pelo catalogo de gavetas.
-- Executar no Supabase SQL Editor uma unica vez.

ALTER TABLE public.gaveta
  ADD COLUMN IF NOT EXISTS id_fornecedor bigint,
  ADD COLUMN IF NOT EXISTS preco_fornecedor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_revendedor numeric NOT NULL DEFAULT 0;

ALTER TABLE public.gaveta_componentes
  ADD COLUMN IF NOT EXISTS id_fornecedor bigint,
  ADD COLUMN IF NOT EXISTS preco_fornecedor numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS custo numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gaveta_id_fornecedor_fkey'
      AND conrelid = 'public.gaveta'::regclass
  ) THEN
    ALTER TABLE public.gaveta
      ADD CONSTRAINT gaveta_id_fornecedor_fkey
      FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gaveta_componentes_id_fornecedor_fkey'
      AND conrelid = 'public.gaveta_componentes'::regclass
  ) THEN
    ALTER TABLE public.gaveta_componentes
      ADD CONSTRAINT gaveta_componentes_id_fornecedor_fkey
      FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
