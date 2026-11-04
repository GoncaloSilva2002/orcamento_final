const fs = require('fs');
const path = require('path');

const CATEGORIES = [
  'plates',
  'paintings',
  'doorSystems',
  'hinges',
  'hingeComponents',
  'openingSystemComponents',
  'edges',
  'extras',
  'paintingComponents',
  'paintingMixDetails',
  'paintRecipes',
  'drawerComponents',
  'drawerRecipes'
];

const CATEGORY_TABLES = {
  plates: 'catalog_plates',
  paintings: 'catalog_paintings',
  doorSystems: 'catalog_door_systems',
  hinges: 'catalog_hinges',
  hingeComponents: 'catalog_hinge_components',
  openingSystemComponents: 'catalog_opening_system_components',
  edges: 'catalog_edges',
  extras: 'catalog_extras',
  paintingComponents: 'catalog_painting_components',
  paintingMixDetails: 'catalog_painting_mix_details',
  paintRecipes: 'catalog_paint_recipes',
  drawerComponents: 'catalog_drawer_components',
  drawerRecipes: 'catalog_drawer_recipes'
};

const DEFAULT_LABOR_PRICES = {
  plates: 2.02,
  edges: 0.32,
  drawers: 9.58
};

function normalizeCostType(value) {
  const text = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (text.includes('ambos') || text.includes('os 2') || text.includes('os dois') || text === '2') return 'ambos';
  if (text.includes('roupeiro')) return 'roupeiro';
  if (text.includes('cozinha')) return 'cozinha';
  return 'ambos';
}

function normalizeCostItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const source = item && typeof item === 'object' ? item : {};
    const name = String(source.name ?? source.nome ?? '').trim();
    const explicitType = normalizeCostType(source.type ?? source.tipo);
    const type = explicitType === 'ambos' ? normalizeCostType(name) : explicitType;
    const cost = Number(source.cost ?? source.custo ?? 0);
    const client = Number(source.client ?? source.preco_cliente ?? 0);
    return {
      id: source.id ?? source.catalogId ?? ('cost:legacy:' + index),
      name,
      type,
      cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      client: Number.isFinite(client) && client >= 0 ? client : 0
    };
  }).filter(item => item.name);
}

function ensureCostItems(data) {
  data.costs = normalizeCostItems(data.costs);
  return data;
}

function normalizeLaborPrices(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.keys(DEFAULT_LABOR_PRICES).reduce((result, key) => {
    const number = Number(source[key]);
    result[key] = Number.isFinite(number) && number >= 0 ? number : DEFAULT_LABOR_PRICES[key];
    return result;
  }, {});
}

function ensureLaborPrices(data) {
  data.laborPrices = normalizeLaborPrices(data.laborPrices);
  return data;
}

// Opcoes estruturais fixas do configurador. Nao sao catalogo comercial:
// nao dependem de fornecedores, precos ou dados criados pelo utilizador.
// Mantem-se no codigo para a aplicacao continuar funcional mesmo quando a
// base de dados nao tem uma tabela de metadados.
const STATIC_LISTS = {
  tipos: ['Inferior', 'Superior', 'Coluna', 'Roupeiro', 'Peças/Placa'],
  simNao: ['Sim', 'Não'],
  toposHorizontais: ['Sim', 'Não', 'Só Cima', 'Só Baixo'],
  toposLaterais: ['Sim', 'Não', 'Só Esquerda', 'Só Direita'],
  tipoLateralTopo: ['Não', 'Inteira', 'Sarrafo 15cm']
};

function createStaticTypePreset(type, family, dimensions) {
  const preset = {
    type,
    family,
    width: dimensions.width,
    height: dimensions.height,
    depth: dimensions.depth,
    doors: dimensions.doors,
    drawers: 0,
    shelves: dimensions.shelves,
    back: 1,
    divider: 0,
    interior: '',
    exterior: '',
    paintDoor: '',
    paintInterior: '',
    doorSystem: '',
    hinge: '',
    edgeType: '',
    topBottomEdges: dimensions.piece ? 'Não' : 'Sim',
    sideEdges: dimensions.piece ? 'Não' : 'Sim',
    sideLeftEdge: dimensions.piece ? 'Não' : 'Inteira',
    sideRightEdge: dimensions.piece ? 'Não' : 'Inteira',
    quantity: 1,
    unitClient: 0,
    unitCost: 0
  };
  preset.pricingBase = { ...preset };
  return preset;
}

const STATIC_TYPE_PRESETS = {
  Inferior: createStaticTypePreset('Inferior', 'ARMÁRIO COZINHA - CAIXOTES INFERIORES', { width: 15, height: 78, depth: 60, doors: 1, shelves: 0 }),
  Superior: createStaticTypePreset('Superior', 'ARMÁRIO COZINHA - CAIXOTES SUPERIORES', { width: 90, height: 100, depth: 40, doors: 2, shelves: 1 }),
  Coluna: createStaticTypePreset('Coluna', 'ARMÁRIO COZINHA - COLUNA', { width: 60, height: 240, depth: 60, doors: 1, shelves: 3 }),
  Roupeiro: createStaticTypePreset('Roupeiro', 'ARMÁRIO - ROUPEIRO', { width: 60, height: 240, depth: 60, doors: 1, shelves: 3 }),
  'Peças/Placa': createStaticTypePreset('Peças/Placa', 'PEÇAS / PLACA', { width: 100, height: 100, depth: 0, doors: 0, shelves: 0, piece: true })
};

function validateCatalog(data) {
  if (!data || data.schemaVersion !== 1 || !data.catalog || !data.lists || !data.typePresets || !data.feetPrices) {
    throw new Error('Catalogo invalido ou versao nao suportada.');
  }
  for (const key of CATEGORIES) {
    if (!Array.isArray(data.catalog[key])) throw new Error('Categoria invalida: ' + key);
    data.catalog[key].forEach((item, index) => {
      if (!item.catalogId) item.catalogId = key + ':legacy:' + index;
    });
  }
  return data;
}

function normalizeDoorSystemFields(name, reference) {
  const rawName = String(name || reference || '').replace(/\r/g, '').trim();
  const nameLines = rawName.split('\n').map(value => value.trim()).filter(Boolean);
  const displayName = nameLines[0] || rawName;
  const rawReference = String(reference || '').replace(/\r/g, '').trim();
  const referenceBody = rawReference.replace(/^componentes\s*:/i, '').trim();
  const referenceLines = referenceBody.split('\n').map(value => value.trim()).filter(Boolean);
  const components = [];
  const addComponent = value => {
    const text = String(value || '').trim().replace(/^componentes\s*:/i, '').trim();
    if (!text || text === displayName || components.includes(text)) return;
    components.push(text);
  };

  nameLines.slice(1).forEach(addComponent);
  if (referenceLines.length > 1 && referenceLines[0] === displayName) referenceLines.slice(1).forEach(addComponent);
  else if (referenceLines.length === 1 && referenceLines[0] !== displayName && referenceLines[0] !== rawName) addComponent(referenceLines[0]);

  return {
    name: displayName,
    reference: components.length ? 'Componentes: ' + components.join(' / ') : (rawReference || displayName)
  };
}

function normalizedDoorLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recoverDoorSystemName(name, reference, seedDoorSystems) {
  const storedName = String(name || '').trim();
  const hasSummaryName = /^componentes\s*:/i.test(storedName);
  if (storedName && !hasSummaryName) return storedName;
  const storedReference = String(reference || '').trim();
  const source = (storedReference || storedName)
    .replace(/^componentes\s*:/i, '')
    .trim();
  const parts = source.split(/\s*(?:\r?\n|\/)\s*/).map(value => normalizedDoorLookup(value)).filter(Boolean);
  if (!parts.length) return storedName;

  const matches = (seedDoorSystems || []).map(item => {
    const candidateReference = normalizedDoorLookup(item.reference);
    const matched = parts.filter(part => candidateReference.includes(part)).length;
    const candidateSize = String(item.reference || '').split(/\r?\n/).filter(Boolean).length;
    return { item, matched, candidateSize };
  }).filter(result => result.matched === parts.length)
    .sort((left, right) => left.candidateSize - right.candidateSize);

  return matches[0]?.item?.name || storedName;
}

function normalizeHingeFields(name, reference, seedHinges) {
  const rawName = String(name || '').replace(/\r/g, '').trim();
  const rawReference = String(reference || '').replace(/\r/g, '').trim();
  let displayName = rawName;
  const referenceLookup = normalizedDoorLookup(rawReference);
  const seedMatch = (seedHinges || []).find(item => {
    const candidateReference = normalizedDoorLookup(item.reference);
    if (!candidateReference || !referenceLookup) return false;
    if (referenceLookup.includes(candidateReference) || candidateReference.includes(referenceLookup)) return true;
    const lines = String(item.reference || '').split('\n').map(value => normalizedDoorLookup(value)).filter(Boolean);
    return lines.length > 1 && lines.every(line => referenceLookup.includes(line));
  });
  if (!displayName || normalizedDoorLookup(displayName) === referenceLookup) displayName = seedMatch?.name || displayName;
  if (!displayName) {
    const firstComponent = rawReference.search(/\d+(?:[.,]\d+)?\s*x\s+/i);
    displayName = firstComponent > 0 ? rawReference.slice(0, firstComponent).trim() : rawReference.split('\n')[0] || rawReference;
  }

  let cleanReference = rawReference;
  const nameLookup = normalizedDoorLookup(displayName);
  if (cleanReference && nameLookup && normalizedDoorLookup(cleanReference).startsWith(nameLookup)) {
    cleanReference = cleanReference.slice(displayName.length).replace(/^\s*[:;,_\-/]+\s*/, '').trim();
  }
  if (!cleanReference || normalizedDoorLookup(cleanReference) === nameLookup) cleanReference = rawReference || displayName;
  return { name: displayName || rawReference, reference: cleanReference || displayName };
}

function itemKey(category, item, index) {
  const candidates = [
    item && item.priceKey,
    item && item.key,
    item && item.id,
    item && item.name,
    item && item.item,
    item && item.label,
    item && item.reference
  ].filter(value => value !== undefined && value !== null && String(value).trim());
  return category + ':' + String(index).padStart(6, '0') + ':' + (candidates[0] ? String(candidates[0]) : 'row');
}

function buildRows(data, category) {
  return data.catalog[category].map((item, index) => ({
    item_key: itemKey(category, item, index),
    item_order: index,
    data: item
  }));
}

function createCatalogStore(options = {}) {
  const url = String(options.url || '').replace(/\/+$/, '');
  const key = options.key;
  const mode = options.mode || (url ? 'supabase' : 'local');
  const file = options.file || path.join(__dirname, '../data/catalog-local.json');
  const seed = options.seed || path.join(__dirname, '../data/catalog-seed.json');
  if (!['local', 'supabase'].includes(mode)) throw new Error('CATALOG_STORAGE deve ser local ou supabase.');
  let seedDoorSystems = [];
  let seedHinges = [];
  let seedHingeComponents = [];
  try {
    const seedData = JSON.parse(fs.readFileSync(seed, 'utf8'));
    seedDoorSystems = seedData?.catalog?.doorSystems || [];
    seedHinges = seedData?.catalog?.hinges || [];
    seedHingeComponents = seedData?.catalog?.hingeComponents || [];
  } catch (_) {
    // A base remota continua a funcionar mesmo sem o ficheiro de seed local.
  }

  async function request(resource, init = {}) {
    if (!url || !key) throw new Error('Configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.');
    const legacyDoorSystemFallback = init.__legacyDoorSystemFallback === true;
    const requestInit = { ...init };
    delete requestInit.__legacyDoorSystemFallback;
    const headers = { apikey: key, 'Content-Type': 'application/json', ...requestInit.headers };
    // Legacy JWT keys need Authorization; new sb_secret keys must stay in apikey.
    if (key.includes('.')) headers.Authorization = 'Bearer ' + key;
    const response = await fetch(url + '/rest/v1/' + resource, {
      ...requestInit,
      headers,
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error('O catalogo foi alterado por outro utilizador. Atualiza e tenta novamente.');
      const detail = await response.text();
      const table = resource.split('?')[0];
      if (!legacyDoorSystemFallback && (table === 'sistema_abertura' || table === 'ferragens') && response.status === 400 && /Could not find the 'nome' column/i.test(detail)) {
        try {
          const body = JSON.parse(requestInit.body || '{}');
          if (body && body.nome) {
            const reference = String(body.referencia || '').trim();
            const name = String(body.nome).trim();
            const fallbackBody = { ...body, referencia: reference && reference.toLowerCase().startsWith(name.toLowerCase()) ? reference : [name, reference].filter(Boolean).join('\n') };
            delete fallbackBody.nome;
            return request(resource, {
              ...requestInit,
              body: JSON.stringify(fallbackBody),
              __legacyDoorSystemFallback: true
            });
          }
        } catch (_) {
          // Deixa passar para a mensagem original se o corpo nao for JSON valido.
        }
      }
      // Antes da migração 20261103_add_plate_manual_prices.sql as placas não
      // têm as colunas manual_*: grava sem elas em vez de falhar.
      if (table === 'placas_madeira' && response.status === 400 && /Could not find the 'manual_(cliente|revendedor)' column/i.test(detail)) {
        try {
          const body = JSON.parse(requestInit.body || '{}');
          if (body && ('manual_cliente' in body || 'manual_revendedor' in body)) {
            delete body.manual_cliente;
            delete body.manual_revendedor;
            return request(resource, { ...requestInit, body: JSON.stringify(body) });
          }
        } catch (_) {
          // Deixa passar para a mensagem original se o corpo nao for JSON valido.
        }
      }
      // Erros 5xx podem trazer detalhes internos do servidor: ficam só no log.
      if (response.status >= 500) {
        console.error('Supabase: tabela ' + table + ' respondeu HTTP ' + response.status + '.', detail.slice(0, 300));
        throw new Error('Supabase: tabela ' + table + ' respondeu HTTP ' + response.status + '. Tenta novamente dentro de momentos.');
      }
      throw new Error('Supabase: tabela ' + table + ' respondeu HTTP ' + response.status + '. ' + detail.slice(0, 300));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function readSupabaseMaterials() {
    const metaRows = await request('app_catalog_meta?id=eq.main&select=lists,type_presets,feet_prices,revision');
    if (!metaRows.length) throw new Error('Catalogo ainda nao importado. Executa npm run migrate:supabase.');
    const laborRows = await request('mao_de_obra?select=codigo,valor').catch(() => []);
    const costRows = await request('custos?select=id,nome,tipo,custo,preco_cliente,ativo&ativo=eq.true&order=nome.asc').catch(() => []);
    const laborPrices = laborRows.reduce((result, row) => {
      const key = { placa_m2: 'plates', orla_ml: 'edges', gaveta: 'drawers' }[row.codigo];
      if (key) result[key] = row.valor;
      return result;
    }, {});
    const data = {
      schemaVersion: 1,
      catalog: {},
      lists: metaRows[0].lists,
      typePresets: metaRows[0].type_presets,
      feetPrices: metaRows[0].feet_prices,
      laborPrices: normalizeLaborPrices(laborPrices),
      costs: normalizeCostItems(costRows)
    };
    const categoryRows = await Promise.all(CATEGORIES.map(category =>
      request(CATEGORY_TABLES[category] + '?select=data&order=item_order.asc')
    ));
    CATEGORIES.forEach((category, index) => {
      data.catalog[category] = categoryRows[index].map(row => row.data);
    });
    return { data: validateCatalog(ensureCostItems(data)), revision: metaRows[0].revision };
  }

  function materialRow(row, category, index, extra = {}) {
    const reference = row.referencia || ('ID ' + row.id);
    const normalizedReference = String(reference).toLowerCase();
    const name = category === 'tintas'
      ? (normalizedReference.includes('alto brilho') ? 'Verniz Poliretano Alto Brilhante'
        : normalizedReference.includes('meio brilhante') ? 'Verniz Poliretano Meio Brilhante'
          : normalizedReference.includes('verniz poliuretano mate') || normalizedReference.includes('verniz poliretano mate') ? 'Verniz Mate Poliretano'
            : normalizedReference.includes('verniz acrilico') || normalizedReference.includes('verniz acrílico') ? 'Verniz Natur / Acrilico'
              : reference)
      : reference;
    const doorSystemName = category === 'sistema_abertura'
      ? recoverDoorSystemName(row.nome, reference, seedDoorSystems) || name
      : row.nome || name;
    const materialFields = category === 'sistema_abertura'
      ? normalizeDoorSystemFields(doorSystemName, reference)
      : category === 'ferragens'
        ? normalizeHingeFields(row.nome, reference, seedHinges)
        : { name: row.nome || name, reference };
    const item = {
      catalogId: category + ':' + row.id,
      name: materialFields.name,
      item: materialFields.name,
      label: materialFields.name,
      reference: materialFields.reference,
      supplierPrice: Number(row.preco_fornecedor || 0),
      supplierMeters: Number(row.metros_comprados || 0),
      cost: Number(row.custo || row.preco_fornecedor || 0),
      client: Number(row.preco_cliente || 0),
      reseller: category === 'tintas'
        ? Number(row.preco_cliente || 0)
        : Number(row.preco_revendedor ?? row.preco_cliente ?? 0)
    };
    // Placas: o modo manual/automático fica gravado na tabela. Sem valor
    // (coluna antiga ou vazia) o servidor deduz o modo pelo preço guardado.
    if (category === 'placas_madeira') {
      if (typeof row.manual_cliente === 'boolean') item.manualClient = row.manual_cliente;
      if (typeof row.manual_revendedor === 'boolean') item.manualReseller = row.manual_revendedor;
    }
    return { ...item, ...extra };
  }

  async function readUserDatabaseMaterials() {
    const get = table => request(table + '?select=*');
    const [plates, paints, hinges, edges, doors, handles, baseboards, others, leds, drawers, transport, ripados, components, paintComponents, drawerComponents, hingeComponents, openingComponents, types, suppliers, metaRows, laborRows, costRows] = await Promise.all([
      get('placas_madeira'), get('tintas'), request('ferragens?select=*,fornecedor!ferragens_id_fornecedor_fkey(fornecedor)'), get('orlas'), get('sistema_abertura'),
      request('puxadores?select=*,fornecedor!puxadores_id_fornecedor_fkey(fornecedor),tipo!puxadores_id_tipo_fkey(tipo)'),
      request('rodapes?select=*,fornecedor!rodapes_id_fornecedor_fkey(fornecedor),tipo!rodapes_id_tipo_fkey(tipo)'),
      request('outro?select=*,fornecedor!outro_id_fornecedor_fkey(fornecedor),tipo!outro_id_tipo_fkey(tipo)'),
      request('led?select=*,fornecedor!led_id_fornecedor_fkey(fornecedor)'),
      request('gaveta?select=*,tipo!gaveta_id_tipo_fkey(tipo)'),
      get('transporte_embalamento'),
      // Tabela nova; enquanto a migração não correr, a aba usa o item padrão do servidor.
      get('ripado_efeitos').catch(() => []),
      get('componente'), get('tinta_componentes'), get('gaveta_componentes'), get('ferragem_componentes'), get('sistema_abertura_componentes'), get('tipo'), get('fornecedor'),
      request('app_catalog_meta?select=lists,type_presets,feet_prices&order=revision.desc&limit=1').catch(() => []),
      request('mao_de_obra?select=codigo,valor').catch(() => []),
      request('custos?select=id,nome,tipo,custo,preco_cliente,ativo&ativo=eq.true&order=nome.asc').catch(() => [])
    ]);
    const typeById = new Map(types.map(row => [row.id, row.tipo]));
    const supplierById = new Map(suppliers.map(row => [row.id, row.fornecedor]));
    const supplierFor = row => (typeof row.fornecedor === 'string' ? row.fornecedor : row.fornecedor?.fornecedor) || supplierById.get(row.id_fornecedor) || '';
    const withType = row => ({
      ...(row.id_tipo ? {
        tipo: typeById.get(row.id_tipo) || ('ID ' + row.id_tipo),
        family: typeById.get(row.id_tipo) || '',
        handleUse: /os\s*2|os\s*dois|ambos/i.test(typeById.get(row.id_tipo) || '')
          ? 'ambos'
          : /roupeiro/i.test(typeById.get(row.id_tipo) || '')
            ? 'roupeiro'
            : /cozinha/i.test(typeById.get(row.id_tipo) || '') ? 'cozinha' : ''
      } : {}),
      ...(row.fornecedor?.fornecedor || row.id_fornecedor ? { supplier: row.fornecedor?.fornecedor || supplierById.get(row.id_fornecedor) || '' } : {})
    });
    const componentById = new Map(components.map(row => [row.id, row.componente]));
    const parentNameFor = row => {
      const parentMap = row.id_tinta
        ? paints
        : row.id_gaveta
          ? drawers
          : row.id_ferragem
            ? hinges
            : row.id_sistema_abertura
              ? doors
              : [];
      const parentId = row.id_tinta || row.id_gaveta || row.id_ferragem || row.id_sistema_abertura;
      const parent = parentMap.find(candidate => String(candidate.id) === String(parentId));
      if (row.id_tinta && parent) return materialRow(parent, 'tintas', parent.id).name;
      if (row.id_ferragem && parent) return materialRow(parent, 'ferragens', parent.id).name;
      if (row.id_sistema_abertura && parent) return materialRow(parent, 'sistema_abertura', parent.id).name;
      return parent?.nome || parent?.referencia || parent?.name || '';
    };
    const componentRows = rows => rows.map(row => {
      const parentId = row.id_tinta || row.id_gaveta || row.id_ferragem || row.id_sistema_abertura;
      const parentName = parentNameFor(row);
      return {
        catalogId: 'componente:' + row.id,
        item: componentById.get(row.id_componente) || ('ID ' + row.id_componente),
        label: componentById.get(row.id_componente) || ('ID ' + row.id_componente),
        reference: componentById.get(row.id_componente) || '',
        supplier: supplierById.get(row.id_fornecedor) || '',
        supplierPrice: Number(row.preco_fornecedor || 0),
        cost: Number(row.custo || row.preco_fornecedor || 0),
        client: 0, reseller: 0,
        detail: row.quantidade_litros ? 'Qtd: ' + String(row.quantidade_litros).replace('.', ',') + 'L' : '',
        parentId,
        // Keep the relation available to the browser so a component price
        // recalculates the material that contains it, even when the parent's
        // reference does not list the component text.
        usedIn: parentName,
        family: parentName
      };
    });
    const hingeComponentCatalog = componentRows(hingeComponents).map(component => {
      const code = String(component.item || '').match(/\b[A-Z]{1,5}[-\/]?[A-Z]*\d{2,}[A-Z0-9]*\b/i)?.[0] || '';
      const wanted = normalizedDoorLookup(component.item);
      const seedComponent = seedHingeComponents.find(candidate => {
        const candidateText = normalizedDoorLookup(candidate.item);
        return candidateText === wanted || (code && candidateText.includes(normalizedDoorLookup(code)));
      });
      if (!seedComponent) return component;
      return {
        ...component,
        label: component.label || seedComponent.label,
        reference: component.reference || seedComponent.reference,
        supplier: component.supplier || seedComponent.supplier,
        supplierPrice: Number(component.supplierPrice) || Number(seedComponent.supplierPrice) || 0,
        cost: Number(component.cost) || Number(seedComponent.cost) || 0
      };
    });
    const inferredHingeComponents = [];
    hinges.forEach(parentRow => {
      const parentItem = materialRow(parentRow, 'ferragens', parentRow.id);
      const parentComponents = hingeComponentCatalog.filter(component => String(component.parentId) === String(parentRow.id));
      const lines = String(parentItem.reference || '').split('\n').map(value => value.trim()).filter(Boolean);
      lines.forEach(line => {
        const componentText = line.replace(/^\s*\d+(?:[.,]\d+)?\s*x\s+/i, '').trim();
        if (!componentText) return;
        const supplierMatch = componentText.match(/\s*\(([^()]*)\)\s*$/);
        const supplierFromLine = supplierMatch?.[1] || '';
        const componentName = componentText.replace(/\s*\(([^()]*)\)\s*$/, '').trim();
        const code = componentName.match(/\b[A-Z]{1,5}[-\/]?[A-Z]*\d{2,}[A-Z0-9]*\b/i)?.[0] || '';
        const seedComponent = seedHingeComponents.find(candidate => {
          const candidateText = normalizedDoorLookup(candidate.item);
          const wantedText = normalizedDoorLookup(componentName);
          return candidateText === wantedText || (code && candidateText.includes(normalizedDoorLookup(code)));
        });
        const existing = parentComponents.some(component => {
          const currentText = normalizedDoorLookup(component.item);
          const wantedText = normalizedDoorLookup(componentName);
          return currentText === wantedText || (code && currentText.includes(normalizedDoorLookup(code)));
        });
        if (existing) return;
        inferredHingeComponents.push({
          group: 'Dobradicas / Ferragens',
          item: seedComponent?.item || componentName,
          label: seedComponent?.label || componentName,
          reference: seedComponent?.reference || componentName,
          supplier: seedComponent?.supplier || supplierFromLine,
          supplierPrice: Number(seedComponent?.supplierPrice || 0),
          cost: Number(seedComponent?.cost || 0),
          client: 0,
          reseller: 0,
          parentId: parentRow.id,
          usedIn: parentItem.name,
          family: parentItem.name,
          inferredFromReference: true
        });
      });
    });
    const allHingeComponents = hingeComponentCatalog.concat(inferredHingeComponents);
    const extras = [
      ...handles.map(row => materialRow(row, 'puxadores', row.id, { group: 'Puxadores', priceUnit: String(row.unidade_preco || '').trim().toLowerCase() === 'cm' ? 'cm' : 'unit', ...withType(row) })),
      ...baseboards.map(row => materialRow(row, 'rodapes', row.id, { group: 'Rodapés', ...withType(row) })),
      ...others.map(row => materialRow(row, 'outro', row.id, { group: 'Outros', ...withType(row) })),
      ...leds.map(row => materialRow(row, 'led', row.id, { group: 'LED', supplier: supplierFor(row) })),
      ...transport.map(row => materialRow(row, 'transporte_embalamento', row.id, { group: 'Transporte e embalamento', supplier: supplierFor(row) })),
      ...ripados.map(row => materialRow(row, 'ripado_efeitos', row.id, { group: 'Ripado/Efeitos', supplier: supplierFor(row) })),
      ...drawers.map(row => materialRow(row, 'gaveta', row.id, { group: 'Gavetas', supplier: supplierFor(row), ...withType(row) }))
    ];
    const data = {
      schemaVersion: 1,
      catalog: {
        plates: plates.map(row => materialRow(row, 'placas_madeira', row.id, { supplier: supplierFor(row) })),
        paintings: paints.map(row => materialRow(row, 'tintas', row.id, { supplier: supplierFor(row) })),
        doorSystems: doors.map(row => materialRow(row, 'sistema_abertura', row.id, { supplier: supplierFor(row) })),
        hinges: hinges.map(row => materialRow(row, 'ferragens', row.id, { supplier: supplierFor(row) })),
        hingeComponents: allHingeComponents, openingSystemComponents: componentRows(openingComponents), edges: edges.map(row => materialRow(row, 'orlas', row.id, { supplier: supplierFor(row) })),
        extras, paintingComponents: componentRows(paintComponents), paintingMixDetails: [], paintRecipes: [], drawerComponents: componentRows(drawerComponents), drawerRecipes: []
      },
      lists: {
        ...STATIC_LISTS,
        interiores: plates.map(row => row.nome || row.referencia || ('ID ' + row.id)),
        exteriores: plates.map(row => row.nome || row.referencia || ('ID ' + row.id)),
        pinturas: ['Nenhuma', ...paints.map(row => row.nome || row.referencia || ('ID ' + row.id))],
        sistemasPorta: doors.map(row => normalizeDoorSystemFields(row.nome || row.referencia || ('ID ' + row.id), row.referencia).name),
        dobradicas: hinges.map(row => materialRow(row, 'ferragens', row.id).name),
        orlas: edges.map(row => row.nome || row.referencia || ('ID ' + row.id)),
        extraGroups: [...new Set(extras.map(item => item.group).filter(Boolean))]
      },
      typePresets: STATIC_TYPE_PRESETS, feetPrices: {},
      laborPrices: normalizeLaborPrices((laborRows || []).reduce((result, row) => {
        const key = { placa_m2: 'plates', orla_ml: 'edges', gaveta: 'drawers' }[row.codigo];
        if (key) result[key] = row.valor;
        return result;
      }, {})),
      costs: normalizeCostItems(costRows)
    };
    const metadata = metaRows[0] || {};
    if (metadata.feet_prices && typeof metadata.feet_prices === 'object') data.feetPrices = metadata.feet_prices;
    return { data: validateCatalog(ensureCostItems(ensureLaborPrices(data))), revision: Date.now() };
  }

  async function read() {
    if (mode === 'supabase') return readUserDatabaseMaterials();
    if (fs.existsSync(file)) {
      const row = JSON.parse(fs.readFileSync(file, 'utf8'));
      validateCatalog(ensureCostItems(ensureLaborPrices(row.data)));
      row.data = ensureCostItems(ensureLaborPrices(row.data));
      return row;
    }
    return { data: validateCatalog(ensureCostItems(ensureLaborPrices(JSON.parse(fs.readFileSync(seed, 'utf8'))))), revision: 0 };
  }

  const USER_TABLES = {
    plates: 'placas_madeira', paintings: 'tintas', hinges: 'ferragens', edges: 'orlas',
    doorSystems: 'sistema_abertura', extras: null
  };

  async function supplierIdFor(item) {
    const name = String(item.supplier || '').trim();
    if (!name) return null;
    const existing = await request('fornecedor?select=id&fornecedor=eq.' + encodeURIComponent(name) + '&limit=1');
    if (existing.length) return existing[0].id;
    const created = await request('fornecedor', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ fornecedor: name }) });
    return created?.[0]?.id || null;
  }

  async function typeIdFor(item, table) {
    if (!['puxadores', 'rodapes', 'outro', 'gaveta'].includes(table)) return null;
    const type = item.tipo || (item.handleUse === 'cozinha' ? 'Cozinha' : item.handleUse === 'roupeiro' ? 'Roupeiro' : item.handleUse === 'ambos' ? 'Os 2' : '');
    if (!type) return null;
    let rows = await request('tipo?select=id&tipo=eq.' + encodeURIComponent(String(type).trim()) + '&limit=1');
    if (rows?.[0]?.id) return rows[0].id;
    if (String(type).trim() !== 'Os 2') return null;
    const created = await request('tipo', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ tipo: 'Os 2' }) });
    if (created?.[0]?.id) return created[0].id;
    rows = await request('tipo?select=id&tipo=eq.' + encodeURIComponent(String(type).trim()) + '&limit=1');
    return rows?.[0]?.id || null;
  }

  async function userRow(item, table) {
    // Transporte/embalamento é uma tabela antiga de preço manual e não tem
    // fornecedor, preço fornecedor nem preço revendedor.
    if (table === 'transporte_embalamento') {
      return {
        referencia: item.reference || item.name || item.item || '',
        custo: Number(item.cost || 0),
        preco_cliente: Number(item.client || 0)
      };
    }
    const row = {
      referencia: item.reference || item.name || item.item || '',
      preco_fornecedor: Number(item.supplierPrice || 0),
      preco_cliente: Number(item.client || 0)
    };
    // Os sistemas de abertura precisam de guardar o nome principal separado
    // da referência, que pode conter a lista completa de componentes.
    if (table === 'placas_madeira' || table === 'tintas' || table === 'sistema_abertura' || table === 'ferragens') {
      row.nome = item.name || item.item || item.label || row.referencia;
    }
    row.custo = Number(item.cost || 0);
    // A tabela de transporte/embalamento nao tem id_fornecedor.
    // As restantes tabelas de materiais mantem a relacao com fornecedor.
    const supplierTables = ['placas_madeira', 'tintas', 'ferragens', 'orlas', 'sistema_abertura', 'puxadores', 'rodapes', 'outro', 'led', 'gaveta', 'ripado_efeitos'];
    if (supplierTables.includes(table)) {
      const supplierId = await supplierIdFor(item);
      if (supplierId !== null) row.id_fornecedor = supplierId;
    }
    const typeId = await typeIdFor(item, table);
    if (typeId !== null) row.id_tipo = typeId;
    if (table === 'puxadores') {
      const priceUnit = String(item.priceUnit || item.unidade_preco || '').trim().toLowerCase();
      row.unidade_preco = priceUnit === 'cm' ? 'cm' : 'unit';
    }
    if (table === 'orlas') row.metros_comprados = Number(item.supplierMeters || 0);
    if (table === 'placas_madeira') {
      if (typeof item.manualClient === 'boolean') row.manual_cliente = item.manualClient;
      if (typeof item.manualReseller === 'boolean') row.manual_revendedor = item.manualReseller;
    }
    // Os sistemas de abertura tambem guardam o preco de revendedor.
    // Apenas as orlas nao usam esta coluna neste modelo.
    if (table !== 'orlas') {
      row.preco_revendedor = table === 'tintas'
        ? Number(item.client || 0)
        : Number(item.reseller || 0);
    }
    return row;
  }

  async function saveUserDatabaseMaterials(data, revision, changes) {
    const changedItems = category => changes
      ? (Array.isArray(changes[category]) ? changes[category] : [])
      : (data.catalog[category] || []);
    for (const [category, table] of Object.entries(USER_TABLES)) {
      if (!table) continue;
      for (const item of changedItems(category)) {
        if (item.__delete) {
          const match = String(item.catalogId || '').match(/:([1-9]\d*)$/);
          if (match) await request(table + '?id=eq.' + match[1], { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          else if (item.reference || item.name || item.item) {
            const reference = item.reference || item.name || item.item;
            await request(table + '?referencia=eq.' + encodeURIComponent(reference), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
          }
          continue;
        }
        const match = String(item.catalogId || '').match(/:([1-9]\d*)$/);
        const body = await userRow(item, table);
        if (match) {
          const updated = await request(table + '?id=eq.' + match[1], { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
          if (!Array.isArray(updated) || !updated.length) {
            // The UI can contain an ID from an older catalogue. Recover by
            // locating the current row through its reference.
            const reference = body.referencia;
            if (reference) {
              const existing = await request(table + '?select=id&referencia=eq.' + encodeURIComponent(reference) + '&limit=1');
              if (existing.length) {
                const repaired = await request(table + '?id=eq.' + existing[0].id, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
                if (Array.isArray(repaired) && repaired.length) continue;
              }
            }
            throw new Error('A tabela ' + table + ' não encontrou o material com id ' + match[1] + ' nem com a referência atual.');
          }
        } else if (item.catalogId && String(item.catalogId).startsWith('placas_madeira:')) {
          throw new Error('A placa existente perdeu o identificador. Atualiza a página antes de guardar para evitar duplicados.');
        } else if (body.referencia) {
          // Uma linha adicionada pelo utilizador é uma nova opção, mesmo que
          // outra já tenha a mesma referência. Só linhas existentes (com ID)
          // podem ser atualizadas; procurar apenas pela referência fazia a
          // nova linha substituir uma das anteriores.
          const existing = item.userAdded === true
            ? []
            : await request(table + '?select=id&referencia=eq.' + encodeURIComponent(body.referencia) + '&limit=1');
          if (existing.length) {
            const updated = await request(table + '?id=eq.' + existing[0].id, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
            if (!Array.isArray(updated) || !updated.length) throw new Error('A tabela ' + table + ' não atualizou o material com referência ' + body.referencia + '.');
          } else {
            const inserted = await request(table, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
            if (!Array.isArray(inserted) || !inserted.length) throw new Error('A tabela ' + table + ' não criou o material ' + body.referencia + '.');
          }
        }
      }
    }
    for (const item of changedItems('extras')) {
      const group = String(item.group || '').toLowerCase();
      const prefix = String(item.catalogId || '').split(':')[0];
      const table = { puxadores: 'puxadores', rodapes: 'rodapes', led: 'led', gaveta: 'gaveta', ripado_efeitos: 'ripado_efeitos' }[prefix] ||
      (group.includes('ripado') ? 'ripado_efeitos' : group.includes('puxador') ? 'puxadores' : group.includes('rodap') ? 'rodapes' : group.includes('led') ? 'led' : group.includes('transport') || group.includes('embal') ? 'transporte_embalamento' : group === 'outros' || group === 'outro' || group.includes('acess') ? 'outro' : group === 'gavetas' ? 'gaveta' : null);
      const match = String(item.catalogId || '').match(/^([^:]+):([1-9]\d*)$/);
      if (!table) continue;
      if (item.__delete) {
        if (match) await request(table + '?id=eq.' + match[2], { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        else if (item.reference || item.name || item.item) {
          const reference = item.reference || item.name || item.item;
          await request(table + '?referencia=eq.' + encodeURIComponent(reference), { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
        }
        continue;
      }
      const body = await userRow(item, table);
      if (match) {
        await request(table + '?id=eq.' + match[2], { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
      } else {
        const select = table === 'transporte_embalamento' ? 'id' : 'id,id_fornecedor';
        const existing = item.userAdded === true
          ? []
          : await request(table + '?select=' + select + '&referencia=eq.' + encodeURIComponent(body.referencia) + '&limit=20');
        const sameSupplier = table === 'transporte_embalamento'
          ? existing[0]
          : existing.find(row => String(row.id_fornecedor || '') === String(body.id_fornecedor || ''));
        if (sameSupplier) {
          await request(table + '?id=eq.' + sameSupplier.id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        } else {
          await request(table, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        }
      }
    }
    const componentRelations = {
      paintingComponents: ['tinta_componentes', 'id_tinta'],
      drawerComponents: ['gaveta_componentes', 'id_gaveta'],
      hingeComponents: ['ferragem_componentes', 'id_ferragem'],
      openingSystemComponents: ['sistema_abertura_componentes', 'id_sistema_abertura']
    };
    for (const [category, [relationTable, parentColumn]] of Object.entries(componentRelations)) {
      for (const item of changedItems(category)) {
        const name = String(item.item || item.label || item.reference || '').trim();
        let parentId = item.parentId;
        if (!parentId) {
          const parentName = String(item.usedIn || item.family || '').trim();
          const parentCategory = category === 'paintingComponents' ? 'paintings' :
            category === 'drawerComponents' ? 'extras' :
            category === 'hingeComponents' ? 'hinges' : 'doorSystems';
          const parent = (data.catalog[parentCategory] || []).find(candidate =>
            String(candidate.name || candidate.item || candidate.label || '').trim().toLowerCase() === parentName.toLowerCase()
          );
          const match = String(parent?.catalogId || '').match(/:([1-9]\d*)$/);
          if (match) parentId = Number(match[1]);
          if (!parentId && parentName) {
            const parentTable = category === 'paintingComponents' ? 'tintas' :
              category === 'hingeComponents' ? 'ferragens' :
              category === 'drawerComponents' ? 'gaveta' : 'sistema_abertura';
            // Itens principais acabados de criar ainda podem ter um catalogId
            // temporario. Resolve-os pela coluna disponivel e nao apenas pela
            // referencia, que pode conter a lista dos componentes.
            const wantedParent = String(parentName).trim().toLowerCase();
            const savedParents = await request(parentTable + '?select=*');
            const savedParent = (savedParents || []).find(row => [row.nome, row.referencia].some(value => {
              const text = String(value || '').replace(/\r/g, '').trim().toLowerCase();
              return text === wantedParent || text.startsWith(wantedParent + '\n') || text.startsWith(wantedParent + ' /');
            }));
            parentId = savedParent?.id || null;
          }
        }
        if (!name || !parentId) continue;
        // Components are options too: two user-added components may share the
        // same reference while belonging to different suppliers. Reusing the
        // first component row would make the later one overwrite its relation.
        let component = item.userAdded === true
          ? []
          : await request('componente?select=id&componente=eq.' + encodeURIComponent(name) + '&limit=1');
        if (!component.length) component = await request('componente', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ componente: name }) });
        const componentId = component?.[0]?.id;
        if (!componentId) continue;
        const exists = await request(relationTable + '?select=id&' + parentColumn + '=eq.' + encodeURIComponent(parentId) + '&id_componente=eq.' + encodeURIComponent(componentId) + '&limit=1');
        const relationBody = { [parentColumn]: parentId, id_componente: componentId };
        if (category === 'paintingComponents' || category === 'drawerComponents' || category === 'hingeComponents' || category === 'openingSystemComponents') {
          const supplierId = await supplierIdFor(item);
          // Supplier belongs to the component relation, never to its
          // reference/name. Explicit null also clears an old supplier.
          relationBody.id_fornecedor = supplierId;
          relationBody.preco_fornecedor = Number(item.supplierPrice || 0);
          relationBody.custo = Number(item.cost || 0);
          const liters = String(item.detail || '').match(/([0-9]+(?:[.,][0-9]+)?)\s*L/i);
          if (category === 'paintingComponents') relationBody.quantidade_litros = liters ? Number(liters[1].replace(',', '.')) : 0;
        }
        if (!exists.length) await request(relationTable, { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(relationBody) });
        else if (category === 'paintingComponents' || category === 'drawerComponents' || category === 'hingeComponents' || category === 'openingSystemComponents') await request(relationTable + '?id=eq.' + exists[0].id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(relationBody) });
      }
    }
    const laborRows = [
      { codigo: 'placa_m2', descricao: 'Mao de obra placas / madeira', unidade: 'm²', valor: data.laborPrices?.plates },
      { codigo: 'orla_ml', descricao: 'Mao de obra orlas', unidade: 'ml', valor: data.laborPrices?.edges },
    ].map(row => ({
      ...row,
      valor: Number.isFinite(Number(row.valor)) && Number(row.valor) >= 0 ? Number(row.valor) : DEFAULT_LABOR_PRICES[row.codigo === 'placa_m2' ? 'plates' : 'edges']
    }));
    const requestedLaborKeys = changes ? new Set(Object.keys(changes.laborPrices || {})) : null;
    for (const row of laborRows.filter(item => !requestedLaborKeys || requestedLaborKeys.has({ placa_m2: 'plates', orla_ml: 'edges' }[item.codigo]))) {
      const existing = await request('mao_de_obra?select=id&codigo=eq.' + encodeURIComponent(row.codigo) + '&limit=1');
      if (existing.length) {
        await request('mao_de_obra?id=eq.' + existing[0].id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      } else {
        await request('mao_de_obra', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
      }
    }
    const costsToSave = changes ? normalizeCostItems(changes.costs || []) : normalizeCostItems(data.costs);
    for (const item of costsToSave) {
      const body = {
        nome: item.name,
        tipo: item.type,
        custo: item.cost,
        preco_cliente: item.client,
        ativo: true
      };
      const match = String(item.id || '').match(/^(?:custos:)?([1-9]\d*)$/);
      if (match) {
        await request('custos?id=eq.' + match[1], { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
        item.id = 'custos:' + match[1];
      } else {
        const existing = await request('custos?select=id&nome=eq.' + encodeURIComponent(body.nome) + '&tipo=eq.' + encodeURIComponent(body.tipo) + '&limit=1');
        if (existing.length) {
          await request('custos?id=eq.' + existing[0].id, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
          item.id = 'custos:' + existing[0].id;
        } else {
          const inserted = await request('custos', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
          if (inserted?.[0]?.id) item.id = 'custos:' + inserted[0].id;
        }
      }
      const savedItem = (data.costs || []).find(candidate =>
        String(candidate.id || '') === String(item.id || '') ||
        String(candidate.name || '').trim().toLowerCase() === String(item.name || '').trim().toLowerCase() && String(candidate.type || '') === String(item.type || '')
      );
      if (savedItem) savedItem.id = item.id;
    }
    return { data, revision: revision + 1 };
  }

  async function save(data, revision, changes) {
    validateCatalog(data);
    if (mode === 'supabase') {
      return saveUserDatabaseMaterials(data, revision, changes);
    }
    const current = await read();
    if (current.revision !== revision) throw new Error('O catalogo foi alterado. Atualiza e tenta novamente.');
    const row = { data, revision: revision + 1 };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(row, null, 2));
    fs.renameSync(temporary, file);
    return row;
  }

  async function importSeed(data) {
    validateCatalog(data);
    if (mode !== 'supabase') throw new Error('A importacao requer Supabase configurado.');
    const existing = await request('app_catalog_meta?id=eq.main&select=revision');
    if (existing.length) return save(data, existing[0].revision);
    await request('app_catalog_meta', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ id: 'main', lists: data.lists, type_presets: data.typePresets, feet_prices: data.feetPrices, revision: 1 })
    });
    for (const category of CATEGORIES) {
      const rows = buildRows(data, category);
      if (rows.length) {
        await request(CATEGORY_TABLES[category], {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(rows)
        });
      }
    }
    const costs = normalizeCostItems(data.costs).map(item => ({
      nome: item.name,
      tipo: item.type,
      custo: item.cost,
      preco_cliente: item.client,
      ativo: true
    }));
    if (costs.length) {
      await request('custos', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(costs)
      });
    }
    return readSupabaseMaterials();
  }

  async function deleteUserDatabaseItem(category, catalogId, reference) {
    const tables = {
      plates: 'placas_madeira', paintings: 'tintas', doorSystems: 'sistema_abertura',
      hinges: 'ferragens', edges: 'orlas', paintingComponents: 'tinta_componentes',
      hingeComponents: 'ferragem_componentes', openingSystemComponents: 'sistema_abertura_componentes',
      drawerComponents: 'gaveta_componentes', puxadores: 'puxadores', rodapes: 'rodapes',
      outro: 'outro', led: 'led', gaveta: 'gaveta', transporte_embalamento: 'transporte_embalamento',
      ripado_efeitos: 'ripado_efeitos'
    };
    const prefix = String(catalogId || '').split(':')[0];
    const table = tables[category] || tables[prefix] || ({
      extras: prefix === 'puxadores' ? 'puxadores' : prefix === 'rodapes' ? 'rodapes' : prefix === 'led' ? 'led' : prefix === 'gaveta' ? 'gaveta' : 'outro'
    }[category]);
    if (mode !== 'supabase' || !table) throw new Error('Tipo de material inválido para eliminação.');
    const id = String(catalogId || '').match(/:([1-9]\d*)$/)?.[1];
    if (!id) throw new Error('O material não tem identificador. Atualiza a página antes de eliminar para não remover outras linhas com a mesma referência.');
    const query = table + '?id=eq.' + id;
    await request(query, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return readUserDatabaseMaterials();
  }

  async function deleteCostItem(costId) {
    const rawId = String(costId || '').trim();
    if (!rawId) throw new Error('Custo sem identificador para eliminar.');
    if (mode === 'supabase') {
      const id = rawId.match(/^(?:custos:)?([1-9]\d*)$/)?.[1];
      if (!id) throw new Error('Identificador do custo inválido. Atualiza a página e tenta novamente.');
      await request('custos?id=eq.' + id, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return readUserDatabaseMaterials();
    }
    const current = await read();
    current.data = ensureCostItems(current.data);
    current.data.costs = current.data.costs.filter(item => String(item.id) !== rawId);
    return save(current.data, current.revision);
  }

  return { mode, read, save, importSeed, deleteUserDatabaseItem, deleteCostItem };
}

module.exports = { createCatalogStore, validateCatalog, CATEGORIES, CATEGORY_TABLES };
