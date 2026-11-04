(function (root) {
  const text = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const description = item => text([item.item, item.label, item.reference].join(' '));
  function watts(item) {
    const name = description(item);
    if (!name.includes('TRANSFORMADOR')) return 0;
    const match = name.match(/(\d+(?:[.,]\d+)?)\s*W\b/);
    return match ? Number(match[1].replace(',', '.')) : 0;
  }
  const wattsPerMeter = 10.5;
  const safetyMargin = 1.2;
  function arrange(extras, catalog) {
    const lines = extras.filter(item => !item.autoLedTransformer);
    const warnings = [];
    const loads = new Map();
    const find = extra => catalog.find(item => item.catalogId && item.catalogId === extra.catalogId) || catalog.find(item => text(item.group) === text(extra.group) && text(item.item) === text(extra.item));
    lines.forEach(extra => {
      const item = find(extra) || extra;
      const name = description(item);
      if (!/\b(?:FITA\s+LED|KIT\s+LED)\b/.test(name) || watts(item)) return;
      const meters = Number(extra.quantity) || 0;
      if (meters <= 0) return;
      const key = extra.furnitureGroupId || '';
      loads.set(key, (loads.get(key) || 0) + meters);
    });
    const options = catalog.map(item => ({ item, watts: watts(item) })).filter(option => option.watts > 0).sort((a, b) => a.watts - b.watts);
    loads.forEach((meters, key) => {
      // Potencia: metros x 10,5 W/m x 1,20 de margem de seguranca.
      const required = Math.round(meters * wattsPerMeter * safetyMargin * 100) / 100;
      const provided = lines
        .filter(extra => (extra.furnitureGroupId || '') === key)
        .reduce((sum, extra) => sum + watts(find(extra) || extra) * (Number(extra.quantity) || 0), 0);
      if (provided >= required) return;
      if (!options.length) {
        warnings.push('LED: ' + meters + ' m precisam de ' + required + ' W. Nao existe nenhum transformador no catalogo.');
        return;
      }
      // Nenhum transformador pode passar da potencia maxima do catalogo: a carga
      // e dividida em partes iguais pelo menor numero de transformadores possivel.
      const largest = options[options.length - 1].watts;
      const count = Math.max(1, Math.ceil(required / largest - 1e-9));
      const perTransformer = required / count;
      const option = options.find(candidate => candidate.watts >= perTransformer - 1e-9);
      lines.push({ id: 'led-transformer:' + key, autoLedTransformer: true, furnitureGroupId: key, group: option.item.group, item: option.item.item, catalogId: option.item.catalogId, quantity: count, ledMeters: meters, ledRequiredWatts: required });
    });
    return { extras: lines, warnings };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { arrange, watts };
  else root.ledTransformers = { arrange, watts };
})(typeof globalThis !== 'undefined' ? globalThis : this);
