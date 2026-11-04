-- Guarda se o preço do puxador é por unidade ou por centímetro.
ALTER TABLE public.puxadores
  ADD COLUMN IF NOT EXISTS unidade_preco text NOT NULL DEFAULT 'unit';

UPDATE public.puxadores
SET unidade_preco = 'unit'
WHERE unidade_preco IS NULL OR unidade_preco NOT IN ('unit', 'cm');

ALTER TABLE public.puxadores
  DROP CONSTRAINT IF EXISTS puxadores_unidade_preco_check;

ALTER TABLE public.puxadores
  ADD CONSTRAINT puxadores_unidade_preco_check CHECK (unidade_preco IN ('unit', 'cm'));

NOTIFY pgrst, 'reload schema';
