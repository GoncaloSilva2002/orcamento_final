const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const catalogFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'silwood-carpentry-')), 'catalog.json');
const seed = structuredClone(require('../data/catalog-seed.json'));
seed.catalog.extras.push({ group: 'Carpintaria', item: 'Porta Lacada Teste', name: 'Porta Lacada Teste', label: 'Porta Lacada Teste', reference: 'Porta Lacada Teste', cost: 50, client: 120, reseller: 100 });
fs.writeFileSync(catalogFile, JSON.stringify({ data: seed, revision: 1 }));
process.env.CATALOG_STORAGE = 'local';
process.env.CATALOG_LOCAL_FILE = catalogFile;
const { app, calculateQuote } = require('../src/server');

async function calculate(body) {
  const server = app.listen(0);
  try {
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return response.json();
  } finally {
    server.close();
  }
}

const carpentryModule = { id: 'c1', blank: true, carpentry: true, carpentryItem: 'Porta Lacada Teste', type: '', quantity: 2, width: 50, height: 200 };

test('carpentry article on a module is priced per m2 of width x height', async () => {
  const line = (await calculate({ modules: [carpentryModule], extras: [] })).modules[0];
  assert.equal(line.unitClient, 120);
  assert.equal(line.unitCost, 50);
  assert.equal(line.totalClient, 240);
});

test('carpentry article uses the reseller price in reseller mode', async () => {
  await calculate({ modules: [], extras: [] }); // make sure the catalog is loaded
  const line = calculateQuote({ pricingMode: 'reseller', modules: [carpentryModule], extras: [] }).modules[0];
  assert.equal(line.unitClient, 100);
});

test('a module without a carpentry article is unchanged', async () => {
  const line = (await calculate({ modules: [{ ...carpentryModule, carpentryItem: '' }], extras: [] })).modules[0];
  assert.equal(line.unitClient, 0);
});

// Carpintaria por tipo: preço calculado pela madeira escolhida, como as portas dos módulos.
// Os preços das placas são recalculados pelo servidor, por isso os testes comparam linhas entre si.
const wood = seed.catalog.plates[0];
const hinge = seed.catalog.hinges.find(item => item.name === 'Dobradiça Standard (com mola)');
const typed = { id: 'c2', blank: true, carpentry: true, carpentryItem: '', type: '', quantity: 1, width: 50, height: 200, interior: wood.name, edgeType: 'Orla - À Cor', paintInterior: 'Nenhuma' };
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, a + ' != ' + b);
const price = async module => (await calculate({ modules: [{ ...typed, ...module }], extras: [] })).modules[0].unitClient;

test('carpentry is priced from the chosen wood and hinges, without edge banding', async () => {
  const woodOnly = await price({ carpentryType: 'Porta de correr', edgeType: 'Serviço Sem Orla' }); // 1 m2
  assert.ok(woodOnly > 0);
  const sliding = await price({ carpentryType: 'Porta de correr' }); // a orla escolhida já não conta
  close(sliding, woodOnly);
  // Porta de abrir com 200 cm de altura: 4 dobradiças.
  close(await price({ carpentryType: 'Porta', hinge: hinge.name }), sliding + 4 * hinge.client);
  // Variantes: Standard e Meio Fio levam dobradiças; correr e pivot não.
  close(await price({ carpentryType: 'Porta Standard', hinge: hinge.name }), sliding + 4 * hinge.client);
  close(await price({ carpentryType: 'Porta Meio Fio', hinge: hinge.name }), sliding + 4 * hinge.client);
  // Portas à face: também de abrir, com dobradiças.
  close(await price({ carpentryType: 'Porta Standard à Face', hinge: hinge.name }), sliding + 4 * hinge.client);
  close(await price({ carpentryType: 'Porta Meio Fio à Face', hinge: hinge.name }), sliding + 4 * hinge.client);
  close(await price({ carpentryType: 'Porta de Correr Standard', hinge: hinge.name }), sliding);
  close(await price({ carpentryType: 'Porta Pivot', hinge: hinge.name }), sliding);
  // Rodapé 300 x 10: 0,3 m2.
  close(await price({ carpentryType: 'Rodapés', width: 300, height: 10 }), 0.3 * woodOnly);
});

test('carpentry without wood or type costs nothing', async () => {
  assert.equal(await price({ carpentryType: 'Porta', interior: '' }), 0);
  assert.equal(await price({ carpentryType: '' }), 0);
});

// Aro: a Prof. é a profundidade do aro. (2 x altura + largura) x profundidade dá os m2,
// pagos ao preço da madeira da porta. Porta 50 x 200 com aro de 10 cm: 0,45 m2.
test('the frame depth adds the frame area at the door wood price', async () => {
  const base = { carpentryType: 'Porta de Correr Standard', edgeType: 'Serviço Sem Orla' };
  const woodOnly = await price({ ...base, depth: 0 }); // 1 m2 de porta
  close(await price({ ...base, depth: 10 }), woodOnly + 0.45 * woodOnly);
  // Rodapés não têm aro: a profundidade não conta.
  close(await price({ carpentryType: 'Rodapés', width: 300, height: 10, depth: 10 }), await price({ carpentryType: 'Rodapés', width: 300, height: 10, depth: 0 }));
});

// Preço por m2 da madeira escolhida (já com margem) x m2 totais (porta + bandeira + aro).
const woodLine = async module => (await calculate({ modules: [{ ...typed, edgeType: 'Serviço Sem Orla', ...module }], extras: [] })).modules[0];

test('the door, frame and transom area are priced at the chosen wood price per m2', async () => {
  const door = { carpentryType: 'Porta de Correr Standard', width: 87.5, height: 204.5, depth: 16 };
  const line = await woodLine(door);
  const area = (87.5 * 204.5 + (2 * 204.5 + 87.5) * 16) / 10000;
  close(line.carpentryArea, area);
  assert.ok(line.woodPricePerM2 > 0);
  close(line.unitClient, area * line.woodPricePerM2);
  // Aro sem topo: só as 2 laterais.
  const noTop = await woodLine({ ...door, frameTop: 'sem' });
  close(line.unitClient - noTop.unitClient, 87.5 * 16 / 10000 * line.woodPricePerM2);
  // Porta pivot com bandeira 50: bandeira 87,5 x 50 e laterais do aro 50 cm mais altas.
  const pivot = await woodLine({ ...door, carpentryType: 'Porta Pivot' });
  const pivotTransom = await woodLine({ ...door, carpentryType: 'Porta Pivot', transomHeight: 50 });
  close(pivotTransom.unitClient - pivot.unitClient, (87.5 * 50 + 2 * 50 * 16) / 10000 * line.woodPricePerM2);
  // Bandeira só na pivot.
  close((await woodLine({ ...door, transomHeight: 50 })).unitClient, line.unitClient);
  // Rodapé: só largura x altura.
  const skirting = await woodLine({ carpentryType: 'Rodapés', width: 300, height: 10, depth: 16 });
  close(skirting.unitClient, 0.3 * line.woodPricePerM2);
});

// O aro tem a sua madeira: m2 da porta à madeira da porta, m2 do aro à madeira do aro.
test('the frame is priced with its own wood', async () => {
  const other = seed.catalog.plates.find(plate => plate.name !== wood.name && Number(plate.client) > 0 && Number(plate.client) !== Number(wood.client));
  const door = { carpentryType: 'Porta de Correr Standard', width: 80, height: 200, depth: 10 };
  const sameWood = await woodLine(door);
  const otherWood = await woodLine({ ...door, interior: other.name });
  const mixed = await woodLine({ ...door, frameWood: other.name });
  // Porta 1,6 m2; aro (2 x 200 + 80) x 10 = 0,48 m2.
  close(mixed.unitClient, 1.6 * sameWood.woodPricePerM2 + 0.48 * otherWood.woodPricePerM2);
});
