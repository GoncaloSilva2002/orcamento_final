-- Guarda o nome/titulo do servico de pintura separadamente da referencia.
ALTER TABLE public.tintas
  ADD COLUMN IF NOT EXISTS nome text;

-- Mantem os titulos conhecidos que a aplicacao inferia da referencia.
UPDATE public.tintas
SET nome = CASE
  WHEN lower(coalesce(referencia, '')) LIKE '%alto brilho%'
    THEN 'Verniz Poliuretano Alto Brilhante'
  WHEN lower(coalesce(referencia, '')) LIKE '%meio brilhante%'
    THEN 'Verniz Poliuretano Meio Brilhante'
  WHEN lower(coalesce(referencia, '')) LIKE '%verniz poliuretano mate%'
    OR lower(coalesce(referencia, '')) LIKE '%verniz poliretano mate%'
    THEN 'Verniz Mate Poliuretano'
  WHEN lower(coalesce(referencia, '')) LIKE '%verniz acrilico%'
    OR lower(coalesce(referencia, '')) LIKE '%verniz acrílico%'
    THEN 'Verniz Natur / Acrílico'
  ELSE referencia
END
WHERE nullif(trim(nome), '') IS NULL;

NOTIFY pgrst, 'reload schema';
