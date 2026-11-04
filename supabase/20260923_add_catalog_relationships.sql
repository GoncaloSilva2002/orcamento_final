-- Relações usadas pelo catálogo de fornecedores.
-- Executar no Supabase SQL Editor uma única vez.

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['placas_madeira', 'tintas', 'ferragens', 'orlas', 'sistema_abertura', 'puxadores', 'rodapes', 'outro', 'led', 'gaveta'] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = tbl AND c.column_name = 'id_fornecedor') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = tbl || '_id_fornecedor_fkey' AND conrelid = ('public.' || tbl)::regclass) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id)', tbl, tbl || '_id_fornecedor_fkey');
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  tbl text;
BEGIN
  ALTER TABLE public.outro ADD COLUMN IF NOT EXISTS id_tipo bigint;
  ALTER TABLE public.gaveta ADD COLUMN IF NOT EXISTS id_tipo bigint;
  FOREACH tbl IN ARRAY ARRAY['puxadores', 'rodapes', 'outro', 'gaveta'] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = tbl AND c.column_name = 'id_tipo') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = tbl || '_id_tipo_fkey' AND conrelid = ('public.' || tbl)::regclass) THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (id_tipo) REFERENCES public.tipo(id)', tbl, tbl || '_id_tipo_fkey');
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.orlas ADD COLUMN IF NOT EXISTS metros_comprados numeric;
ALTER TABLE public.ferragens ADD COLUMN IF NOT EXISTS custo numeric;
ALTER TABLE public.ferragens ADD COLUMN IF NOT EXISTS preco_cliente numeric;
ALTER TABLE public.ferragens ADD COLUMN IF NOT EXISTS preco_revendedor numeric;
ALTER TABLE public.ferragens ALTER COLUMN referencia TYPE text;
ALTER TABLE public.sistema_abertura ALTER COLUMN referencia TYPE text;
ALTER TABLE public.placas_madeira ADD COLUMN IF NOT EXISTS nome text;
ALTER TABLE public.tinta_componentes ADD COLUMN IF NOT EXISTS id_fornecedor bigint;
ALTER TABLE public.tinta_componentes ADD COLUMN IF NOT EXISTS preco_fornecedor numeric;
ALTER TABLE public.tinta_componentes ADD COLUMN IF NOT EXISTS custo numeric;
ALTER TABLE public.tinta_componentes ADD COLUMN IF NOT EXISTS quantidade_litros numeric;
ALTER TABLE public.ferragem_componentes ADD COLUMN IF NOT EXISTS id_fornecedor bigint;
ALTER TABLE public.ferragem_componentes ADD COLUMN IF NOT EXISTS preco_fornecedor numeric;
ALTER TABLE public.ferragem_componentes ADD COLUMN IF NOT EXISTS custo numeric;
ALTER TABLE public.sistema_abertura_componentes ADD COLUMN IF NOT EXISTS id_fornecedor bigint;
ALTER TABLE public.sistema_abertura_componentes ADD COLUMN IF NOT EXISTS preco_fornecedor numeric;
ALTER TABLE public.sistema_abertura_componentes ADD COLUMN IF NOT EXISTS custo numeric;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tinta_componentes_id_fornecedor_fkey') THEN
    ALTER TABLE public.tinta_componentes ADD CONSTRAINT tinta_componentes_id_fornecedor_fkey FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ferragem_componentes_id_fornecedor_fkey') THEN
    ALTER TABLE public.ferragem_componentes ADD CONSTRAINT ferragem_componentes_id_fornecedor_fkey FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sistema_abertura_componentes_id_fornecedor_fkey') THEN
    ALTER TABLE public.sistema_abertura_componentes ADD CONSTRAINT sistema_abertura_componentes_id_fornecedor_fkey FOREIGN KEY (id_fornecedor) REFERENCES public.fornecedor(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
