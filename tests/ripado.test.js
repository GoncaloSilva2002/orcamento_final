const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.CATALOG_STORAGE = 'local';
process.env.CATALOG_LOCAL_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'silwood-ripado-')), 'catalog.json');
const { app } = require('../src/server');

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

async function ripadoLine(quantity) {
  return (await calculate({ modules: [], extras: [{ group: 'Ripado/Efeitos', item: 'Ripado', quantity }] })).extras[0];
}

test('ripado costs 85 per unit below 10 units', async () => {
  const line = await ripadoLine(9);
  assert.equal(line.unitClient, 85);
  assert.equal(line.totalClient, 765);
});

test('ripado costs 65% of 85 per unit from 10 units', async () => {
  const line = await ripadoLine(10);
  assert.equal(line.unitClient, 55.25);
  assert.equal(line.totalClient, 552.5);
});

test('efeito almofada recuada costs 15% of the chosen module client price', async () => {
  const plate = require('../data/catalog-seed.json').catalog.plates.find(item => Number(item.client) > 0).name;
  const module = { id: 'module_test', type: 'Inferior', quantity: 2, width: 60, height: 78, depth: 60, doors: 1, back: 1, interior: plate, exterior: plate };
  const plain = await calculate({ modules: [module], extras: [] });
  const moduleClient = plain.modules[0].unitClient;
  assert.ok(moduleClient > 0);
  const quote = await calculate({
    modules: [module],
    extras: [{ group: 'Ripado/Efeitos', item: 'Efeito almofada recuada', quantity: 2, targetModuleId: 'module_test' }]
  });
  const expected = Math.round(moduleClient * 0.15 * 100) / 100;
  assert.equal(quote.extras[0].unitClient, expected);
  assert.equal(quote.extras[0].totalClient, Math.round(expected * 2 * 100) / 100);
});

test('efeito almofada recuada without a module costs nothing', async () => {
  const quote = await calculate({ modules: [], extras: [{ group: 'Ripado/Efeitos', item: 'Efeito almofada recuada', quantity: 1 }] });
  assert.equal(quote.extras[0].unitClient, 0);
});

test('redondos costs 200 per unit', async () => {
  const line = (await calculate({ modules: [], extras: [{ group: 'Ripado/Efeitos', item: 'Redondos', quantity: 2 }] })).extras[0];
  assert.equal(line.unitClient, 200);
  assert.equal(line.totalClient, 400);
});
