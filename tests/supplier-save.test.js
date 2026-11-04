const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');

test('saving untouched displayed prices keeps automatic prices and full precision', () => {
  let tracked = 0;
  const item = { client: 10.014, manualClient: false };
  const context = vm.createContext({
    supplierManualPriceList: () => [item],
    num: value => Number(String(value).replace(',', '.')),
    salePriceValue: Number,
    supplierNumber: value => Number(value).toFixed(2),
    clone: structuredClone,
    ensureManualPriceBaseline: () => {},
    trackManualPriceChange: () => { tracked += 1; }
  });
  vm.runInContext(source.slice(source.indexOf('function commitSupplierManualPriceInput('), source.indexOf('function commitVisibleSupplierManualPrices(')), context);
  const input = { dataset: { manualPriceType: 'plates', manualPriceIndex: '0', manualPriceField: 'client' }, value: '10.01' };
  assert.equal(context.commitSupplierManualPriceInput(input), false);
  assert.equal(item.client, 10.014);
  assert.equal(item.manualClient, false);
  assert.equal(tracked, 0);
  input.value = '12,34';
  assert.equal(context.commitSupplierManualPriceInput(input), true);
  assert.equal(item.client, 12.34);
  assert.equal(item.manualClient, true);
  assert.equal(context.commitSupplierManualPriceInput(input), false);
  assert.equal(tracked, 1);
});

test('a refresh failure after saving acknowledges the save; a write failure discards drafts', async () => {
  for (const succeeds of [true, false]) {
    let pending = true;
    let notice = null;
    const button = {};
    const context = vm.createContext({
      document: { querySelector: () => button },
      sourceStatus: {}, state: { catalog: { hinges: [], doorSystems: [], openingSystemComponents: [] } }, console: { error: () => {} },
      canManagePrices: () => true,
      setSupplierSaveNotice: (message, stateName) => { notice = { message, stateName }; },
      setSupplierSaveButtonState: (saving) => { button.disabled = saving; },
      trackSupplierChange: () => {},
      commitVisibleSupplierManualPrices: () => {}, flushSupplierDraftPersist: () => {},
      supplierRecalculationTimer: null,
      hasSupplierDirtyChanges: () => pending,
      restoreSupplierDirtyChanges: () => false,
      recalculateSystemSummaries: () => {},
      activeDoorSystems: () => [],
      systemRecipeTotals: () => ({ components: 0 }),
      syncDoorSystemExtras: () => {},
      supplierSavePayload: () => ({ plates: [{ catalogId: 'a', reference: 'NEW' }] }),
      acknowledgeSupplierChanges: () => { pending = false; },
      clearSupplierDirtyChanges: () => { pending = false; },
      applySupplierCatalogResponse: () => {},
      applySupplierAdditions: () => {},
      applySupplierDraftChanges: () => {},
      fetch: async () => ({ ok: succeeds }),
      readJson: async () => ({ plates: [], error: 'Write failed' }),
      normalizeAllPlateNames: () => { throw new Error('Refresh failed'); }
    });
    vm.runInContext(source.slice(source.indexOf('async function saveSupplierPrices('), source.indexOf('async function showView(')), context);
    await context.saveSupplierPrices();
    if (succeeds) {
      assert.equal(pending, false);
      assert.match(context.sourceStatus.textContent, /Precos guardados/);
      assert.match(notice.message, /foram guardados/);
    } else {
      // Se a gravação falhar, os rascunhos são descartados e o erro é mostrado.
      assert.equal(pending, false);
      assert.match(context.sourceStatus.textContent, /Write failed/);
      assert.equal(notice.stateName, 'error');
    }
    assert.equal(button.disabled, false);
  }
});

test('acknowledging a save preserves edits made during the request', () => {
  const saved = { catalogId: 'a', reference: 'saved' };
  const changed = { catalogId: 'b', reference: 'newer edit' };
  const changes = new Map([['a', saved], ['b', changed]]);
  const context = vm.createContext({ supplierDirtyChanges: { plates: changes }, supplierDirtyKey: item => item.catalogId, clone: value => JSON.parse(JSON.stringify(value)), persistSupplierDraftChanges: () => {} });
  vm.runInContext(source.slice(source.indexOf('function acknowledgeSupplierChanges('), source.indexOf('function persistSupplierDraftChanges(')), context);
  context.acknowledgeSupplierChanges({ plates: [saved, { catalogId: 'b', reference: 'old edit' }] });
  assert.equal(changes.has('a'), false);
  assert.equal(changes.get('b'), changed);
});

test('supplier refresh notices painting client-price changes and applies the database value', () => {
  const context = vm.createContext({
    supplierCatalogSignature: '',
    state: { catalog: { paintings: [{ name: 'Verniz', client: 6.35 }], plates: [] }, supplierPrices: [], costItems: [] },
    clone: value => JSON.parse(JSON.stringify(value)),
    recalculateCustomCostPrices: () => {},
    normalizeAllPlateNames: () => {},
    normalizeCatalogSalePrices: () => {}
  });
  vm.runInContext(source.slice(
    source.indexOf('function supplierCatalogSignatureFor('),
    source.indexOf('async function refreshSupplierCatalogFromServer(')
  ), context);

  const before = context.supplierCatalogSignatureFor({ paintings: [{ name: 'Verniz', client: 6.35 }] });
  const after = context.supplierCatalogSignatureFor({ paintings: [{ name: 'Verniz', client: 110 }] });
  assert.notEqual(before, after);

  context.applySupplierCatalogResponse({ paintings: [{ name: 'Verniz', client: 110, serviceCostPerM2: 6.35 }] });
  assert.equal(context.state.catalog.paintings[0].client, 110);
  assert.equal(context.state.catalog.paintings[0].serviceCostPerM2, 6.35);
});

test('editing a painting client price immediately matches its reseller price', () => {
  const item = { client: 110, reseller: 150 };
  const context = vm.createContext({
    supplierManualPriceList: () => [item],
    num: value => Number(String(value).replace(',', '.')),
    salePriceValue: Number,
    supplierNumber: value => Number(value).toFixed(2),
    clone: value => JSON.parse(JSON.stringify(value)),
    ensureManualPriceBaseline: () => {},
    trackManualPriceChange: () => {}
  });
  vm.runInContext(source.slice(
    source.indexOf('function commitSupplierManualPriceInput('),
    source.indexOf('function commitVisibleSupplierManualPrices(')
  ), context);

  const input = { dataset: { manualPriceType: 'paintings', manualPriceIndex: '0', manualPriceField: 'client' }, value: '125' };
  assert.equal(context.commitSupplierManualPriceInput(input), true);
  assert.equal(item.client, 125);
  assert.equal(item.reseller, 125);
});
