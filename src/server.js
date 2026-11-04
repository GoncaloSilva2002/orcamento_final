const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const os = require('os');
const express = require('express');
const ledTransformers = require('../public/led-transformers');

const rootDir = path.resolve(__dirname, '..');

function runtimeRootDir() {
  return process.pkg ? path.dirname(process.execPath) : rootDir;
}

function loadLocalEnv() {
  const envFile = path.join(runtimeRootDir(), '.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separator = trimmed.indexOf('=');
    if (separator === -1) return;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) return;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

loadLocalEnv();

let workbookData = require('./workbook-data');
let { catalog, lists, typePresets, enrichModules, calculateModulePrice } = workbookData;

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const adminUser = process.env.SILWOOD_ADMIN_USER || 'admin';
const adminPassword = process.env.SILWOOD_ADMIN_PASSWORD || 'silwood';
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// The application uses the project's public.utilizador table for accounts.
// The service role is required because all account operations happen on the server.
const useSupabaseAuth = Boolean(supabaseUrl && supabaseServiceRoleKey);
const allowBootstrapAdmin = process.env.SILWOOD_BOOTSTRAP_ADMIN === 'true';
const adminSessions = new Map();
const sessionMaxAgeSeconds = 8 * 60 * 60;
const sessionMaxAgeMs = sessionMaxAgeSeconds * 1000;

function localNetworkUrls() {
  const urls = [];
  Object.values(os.networkInterfaces()).flat().forEach((address) => {
    if (!address || address.family !== 'IPv4' || address.internal) return;
    urls.push('http://' + address.address + ':' + port);
  });
  return urls;
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(runtimeRootDir(), 'public')));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

const { createCatalogStore } = require('./catalog-store');
const { createPricingEngine } = require('./pricing-engine');
const catalogStore = createCatalogStore({
  url: supabaseUrl, key: supabaseServiceRoleKey, mode: process.env.CATALOG_STORAGE,
  file: process.env.CATALOG_LOCAL_FILE || path.join(runtimeRootDir(), 'data/catalog-local.json'),
  seed: path.join(runtimeRootDir(), 'data/catalog-seed.json')
});
let catalogRevision = -1;
const defaultLaborPrices = { plates: 2.02, edges: 0.32, drawers: 9.58 };
let laborPrices = { ...defaultLaborPrices };
let costItems = [];
const customEdgebanderMetersPerHour = 120;
const customLevelerLaborMinutes = 5;
const customLevelerConsumableUnit = 0.06;
const customLevelerConsumableMultiplier = 2;
const customLevelerCostMultiplier = 2;
const customEdgebanderClientMultiplier = 1.5;
const customLevelerClientMultiplier = 1.5;
const customFeetLaborSeconds = 60;
const customFeetScrewUnit = 0.06;
const customFeetScrewCount = 4;
const customFeetClientMultiplier = 1.5;
const customCncDivisor = 5.769;
const customCncClientMultiplier = 1.5;
const customPanelSawDivisor = 23.184;
const customPanelSawClientMultiplier = 1.5;
const customModuleAssemblyLaborMinutes = 30;
const customModuleAssemblyAreaSquareMeters = 2.64;
const customPlateClientMultiplier = 1.92;
const customPlateResellerMultiplier = 1.45;
const previousCustomPlateResellerMultiplier = 1.5;
const customPaintingDivisor = 8;
const customPaintingClientMultiplier = 1.5;
function normalizedCostItemName(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function costItemNamed(items, fragment) {
  return (Array.isArray(items) ? items : []).find(item => normalizedCostItemName(item?.name).includes(fragment));
}
function laborHourlyPriceFromCostItems(items) {
  const labor = costItemNamed(items, 'mao') && normalizedCostItemName(costItemNamed(items, 'mao')?.name).includes('obra')
    ? costItemNamed(items, 'mao')
    : (Array.isArray(items) ? items.find(item => {
      const name = normalizedCostItemName(item?.name);
      return name.includes('mao') && name.includes('obra');
    }) : null);
  return Number(labor?.cost) > 0 ? Number(labor.cost) : Number(labor?.client) || 0;
}
function panelSawCostPerSquareMeter(items) {
  const saw = costItemNamed(items, 'seccionadora');
  if (!saw) return null;
  return ((laborHourlyPriceFromCostItems(items) + (Number(saw.cost) || 0)) / customPanelSawDivisor) * customPanelSawClientMultiplier;
}
function moduleAssemblyLaborPerSquareMeter(items) {
  return laborHourlyPriceFromCostItems(items) * (customModuleAssemblyLaborMinutes / 60) / customModuleAssemblyAreaSquareMeters;
}
function plateCostPerSquareMeter(supplierPrice, items, fallbackLabor) {
  const sawRate = panelSawCostPerSquareMeter(items);
  const laborRate = sawRate === null ? (Number(fallbackLabor) || 0) : sawRate;
  return (Number(supplierPrice) || 0) + laborRate + moduleAssemblyLaborPerSquareMeter(items);
}
function normalizeLaborPrices(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.keys(defaultLaborPrices).reduce((result, key) => {
    const number = Number(source[key]);
    result[key] = Number.isFinite(number) && number >= 0 ? number : defaultLaborPrices[key];
    return result;
  }, {});
}
function normalizeCostItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const source = item && typeof item === 'object' ? item : {};
    const name = String(source.name ?? source.nome ?? '').trim();
    const typeText = String(source.type ?? source.tipo ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const nameText = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const cost = Number(source.cost ?? source.custo ?? 0);
    const client = Number(source.client ?? source.preco_cliente ?? 0);
    const type = typeText.includes('roupeiro') ? 'roupeiro' : typeText.includes('cozinha') ? 'cozinha' : typeText.includes('ambos') || typeText.includes('os 2') || typeText.includes('os dois') ? 'ambos' : 'ambos';
    return {
      id: source.id ?? source.catalogId ?? ('cost:legacy:' + index),
      name,
      type,
      cost: Number.isFinite(cost) && cost >= 0 ? cost : 0,
      client: Number.isFinite(client) && client >= 0 ? client : 0
    };
  }).filter(item => item.name);
}
function calculateCustomCostPrices(value) {
  const items = normalizeCostItems(value);
  const laborHourlyPrice = laborHourlyPriceFromCostItems(items);
  return items.map(item => {
    const name = normalizedCostItemName(item.name);
    if (name.includes('orladora')) {
      const hourlyCost = laborHourlyPrice + (Number(item.cost) || 0);
      item.client = (hourlyCost / customEdgebanderMetersPerHour) * customEdgebanderClientMultiplier;
    }
    if (name.includes('cnc')) {
      const hourlyCost = laborHourlyPrice + (Number(item.cost) || 0);
      item.client = (hourlyCost / customCncDivisor) * customCncClientMultiplier;
    }
    if (name.includes('seccionadora')) {
      const hourlyCost = laborHourlyPrice + (Number(item.cost) || 0);
      item.client = (hourlyCost / customPanelSawDivisor) * customPanelSawClientMultiplier;
    }
    if (name.includes('pintura')) {
      const totalCost = (Number(item.cost) || 0) + laborHourlyPrice;
      item.client = (totalCost / customPaintingDivisor) * customPaintingClientMultiplier;
    }
    if (name.includes('nivelador')) {
      const laborCost = laborHourlyPrice * (customLevelerLaborMinutes / 60);
      const consumables = (customLevelerConsumableUnit * customLevelerConsumableMultiplier) * customLevelerConsumableMultiplier;
      const levelerCost = (Number(item.cost) || 0) * customLevelerCostMultiplier;
      item.client = (laborCost + consumables + levelerCost) * customLevelerClientMultiplier;
    }
    if (name.includes('pes') && (item.type === 'cozinha' || item.type === 'roupeiro')) {
      const laborCost = laborHourlyPrice * (customFeetLaborSeconds / 3600);
      const consumables = customFeetScrewUnit * customFeetScrewCount;
      const feetCost = Number(item.cost) || 0;
      item.client = (laborCost + consumables + feetCost) * customFeetClientMultiplier;
    }
    return item;
  });
}
const drawerAssemblyCostNames = {
  cozinha: 'Montagem de gavetas - Cozinha',
  roupeiro: 'Montagem de gavetas - Roupeiro'
};
function isDrawerAssemblyCost(item) {
  const name = normalizedCostItemName(item?.name);
  return (name.includes('montagem') && name.includes('gaveta')) ||
    (name.includes('mao') && name.includes('obra') && name.includes('gaveta'));
}
function drawerAssemblyKind(item) {
  const name = normalizedCostItemName(item?.name);
  return name.includes('roupeiro') || normalizedCostItemName(item?.type) === 'roupeiro' ? 'roupeiro' : 'cozinha';
}
function drawerAssemblyFormulaCost(type, items = costItems) {
  const wardrobe = type === 'roupeiro';
  const screwCost = wardrobe ? 4 * 0.07 : 8 * 0.06;
  const laborMinutes = wardrobe ? 10 : 7;
  return screwCost + laborHourlyPriceFromCostItems(items) * laborMinutes / 60;
}
function drawerAssemblyCost(type = 'cozinha', items = costItems) {
  const wantedType = type === 'roupeiro' ? 'roupeiro' : 'cozinha';
  const item = (Array.isArray(items) ? items : []).find(candidate =>
    isDrawerAssemblyCost(candidate) && drawerAssemblyKind(candidate) === wantedType
  );
  return item ? Math.max(0, Number(item.cost) || 0) : drawerAssemblyFormulaCost(wantedType, items);
}
function ensureDrawerAssemblyCostItems(items) {
  const result = normalizeCostItems(items);
  for (const type of ['cozinha', 'roupeiro']) {
    let item = result.find(candidate => isDrawerAssemblyCost(candidate) && drawerAssemblyKind(candidate) === type);
    if (!item) {
      item = {
        id: 'cost:legacy:drawer-assembly-' + type,
        name: drawerAssemblyCostNames[type],
        type,
        cost: 0,
        client: 0
      };
      result.push(item);
    }
    item.name = drawerAssemblyCostNames[type];
    item.type = type;
    item.cost = drawerAssemblyFormulaCost(type, result);
    item.client = 0;
  }
  return result;
}
function syncDrawerLaborFromCostItems() {
  laborPrices = { ...laborPrices, drawers: drawerAssemblyCost('cozinha') };
}
function customPaintingServiceCostPerSquareMeter(items = costItems) {
  const item = costItemNamed(items, 'pintura');
  return item ? Number(item.client) || 0 : null;
}
function syncPaintingServiceCosts(items = catalog?.paintings, costs = costItems) {
  const serviceCostPerM2 = customPaintingServiceCostPerSquareMeter(costs) ?? 0;
  (Array.isArray(items) ? items : []).forEach(item => {
    if (comparableText(item?.name) === comparableText('Nenhuma')) return;
    // The Costs-tab rate contributes to internal cost only. Keep the
    // painting's editable client price independent.
    item.serviceCostPerM2 = serviceCostPerM2;
    item.reseller = Number(item.client) || 0;
  });
}
function syncEdgeLaborFromEdgebander() {
  const edgebander = costItemNamed(costItems, 'orladora');
  const clientPricePerMeter = Number(edgebander?.client);
  if (Number.isFinite(clientPricePerMeter) && clientPricePerMeter >= 0) laborPrices.edges = clientPricePerMeter;
}
function markDoorSystemDuplicates(items) {
  const seen = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item) return;
    delete item.duplicateOf;
    const key = comparableText(item.name || item.item || item.label);
    if (!key) return;
    const existing = seen.get(key);
    if (existing) item.duplicateOf = existing.catalogId || key;
    else seen.set(key, item);
  });
  return items;
}
function installCatalog(row) {
  if (row.revision < catalogRevision) return;
  const catalogData = structuredClone(row.data);
  laborPrices = normalizeLaborPrices(row.data.laborPrices);
  costItems = ensureDrawerAssemblyCostItems(calculateCustomCostPrices(catalogData.costs));
  catalogData.costs = costItems.map(item => ({ ...item }));
  syncPaintingServiceCosts(catalogData.catalog?.paintings, costItems);
  workbookData = createPricingEngine(catalogData);
  ({ catalog, lists, typePresets, enrichModules, calculateModulePrice } = workbookData);
  syncPaintingServiceCosts();
  syncDrawerLaborFromCostItems();
  syncEdgeLaborFromEdgebander();
  syncPanelSawPlatePricing();
  recalculateCatalogLaborCosts();
  markDoorSystemDuplicates(catalog.doorSystems);
  catalogRevision = row.revision;
  lists.interiores = [...new Set(catalog.plates.map(item => item.name))];
  lists.exteriores = lists.interiores.slice();
  lists.pinturas = ['Nenhuma', ...catalog.paintings.map(item => item.name).filter(name => name && name !== 'Nenhuma')];
  lists.sistemasPorta = catalog.doorSystems.filter(item => !item.duplicateOf).map(item => item.name);
  lists.dobradicas = catalog.hinges.map(item => item.name);
  lists.orlas = catalog.edges.map(item => item.name);
  ensureRipadoCatalogItem();
  lists.extraGroups = [...new Set(catalog.extras.map(item => item.group))];
  Object.assign(quoteSeed, { catalog, lists, typePresets });
  quoteSeed.source = { storage: catalogStore.mode, present: true, note: 'Catálogo independente do Excel' };
}
function catalogSnapshot() {
  return structuredClone({ schemaVersion: 1, catalog, lists, typePresets, feetPrices: workbookData.feetPrices, laborPrices, costs: costItems });
}
async function refreshCatalog() { installCatalog(await catalogStore.read()); }
app.use('/api', async (req, res, next) => {
  if (!['/bootstrap', '/calculate', '/supplier-prices', '/supplier-prices/plate', '/supplier-prices/item', '/supplier-prices/cost'].includes(req.path)) return next();
  if ((req.method === 'PUT' && req.path === '/supplier-prices') || (req.method === 'POST' && req.path === '/supplier-prices/plate')) return next();
  // A gravação já atualizou o catálogo em memória; não voltar a ler todas as
  // tabelas apenas para recalcular o orçamento imediatamente a seguir.
  if (req.method === 'POST' && req.path === '/calculate' && req.query.current === '1') return next();
  try { await refreshCatalog(); next(); }
  catch (error) { res.status(503).json({ error: error.message }); }
});
let savingCatalog = Promise.resolve();
function saveSupplierPrices(payload) {
  const operation = savingCatalog.then(async () => {
    await refreshCatalog();
    const before = catalogSnapshot();
    const revision = catalogRevision;
    let next;
    try { applySupplierPayload(payload); next = catalogSnapshot(); }
    finally { installCatalog({ data: before, revision }); }
    const saved = await catalogStore.save(next, revision, payload);
    installCatalog(saved);
    return { updated: Object.values(payload).reduce((n, items) => n + (Array.isArray(items) ? items.length : 0), 0), storage: catalogStore.mode };
  });
  savingCatalog = operation.catch(() => {});
  return operation;
}

function deleteSupplierCatalogItem(type, index, catalogId, reference) {
  const payload = {};
  if (!['plates', 'paintings', 'paintingComponents', 'edges', 'extras', 'doorSystems', 'drawerComponents', 'hinges', 'hingeComponents', 'openingSystemComponents'].includes(type)) {
    throw new Error('Tipo de material invalido.');
  }
  const itemIndex = Number(index);
  if (!Number.isInteger(itemIndex) || itemIndex < 0) throw new Error('Indice do material invalido.');
  if (catalogStore.mode === 'supabase') {
    return catalogStore.deleteUserDatabaseItem(type, catalogId, reference);
  }
  payload[type] = [{ catalogId, __dirtyIndex: itemIndex, reference, __delete: true }];
  return saveSupplierPrices(payload);
}
const platePricingRules = { labor: defaultLaborPrices.plates, clientMultiplier: 3, resellerMultiplier: 1.4 };
function syncPanelSawPlatePricing() {
  const costRate = panelSawCostPerSquareMeter(costItems);
  platePricingRules.labor = costRate === null ? laborPrices.plates : costRate;
}
const skirtingLacquerClientPerMeter = 6;
const wardrobeDrawerGroup = 'Gavetas Roupeiro';
const manualExtraGroup = 'Manual';
const transportExtraGroup = 'Transporte e embalamento';
const ripadoExtraGroup = 'Ripado/Efeitos';
const ripadoItemName = 'Ripado';
const ripadoDefaultClientPrice = 85;
// A partir de 10 unidades o cliente paga 65% do preço unitário do Ripado.
const ripadoVolumeQuantity = 10;
const ripadoVolumeFactor = 0.65;
// O efeito almofada recuada custa ao cliente 15% do preço unitário do módulo escolhido.
const pillowEffectItemName = 'Efeito almofada recuada';
const pillowEffectModuleFactor = 0.15;
const roundsItemName = 'Redondos';
const roundsDefaultClientPrice = 200;
const internationalPackagingItemName = 'Embalamento Internacional Standard';
const lacqueredInternationalPackagingItemName = 'Embalamento Internacional Lacado';
const nationalPackagingItemName = 'Embalamento Nacional Standard';
const lacqueredNationalPackagingItemName = 'Embalamento Nacional Lacado';
const internationalPackagingClientMultiplier = 2;
const wardrobeDrawerItem = 'Gaveta Roupeiro';

function parseCookies(req) {
  return String(req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function sessionCookie(value, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return 'silwood_session=' + encodeURIComponent(value || '') + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + maxAge + secure;
}

function readAuthSession(req) {
  const token = parseCookies(req).silwood_session;
  const session = token ? adminSessions.get(token) : null;
  const expiresAt = typeof session === 'number' ? session : session?.expiresAt;
  if (!expiresAt) return null;
  if (expiresAt < Date.now()) {
    adminSessions.delete(token);
    return null;
  }
  if (typeof session === 'number') return { role: 'admin', admin: true, authenticated: true, name: adminUser };
  return session;
}

function isAdminRequest(req) {
  return readAuthSession(req)?.role === 'admin';
}

function requireAdmin(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: 'Login de administrador necessario.' });
}

function requireAuth(req, res, next) {
  const session = readAuthSession(req);
  if (!session) return res.status(401).json({ error: 'Login necessario.' });
  req.authSession = session;
  return next();
}

function allowedPricingModeForRequest(req, requestedMode) {
  const role = normalizeUserRole(readAuthSession(req)?.role);
  if (role === 'admin') return requestedMode === 'reseller' ? 'reseller' : 'normal';
  if (role === 'reseller') return 'reseller';
  return 'normal';
}

function publicSession(session) {
  return {
    authenticated: Boolean(session),
    admin: session?.role === 'admin',
    role: normalizeUserRole(session?.role || 'guest'),
    name: session?.name || '',
    supabase: useSupabaseAuth
  };
}

function createAuthSession(profile) {
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, {
    userId: profile.userId || '',
    email: profile.email || '',
    name: profile.name || profile.email || profile.username || '',
    role: normalizeUserRole(profile.role),
    expiresAt: Date.now() + sessionMaxAgeMs
  });
  return token;
}

async function supabaseJson(pathname, options = {}) {
  if (typeof fetch !== 'function') throw new Error('Esta versao do Node nao suporta fetch. Usa Node 18+ para login Supabase.');
  const apiKey = options.serviceRole ? supabaseServiceRoleKey : supabaseAnonKey;
  if (!apiKey) throw new Error('Supabase nao configurado.');
  const headers = {
    apikey: apiKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const bearer = options.accessToken || (apiKey.includes('.') ? apiKey : '');
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  const response = await fetch(supabaseUrl + pathname, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Number(options.timeoutMs || 10000))
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error_description || data.msg || data.message || 'Erro de autenticaÃ§Ã£o no Supabase.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loginWithSupabase(username, password) {
  const value = String(username || '').trim();
  const select = 'id,nome,email,user_name,password,id_permissao,active,permissao(permissao)';
  const find = async (field) => {
    try {
      return await supabaseJson('/rest/v1/utilizador?select=' + select + '&' + field + '=eq.' + encodeURIComponent(value) + '&limit=1', { serviceRole: true });
    } catch (error) {
      if (!String(error.message || '').includes('column utilizador.active does not exist')) throw error;
      return supabaseJson('/rest/v1/utilizador?select=id,nome,email,user_name,password,id_permissao,permissao(permissao)&' + field + '=eq.' + encodeURIComponent(value) + '&limit=1', { serviceRole: true });
    }
  };
  let rows = await find('user_name');
  let row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    rows = await find('email');
    row = Array.isArray(rows) ? rows[0] : null;
  }
  if (!row || !(await bcrypt.compare(password, String(row.password || '')))) {
    const error = new Error('Credenciais invalidas.');
    error.status = 401;
    throw error;
  }
  if (row.active === false) throw new Error('Utilizador desativado.');
  return {
    userId: String(row.id),
    email: row.email || value,
    name: row.nome || row.user_name || value,
    role: roleFromPermission(row.permissao?.permissao)
  };
}

function requireSupabaseUserAdmin() {
  if (!supabaseUrl) throw new Error('Configura SUPABASE_URL no servidor para gerir utilizadores.');
  if (!supabaseServiceRoleKey) throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY no servidor para criar utilizadores.');
}

function normalizeUserRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin') return 'admin';
  if (value === 'reseller' || value === 'revendedor') return 'reseller';
  return 'guest';
}

function roleFromPermission(permission) {
  const value = String(permission || '').trim().toLowerCase();
  if (value.includes('admin')) return 'admin';
  if (value.includes('reseller') || value.includes('revend')) return 'reseller';
  return 'guest';
}

function normalizeUserProfileInput(body) {
  return {
    email: String(body?.email || '').trim().toLowerCase(),
    password: String(body?.password || ''),
    name: String(body?.name || '').trim(),
    role: normalizeUserRole(body?.role),
    active: body?.active !== false
  };
}

async function permissionIdForRole(role) {
  const wanted = normalizeUserRole(role);
  const rows = await supabaseJson('/rest/v1/permissao?select=id,permissao&order=id.asc', { serviceRole: true });
  const permissions = Array.isArray(rows) ? rows : [];
  const permission = permissions.find((row) => roleFromPermission(row.permissao) === wanted);
  if (!permission) {
    const label = wanted === 'admin' ? 'Admin' : wanted === 'reseller' ? 'Revendedor' : 'Convidado';
    throw new Error('A tabela permissao não tem uma permissão "' + label + '". Cria essa permissão antes de criar o utilizador.');
  }
  return permission.id;
}

async function listSupabaseUsers() {
  requireSupabaseUserAdmin();
  let rows;
  try {
    rows = await supabaseJson('/rest/v1/utilizador?select=id,nome,email,user_name,id_permissao,active,permissao(permissao)&order=id.asc', { serviceRole: true });
  } catch (error) {
    if (!String(error.message || '').includes('column utilizador.active does not exist')) throw error;
    rows = await supabaseJson('/rest/v1/utilizador?select=id,nome,email,user_name,id_permissao,permissao(permissao)&order=id.asc', { serviceRole: true });
  }
  return (Array.isArray(rows) ? rows : []).map((user) => {
    return {
      id: user.id,
      username: user.user_name || '',
      email: user.email || '',
      name: user.nome || user.user_name || '',
      role: roleFromPermission(user.permissao?.permissao),
      active: user.active !== false,
      createdAt: '',
      lastSignInAt: ''
    };
  });
}

async function createSupabaseUser(body) {
  requireSupabaseUserAdmin();
  const input = normalizeUserProfileInput(body);
  if (!input.email || !input.email.includes('@')) throw new Error('Preenche um email valido.');
  if (input.password.length < 6) throw new Error('A palavra-passe deve ter pelo menos 6 caracteres.');
  const username = String(body?.username || body?.user_name || input.email.split('@')[0] || '').trim();
  if (!username) throw new Error('Não foi possível determinar o nome de utilizador.');
  const duplicateUsername = await supabaseJson('/rest/v1/utilizador?select=id&user_name=eq.' + encodeURIComponent(username) + '&limit=1', { serviceRole: true });
  if (Array.isArray(duplicateUsername) && duplicateUsername.length) throw new Error('Já existe um utilizador com esse nome de utilizador.');
  const duplicateEmail = await supabaseJson('/rest/v1/utilizador?select=id&email=eq.' + encodeURIComponent(input.email) + '&limit=1', { serviceRole: true });
  if (Array.isArray(duplicateEmail) && duplicateEmail.length) throw new Error('Já existe um utilizador com esse email.');
  const permissionId = await permissionIdForRole(input.role);
  const passwordHash = await bcrypt.hash(input.password, 10);
  const createOptions = {
    method: 'POST',
    serviceRole: true,
    headers: { Prefer: 'return=representation' },
    body: {
      nome: input.name || username,
      email: input.email,
      user_name: username,
      password: passwordHash,
      id_permissao: permissionId,
      active: input.active
    }
  };
  let created;
  try {
    created = await supabaseJson('/rest/v1/utilizador', createOptions);
  } catch (error) {
    if (!String(error.message || '').includes('column utilizador.active does not exist')) throw error;
    delete createOptions.body.active;
    created = await supabaseJson('/rest/v1/utilizador', createOptions);
  }
  const user = Array.isArray(created) ? created[0] : created;
  if (!user?.id) throw new Error('A base de dados não devolveu o utilizador criado.');
  return user.id;
}

async function updateSupabaseUser(id, body) {
  requireSupabaseUserAdmin();
  const userId = String(id || '').trim();
  if (!userId) throw new Error('Utilizador invalido.');
  const password = String(body?.password || '');
  const email = String(body?.email || '').trim().toLowerCase();
  const update = {};
  if (Object.prototype.hasOwnProperty.call(body || {}, 'name')) update.nome = String(body?.name || '').trim();
  if (email) {
    if (!email.includes('@')) throw new Error('Preenche um email valido.');
    update.email = email;
  }
  if (password) {
    if (password.length < 6) throw new Error('A palavra-passe deve ter pelo menos 6 caracteres.');
    update.password = await bcrypt.hash(password, 10);
  }
  if (Object.prototype.hasOwnProperty.call(body || {}, 'role')) update.id_permissao = await permissionIdForRole(body.role);
  if (Object.prototype.hasOwnProperty.call(body || {}, 'active')) update.active = body.active !== false;
  if (Object.keys(update).length) {
    const updateOptions = {
      method: 'PATCH',
      serviceRole: true,
      headers: { Prefer: 'return=minimal' },
      body: update
    };
    try {
      await supabaseJson('/rest/v1/utilizador?id=eq.' + encodeURIComponent(userId), updateOptions);
    } catch (error) {
      if (!String(error.message || '').includes('column utilizador.active does not exist')) throw error;
      delete updateOptions.body.active;
      if (Object.keys(updateOptions.body).length) {
        await supabaseJson('/rest/v1/utilizador?id=eq.' + encodeURIComponent(userId), updateOptions);
      }
    }
  }
}

function requireSupabaseHistory() {
  if (!useSupabaseAuth || !supabaseServiceRoleKey) {
    throw new Error('Historico por utilizador precisa de Supabase configurado no servidor.');
  }
}

function normalizeQuoteHistoryEntry(row, profileById = new Map()) {
  const profile = profileById.get(row.owner_id) || {};
  return {
    id: String(row.id ?? ''),
    userId: String(row.owner_id ?? ''),
    userName: profile.name || profile.email || '',
    label: row.label || 'Sem nome',
    updatedAt: row.updated_at || row.created_at || '',
    snapshot: row.snapshot || null
  };
}

async function profileMapForUserIds(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return new Map();
  const query = '/rest/v1/utilizador?select=id,nome,email&id=in.(' + ids.map(encodeURIComponent).join(',') + ')';
  const rows = await supabaseJson(query, { serviceRole: true });
  return new Map((Array.isArray(rows) ? rows : []).map(row => [String(row.id), { id: row.id, name: row.nome, email: row.email }]));
}

async function quoteHistoryForSession(session, requestedUserId, search) {
  requireSupabaseHistory();
  const admin = session.role === 'admin';
  const ownerId = admin && requestedUserId ? String(requestedUserId) : session.userId;
  if (!ownerId) throw new Error('Sessao sem utilizador Supabase associado.');
  const ownerFilter = '&owner_id=eq.' + encodeURIComponent(ownerId);
  const searchText = comparableText(search);
  let idFilter = '';
  if (searchText) {
    // Search every saved quote by label, ignoring accents and case.
    const labels = await supabaseJson(
      '/rest/v1/quote_history?select=id,label' + ownerFilter + '&order=updated_at.desc',
      { serviceRole: true }
    );
    const ids = (Array.isArray(labels) ? labels : [])
      .filter(row => comparableText(row.label).includes(searchText))
      .slice(0, 100)
      .map(row => encodeURIComponent(row.id));
    if (!ids.length) return [];
    idFilter = '&id=in.(' + ids.join(',') + ')';
  }
  const rows = await supabaseJson(
    '/rest/v1/quote_history?select=id,owner_id,label,snapshot,created_at,updated_at' + ownerFilter + idFilter + '&order=updated_at.desc&limit=100',
    { serviceRole: true }
  );
  const profileById = await profileMapForUserIds([ownerId]);
  return (Array.isArray(rows) ? rows : []).map(row => normalizeQuoteHistoryEntry(row, profileById));
}

async function saveQuoteHistoryForSession(session, body) {
  requireSupabaseHistory();
  const ownerId = session.role === 'admin' && body?.userId ? String(body.userId) : session.userId;
  if (!ownerId) throw new Error('Sessao sem utilizador Supabase associado.');
  const snapshot = body?.snapshot || {};
  const label = String(body?.label || 'Sem nome').trim() || 'Sem nome';
  const snapshotKey = String(body?.snapshotKey || label).trim() || label;
  await supabaseJson('/rest/v1/quote_history?on_conflict=owner_id,snapshot_key', {
    method: 'POST',
    serviceRole: true,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: {
      owner_id: ownerId,
      snapshot_key: snapshotKey,
      label,
      snapshot,
      updated_at: new Date().toISOString()
    }
  });
}

async function importQuoteHistoryForSession(session, body) {
  requireSupabaseHistory();
  const ownerId = session.userId;
  if (!ownerId) throw new Error('Sessao sem utilizador Supabase associado.');
  const entries = Array.isArray(body?.entries) ? body.entries.slice(0, 100) : [];
  const rows = entries.map((entry) => {
    const snapshot = entry?.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : {};
    const label = String(entry?.label || 'Sem nome').trim() || 'Sem nome';
    const snapshotKey = String(entry?.snapshotKey || entry?.id || label).trim() || label;
    return {
      owner_id: ownerId,
      snapshot_key: snapshotKey,
      label,
      snapshot,
      updated_at: entry?.updatedAt || new Date().toISOString()
    };
  }).filter(row => row.snapshot && row.snapshot.client);
  if (!rows.length) return;
  await supabaseJson('/rest/v1/quote_history?on_conflict=owner_id,snapshot_key', {
    method: 'POST',
    serviceRole: true,
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: rows
  });
}

async function deleteQuoteHistoryForSession(session, id) {
  requireSupabaseHistory();
  const rows = await supabaseJson('/rest/v1/quote_history?select=id,owner_id&id=eq.' + encodeURIComponent(id), { serviceRole: true });
  const entry = Array.isArray(rows) ? rows[0] : null;
  if (!entry) return;
  if (session.role !== 'admin' && entry.owner_id !== session.userId) throw new Error('Sem permissao para apagar este historico.');
  await supabaseJson('/rest/v1/quote_history?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    serviceRole: true,
    headers: { Prefer: 'return=minimal' }
  });
}

function cleanComparableSource(value) {
  let text = String(value || '');
  text = text
    .replace(/\u00c3\u20ac/g, 'À')
    .replace(/\u00c3\u00a1/g, 'á')
    .replace(/\u00c3\u00a0/g, 'à')
    .replace(/\u00c3\u00a9/g, 'é')
    .replace(/\u00c3\u00b3/g, 'ó')
    .replace(/\u00c3\u00a7/g, 'ç')
    .replace(/\u00c3\u00a3/g, 'ã');
  for (let index = 0; index < 3 && /Ã|Â|�/.test(text); index += 1) {
    try {
      const decoded = Buffer.from(text, 'latin1').toString('utf8');
      if (!decoded || decoded === text) break;
      text = decoded;
    } catch (error) {
      break;
    }
  }
  return text
    .replace(/LEDÂ´S/g, "LED'S")
    .replace(/LED´S/g, "LED'S")
    .replace(/SÃƒO/g, 'SÃO')
    .replace(/SÃƒÂO/g, 'SÃO')
    .replace(/PeÃƒÂ§as/g, 'Peças')
    .replace(/PeÃ§as/g, 'Peças')
    .replace(/AcessÃ³rios/g, 'Acessórios')
    .replace(/RodapÃ©s/g, 'Rodapés')
    .replace(/DobradiÃ§a/g, 'Dobradiça')
    .replace(/HidrÃ³fuga/g, 'Hidrófuga')
    .replace(/OrÃ§amento/g, 'Orçamento')
    .replace(/AfinaÃ§Ã£o/g, 'Afinação')
    .replace(/NÃ£o/g, 'Não')
    .replace(/SÃ³/g, 'Só');
}

function comparableText(value) {
  return cleanComparableSource(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function badHingeSummary(item) {
  const text = comparableText([item?.name, item?.item, item?.label, item?.reference].join(' '));
  return text.includes('CORRED') || text.includes('GAVETAS ROUPEIRO');
}

function normalizeExtraGroupName(group) {
  const text = comparableText(group);
  if (!text) return '';
  if (text === comparableText('Sistema de abertura de portas') || text === comparableText('Sistema de abertura')) return 'Sistema de abertura';
  if (text === comparableText(wardrobeDrawerGroup)) return wardrobeDrawerGroup;
  if (text === comparableText(transportExtraGroup) || (text.includes('TRANSPORTE') && text.includes('EMBAL'))) return transportExtraGroup;
  if (text.includes('ACESS') && text.includes('COZINHA')) return 'Acessórios Cozinha';
  if (text.includes('ACESS') && text.includes('ROUPEIRO')) return 'Acessórios Roupeiro';
  if (text.includes('RODAP')) return 'Rodapés (metros)';
  if (text.includes('LED')) return "LED'S (metros)";
  if (text === 'CESTOS DO LIXO') return 'Cestos do Lixo';
  if (text === 'PUXADORES') return 'Puxadores';
  if (text === 'TOMADAS') return 'Tomadas';
  if (text === 'GAVETAS') return 'Gavetas';
  if (text === comparableText(manualExtraGroup)) return manualExtraGroup;
  if (text.includes('PES') && text.includes('FIXACAO') && text.includes('ORGANIZACAO')) return 'Pés, Fixação e Organização';
  if (text === 'OUTROS') return 'Outros';
  return String(group || '').replace(/\s+/g, ' ').trim();
}

function isManualPricedExtra(extra) {
  const group = normalizeExtraGroupName(extra?.group);
  if (group === manualExtraGroup) return true;
  if (group === transportExtraGroup) return !findCatalogExtraForQuote(extra);
  if (group !== 'Outros') return false;
  return !findCatalogExtraForQuote(extra);
}

function isInternationalPackagingItem(item) {
  return internationalPackagingLaborMinutesFor(item) > 0;
}

function internationalPackagingLaborMinutesFor(item) {
  const name = comparableItemText(item?.item || item?.label || item?.name || item?.reference);
  if (name === comparableItemText(internationalPackagingItemName)) return 20;
  if (name === comparableItemText(lacqueredInternationalPackagingItemName)) return 35;
  if (name === comparableItemText(nationalPackagingItemName)) return 10;
  if (name === comparableItemText(lacqueredNationalPackagingItemName)) return 25;
  return 0;
}

function internationalPackagingInternalCost(item, costs = costItems) {
  return (Number(item?.cost) || 0) + laborHourlyPriceFromCostItems(costs) * internationalPackagingLaborMinutesFor(item) / 60;
}

function recalculateInternationalPackagingPrices(items = catalog?.extras, costs = costItems) {
  (Array.isArray(items) ? items : []).forEach(item => {
    if (normalizeExtraGroupName(item?.group) !== transportExtraGroup || !isInternationalPackagingItem(item)) return;
    item.client = internationalPackagingInternalCost(item, costs) * internationalPackagingClientMultiplier;
    item.reseller = item.client;
    item.manualClient = false;
    item.manualReseller = false;
  });
}

function comparableItemText(value) {
  return comparableText(value)
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function catalogExtraMatches(item, extra) {
  if (normalizeExtraGroupName(item?.group) !== normalizeExtraGroupName(extra?.group)) return false;
  const left = comparableItemText(item?.item || item?.label || item?.name || item?.reference);
  const right = comparableItemText(extra?.item || extra?.label || extra?.name || extra?.reference);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function isRipadoGroupItem(extra, name) {
  return comparableText(extra?.group) === comparableText(ripadoExtraGroup) &&
    comparableItemText(extra?.item || extra?.label || extra?.name || extra?.reference) === comparableItemText(name);
}

function isRipadoExtra(extra) {
  return isRipadoGroupItem(extra, ripadoItemName);
}

function isPillowEffectExtra(extra) {
  return isRipadoGroupItem(extra, pillowEffectItemName);
}

function ripadoUnitFactor(quantity) {
  return quantity >= ripadoVolumeQuantity ? ripadoVolumeFactor : 1;
}

function ensureRipadoCatalogItem() {
  catalog.extras = Array.isArray(catalog.extras) ? catalog.extras : [];
  [[ripadoItemName, ripadoDefaultClientPrice], [pillowEffectItemName, 0], [roundsItemName, roundsDefaultClientPrice]].forEach(([name, client]) => {
    if (catalog.extras.some(item => isRipadoGroupItem(item, name))) return;
    catalog.extras.push({
      group: ripadoExtraGroup,
      item: name,
      label: name,
      name,
      reference: name,
      supplier: '',
      supplierPrice: 0,
      cost: 0,
      client,
      reseller: client
    });
  });
}

function findCatalogExtraForQuote(extra) {
  const direct = (catalog.extras || []).find(item => catalogExtraMatches(item, extra));
  if (direct) return direct;
  if (normalizeExtraGroupName(extra?.group) !== 'Sistema de abertura') return null;
  const wanted = comparableItemText(extra?.item || extra?.label || extra?.name || extra?.reference);
  if (!wanted) return null;
  return (catalog.doorSystems || []).find(item => {
    const candidate = comparableItemText(item?.name || item?.item || item?.label || item?.reference);
    return candidate && (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
  }) || null;
}

function isSkirtingExtra(extra) {
  return comparableText(extra?.group).includes('RODAP');
}

function isLacqueredExtra(extra) {
  return extra?.lacquered === true || extra?.lacquered === 'Sim';
}

function drawerUsesWardrobeType(extra) {
  const wanted = comparableItemText(extra?.item || extra?.label || extra?.name || extra?.reference);
  const drawerCatalog = (catalog.extras || []).filter(item => comparableText(item.group) === comparableText('Gavetas'));
  const catalogItem = drawerCatalog.find(item =>
    comparableItemText(item.item || item.label || item.name || item.reference) === wanted
  ) || findCatalogExtraForQuote(extra);
  if (catalogItem) {
    const declaredUse = comparableText([catalogItem.handleUse, catalogItem.tipo].filter(Boolean).join(' '));
    if (declaredUse.includes('COZINHA')) return false;
    if (declaredUse.includes('ROUPEIRO')) return true;
    const family = comparableText(catalogItem.family || '');
    if (family.includes('COZINHA')) return false;
    if (family.includes('ROUPEIRO')) return true;
    return comparableText([catalogItem.item, catalogItem.label, catalogItem.name, catalogItem.reference].join(' ')).includes('ROUPEIRO');
  }
  if (!wanted) return false;
  return comparableText([extra?.tipo, extra?.handleUse, extra?.family, extra?.item].filter(Boolean).join(' ')).includes('ROUPEIRO');
}

function isWardrobeDrawerExtra(extra) {
  if (comparableText(extra?.group) === comparableText(wardrobeDrawerGroup)) return true;
  if (normalizeExtraGroupName(extra?.group) !== 'Gavetas') return false;
  return drawerUsesWardrobeType(extra);
}

function isWardrobeRodExtra(extra, catalogItem) {
  const group = normalizeExtraGroupName(extra?.group || catalogItem?.group);
  if (group !== 'Acessórios Roupeiro') return false;
  const text = comparableText([
    extra?.item,
    extra?.reference,
    catalogItem?.item,
    catalogItem?.label,
    catalogItem?.name,
    catalogItem?.reference
  ].join(' '));
  return text.includes('VARAO') ||
    text.includes('EXTENSIVEL') ||
    /\bASSA\s*75\s*125\b/.test(text) ||
    wardrobeRodLengthCm(extra, catalogItem) > 80;
}

function wardrobeRodLengthCm(extra, catalogItem) {
  const raw = cleanComparableSource([
    extra?.item,
    extra?.reference,
    catalogItem?.item,
    catalogItem?.label,
    catalogItem?.name,
    catalogItem?.reference
  ].join(' ')).toUpperCase();
  const normalized = comparableText(raw);
  let longest = 0;

  for (const match of raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:M|MT|METRO|METROS)\b/g)) {
    longest = Math.max(longest, Number(String(match[1]).replace(',', '.')) * 100);
  }
  for (const match of raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:CM|CENTIMETROS)\b/g)) {
    longest = Math.max(longest, Number(String(match[1]).replace(',', '.')));
  }
  for (const match of raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:MM|MILIMETROS)\b/g)) {
    longest = Math.max(longest, Number(String(match[1]).replace(',', '.')) / 10);
  }
  for (const match of normalized.matchAll(/\b(?:MOD|AAF)\s*\.?\s*(\d{2,3})\b/g)) {
    longest = Math.max(longest, Number(match[1]));
  }
  for (const match of normalized.matchAll(/\b(\d{2,4})\s*[-/]\s*(\d{2,4})\b/g)) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    const max = Math.max(left, right);
    longest = Math.max(longest, max > 300 ? max / 10 : max);
  }

  return longest;
}

function wardrobeRodClientSurcharge(extra, catalogItem) {
  if (!isWardrobeRodExtra(extra, catalogItem)) return 0;
  return wardrobeRodLengthCm(extra, catalogItem) > 80 ? 4 : 0;
}

function wardrobeRodSegments(extra) {
  return String(extra?.rodLengths || extra?.rodLengthCm || '')
    .split(/[+;,|/\n]+/)
    .map(value => Number(String(value).replace(',', '.').trim()))
    .filter(value => Number.isFinite(value) && value > 0);
}

function wardrobeRodLine(extra, catalogItem, baseClient, baseCost) {
  if (!isWardrobeRodExtra(extra, catalogItem)) return null;
  const fullLengthCm = wardrobeRodLengthCm(extra, catalogItem);
  const segments = wardrobeRodSegments(extra);
  if (!segments.length || !fullLengthCm) {
    return {
      unitClient: money(baseClient + wardrobeRodClientSurcharge(extra, catalogItem)),
      unitCost: money(baseCost)
    };
  }
  const usedCm = segments.reduce((sum, value) => sum + value, 0);
  const proportionalClient = baseClient * (usedCm / fullLengthCm);
  const proportionalCost = baseCost * (usedCm / fullLengthCm);
  const middleSupportClient = segments.filter(value => value > 80).length * 4;
  return {
    unitClient: money(proportionalClient + middleSupportClient),
    unitCost: money(proportionalCost)
  };
}

function updatePlatePrices(plate, changes) {
  if (typeof changes.name === 'string') plate.name = changes.name.trim();
  if (typeof changes.supplier === 'string') plate.supplier = changes.supplier.trim();
  if (typeof changes.reference === 'string') plate.reference = changes.reference.trim();
  if (Number.isFinite(Number(changes.supplierPrice))) plate.supplierPrice = Math.max(0, Number(changes.supplierPrice));
  if (changes.manualClient !== undefined) plate.manualClient = changes.manualClient === true;
  if (changes.manualReseller !== undefined) plate.manualReseller = changes.manualReseller === true;
  plate.cost = plateCostPerSquareMeter(plate.supplierPrice, costItems, platePricingRules.labor);
  const automaticClient = plate.cost * customPlateClientMultiplier;
  plate.client = plate.manualClient === true && Number.isFinite(Number(changes.client))
    ? Number(changes.client)
    : automaticClient;
  plate.reseller = plate.manualReseller === true && Number.isFinite(Number(changes.reseller))
    ? Number(changes.reseller)
    : plate.cost * customPlateResellerMultiplier;
}

function updateEdgeLaborCost(edge) {
  if (!edge) return;
  const meters = Number(edge.supplierMeters) || 1000;
  const supplierPrice = Number(edge.supplierPrice) || 0;
  edge.materialPerMeter = meters ? supplierPrice / meters : 0;
  edge.cost = edge.materialPerMeter + laborPrices.edges;
}

function recalculateCatalogLaborCosts() {
  (catalog.plates || []).forEach((plate) => {
    const client = Number(plate.client) || 0;
    const reseller = Number(plate.reseller) || 0;
    const supplierPrice = Number(plate.supplierPrice) || 0;
    const previousCost = supplierPrice + platePricingRules.labor;
    const saw = costItemNamed(costItems, 'seccionadora');
    const sawRate = panelSawCostPerSquareMeter(costItems);
    const assemblyLaborRate = moduleAssemblyLaborPerSquareMeter(costItems);
    const previousSaleBase = supplierPrice + (sawRate ?? 0) + assemblyLaborRate;
    plate.cost = plateCostPerSquareMeter(supplierPrice, costItems, platePricingRules.labor);
    // Older Supabase tables do not have manual-price flag columns. If the
    // stored sale price differs from the automatic formula, preserve it as a
    // manual value instead of silently replacing it on every refresh.
    const automaticClient = plate.cost * customPlateClientMultiplier;
    const automaticReseller = plate.cost * customPlateResellerMultiplier;
    const previousAutomaticClient = previousSaleBase * customPlateClientMultiplier;
    const previousAutomaticReseller = previousSaleBase * previousCustomPlateResellerMultiplier;
    const olderAutomaticClient = saw
      ? supplierPrice * platePricingRules.clientMultiplier + (Number(saw.client) || 0)
      : previousCost * platePricingRules.clientMultiplier;
    const olderAutomaticReseller = previousCost * platePricingRules.resellerMultiplier;
    const legacyCost = supplierPrice + laborPrices.plates;
    const legacyAutomaticClient = legacyCost * platePricingRules.clientMultiplier;
    const legacyAutomaticReseller = legacyCost * platePricingRules.resellerMultiplier;
    const legacyManualClient = plate.manualClient == null && client > 0 &&
      Math.abs(client - automaticClient) > 0.005 &&
      Math.abs(client - previousAutomaticClient) > 0.005 &&
      Math.abs(client - olderAutomaticClient) > 0.005 &&
      Math.abs(client - legacyAutomaticClient) > 0.005;
    const legacyManualReseller = plate.manualReseller == null && reseller > 0 &&
      Math.abs(reseller - automaticReseller) > 0.005 &&
      Math.abs(reseller - previousAutomaticReseller) > 0.005 &&
      Math.abs(reseller - olderAutomaticReseller) > 0.005 &&
      Math.abs(reseller - legacyAutomaticReseller) > 0.005;
    const manualClient = plate.manualClient === true || legacyManualClient;
    const manualReseller = plate.manualReseller === true || legacyManualReseller;
    plate.manualClient = manualClient;
    plate.manualReseller = manualReseller;
    if (!manualClient) plate.client = automaticClient;
    else plate.client = client;
    if (!manualReseller) plate.reseller = automaticReseller;
    else plate.reseller = reseller;
  });
  (catalog.edges || []).forEach(updateEdgeLaborCost);
  normalizeDrawerRunnerExtras();
  recalculateInternationalPackagingPrices();
}

function cleanSupplierItem(item) {
  const next = { ...item };
  delete next.__dirtyIndex;
  delete next.__delete;
  return next;
}

function removeCatalogItems(list, items) {
  if (!Array.isArray(list) || !Array.isArray(items)) return;
  items.forEach((item) => {
    const index = item?.catalogId ? list.findIndex(existing => existing.catalogId === item.catalogId) : Number(item?.__dirtyIndex);
    if (Number.isInteger(index) && index >= 0 && index < list.length) list.splice(index, 1);
  });
}

function supplierChangeKey(item, nameField) {
  const identityName = item?.[nameField] || item?.name || item?.item || item?.label;
  return [
    item?.priceKey,
    identityName,
    item?.group,
    item?.family,
    item?.usedIn,
    item?.parentId,
    item?.__supplierLocalId,
    item?.supplier,
    item?.reference
  ].map(comparableText).filter(Boolean).join('|');
}

function findSavedSupplierItem(list, item, nameField) {
  const identified = list.find(existing => existing.catalogId === item.catalogId);
  if (identified) return identified;
  // Old browser drafts can refer to an ID replaced during catalogue migration.
  // Reconcile only one exact identity; never fall back to a shifted row index.
  const key = supplierChangeKey(item, nameField);
  const matches = list.filter(existing => supplierChangeKey(existing, nameField) === key);
  if (matches.length === 1) return matches[0];
  throw new Error('Material nao encontrado: ' + (item.name || item.item || item.reference || item.catalogId) + '. Atualiza a pagina antes de guardar.');
}

function upsertCatalogItems(list, items, nameField) {
  if (!Array.isArray(list) || !Array.isArray(items)) return;
  items.forEach((item) => {
    if (item?.__delete === true) return;
    const index = Number(item?.__dirtyIndex);
    const key = supplierChangeKey(item, nameField);
    const target = item.catalogId ? findSavedSupplierItem(list, item, nameField) : Number.isInteger(index) && index >= 0 && index < list.length
      ? list[index]
      : list.find(existing => supplierChangeKey(existing, nameField) === key);
    if (target) {
      Object.assign(target, cleanSupplierItem(item), { catalogId: target.catalogId });
    } else {
      if (item.catalogId) throw new Error('Material nao encontrado. Atualiza a pagina antes de guardar.');
      list.push({ ...cleanSupplierItem(item), catalogId: crypto.randomUUID() });
    }
  });
  dedupeCatalogItems(list, nameField);
}

function dedupeCatalogItems(list, nameField) {
  if (!Array.isArray(list)) return;
  const seen = new Map();
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const key = list[index].catalogId || supplierChangeKey(list[index], nameField);
    if (!key) continue;
    if (seen.has(key)) {
      list.splice(index, 1);
    } else {
      seen.set(key, list[index]);
    }
  }
}

function upsertCatalogItemsByName(list, items, nameField) {
  if (!Array.isArray(list) || !Array.isArray(items)) return;
  items.forEach((item) => {
    const wanted = comparableText(item?.[nameField] || item?.name || item?.item || item?.label);
    const target = list.find(existing => comparableText(existing?.[nameField] || existing?.name || existing?.item || existing?.label) === wanted);
    if (target) {
      Object.assign(target, item);
    } else {
      list.push({ ...item });
    }
  });
}

function applySupplierPayload(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.laborPrices && typeof payload.laborPrices === 'object') {
    laborPrices = normalizeLaborPrices({ ...laborPrices, ...payload.laborPrices });
  }
  if (Array.isArray(payload.costs)) {
    const mergedCosts = costItems.map(item => ({ ...item }));
    payload.costs.forEach(change => {
      const changeId = String(change?.id || '');
      const changeName = normalizedCostItemName(change?.name);
      const changeType = String(change?.type || 'ambos');
      const index = mergedCosts.findIndex(item => changeId
        ? String(item.id || '') === changeId
        : normalizedCostItemName(item.name) === changeName && String(item.type || 'ambos') === changeType);
      if (change?.__delete === true) {
        if (index >= 0) mergedCosts.splice(index, 1);
      } else if (index >= 0) {
        Object.assign(mergedCosts[index], change);
      } else {
        mergedCosts.push({ ...change });
      }
    });
    costItems = ensureDrawerAssemblyCostItems(calculateCustomCostPrices(mergedCosts));
    syncEdgeLaborFromEdgebander();
    syncDrawerLaborFromCostItems();
  }
  syncPanelSawPlatePricing();
  removeCatalogItems(catalog.plates, (payload.plates || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.paintings, (payload.paintings || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.paintingComponents, (payload.paintingComponents || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.edges, (payload.edges || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.extras, (payload.extras || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.hinges, (payload.hinges || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.drawerComponents, (payload.drawerComponents || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.hingeComponents, (payload.hingeComponents || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.openingSystemComponents, (payload.openingSystemComponents || []).filter(item => item?.__delete === true));
  removeCatalogItems(catalog.doorSystems, (payload.doorSystems || []).filter(item => item?.__delete === true));
  if (Array.isArray(payload.plates)) {
    payload.plates.forEach((change) => {
      if (change?.__delete === true) return;
      const index = Number(change?.__dirtyIndex);
      const key = supplierChangeKey(change, 'name');
      const plate = change.catalogId ? findSavedSupplierItem(catalog.plates, change, 'name') : Number.isInteger(index) && index >= 0 && index < catalog.plates.length
        ? catalog.plates[index]
        : catalog.plates.find(item => supplierChangeKey(item, 'name') === key);
      const cleanChange = cleanSupplierItem(change);
      if (plate) {
        Object.assign(plate, cleanChange, { catalogId: plate.catalogId });
        updatePlatePrices(plate, cleanChange);
      } else if (payload.addMissingPlates === true) {
        if (change.catalogId) throw new Error('Material nao encontrado. Atualiza a pagina antes de guardar.');
        const next = { ...cleanChange, catalogId: crypto.randomUUID() };
        updatePlatePrices(next, cleanChange);
        catalog.plates.push(next);
      } else if (change.catalogId) {
        throw new Error('Material nao encontrado. Atualiza a pagina antes de guardar.');
      }
    });
  }
  (payload.extras || []).forEach(item => { item.group = normalizeExtraGroupName(item.group); });
  upsertCatalogItems(catalog.paintings, payload.paintings, 'name');
  syncPaintingServiceCosts();
  upsertCatalogItems(catalog.paintingComponents, payload.paintingComponents, 'item');
  upsertCatalogItems(catalog.edges, payload.edges, 'name');
  if (payload.laborPrices || Array.isArray(payload.edges)) (catalog.edges || []).forEach(updateEdgeLaborCost);
  upsertCatalogItems(catalog.extras, payload.extras, 'item');
  catalog.extras.forEach(item => {
    if (normalizeExtraGroupName(item.group) === 'Puxadores' && item.priceUnit === 'cm') {
      item.cost = 0;
      item.supplierPrice = 0;
      item.manualClient = true;
      item.reseller = item.client;
      item.manualReseller = true;
    }
  });
  upsertCatalogItems(catalog.hinges, (payload.hinges || []).filter(item => !badHingeSummary(item)), 'name');
  upsertCatalogItems(catalog.doorSystems, payload.doorSystems, 'name');
  upsertCatalogItemsByName(catalog.doorSystems, (payload.extras || [])
    .filter(item => comparableText(item.group) === comparableText('Sistema de abertura de portas') || comparableText(item.group) === comparableText('Sistema de abertura'))
    .map(item => ({
      name: item.name || item.item || item.label,
      item: item.name || item.item || item.label,
      label: item.name || item.item || item.label,
      supplier: item.supplier,
      reference: item.reference,
      supplierPrice: item.supplierPrice,
      cost: item.cost,
      client: item.client,
      reseller: item.reseller,
      manualSupplierPrice: item.manualSupplierPrice,
      manualClient: item.manualClient,
      manualReseller: item.manualReseller,
      userAdded: item.userAdded
    })), 'name');
  upsertCatalogItems(catalog.drawerComponents, payload.drawerComponents, 'item');
  upsertCatalogItems(catalog.hingeComponents, payload.hingeComponents, 'item');
  upsertCatalogItems(catalog.openingSystemComponents, (payload.openingSystemComponents || []).filter(item => !item.userAddedSummary), 'item');
  upsertCatalogItemsByName(catalog.doorSystems, (payload.openingSystemComponents || []).filter(item => item.userAddedSummary === true).map(item => ({
    name: item.name || item.item || item.label,
    item: item.name || item.item || item.label,
    label: item.name || item.item || item.label,
    supplier: item.supplier,
    reference: item.reference,
    supplierPrice: item.supplierPrice,
    cost: item.cost,
    client: item.client,
    reseller: item.reseller,
    manualSupplierPrice: item.manualSupplierPrice,
    manualClient: item.manualClient,
    manualReseller: item.manualReseller,
    userAdded: item.userAdded
  })), 'name');
  markDoorSystemDuplicates(catalog.doorSystems);
  recalculateInternationalPackagingPrices();
}

function supplierPricePayload() {
  return {
    rules: { ...platePricingRules, edgeLabor: laborPrices.edges, drawerLabor: drawerAssemblyCost('cozinha'), wardrobeDrawerLabor: drawerAssemblyCost('roupeiro') },
    laborPrices: { ...laborPrices },
    plates: catalog.plates.map(item => ({ ...item })),
    paintings: catalog.paintings.map(item => ({ ...item })),
    costs: costItems.map(item => ({ ...item }))
  };
}

const quoteSeed = {
  source: {
    storage: catalogStore.mode,
    present: true,
    note: 'Dados e fluxo modelados a partir das folhas OrÃ§amento_Cozinhas e OrÃ§amento_Final.'
  },
  client: {
    name: 'ELISABETE - MANUEL (V2)',
    location: 'SÃƒO JOAO MADEIRA',
    date: '2026-07-02'
  },
  modules: [
    {
      id: 'inferior_75',
      family: 'ARMÃRIO COZINHA - CAIXOTES INFERIORES',
      quantity: 1,
      width: 75,
      height: 78,
      depth: 60,
      doors: 1,
      drawers: 3,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Melamina Branca HidrÃ³fuga B3768 - 16mm',
      paintDoor: 'Velaturas Claras c/ AfinaÃ§Ã£o',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 0,
      back: 1,
      divider: 0,
      unitClient: 103.0008,
      unitCost: 37.052,
      description: 'ARMÃRIO COZINHA - CAIXOTES INFERIORES / 75(L)x78(A)x60(P) / 1 Portas / 3 Gavetas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Melamina Branca HidrÃ³fuga B3768 - 16mm'
    },
    {
      id: 'superior_90',
      family: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES',
      quantity: 1,
      width: 90,
      height: 100,
      depth: 40,
      doors: 2,
      drawers: 0,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Termolaminado Cinza Alto Brilho - 19mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Tip-on (Pulsador Preto) / Tic-Tac',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 1,
      back: 1,
      divider: 0,
      unitClient: 465.8826,
      unitCost: 179.2834,
      description: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES / 90(L)x100(A)x40(P) / 2 Portas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Termolaminado Cinza Alto Brilho - 19mm'
    },
    {
      id: 'superior_60',
      family: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES',
      quantity: 1,
      width: 60,
      height: 60,
      depth: 60,
      doors: 2,
      drawers: 0,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Termolaminado Cinza Alto Brilho - 19mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 1,
      back: 1,
      divider: 0,
      unitClient: 316.4267,
      unitCost: 120.0218,
      description: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES / 60(L)x60(A)x60(P) / 2 Portas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Termolaminado Cinza Alto Brilho - 19mm'
    },
    {
      id: 'coluna_60',
      family: 'ARMÃRIO COZINHA - COLUNA',
      quantity: 1,
      width: 60,
      height: 240,
      depth: 60,
      doors: 1,
      drawers: 2,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Termolaminado Cinza Alto Brilho - 19mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 0,
      back: 1,
      divider: 0,
      unitClient: 229.5732,
      unitCost: 85.3516,
      description: 'ARMÃRIO COZINHA - COLUNA / 60(L)x240(A)x60(P) / 1 Portas / 2 Gavetas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Termolaminado Cinza Alto Brilho - 19mm'
    },
    {
      id: 'superior_83',
      family: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES',
      quantity: 1,
      width: 83,
      height: 100,
      depth: 40,
      doors: 2,
      drawers: 0,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Termolaminado Cinza Alto Brilho - 19mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 1,
      back: 1,
      divider: 0,
      unitClient: 660.2973,
      unitCost: 239.7738,
      description: 'ARMÃRIO COZINHA - CAIXOTES SUPERIORES / 83(L)x100(A)x40(P) / 2 Portas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Termolaminado Cinza Alto Brilho - 19mm'
    },
    {
      id: 'inferior_83',
      family: 'ARMÃRIO COZINHA - CAIXOTES INFERIORES',
      quantity: 1,
      width: 83,
      height: 78,
      depth: 60,
      doors: 2,
      drawers: 0,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Melamina Branca HidrÃ³fuga B3768 - 16mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 1,
      back: 1,
      divider: 0,
      unitClient: 304.519,
      unitCost: 116.1032,
      description: 'ARMÃRIO COZINHA - CAIXOTES INFERIORES / 83(L)x78(A)x60(P) / 2 Portas / INT: Melamina F067 HidrÃ³fuga - 16mm / EXT: Melamina Branca HidrÃ³fuga B3768 - 16mm'
    },
    {
      id: 'extra_caixote',
      family: 'ARMÃRIO COZINHA',
      quantity: 1,
      width: 60,
      height: 78,
      depth: 60,
      doors: 1,
      drawers: 0,
      interior: 'Melamina F067 HidrÃ³fuga - 16mm',
      exterior: 'Melamina Branca HidrÃ³fuga B3768 - 16mm',
      paintDoor: 'Nenhuma',
      doorSystem: 'Normal',
      topBottomEdges: 'Sim',
      sideEdges: 'Sim',
      hinge: 'DobradiÃ§a Standard (com mola)',
      shelves: 1,
      back: 1,
      divider: 0,
      unitClient: 232.5301,
      unitCost: 82.7521,
      description: 'ARMÃRIO COZINHA / valores importados da folha OrÃ§amento_Final'
    }
  ],
  extras: [
    { id: 'rodape', group: 'RodapÃ©s (metros)', item: 'RodapÃ© PVC AlumÃ­nio Escovado (Altura 100mm)', quantity: 3, unitClient: 10, unitCost: 5.9783333333 },
    { id: 'acessorio', group: 'AcessÃ³rios Cozinha', item: 'Porta-Garrafas ExtraÃ­vel Ring (M15)', quantity: 1, unitClient: 74, unitCost: 46.1666666667 },
    { id: 'perfil_led', group: 'LEDÂ´S (metros)', item: 'Perfil LED Embutir AlumÃ­nio (Ares)', quantity: 1, unitClient: 8, unitCost: 4.925 },
    { id: 'difusor_led', group: 'LEDÂ´S (metros)', item: 'Difusor Fosco p/ Perfil (5MT)', quantity: 1, unitClient: 7, unitCost: 3.99 },
    { id: 'fita_led', group: 'LEDÂ´S (metros)', item: 'Rolo Fita LED Luz Neutra (50MT)', quantity: 1, unitClient: 6, unitCost: 3.3 },
    { id: 'transformador_led', group: 'LEDÂ´S (metros)', item: 'Transformador LED 24V (36W)', quantity: 1, unitClient: 26, unitCost: 15.9333333333 },
    { id: 'interruptor_led', group: 'LEDÂ´S (metros)', item: 'Interruptor Touch Embutir Preto', quantity: 1, unitClient: 21, unitCost: 12.8333333333 },
    { id: 'tomada_1', group: 'Tomadas', item: '', quantity: 0, unitClient: 0, unitCost: 0 }
  ],
  lists
};

// A base nova deve começar sem o orçamento de demonstração antigo.  Os dados
// de exemplo continham materiais que podem não existir no catálogo atual e
// acabavam por gerar avisos como "madeira interior sem preço encontrado".
quoteSeed.modules = [];
quoteSeed.extras = [];
quoteSeed.client = { name: '', location: '', date: '' };
quoteSeed.typePresets = typePresets;
quoteSeed.catalog = catalog;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function mergeCatalogPrices(target, incoming, matcher) {
  if (!Array.isArray(target) || !Array.isArray(incoming)) return;
  incoming.forEach(source => {
    // A new user-added row must stay independent even when its reference or
    // material code is equal to an existing row. Existing rows are matched by
    // ID first, then by the legacy matcher used for old overrides.
    const isNewUserItem = source?.userAdded === true && !source?.catalogId;
    const item = source?.catalogId
      ? target.find(candidate => candidate.catalogId === source.catalogId)
      : (isNewUserItem ? null : target.find(candidate => matcher(candidate, source)));
    if (!item) {
      if (source.userAdded === true) target.push({ ...source });
      return;
    }
    ['supplier', 'reference'].forEach(field => {
      if (typeof source[field] === 'string') item[field] = source[field];
    });
    ['supplierPrice', 'cost', 'client', 'reseller'].forEach(field => {
      if (Number.isFinite(Number(source[field]))) item[field] = Number(source[field]);
    });
    ['manualClient', 'manualReseller'].forEach(field => {
      if (source[field] !== undefined) item[field] = source[field] === true;
    });
  });
}

function materialCodeThicknessKey(value) {
  const text = comparableText(value).replace(/\|/g, ' ')
    .replace(/\bTOUCH\b/g, 'TC')
    .replace(/\bBRILHO\b/g, 'BRI')
    .replace(/\bEXTRA[\s-]+MATE\b/g, 'EXT');
  const thickness = text.match(/\b(\d+(?:[,.]\d+)?)\s*MM\b/) || text.match(/(?:^|\s|-)(\d+(?:[,.]\d+)?)\s*$/);
  if (thickness && text.includes('MDF') && /HIDR[OI]FUG/.test(text)) return 'MDF HIDROFUGO|' + thickness[1].replace(',', '.');
  if (thickness && text.includes('MDF') && text.includes('STANDARD')) return 'MDF STANDARD|' + thickness[1].replace(',', '.');
  const code = text.match(/\b([A-Z]{1,4}\d{2,5}|\d{3,5})\b(?:\s+(ST\d+|SC|TL|BRI|GLOSS|FUN|FA|FH|TC|SILK|EXT))?/);
  if (!thickness || !code) return '';
  let plateCode = comparableText(code[1]) === 'F067' && !code[2] ? 'F067 SC' : code[1];
  if (code[2] && !String(plateCode).includes(' ')) plateCode += ' ' + code[2];
  return plateCode + '|' + thickness[1].replace(',', '.');
}

function sameMaterialPrice(item, source) {
  const itemVariant = materialCodeThicknessKey(item.reference) || materialCodeThicknessKey(item.name);
  const sourceVariant = materialCodeThicknessKey(source.reference) || materialCodeThicknessKey(source.name);
  if (itemVariant && sourceVariant) return itemVariant === sourceVariant;
  if (item.name === source.name) return true;
  if (comparableText(item.name) === comparableText(source.name)) return true;
  const sourceKey = materialCodeThicknessKey(source.name || source.reference || source.comparisonKey);
  if (!sourceKey) return false;
  return materialCodeThicknessKey(item.name) === sourceKey ||
    materialCodeThicknessKey(item.reference) === sourceKey ||
    materialCodeThicknessKey(item.comparisonKey) === sourceKey;
}

const knownDrawerRunnerRatios = [
  { key: '760H TICTAC 40KG 250', cost: 37.16, client: 75 },
  { key: '561HT TIC TAC 30KG 435', cost: 23.231, client: 52 },
  { key: '551H AMORT PARCIAL 30KG 360', cost: 6.992, client: 17 }
];

function drawerRunnerKnownEntry(value) {
  return null;
  const text = comparableText(value).replace(/[^A-Z0-9]+/g, ' ');
  return knownDrawerRunnerRatios.find(entry => {
    const keyParts = entry.key.split(/\s+/).filter(Boolean);
    return keyParts.every(part => text.includes(part));
  }) || null;
}

function uniqueDrawerComponentsForFamily(family) {
  const wanted = comparableText(family);
  const seen = new Set();
  return (catalog.drawerComponents || []).filter(component => {
    const parent = comparableText([component.family, component.usedIn].join(' '));
    if (!wanted || parent !== wanted) return false;
    const key = [component.item, component.supplier, component.reference].map(comparableText).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function drawerRecipeLabel(recipe) {
  const type = comparableText(recipe?.type);
  const family = comparableText(recipe?.family);
  const kind = type.includes('GAVETAO') ? 'GAVETAO' : 'GAVETA';
  const place = type.includes('INTERIOR') ? 'INTERIOR' : 'EXTERIOR';
  let familyName = '';
  if (family.includes('ANTARO')) familyName = 'ANTARO';
  if (family.includes('MERIVOBOX')) familyName = 'MERIVOBOX';
  if (family.includes('LEGRABOX')) familyName = 'LEGRABOX';
  return [kind, familyName, place].join(' ');
}

function drawerComponentSupplierCost(component) {
  const supplierPrice = Number(component?.supplierPrice);
  return Number.isFinite(supplierPrice) ? supplierPrice : (Number(component?.cost) || 0);
}

function drawerSupplierCost(item) {
  const itemKey = comparableItemText(item?.item || item?.label || item?.name || item?.reference);
  if (!itemKey) return null;
  const recipe = (catalog.drawerRecipes || []).find(candidate => drawerRecipeLabel(candidate) === itemKey);
  const components = recipe
    ? (recipe.components || []).map(recipeComponent => (catalog.drawerComponents || []).find(component =>
      comparableItemText(component.item || component.label || component.name || component.reference) === comparableItemText(recipeComponent.item) &&
      comparableText(component.supplier) === comparableText(recipeComponent.supplier)
    )).filter(Boolean)
    : uniqueDrawerComponentsForFamily(item.item || item.label || item.name || item.reference);
  if (!components.length) return null;
  const componentCost = recipe
    ? (recipe.components || []).reduce((sum, recipeComponent) => {
      const component = (catalog.drawerComponents || []).find(candidate =>
        comparableItemText(candidate.item || candidate.label || candidate.name || candidate.reference) === comparableItemText(recipeComponent.item) &&
        comparableText(candidate.supplier) === comparableText(recipeComponent.supplier)
      );
      return sum + drawerComponentSupplierCost(component) * (Number(recipeComponent.quantity) || 0);
    }, 0)
    : components.reduce((sum, component) => sum + drawerComponentSupplierCost(component), 0);
  const assemblyType = isWardrobeDrawerExtra(item) ? 'roupeiro' : 'cozinha';
  return (Number(item.supplierPrice) || 0) + componentCost + (components.length ? drawerAssemblyCost(assemblyType) : 0);
}

function normalizeDrawerRunnerExtras() {
  const drawerExtras = (catalog.extras || []).filter(item => comparableText(item.group) === comparableText('Gavetas'));
  drawerExtras.forEach(item => {
    const supplierCost = drawerSupplierCost(item);
    if (supplierCost !== null) item.cost = supplierCost;
    const known = drawerRunnerKnownEntry([item.item, item.label, item.name, item.reference].join(' '));
    if (!known) return;
    const components = uniqueDrawerComponentsForFamily(item.item || item.reference);
    const componentCost = money(components.reduce((sum, component) => sum + (Number(component.cost ?? component.supplierPrice) || 0), 0));
    const assemblyType = isWardrobeDrawerExtra(item) ? 'roupeiro' : 'cozinha';
    const cost = (componentCost || known.cost) + (components.length ? drawerAssemblyCost(assemblyType) : 0);
    const ratio = known.cost ? known.client / known.cost : 1.7;
    item.cost = money(cost);
    if (item.manualClient !== true) item.client = cost * ratio;
    if (item.manualReseller !== true) item.reseller = Number(item.client) || cost * ratio;
  });
}

function applyCatalogOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return;
  mergeCatalogPrices(catalog.plates, overrides.plates, sameMaterialPrice);
  mergeCatalogPrices(catalog.paintings, overrides.paintings, (item, source) => item.name === source.name);
  if (Array.isArray(overrides.costs)) {
    costItems = ensureDrawerAssemblyCostItems(calculateCustomCostPrices(overrides.costs));
    syncDrawerLaborFromCostItems();
    syncEdgeLaborFromEdgebander();
    syncPanelSawPlatePricing();
    recalculateCatalogLaborCosts();
  }
  const calculationCosts = costItems;
  syncPaintingServiceCosts(catalog.paintings, calculationCosts);
  mergeCatalogPrices(catalog.edges, overrides.edges, (item, source) => item.name === source.name);
  mergeCatalogPrices(catalog.doorSystems, overrides.doorSystems, (item, source) => item.name === source.name);
  mergeCatalogPrices(catalog.hinges, overrides.hinges, (item, source) => item.name === source.name);
  mergeCatalogPrices(catalog.extras, overrides.extras, catalogExtraMatches);
  mergeCatalogPrices(catalog.drawerComponents, overrides.drawerComponents, (item, source) => comparableItemText(item.item || item.reference) === comparableItemText(source.item || source.reference));
  normalizeDrawerRunnerExtras();
  recalculateInternationalPackagingPrices();
}

function findMaterialForAudit(value) {
  if (!String(value || '').trim()) return null;
  return catalog.plates.find(item => sameMaterialPrice(item, { name: value, reference: value, comparisonKey: value })) || null;
}

function findDrawerRunner(value) {
  const wanted = comparableItemText(value);
  if (!wanted) return null;
  const drawerExtras = (catalog.extras || []).filter(item => comparableText(item.group) === comparableText('Gavetas'));
  const components = catalog.drawerComponents || [];
  const candidateText = item => comparableItemText(item.item || item.label || item.name || item.reference);
  const exactExtra = drawerExtras.find(item => candidateText(item) === wanted);
  if (exactExtra) return exactExtra;
  const exactComponent = components.find(item => candidateText(item) === wanted);
  if (exactComponent) return exactComponent;
  return drawerExtras.concat(components).find(item => {
    const candidate = comparableItemText(item.item || item.label || item.name || item.reference);
    return candidate && (candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
  }) || null;
}

function drawerMaterialLine(materialName, areaM2, sellKey) {
  const plate = findMaterialForAudit(materialName);
  if (!plate || areaM2 <= 0) return { cost: 0, client: 0 };
  return {
    cost: areaM2 * (Number(plate.cost) || 0),
    client: areaM2 * (Number(plate[sellKey]) || Number(plate.client) || 0)
  };
}

function drawerPaintLine(paintName, areaM2, sellKey) {
  const wanted = comparableText(paintName || 'Nenhuma');
  if (!wanted || wanted === 'NENHUMA' || areaM2 <= 0) return { cost: 0, client: 0 };
  const paint = (catalog.paintings || []).find(item => comparableText(item.name) === wanted);
  if (!paint) return { cost: 0, client: 0 };
  const saleValue = paint[sellKey] !== undefined && paint[sellKey] !== null
    ? Number(paint[sellKey])
    : Number(paint.client) || 0;
  return {
    cost: areaM2 * ((Number(paint.cost) || 0) + (Number(paint.serviceCostPerM2) || 0)),
    client: areaM2 * (Number.isFinite(saleValue) ? saleValue : 0)
  };
}

function materialThicknessCm(materialName) {
  const plate = findMaterialForAudit(materialName);
  const text = [materialName, plate?.name, plate?.reference, plate?.comparisonKey].filter(Boolean).join(' ');
  const match = text.match(/\b(\d+(?:[,.]\d+)?)\s*mm\b/i);
  return match ? (Number(String(match[1]).replace(',', '.')) || 0) / 10 : 0;
}

function calculateWardrobeDrawerUnit(extra, pricingMode, measures) {
  const width = Number(measures?.drawerWidth ?? extra.drawerWidth) || 0;
  const depth = Number(measures?.drawerDepth ?? extra.drawerDepth) || 0;
  const height = Number(measures?.drawerHeight ?? extra.drawerHeight) || 0;
  const sellKey = pricingMode === 'reseller' ? 'reseller' : 'client';
  const mode = comparableText(extra.drawerMaterialMode || 'Interior');
  const interior = extra.drawerInterior || extra.interior || '';
  const exterior = extra.drawerExterior || extra.exterior || interior;
  const useExteriorAll = mode === 'EXTERIOR';
  const useExteriorFront = mode.includes('FRENTE') || useExteriorAll;
  const baseMaterial = useExteriorAll ? exterior : interior;
  const frontMaterial = useExteriorFront ? exterior : interior;
  const boxWidth = Math.max(0, width - (materialThicknessCm(baseMaterial) * 2));
  const frontWidth = Math.max(0, width - (materialThicknessCm(frontMaterial) * 2));
  const bottomArea = (boxWidth * depth) / 10000;
  const sideArea = 2 * ((depth * height) / 10000);
  const frontArea = (frontWidth * height) / 10000;
  const backArea = (boxWidth * height) / 10000;
  const baseArea = bottomArea + sideArea + backArea;
  const baseLine = drawerMaterialLine(baseMaterial, baseArea, sellKey);
  const frontLine = drawerMaterialLine(frontMaterial, frontArea, sellKey);
  const interiorPaint = extra.drawerPaintInterior || extra.paintInterior || 'Nenhuma';
  const exteriorPaint = extra.drawerPaintExterior || extra.paintDoor || 'Nenhuma';
  const basePaint = drawerPaintLine(useExteriorAll ? exteriorPaint : interiorPaint, baseArea, sellKey);
  const frontPaint = drawerPaintLine(useExteriorFront ? exteriorPaint : interiorPaint, frontArea, sellKey);
  const runner = findDrawerRunner(extra.drawerRunner);
  const runnerCost = Number(runner?.cost ?? runner?.supplierPrice) || 0;
  const runnerSaleValue = runner?.[sellKey];
  const runnerSalePrice = runnerSaleValue !== undefined && runnerSaleValue !== null && Number.isFinite(Number(runnerSaleValue))
    ? Number(runnerSaleValue)
    : (Number(runner?.client) || 0);
  const unitCost = money(baseLine.cost + frontLine.cost + basePaint.cost + frontPaint.cost + runnerCost + drawerAssemblyCost('roupeiro'));
  const unitClient = money(baseLine.client + frontLine.client + basePaint.client + frontPaint.client + runnerSalePrice);
  return {
    unitCost,
    unitClient,
    item: wardrobeDrawerItem
  };
}

function calculateWardrobeDrawerExtra(extra, pricingMode) {
  const distribution = Array.isArray(extra.moduleDistribution)
    ? extra.moduleDistribution.filter(item => (Number(item.quantity) || 0) > 0)
    : [];
  if (!distribution.length) return calculateWardrobeDrawerUnit(extra, pricingMode);
  const totals = distribution.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    const unit = calculateWardrobeDrawerUnit(extra, pricingMode, item);
    return {
      quantity: sum.quantity + quantity,
      totalCost: sum.totalCost + (quantity * unit.unitCost),
      totalClient: sum.totalClient + (quantity * unit.unitClient)
    };
  }, { quantity: 0, totalCost: 0, totalClient: 0 });
  const quantity = totals.quantity || Number(extra.quantity) || 1;
  return {
    unitCost: money(totals.totalCost / quantity),
    unitClient: money(totals.totalClient / quantity),
    totalCost: money(totals.totalCost),
    totalClient: money(totals.totalClient),
    item: wardrobeDrawerItem
  };
}

function quoteWarnings(modules, extras) {
  const warnings = [];
  const hasPlates = Array.isArray(catalog.plates) && catalog.plates.length > 0;
  modules.forEach((module, index) => {
    if (module.blank || !String(module.type || '').trim()) return;
    const type = workbookData.inferType(module);
    const piecePlate = type === 'Peças/Placa' || type === 'PeÃ§as/Placa' || type === 'PeÃƒÂ§as/Placa';
    if (!String(module.interior || '').trim() && hasPlates) {
      warnings.push(`Módulo ${index + 1}: falta madeira interior.`);
    } else if (!findMaterialForAudit(module.interior)) {
      warnings.push(`Módulo ${index + 1}: madeira interior sem preço encontrado (${module.interior}).`);
    }
    if (!piecePlate && String(module.exterior || '').trim()) {
      if (!findMaterialForAudit(module.exterior)) {
        warnings.push(`Módulo ${index + 1}: madeira exterior sem preço encontrado (${module.exterior}).`);
      }
    }
    if (module.edgeType && !/sem orla/i.test(module.edgeType) && !catalog.edges.find(item => comparableText(item.name) === comparableText(module.edgeType))) {
      warnings.push(`Módulo ${index + 1}: orla sem preço encontrado (${module.edgeType}).`);
    }
  });
  extras.forEach((extra, index) => {
    if (!String(extra.group || '').trim()) return;
    if (!String(extra.item || '').trim()) return;
    if (isManualPricedExtra(extra)) return;
    if (isWardrobeDrawerExtra(extra)) return;
    if (
      Number(extra.unitClient) ||
      Number(extra.unitCost) ||
      Number(extra.totalClient) ||
      Number(extra.totalCost)
    ) return;
    if (!findCatalogExtraForQuote(extra)) {
      warnings.push(`Extra ${index + 1}: item sem preço encontrado (${extra.group} / ${extra.item || 'sem item'}).`);
    }
  });
  return warnings;
}

function calculateQuoteInternal(payload) {
  applyCatalogOverrides(payload.catalog || {});
  const client = payload.client || quoteSeed.client;
  const pricingMode = payload.pricingMode === 'reseller' ? 'reseller' : 'normal';
  const modules = Array.isArray(payload.modules) ? payload.modules : quoteSeed.modules;
  const ledPlan = ledTransformers.arrange(Array.isArray(payload.extras) ? payload.extras : quoteSeed.extras, catalog.extras);
  const extras = ledPlan.extras;

  const moduleLines = modules.map(module => {
    const quantity = Number(module.quantity) || 0;
    const blankModule = module.blank || !String(module.type || '').trim();
    const prices = blankModule ? { unitClient: 0, unitCost: 0 } : calculateModulePrice(module, pricingMode);
    const unitClient = prices.unitClient;
    const unitCost = prices.unitCost;
    return {
      ...module,
      quantity,
      unitClient,
      unitCost,
      totalClient: money(quantity * unitClient),
      totalCost: money(quantity * unitCost)
    };
  });

  const extraLines = extras.map(extra => {
    const quantity = Number(extra.quantity) || 0;
    const blankExtra = !String(extra.group || '').trim() || !String(extra.item || '').trim();
    const wardrobeDrawer = !blankExtra && isWardrobeDrawerExtra(extra) ? calculateWardrobeDrawerExtra(extra, pricingMode) : null;
    const manualPricedExtra = !blankExtra && isManualPricedExtra(extra);
    const catalogItem = blankExtra || manualPricedExtra ? null : findCatalogExtraForQuote(extra);
    const lacquerClient = isSkirtingExtra(extra) && isLacqueredExtra(extra) ? skirtingLacquerClientPerMeter : 0;
    const handleCm = normalizeExtraGroupName(extra.group) === 'Puxadores' && catalogItem?.priceUnit === 'cm';
    const baseExtraClient = handleCm ? (Number(catalogItem.client) || 0) : catalogItem
      ? (pricingMode === 'reseller' ? (Number(catalogItem.reseller) || Number(catalogItem.client) || 0) : (Number(catalogItem.client) || 0))
      : (Number(extra.unitClient) || 0);
    const baseExtraCost = handleCm ? 0 : catalogItem ? (Number(catalogItem.cost) || 0) : (Number(extra.unitCost) || 0);
    const internationalPackaging = !blankExtra && normalizeExtraGroupName(extra.group) === transportExtraGroup && isInternationalPackagingItem(extra) && Boolean(catalogItem);
    const internationalCost = internationalPackaging ? internationalPackagingInternalCost(catalogItem) : 0;
    const rodLine = !blankExtra && !wardrobeDrawer ? wardrobeRodLine(extra, catalogItem, baseExtraClient, baseExtraCost) : null;
    const ripadoFactor = !blankExtra && isRipadoExtra(extra) ? ripadoUnitFactor(quantity) : 1;
    const pillowModule = !blankExtra && isPillowEffectExtra(extra)
      ? moduleLines.find(line => line.id && String(line.id) === String(extra.targetModuleId || ''))
      : null;
    const unitClient = blankExtra ? 0 : isPillowEffectExtra(extra) ? money((Number(pillowModule?.unitClient) || 0) * pillowEffectModuleFactor) : (wardrobeDrawer ? wardrobeDrawer.unitClient : internationalPackaging ? internationalCost * internationalPackagingClientMultiplier : (rodLine ? rodLine.unitClient : (baseExtraClient * ripadoFactor + lacquerClient)));
    const unitCost = blankExtra ? 0 : (wardrobeDrawer ? wardrobeDrawer.unitCost : internationalPackaging ? internationalCost : (rodLine ? rodLine.unitCost : baseExtraCost));
    const totalClient = wardrobeDrawer && wardrobeDrawer.totalClient !== undefined ? wardrobeDrawer.totalClient : money(quantity * unitClient);
    const totalCost = wardrobeDrawer && wardrobeDrawer.totalCost !== undefined ? wardrobeDrawer.totalCost : money(quantity * unitCost);
    return {
      ...extra,
      item: wardrobeDrawer ? wardrobeDrawer.item : extra.item,
      quantity,
      unitClient,
      unitCost,
      totalClient,
      totalCost
    };
  });

  const moduleTotal = money(moduleLines.reduce((sum, line) => sum + line.totalClient, 0));
  const extrasTotal = money(extraLines.reduce((sum, line) => sum + line.totalClient, 0));
  const costTotal = money(moduleLines.reduce((sum, line) => sum + line.totalCost, 0) + extraLines.reduce((sum, line) => sum + line.totalCost, 0));
  const finalTotal = money(moduleTotal + extrasTotal);
  const margin = money(finalTotal - costTotal);

  return { client, pricingMode, modules: moduleLines, extras: extraLines, totals: { moduleTotal, extrasTotal, costTotal, finalTotal, margin }, warnings: quoteWarnings(modules, extras).concat(ledPlan.warnings) };
}

function calculateQuote(payload) {
  const before = structuredClone(catalog);
  const costsBefore = costItems;
  const laborBefore = laborPrices;
  try { return calculateQuoteInternal(payload); }
  finally {
    for (const key of Object.keys(catalog)) delete catalog[key];
    Object.assign(catalog, before);
    costItems = costsBefore;
    laborPrices = laborBefore;
  }
}

app.get('/api/bootstrap', (req, res) => {
  res.json({ ...quoteSeed, quote: calculateQuote(quoteSeed) });
});

app.post('/api/calculate', (req, res) => {
  const payload = req.body || quoteSeed;
  res.json(calculateQuote({
    ...payload,
    pricingMode: allowedPricingModeForRequest(req, payload.pricingMode)
  }));
});

app.get('/api/supplier-prices', (req, res) => {
  res.json(supplierPricePayload());
});

app.get('/api/session', (req, res) => {
  res.json(publicSession(readAuthSession(req)));
});

app.post('/api/login', async (req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  try {
    let profile;
    if (useSupabaseAuth) {
      try {
        profile = await loginWithSupabase(username, password);
      } catch (error) {
        if (!allowBootstrapAdmin || username !== adminUser || password !== adminPassword) throw error;
        profile = { username, name: adminUser, role: 'admin' };
      }
    } else {
      if (username !== adminUser || password !== adminPassword) {
        return res.status(401).json({ error: 'Credenciais invalidas.' });
      }
      profile = { username, name: adminUser, role: 'admin' };
    }
    const token = createAuthSession(profile);
    const session = adminSessions.get(token);
    res.setHeader('Set-Cookie', sessionCookie(token, sessionMaxAgeSeconds));
    return res.json(publicSession(session));
  } catch (error) {
    const status = error.status === 400 || error.status === 401 ? 401 : 503;
    return res.status(status).json({ error: error.message || 'Credenciais invalidas.' });
  }
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req).silwood_session;
  if (token) adminSessions.delete(token);
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.json(publicSession(null));
});

app.get('/api/quote-history', requireAuth, async (req, res) => {
  try {
    const entries = await quoteHistoryForSession(req.authSession, req.query.userId, req.query.q);
    res.json({ entries });
  } catch (error) {
    res.status(400).json({ entries: [], error: error.message });
  }
});

app.post('/api/quote-history', requireAuth, async (req, res) => {
  try {
    await saveQuoteHistoryForSession(req.authSession, req.body || {});
    const entries = await quoteHistoryForSession(req.authSession);
    res.json({ entries });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/quote-history/import', requireAuth, async (req, res) => {
  try {
    await importQuoteHistoryForSession(req.authSession, req.body || {});
    const entries = await quoteHistoryForSession(req.authSession);
    res.json({ entries });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/quote-history/:id', requireAuth, async (req, res) => {
  try {
    await deleteQuoteHistoryForSession(req.authSession, req.params.id);
    const entries = await quoteHistoryForSession(req.authSession, req.query.userId);
    res.json({ entries });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users', requireAdmin, async (req, res) => {
  try {
    res.json({ enabled: useSupabaseAuth && Boolean(supabaseServiceRoleKey), users: await listSupabaseUsers() });
  } catch (error) {
    res.status(400).json({ enabled: false, users: [], error: error.message });
  }
});

app.post('/api/users', requireAdmin, async (req, res) => {
  try {
    await createSupabaseUser(req.body || {});
    res.json({ enabled: true, users: await listSupabaseUsers() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.patch('/api/users/:id', requireAdmin, async (req, res) => {
  try {
    await updateSupabaseUser(req.params.id, req.body || {});
    res.json({ enabled: true, users: await listSupabaseUsers() });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/supplier-prices', requireAdmin, async (req, res) => {
  const changedKeys = [
    'plates',
    'paintings',
    'paintingComponents',
    'edges',
    'extras',
    'doorSystems',
    'drawerComponents',
    'hinges',
    'hingeComponents',
    'openingSystemComponents',
    'laborPrices',
    'costs'
  ];
  const hasChanges = changedKeys.some((key) => Array.isArray(req.body?.[key]) && req.body[key].length) ||
    (req.body?.laborPrices && typeof req.body.laborPrices === 'object') ||
    (Array.isArray(req.body?.costs) && req.body.costs.length > 0);
  if (!hasChanges) return res.status(400).json({ error: 'NÃ£o existem preÃ§os para guardar.' });

  try {
    const result = await saveSupplierPrices(req.body || {});
    res.json({ ...supplierPricePayload(), saved: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supplier-prices/plate', requireAdmin, async (req, res) => {
  const plate = req.body?.plate || req.body;
  if (!plate || !plate.name) return res.status(400).json({ error: 'Indique o nome da madeira.' });

  try {
    const result = await saveSupplierPrices({ plates: [plate], addMissingPlates: true });
    res.json({ ...supplierPricePayload(), saved: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/supplier-prices/item', requireAdmin, async (req, res) => {
  try {
    const result = await deleteSupplierCatalogItem(String(req.body?.type || ''), req.body?.index, req.body?.catalogId, req.body?.reference);
    res.json({ ...supplierPricePayload(), saved: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/supplier-prices/cost', requireAdmin, async (req, res) => {
  try {
    const result = await catalogStore.deleteCostItem(req.body?.id);
    installCatalog(result);
    res.json({ ...supplierPricePayload(), saved: { updated: 1, storage: catalogStore.mode } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (require.main === module) {
  refreshCatalog().then(() => app.listen(port, host, () => {
    console.log('Silwood simulador ativo em http://localhost:' + port);
    localNetworkUrls().forEach((url) => {
      console.log('Acesso na rede: ' + url);
    });
  })).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { app, calculateQuote };

