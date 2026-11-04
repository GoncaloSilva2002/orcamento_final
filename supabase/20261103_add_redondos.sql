-- Item "Redondos" na aba "Ripado/Efeitos": custa 200 EUR ao cliente por unidade.
INSERT INTO public.ripado_efeitos (referencia, preco_cliente, preco_revendedor)
SELECT 'Redondos', 200, 200
WHERE NOT EXISTS (SELECT 1 FROM public.ripado_efeitos WHERE referencia = 'Redondos');

NOTIFY pgrst, 'reload schema';
