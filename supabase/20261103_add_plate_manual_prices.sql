-- Placas: guardar se o preço cliente/revendedor é manual ou automático.
-- Automático = custo x 1,92 (cliente) e custo x 1,45 (revendedor), recalculado
-- sempre que o custo muda. Todas as placas passam a automático; o botão
-- "Auto" volta a pôr uma placa manual em automático.
ALTER TABLE public.placas_madeira
  ADD COLUMN IF NOT EXISTS manual_cliente boolean,
  ADD COLUMN IF NOT EXISTS manual_revendedor boolean;

UPDATE public.placas_madeira
SET manual_cliente = false, manual_revendedor = false
WHERE manual_cliente IS NULL OR manual_revendedor IS NULL;

NOTIFY pgrst, 'reload schema';
