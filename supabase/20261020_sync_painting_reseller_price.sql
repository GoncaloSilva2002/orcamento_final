-- Nas pinturas, o preco de revendedor acompanha sempre o preco cliente.
UPDATE public.tintas
SET preco_revendedor = preco_cliente
WHERE preco_revendedor IS DISTINCT FROM preco_cliente;
