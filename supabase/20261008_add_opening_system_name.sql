-- Guarda o nome principal separado da referencia/componentes do sistema.
-- A coluna e opcional para instalacoes antigas e nao altera os precos existentes.
ALTER TABLE public.sistema_abertura
  ADD COLUMN IF NOT EXISTS nome text;

-- Mantem tambem o nome principal das dobradicas separado da referencia
-- que pode listar varios componentes.
ALTER TABLE public.ferragens
  ADD COLUMN IF NOT EXISTS nome text;

-- Converte as linhas de componentes que estavam apenas na referencia em
-- relacoes reais. A operacao e idempotente e nao altera os precos da ferragem.
DO $$
DECLARE
  ferragem_row record;
  component_line text;
  component_name text;
  component_id bigint;
BEGIN
  FOR ferragem_row IN
    SELECT id, referencia
    FROM public.ferragens
    WHERE referencia IS NOT NULL
  LOOP
    FOR component_line IN
      SELECT regexp_split_to_table(ferragem_row.referencia, E'\r?\n|[[:space:]]+/[[:space:]]+')
    LOOP
      IF component_line !~* '[0-9]+([.,][0-9]+)?[[:space:]]*[xX][[:space:]]+' THEN
        CONTINUE;
      END IF;
      component_line := regexp_replace(component_line, '^.*[0-9]+([.,][0-9]+)?[[:space:]]*[xX][[:space:]]+', '', 'i');
      component_name := btrim(regexp_replace(component_line, '[[:space:]]*\([^()]*\)[[:space:]]*$', '', 'g'));
      IF component_name = '' THEN
        CONTINUE;
      END IF;

      SELECT id INTO component_id
      FROM public.componente
      WHERE lower(trim(componente)) = lower(trim(component_name))
      LIMIT 1;

      IF component_id IS NULL THEN
        INSERT INTO public.componente (componente)
        VALUES (component_name)
        RETURNING id INTO component_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM public.ferragem_componentes
        WHERE id_ferragem = ferragem_row.id
          AND id_componente = component_id
      ) THEN
        INSERT INTO public.ferragem_componentes (id_ferragem, id_componente)
        VALUES (ferragem_row.id, component_id);
      END IF;
      component_id := NULL;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
