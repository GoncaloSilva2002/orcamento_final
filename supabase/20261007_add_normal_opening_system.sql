-- O sistema Normal nao tem componentes nem custo proprio.
-- Fica disponivel como extra, mas continua a vir exclusivamente da base de dados.
INSERT INTO public.sistema_abertura (referencia, preco_fornecedor, custo, preco_cliente)
SELECT 'Normal', 0, 0, 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sistema_abertura
  WHERE lower(trim(referencia)) = 'normal'
);

NOTIFY pgrst, 'reload schema';
