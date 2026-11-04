const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const drawerClassification = source.slice(
  source.indexOf('function drawerUsesWardrobeType('),
  source.indexOf('function wardrobeRodLengthCmFromText(')
);
const drawerCompatibility = source.slice(
  source.indexOf('function drawerCompatibleModules('),
  source.indexOf('function drawerTargetModule(')
);

function comparableText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function comparableItemText(value) {
  return comparableText(value).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeExtraGroupName(value) {
  const text = comparableText(value);
  return text === 'GAVETAS' ? 'Gavetas' : text === 'GAVETAS ROUPEIRO' ? 'Gavetas Roupeiro' : String(value || '');
}

test('a selected kitchen drawer stays a kitchen drawer even if its saved row has stale wardrobe metadata', () => {
  const context = vm.createContext({
    wardrobeDrawerGroup: 'Gavetas Roupeiro',
    state: { catalog: { extras: [
      { group: 'Gavetas', item: 'GAVETA ANTARO EXTERIOR' },
      { group: 'Gavetas', item: 'Corrediças BLUM gavetas roupeiro 561HT TIC-TAC 30KG*435' }
    ] } },
    comparableText,
    comparableItemText,
    normalizeExtraGroupName,
    findCatalogExtraForQuote(extra) {
      const wanted = comparableItemText(extra.item);
      return this.state.catalog.extras.find(item => comparableItemText(item.item) === wanted) || null;
    }
  });
  vm.runInContext(drawerClassification, context);

  const kitchenDrawer = {
    group: 'Gavetas',
    item: 'GAVETA ANTARO EXTERIOR',
    tipo: 'Roupeiro',
    handleUse: 'roupeiro',
    family: 'Roupeiro'
  };
  assert.equal(context.isWardrobeDrawerExtra(kitchenDrawer), false);
  assert.equal(context.isKitchenDrawerExtra(kitchenDrawer), true);
  assert.equal(context.isWardrobeDrawerExtra({
    group: 'Gavetas',
    item: 'Corrediças BLUM gavetas roupeiro 561HT TIC-TAC 30KG*435'
  }), true);
});

test('a Coluna module is compatible with wardrobe drawer distribution', () => {
  const column = { type: 'Coluna' };
  const context = vm.createContext({
    wardrobeDrawerGroup: 'Gavetas Roupeiro',
    state: { modules: [column] },
    comparableText,
    comparableItemText,
    normalizeExtraGroupName,
    findCatalogExtraForQuote: () => null
  });
  vm.runInContext(drawerClassification + drawerCompatibility, context);
  const compatible = Array.from(context.drawerCompatibleModules({ group: 'Gavetas Roupeiro', item: 'Gaveta Roupeiro' }));
  assert.equal(compatible.length, 1);
  assert.equal(compatible[0].type, 'Coluna');
});
