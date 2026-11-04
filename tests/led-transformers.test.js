const test = require('node:test');
const assert = require('node:assert/strict');
const { arrange } = require('../public/led-transformers');
const catalog = [15, 21, 36, 60, 100].map(w => ({ group: 'LED', item: 'Transformador ' + w + 'W', client: w, cost: w / 2 }));
const led = (quantity, group = 'a') => ({ group: 'LED', item: 'KIT LED', quantity, furnitureGroupId: group });
const transformer = result => result.extras.find(extra => extra.autoLedTransformer);
test('LED transformer uses meters x 10.5 x 1.20 and picks the smallest that fits, without duplicates', () => {
  // 1 m -> 12,6 W
  assert.equal(transformer(arrange([led(1)], catalog)).item, 'Transformador 15W');
  // 2 m -> 25,2 W
  const result = arrange([led(2)], catalog);
  assert.equal(transformer(result).item, 'Transformador 36W');
  assert.equal(transformer(result).ledRequiredWatts, 25.2);
  assert.equal(arrange(result.extras, catalog).extras.length, 2);
  // 7 m -> 88,2 W
  result.extras[0].quantity = 7;
  assert.equal(transformer(arrange(result.extras, catalog)).item, 'Transformador 100W');
  result.extras[0].quantity = 0;
  assert.equal(arrange(result.extras, catalog).extras.length, 1);
});
test('LED loads above the largest transformer are split across several transformers', () => {
  // 24,5 m -> 308,7 W -> 4 x 77,175 W -> 4 x 100 W
  const big = transformer(arrange([led(24.5)], catalog));
  assert.equal(big.item, 'Transformador 100W');
  assert.equal(big.quantity, 4);
  // 9 m -> 113,4 W -> 2 x 56,7 W -> 2 x 60 W
  const split = transformer(arrange([led(9)], catalog));
  assert.equal(split.item, 'Transformador 60W');
  assert.equal(split.quantity, 2);
});
test('LED loads sum per furniture group and reuse sufficient manual transformers', () => {
  const result = arrange([led(1), led(2), led(1, 'b')], catalog);
  // grupo a: 3 m -> 37,8 W; grupo b: 1 m -> 12,6 W
  assert.deepEqual(result.extras.slice(3).map(x => x.item), ['Transformador 60W', 'Transformador 15W']);
  const manual = { ...catalog[3], quantity: 1, furnitureGroupId: 'a' };
  assert.equal(arrange([led(3), manual], catalog).extras.length, 2);
  const twoManual = { ...catalog[4], quantity: 2, furnitureGroupId: 'a' };
  assert.equal(arrange([led(15), twoManual], catalog).extras.length, 2);
  const missing = arrange([led(10)], []);
  assert.equal(missing.extras.length, 1);
  assert.match(missing.warnings[0], /126 W/);
  assert.equal(arrange([{ item: 'Perfil LED', quantity: 3 }, { item: 'Sensor LED', quantity: 1 }], catalog).extras.length, 2);
});
