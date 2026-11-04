const euro = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const doorSystemExtraGroup = 'Sistema de abertura';
const legacyDoorSystemExtraGroup = 'Sistema de abertura de portas';
const otherExtraGroup = 'Outros';
const manualExtraGroup = 'Manual';
const transportExtraGroup = 'Transporte e embalamento';
const ripadoExtraGroup = 'Ripado/Efeitos';
const pillowEffectItemName = 'Efeito almofada recuada';
const duriosBinReference = 'BALDE LIXO - DURIOS';
const duriosBinCompanionReference = 'FUNDO PVC';
const internationalPackagingItemName = 'Embalamento Internacional Standard';
const lacqueredInternationalPackagingItemName = 'Embalamento Internacional Lacado';
const nationalPackagingItemName = 'Embalamento Nacional Standard';
const lacqueredNationalPackagingItemName = 'Embalamento Nacional Lacado';
const syntheticInternationalPackagingItems = new WeakSet();
const wardrobeDrawerGroup = 'Gavetas Roupeiro';
const wardrobeDrawerItem = 'Gaveta Roupeiro';
const state = { client: null, modules: [], extras: [], furnitureGroups: [], lists: {}, catalog: { extras: [] }, costItems: [], savedCostIds: new Set(), typePresets: {}, quote: null, original: null, pricingMode: 'normal', supplierPrices: [], pricingRules: null, plateLaborFallback: 2.02, supplierTab: 'Madeiras / Placas', platePriceView: 'summary', isAdmin: false, isAuthenticated: false, hasEnteredApp: false, userRole: 'anonymous', userName: '', usesSupabase: false, users: [], usersEnabled: false, quoteHistory: [], quoteHistoryOwnerId: '', quoteHistoryOwnerLabel: '' };
let plateDuplicateReferenceKeysCache = null;
let plateKnownNameCache = null;
let knownPlateCodesCache = null;
let supplierRenderTimer = null;
let supplierRecalculationTimer = null;
let supplierRecalculationNeedsPlateRefresh = false;
let visualPreviewTimer = null;
let calculateTimer = null;
let supplierSearchTimer = null;
let quotePersistTimer = null;
let supplierAutoRefreshTimer = null;
let supplierRefreshInFlight = false;
let supplierCatalogSignature = '';
let pendingQuoteSnapshot = null;
let drawerSplitState = null;
let moduleSplitState = null;
const drawerQuantityMemory = new Map();
const supplierDirtyChanges = {
  plates: new Map(),
  paintings: new Map(),
  paintingComponents: new Map(),
  edges: new Map(),
  extras: new Map(),
  drawerComponents: new Map(),
  hinges: new Map(),
  hingeComponents: new Map(),
  openingSystemComponents: new Map(),
  doorSystems: new Map(),
  laborPrices: new Map(),
  costs: new Map()
};
let baseDoorSystemsByName = new Map();

const sourceStatus = document.querySelector('#sourceStatus');
const clientBlock = document.querySelector('#clientBlock');
const kpiBlock = document.querySelector('#kpiBlock');
const modulesGrid = document.querySelector('#modulesGrid');
const finalGrid = document.querySelector('#finalGrid');
const visualPreviewGrid = document.querySelector('#visualPreviewGrid');
const printSheet = document.querySelector('#printSheet');
const quoteView = document.querySelector('#quoteView');
const visualView = document.querySelector('#visualView');
const supplierView = document.querySelector('#supplierView');
const usersView = document.querySelector('#usersView');
const supplierPricesGrid = document.querySelector('#supplierPricesGrid');
const usersGrid = document.querySelector('#usersGrid');
const supplierSearchInput = document.querySelector('#supplierSearchInput');
const supplierSearchButton = document.querySelector('#supplierSearchButton');
const supplierSaveNotice = document.querySelector('#supplierSaveNotice');
const quoteActions = document.querySelector('#quoteActions');
const quoteHistoryList = document.querySelector('#quoteHistoryList');
const quoteHistorySearch = document.querySelector('#quoteHistorySearch');
const saveHistoryButton = document.querySelector('#saveHistoryButton');
const pageTitle = document.querySelector('#pageTitle');
const quoteTitle = document.querySelector('#quoteTitle');
const authState = document.querySelector('#authState');
const authForm = document.querySelector('#authForm');
const loginUser = document.querySelector('#loginUser');
const loginPassword = document.querySelector('#loginPassword');
const loginButton = document.querySelector('#loginButton');
const authError = document.querySelector('#authError');
const logoutButton = document.querySelector('#logoutButton');
const mobileLogoutButton = document.querySelector('#mobileLogoutButton');
const mobileAuthState = document.querySelector('#mobileAuthState');
const mobileMenuButton = document.querySelector('#mobileMenuButton');
const mobileMenuBackdrop = document.querySelector('#mobileMenuBackdrop');
const loginGate = document.querySelector('#loginGate');
const guestButton = document.querySelector('#guestButton');
const appShell = document.querySelector('.app-shell');
const sideMenu = document.querySelector('.side-menu');
const sheetPage = document.querySelector('.sheet-page');
const appTop = document.querySelector('.app-top');

const mobileLayoutQuery = window.matchMedia('(max-width: 720px)');
function syncMobileHeaderPosition() {
  if (!appShell || !sideMenu || !sheetPage || !appTop || !quoteView) return;
  if (mobileLayoutQuery.matches) {
    if (appTop.parentElement !== appShell || appTop.nextElementSibling !== sideMenu) {
      appShell.insertBefore(appTop, sideMenu);
    }
  } else if (appTop.parentElement !== sheetPage || appTop.nextElementSibling !== quoteView) {
    sheetPage.insertBefore(appTop, quoteView);
  }
  if (!mobileLayoutQuery.matches) closeMobileMenu();
}
if (typeof mobileLayoutQuery.addEventListener === 'function') {
  mobileLayoutQuery.addEventListener('change', syncMobileHeaderPosition);
}
syncMobileHeaderPosition();

function setMobileMenuOpen(open) {
  const isOpen = mobileLayoutQuery.matches && open;
  document.body.classList.toggle('mobile-menu-open', isOpen);
  if (mobileMenuButton) mobileMenuButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (sideMenu) sideMenu.setAttribute('aria-hidden', mobileLayoutQuery.matches && !isOpen ? 'true' : 'false');
}
function closeMobileMenu() { setMobileMenuOpen(false); }

function money(value) { return euro.format(Number(value) || 0); }
function scheduleVisualPreview(delay) {
  window.clearTimeout(visualPreviewTimer);
  visualPreviewTimer = window.setTimeout(renderVisualPreview, delay === undefined ? 80 : delay);
}
function scheduleCalculate(options, delay) {
  window.clearTimeout(calculateTimer);
  calculateTimer = window.setTimeout(function () {
    calculate(options).catch(function (error) { sourceStatus.textContent = error.message; });
  }, delay === undefined ? 180 : delay);
}
function scheduleSupplierSearch(delay) {
  window.clearTimeout(supplierSearchTimer);
  supplierSearchTimer = window.setTimeout(applySupplierSearch, delay === undefined ? 120 : delay);
}
function currentRole() {
  if (state.isAdmin === true) return 'admin';
  if (state.userRole === 'reseller' || state.userRole === 'revendedor') return 'reseller';
  return 'guest';
}
function canManagePrices() { return currentRole() === 'admin'; }
function canUseNormalQuote() { return currentRole() === 'admin' || currentRole() === 'guest'; }
function canUseResellerQuote() { return currentRole() === 'admin' || currentRole() === 'reseller'; }
function canUseQuoteMode(mode) {
  return mode === 'reseller' ? canUseResellerQuote() : canUseNormalQuote();
}
function roleLabel() {
  const role = currentRole();
  if (role === 'admin') return 'Administrador';
  if (role === 'reseller') return 'Revendedor';
  return 'Convidado';
}
function setLoginError(message) {
  if (!authError) return;
  authError.textContent = message || '';
  authError.hidden = !message;
}
async function readJson(response, fallback) {
  const text = await response.text();
  if (!text) return fallback === undefined ? {} : fallback;
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback === undefined ? {} : fallback;
  }
}
function enterApp() {
  state.hasEnteredApp = true;
  document.body.classList.remove('auth-gate-active');
  if (loginGate) loginGate.hidden = true;
  scheduleSupplierAutoRefresh(15000);
}
function showLoginGate() {
  state.hasEnteredApp = false;
  stopSupplierAutoRefresh();
  document.body.classList.add('auth-gate-active');
  if (loginGate) loginGate.hidden = false;
  setLoginError('');
  if (loginPassword) loginPassword.value = '';
}
function updateAccessUi() {
  document.body.classList.toggle('auth-gate-active', !state.hasEnteredApp);
  if (loginGate) loginGate.hidden = state.hasEnteredApp;
  document.body.classList.toggle('is-admin', canManagePrices());
  document.body.classList.toggle('is-standard-user', !canManagePrices());
  document.body.classList.toggle('is-reseller', currentRole() === 'reseller');
  document.body.classList.toggle('is-guest', currentRole() === 'guest');
  document.querySelectorAll('.side-nav button').forEach(function (button) {
    const view = button.dataset.view;
    const mode = button.dataset.mode || 'normal';
    button.hidden =
      ((view === 'suppliers' || view === 'users') && !canManagePrices()) ||
      (view === 'quote' && !canUseQuoteMode(mode));
  });
  if (authState) {
    authState.textContent = roleLabel();
  }
  if (mobileAuthState) mobileAuthState.textContent = roleLabel();
  if (authForm) authForm.hidden = state.isAuthenticated;
  if (logoutButton) logoutButton.hidden = !state.hasEnteredApp;
  if (mobileLogoutButton) mobileLogoutButton.hidden = !state.hasEnteredApp;
  const saveButton = document.querySelector('#saveSupplierPricesButton');
  if (saveButton) saveButton.disabled = !canManagePrices();
  if (!canManagePrices() && ((supplierView && !supplierView.hidden) || (usersView && !usersView.hidden))) {
    showView('quote', state.pricingMode, false).catch(function (error) { sourceStatus.textContent = error.message; });
  }
}

async function loadSession() {
  const response = await fetch('/api/session');
  if (!response.ok) return;
  const data = await readJson(response, {});
  state.isAdmin = data.admin === true;
  state.isAuthenticated = data.authenticated === true;
  state.hasEnteredApp = state.isAuthenticated;
  state.userRole = data.role || (state.isAdmin ? 'admin' : 'guest');
  state.userName = data.name || '';
  state.usesSupabase = data.supabase === true;
  updateAccessUi();
}

async function loginAdmin() {
  const username = loginUser ? loginUser.value.trim() : '';
  const password = loginPassword ? loginPassword.value : '';
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent = 'A entrar...';
  }
  setLoginError('');
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await readJson(response, {});
    if (!response.ok) {
      const message = data.error || (response.status === 401
        ? 'Utilizador ou palavra-passe incorretos.'
        : 'Não foi possível iniciar sessão.');
      setLoginError(message);
      throw new Error(message);
    }
    state.isAdmin = data.admin === true;
    state.isAuthenticated = data.authenticated === true;
    enterApp();
    state.userRole = data.role || (state.isAdmin ? 'admin' : 'guest');
    state.userName = data.name || username;
    state.usesSupabase = data.supabase === true;
    if (loginPassword) loginPassword.value = '';
    updateAccessUi();
    sourceStatus.textContent = canManagePrices() ? 'Modo administrador ativo' : 'Sessao iniciada';
    Promise.resolve()
      .then(function () { return loadQuoteHistoryList(); })
      .then(function () {
        if (visualView && !visualView.hidden) return showView('visual', state.pricingMode, false);
        return showView('quote', state.pricingMode, true);
      })
      .catch(function (error) { sourceStatus.textContent = error.message; });
  } finally {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  }
}

async function logoutAdmin() {
  const response = await fetch('/api/logout', { method: 'POST' }).catch(function () { return null; });
  const data = response ? await readJson(response, {}) : {};
  state.isAdmin = false;
  state.isAuthenticated = false;
  state.hasEnteredApp = false;
  state.userRole = 'anonymous';
  state.userName = '';
  state.usesSupabase = data.supabase === true || state.usesSupabase;
  state.quoteHistory = [];
  state.quoteHistoryOwnerId = '';
  state.quoteHistoryOwnerLabel = '';
  updateAccessUi();
  renderQuoteHistory();
  await showView('quote', state.pricingMode, false);
  showLoginGate();
  sourceStatus.textContent = 'Sessao terminada';
}

async function continueAsGuest() {
  state.isAdmin = false;
  state.isAuthenticated = false;
  state.userRole = 'guest';
  state.userName = 'Convidado';
  state.quoteHistory = [];
  state.quoteHistoryOwnerId = '';
  state.quoteHistoryOwnerLabel = '';
  enterApp();
  updateAccessUi();
  renderQuoteHistory();
  await showView('quote', state.pricingMode, false);
  sourceStatus.textContent = 'Modo convidado ativo';
}

function renderUserRoleOptions(current) {
  const normalized = current === 'user' ? 'guest' : current;
  return [
    ['admin', 'Admin'],
    ['reseller', 'Revendedor'],
    ['guest', 'Convidado']
  ].map(function (pair) {
    return '<option value="' + pair[0] + '"' + (pair[0] === normalized ? ' selected' : '') + '>' + pair[1] + '</option>';
  }).join('');
}

function renderUsersPanel(message) {
  if (!usersGrid) return;
  const disabled = state.usersEnabled ? '' : ' disabled';
  const rows = (state.users || []).map(function (user) {
    return '<tr>' +
      '<td><input data-user-id="' + attrEsc(user.id) + '" data-user-field="email" value="' + attrEsc(user.email || '') + '"' + disabled + '></td>' +
      '<td><input data-user-id="' + attrEsc(user.id) + '" data-user-field="name" value="' + attrEsc(user.name || '') + '"' + disabled + '></td>' +
      '<td><select data-user-id="' + attrEsc(user.id) + '" data-user-field="role"' + disabled + '>' + renderUserRoleOptions(user.role || 'user') + '</select></td>' +
      '<td class="text-center"><input type="checkbox" data-user-id="' + attrEsc(user.id) + '" data-user-field="active"' + (user.active !== false ? ' checked' : '') + disabled + '></td>' +
      '<td><input type="password" data-user-id="' + attrEsc(user.id) + '" data-user-field="password" placeholder="Nova palavra-passe"' + disabled + '></td>' +
      '<td class="user-actions-cell"><div class="user-actions-buttons">' +
        '<button class="soft-inline-button" data-show-user-history="' + attrEsc(user.id) + '" data-user-history-label="' + attrEsc(user.name || user.email || 'Utilizador') + '" type="button"' + disabled + '>Histórico</button>' +
        '<button class="soft-inline-button" data-save-user="' + attrEsc(user.id) + '" type="button"' + disabled + '>Guardar</button>' +
        '</div></td>' +
    '</tr>';
  }).join('');
  usersGrid.innerHTML =
    '<section class="user-card">' +
      '<h3>Criar utilizador</h3>' +
      '<div class="user-form-grid">' +
        '<label><span>Email</span><input id="newUserEmail" type="email" placeholder="nome@empresa.pt"' + disabled + '></label>' +
        '<label><span>Nome</span><input id="newUserName" type="text" placeholder="Nome"' + disabled + '></label>' +
        '<label><span>Palavra-passe</span><input id="newUserPassword" type="password" placeholder="Mín. 6 caracteres"' + disabled + '></label>' +
        '<label><span>Permissão</span><select id="newUserRole"' + disabled + '>' + renderUserRoleOptions('guest') + '</select></label>' +
        '<label class="user-active-field"><span>Ativo</span><input id="newUserActive" type="checkbox" checked' + disabled + '></label>' +
        '<button id="createUserButton" type="button"' + disabled + '>Criar utilizador</button>' +
      '</div>' +
      (message ? '<p class="user-message">' + esc(message) + '</p>' : '') +
      (!state.usersEnabled ? '<p class="user-message">Para gerir utilizadores aqui, configura SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.</p>' : '') +
    '</section>' +
    '<section class="user-card">' +
      '<h3>Utilizadores existentes</h3>' +
      '<table class="supplier-table users-table"><thead><tr>' +
        '<th>Email</th><th>Nome</th><th>Permissão</th><th>Ativo</th><th>Nova password</th><th>Ações</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6">Sem utilizadores para mostrar.</td></tr>') + '</tbody></table>' +
    '</section>';
}

async function loadUsers() {
  const response = await fetch('/api/users');
  const data = await readJson(response, {});
  if (!response.ok) {
    state.users = [];
    state.usersEnabled = false;
    renderUsersPanel(data.error || 'Não foi possível carregar utilizadores.');
    return;
  }
  state.users = data.users || [];
  state.usersEnabled = data.enabled === true;
  renderUsersPanel(data.error || '');
}

async function createUserFromForm() {
  const payload = {
    email: document.querySelector('#newUserEmail')?.value || '',
    name: document.querySelector('#newUserName')?.value || '',
    password: document.querySelector('#newUserPassword')?.value || '',
    role: document.querySelector('#newUserRole')?.value || 'guest',
    active: document.querySelector('#newUserActive')?.checked !== false
  };
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Não foi possível criar utilizador.');
  state.users = data.users || [];
  state.usersEnabled = data.enabled === true;
  renderUsersPanel('Utilizador criado.');
}

async function saveUserFromRow(userId) {
  const fields = Array.from(document.querySelectorAll('[data-user-id]')).filter(function (field) {
    return field.dataset.userId === userId;
  });
  const payload = fields.reduce(function (sum, field) {
    const key = field.dataset.userField;
    if (!key) return sum;
    if (key === 'active') sum.active = field.checked;
    else if (key === 'password') {
      if (field.value) sum.password = field.value;
    } else {
      sum[key] = field.value;
    }
    return sum;
  }, {});
  const response = await fetch('/api/users/' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Não foi possível guardar utilizador.');
  state.users = data.users || [];
  state.usersEnabled = data.enabled === true;
  renderUsersPanel('Utilizador guardado.');
}

function markSupplierPricesDirty() {
  setSupplierSaveNotice('Existem altera\u00e7\u00f5es por guardar.', 'pending');
  sourceStatus.textContent = 'Existem preços por guardar';
}
function setSupplierSaveNotice(message, stateName) {
  if (!supplierSaveNotice) return;
  supplierSaveNotice.hidden = !message;
  supplierSaveNotice.textContent = message || '';
  supplierSaveNotice.classList.remove('is-saving', 'is-success', 'is-error');
  if (stateName === 'saving') supplierSaveNotice.classList.add('is-saving');
  if (stateName === 'success') supplierSaveNotice.classList.add('is-success');
  if (stateName === 'error') supplierSaveNotice.classList.add('is-error');
}
function setSupplierSaveButtonState(saving) {
  const button = document.querySelector('#saveSupplierPricesButton');
  if (!button) return;
  button.classList.toggle('is-saving', saving);
  button.disabled = saving || !canManagePrices();
  button.textContent = saving ? 'A guardar...' : 'Gravar pre\u00e7os';
}
function supplierDirtyKey(item, fallback) {
  if (!item) return String(fallback || '');
  if (item.catalogId) return 'ID|' + item.catalogId;
  if (item.__dirtyIndex !== undefined && item.__dirtyIndex !== null) return 'INDEX|' + String(item.__dirtyIndex);
  return [
    item.priceKey,
    item.name,
    item.item,
    item.group,
    item.usedIn,
    item.family,
    item.parentId,
    item.__supplierLocalId,
    item.supplier,
    item.reference,
    fallback
  ].map(function (value) { return comparableText(value); }).filter(Boolean).join('|');
}
function trackSupplierChange(type, item, fallback) {
  if (!supplierDirtyChanges[type] || !item) return;
  ensureSupplierLocalId(item);
  const draftItem = clone(item);
  if (Number.isInteger(fallback)) draftItem.__dirtyIndex = fallback;
  supplierDirtyChanges[type].set(supplierDirtyKey(draftItem, fallback), draftItem);
  markSupplierPricesDirty();
}

function ensureSupplierLocalId(item) {
  if (!item || item.userAdded !== true || item.catalogId || item.__supplierLocalId) return item;
  item.__supplierLocalId = 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  return item;
}

function trackComponentParentChanges(type, component) {
  const config = {
    paintingComponents: { parentType: 'paintings', parents: state.catalog.paintings || [] },
    drawerComponents: { parentType: 'extras', parents: (state.catalog.extras || []).filter(item => normalizeExtraGroupName(item.group) === 'Gavetas') },
    hingeComponents: { parentType: 'hinges', parents: state.catalog.hinges || [] },
    openingSystemComponents: { parentType: 'doorSystems', parents: activeDoorSystems() }
  }[type];
  if (!config) return;
  config.parents.filter(parent => componentBelongsToSummary(parent, component)).forEach(function (parent) {
    trackSupplierChange(config.parentType, parent);
  });
}
function supplierDirtyPayload() {
  const payload = {};
  Object.keys(supplierDirtyChanges).forEach(function (type) {
    const values = Array.from(supplierDirtyChanges[type].values()).map(function (item) {
      return clone(item);
    });
    if (!values.length) return;
    if (type === 'laborPrices') {
      payload.laborPrices = values.reduce(function (prices, item) {
        if (item?.key) prices[item.key] = item.value;
        return prices;
      }, {});
    } else {
      payload[type] = values;
    }
  });
  if (payload.plates?.length) payload.addMissingPlates = true;
  return payload;
}
function supplierSavePayload() {
  recalculateCustomCostPrices();
  const payload = supplierDirtyPayload();
  if (supplierDirtyChanges.costs.size) {
    const costs = new Map((payload.costs || []).map(function (item) {
      return [String(item.id || item.name + '|' + item.type), item];
    }));
    (state.costItems || []).filter(function (item) {
      return isDrawerAssemblyCostName(item.name);
    }).forEach(function (item) {
      costs.set(String(item.id || item.name + '|' + item.type), clone(item));
    });
    payload.costs = Array.from(costs.values());
    const extras = new Map((payload.extras || []).map(function (item) {
      return [String(item.catalogId || item.item + '|' + item.group), item];
    }));
    (state.catalog?.extras || []).filter(function (item) {
      return normalizeExtraGroupName(item.group) === transportExtraGroup && isInternationalPackagingItem(item);
    }).forEach(function (item) {
      extras.set(String(item.catalogId || item.item + '|' + item.group), clone(item));
    });
    payload.extras = Array.from(extras.values());
  }
  return payload;
}

function supplierCatalogSignatureFor(data) {
  return JSON.stringify({
    rules: data?.rules || null,
    plates: Array.isArray(data?.plates) ? data.plates : [],
    paintings: Array.isArray(data?.paintings) ? data.paintings : [],
    costs: Array.isArray(data?.costs) ? data.costs : []
  });
}

function applySupplierCatalogResponse(data) {
  const nextSignature = supplierCatalogSignatureFor(data);
  const changed = nextSignature !== supplierCatalogSignature;
  if (data.rules) state.pricingRules = data.rules;
  if (Number.isFinite(Number(data.laborPrices?.plates))) state.plateLaborFallback = Math.max(0, Number(data.laborPrices.plates));
  if (Array.isArray(data.plates)) {
    state.supplierPrices = data.plates;
    if (state.catalog) state.catalog.plates = data.plates.map(clone);
  }
  if (Array.isArray(data.paintings) && state.catalog) {
    state.catalog.paintings = data.paintings.map(clone);
  }
  if (Array.isArray(data.costs)) {
    state.costItems = data.costs.map(clone);
    state.savedCostIds = new Set(state.costItems.map(function (item) { return String(item.id || ''); }).filter(Boolean));
  }
  recalculateCustomCostPrices();
  normalizeAllPlateNames();
  normalizeCatalogSalePrices();
  supplierCatalogSignature = nextSignature;
  return changed;
}

async function refreshSupplierCatalogFromServer() {
  if (hasSupplierDirtyChanges()) return false;
  const response = await fetch('/api/supplier-prices?fresh=' + Date.now(), { cache: 'no-store' });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Falha ao atualizar os preços dos fornecedores.');
  if (hasSupplierDirtyChanges()) return false;
  return applySupplierCatalogResponse(data);
}

function stopSupplierAutoRefresh() {
  if (supplierAutoRefreshTimer) {
    window.clearTimeout(supplierAutoRefreshTimer);
    supplierAutoRefreshTimer = null;
  }
}

function scheduleSupplierAutoRefresh(delay) {
  stopSupplierAutoRefresh();
  if (!state.hasEnteredApp) return;
  supplierAutoRefreshTimer = window.setTimeout(function () {
    refreshSupplierDataAutomatically().catch(function (error) {
      console.warn('Falha na sincronização automática dos preços:', error);
    });
  }, delay === undefined ? 15000 : delay);
}

async function refreshSupplierDataAutomatically() {
  if (!state.hasEnteredApp || supplierRefreshInFlight) return false;
  if (document.visibilityState === 'hidden' || hasSupplierDirtyChanges()) {
    scheduleSupplierAutoRefresh();
    return false;
  }
  supplierRefreshInFlight = true;
  try {
    const changed = await refreshSupplierCatalogFromServer();
    if (!changed) return false;
    await calculate({ renderFinal: false });
    renderFinal();
    if (supplierView && !supplierView.hidden) renderSupplierPrices();
    else renderModules();
    return true;
  } finally {
    supplierRefreshInFlight = false;
    scheduleSupplierAutoRefresh();
  }
}

function hasSupplierDirtyChanges() {
  return Object.keys(supplierDirtyChanges).some(function (type) {
    return supplierDirtyChanges[type].size > 0;
  });
}
function clearSupplierDirtyChanges() {
  Object.keys(supplierDirtyChanges).forEach(function (type) {
    supplierDirtyChanges[type].clear();
  });
}
function acknowledgeSupplierChanges(payload) {
  Object.keys(payload).forEach(function (type) {
    const changes = supplierDirtyChanges[type];
    if (!changes || !Array.isArray(payload[type])) return;
    payload[type].forEach(function (saved) {
      const key = supplierDirtyKey(saved, saved.__dirtyIndex);
      const pending = changes.get(key);
      if (!pending) return;
      const savedComparable = clone(saved);
      const pendingComparable = clone(pending);
      delete savedComparable.__dirtyIndex;
      delete pendingComparable.__dirtyIndex;
      if (JSON.stringify(pendingComparable) === JSON.stringify(savedComparable)) changes.delete(key);
    });
  });
}
function persistSupplierDraftChanges() {}
function persistSupplierDraftChangesSoon() {}
function flushSupplierDraftPersist() {}
function supplierDraftStore() { return {}; }
function restoreSupplierDirtyChanges() { return false; }
function cleanDisplayText(value) {
  let text = String(value ?? '');
  for (let i = 0; i < 3 && /Ã|Â|â|�/.test(text); i += 1) {
    try {
      text = decodeURIComponent(escape(text));
    } catch (error) {
      break;
    }
  }
  return text
    .replace(/ServiÃ§o/g, 'Serviço')
    .replace(/ServiÃƒÂ§o/g, 'Serviço')
    .replace(/preÃ§o/g, 'preço')
    .replace(/PreÃ§o/g, 'Preço')
    .replace(/MÃ³dulo/g, 'Módulo')
    .replace(/mÃ³dulo/g, 'módulo')
    .replace(/referÃªncia/g, 'referência')
    .replace(/ReferÃªncia/g, 'Referência')
    .replace(/descriÃ§Ã£o/g, 'descrição')
    .replace(/DescriÃ§Ã£o/g, 'Descrição')
    .replace(/orÃ§amento/g, 'orçamento')
    .replace(/OrÃ§amento/g, 'Orçamento')
    .replace(/NÃ£o/g, 'Não')
    .replace(/NÃƒÂ£o/g, 'Não')
    .replace(/nÃ£o/g, 'não')
    .replace(/nÃƒÂ£o/g, 'não')
    .replace(/SÃ³/g, 'Só')
    .replace(/Lage & Sã/g, 'Lage & Sá')
    .replace(/Lage & SÃ¡/g, 'Lage & Sá')
    .replace(/Ã‡/g, 'Ç')
    .replace(/ÃƒO/g, 'ÃO')
    .replace(/Ãƒo/g, 'ão')
    .replace(/ÃŠ/g, 'Ê')
    .replace(/Ã“/g, 'Ó')
    .replace(/Poliretano/g, 'Poliuretano')
    .replace(/poliretano/g, 'poliuretano')
    .replace(/Acrilico/g, 'Acrílico')
    .replace(/acrilico/g, 'acrílico');
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
function esc(value) { return escapeHtml(cleanDisplayText(value)); }
function attrEsc(value) { return escapeHtml(value); }
function num(value) { return Number(String(value).replace(',', '.')) || 0; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function cleanMaterialName(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (/lunawood/i.test(text) && /212/i.test(text) && /3000\s*mm/i.test(text)) {
    return 'LUNAWOOD ST 212ºC TRIPLE SHAD - 3000mm (32*140)';
  }
  const matches = Array.from(text.matchAll(/\b\d+(?:[,.]\d+)?\s*mm\b/gi));
  if (matches.length > 1) {
    const first = matches[0];
    const head = text.slice(0, first.index + first[0].length).trim();
    const tail = text.slice(first.index + first[0].length).trim();
    const headBase = head.replace(/\s*-?\s*\d+(?:[,.]\d+)?\s*mm$/i, '').trim();
    if (headBase && comparableText(tail).startsWith(comparableText(headBase))) return head;
  }
  return text;
}
function optionList(values, current) { return (values || []).map(function (value) { return '<option value="' + attrEsc(value) + '"' + (value === current ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join(''); }
function optionListWithBlank(values, current) {
  return '<option value=""' + (!current ? ' selected' : '') + '></option>' + optionList(values, current);
}
function datalistOptions(id, values) { return '<datalist id="' + attrEsc(id) + '">' + (values || []).map(function (value) { return '<option value="' + attrEsc(value) + '">' + esc(value) + '</option>'; }).join('') + '</datalist>'; }
function extraItems(group) { return state.catalog.extras.filter(item => normalizeExtraGroupName(item.group) === normalizeExtraGroupName(group)).map(item => item.item); }
function isOtherExtra(extra) { return comparableText(extra?.group) === comparableText(otherExtraGroup); }
function extraReferenceValues(extra) {
  return [extra?.item, extra?.reference, extra?.label, extra?.name]
    .filter(value => String(value || '').trim())
    .map(comparableItemText);
}
function extraHasReference(extra, reference) {
  const wanted = comparableItemText(reference);
  return wanted && extraReferenceValues(extra).some(function (value) {
    return value === wanted || value.includes(wanted) || wanted.includes(value);
  });
}
function isDuriosBinExtra(extra) {
  return isOtherExtra(extra) && extraHasReference(extra, duriosBinReference);
}
function isDuriosBinCompanion(extra) {
  return isOtherExtra(extra) && extraHasReference(extra, duriosBinCompanionReference);
}
function findOtherCatalogExtra(reference) {
  return (state.catalog?.extras || []).find(function (item) {
    return normalizeExtraGroupName(item.group) === otherExtraGroup && extraHasReference(item, reference);
  }) || null;
}
function newLinkedExtraId(index) {
  return 'extra_' + Date.now() + '_linked_' + index + '_' + Math.random().toString(36).slice(2, 7);
}
function syncDuriosBinCompanions() {
  if (!Array.isArray(state.extras)) return;
  const parentIds = new Set();
  state.extras.forEach(function (extra, index) {
    if (!extra.id) extra.id = 'extra_' + Date.now() + '_' + index;
    if (isDuriosBinExtra(extra)) parentIds.add(String(extra.id));
  });
  state.extras = state.extras.filter(function (extra) {
    return !extra.autoAddedFor || parentIds.has(String(extra.autoAddedFor));
  });
  const additions = [];
  state.extras.forEach(function (parent, index) {
    if (!isDuriosBinExtra(parent)) return;
    const parentId = String(parent.id);
    const companion = state.extras.find(function (extra) {
      return String(extra.autoAddedFor || '') === parentId && isDuriosBinCompanion(extra);
    });
    const catalogItem = findOtherCatalogExtra(duriosBinCompanionReference);
    if (!catalogItem) return;
    const quantity = parent.quantity === '' || parent.quantity === null || parent.quantity === undefined
      ? 1
      : num(parent.quantity);
    if (companion) {
      companion.furnitureGroupId = parent.furnitureGroupId || '';
      companion.quantity = quantity;
      return;
    }
    additions.push({
      id: newLinkedExtraId(index),
      furnitureGroupId: parent.furnitureGroupId || '',
      group: normalizeExtraGroupName(catalogItem.group || otherExtraGroup),
      item: catalogItem.item || catalogItem.name || catalogItem.label || catalogItem.reference || duriosBinCompanionReference,
      quantity,
      unitClient: 0,
      unitCost: 0,
      lacquered: false,
      autoAddedFor: parentId
    });
  });
  if (additions.length) state.extras.push(...additions);
}
function isManualExtra(extra) { return normalizeExtraGroupName(extra?.group) === manualExtraGroup; }
function isTransportExtra(extra) { return comparableText(extra?.group) === comparableText(transportExtraGroup); }
function isManualPricedExtra(extra) {
  if (isManualExtra(extra)) return true;
  if (isTransportExtra(extra)) return !findCatalogExtraForQuote(extra);
  if (!isOtherExtra(extra)) return false;
  return !findCatalogExtraForQuote(extra);
}
function isManualOtherItem(extra) {
  return isOtherExtra(extra) && (extra?.manualItem === true || (String(extra?.item || '').trim() && !findCatalogExtraForQuote(extra)));
}
function otherItemControl(index, extra, options) {
  const manual = isManualOtherItem(extra);
  const current = extra.item || '';
  const manualInput = manual
    ? '<label class="other-manual-item"><span>Descrição</span>' + input('text', extra.item || '', 'placeholder="Descrição" data-extra="' + index + '" data-field="item"') + '</label>'
    : '';
  return '<div class="other-extra-config"><select data-extra="' + index + '" data-field="item" data-extra-item-select="' + index + '">' + optionListWithBlank(options, current) + '</select>' + manualInput + '</div>';
}
function manualItemControl(index, extra) { return input('text', extra.item || '', 'placeholder="DescriÃ§Ã£o" data-extra="' + index + '" data-field="item"'); }
function isSkirtingExtra(extra) { return comparableText(extra?.group).includes('RODAP'); }
function isLacqueredExtra(extra) { return extra?.lacquered === true || extra?.lacquered === 'Sim'; }
function drawerUsesWardrobeType(extra) {
  const wanted = comparableItemText(extra?.item || extra?.label || extra?.name || extra?.reference);
  const drawerCatalog = (state.catalog?.extras || []).filter(function (item) {
    return normalizeExtraGroupName(item.group) === 'Gavetas';
  });
  const catalogItem = drawerCatalog.find(function (item) {
    return comparableItemText(item.item || item.label || item.name || item.reference) === wanted;
  }) || findCatalogExtraForQuote(extra);
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
function isKitchenDrawerExtra(extra) {
  return normalizeExtraGroupName(extra?.group) === 'Gavetas' && !isWardrobeDrawerExtra(extra);
}
function wardrobeRodLengthCmFromText(text) {
  const raw = cleanDisplayText(text).toUpperCase();
  const normalized = comparableText(raw);
  let longest = 0;
  Array.from(raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:M|MT|METRO|METROS)\b/g)).forEach(function (match) {
    longest = Math.max(longest, num(match[1]) * 100);
  });
  Array.from(raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:CM|CENTIMETROS)\b/g)).forEach(function (match) {
    longest = Math.max(longest, num(match[1]));
  });
  Array.from(raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:MM|MILIMETROS)\b/g)).forEach(function (match) {
    longest = Math.max(longest, num(match[1]) / 10);
  });
  Array.from(normalized.matchAll(/\b(?:MOD|AAF)\s*\.?\s*(\d{2,3})\b/g)).forEach(function (match) {
    longest = Math.max(longest, Number(match[1]) || 0);
  });
  Array.from(normalized.matchAll(/\b(\d{2,4})\s*[-/]\s*(\d{2,4})\b/g)).forEach(function (match) {
    const value = Math.max(Number(match[1]) || 0, Number(match[2]) || 0);
    longest = Math.max(longest, value > 300 ? value / 10 : value);
  });
  return longest;
}
function isWardrobeRodExtra(extra) {
  if (normalizeExtraGroupName(extra?.group) !== 'Acessórios Roupeiro') return false;
  const catalogItem = findCatalogExtraForQuote(extra);
  const text = comparableText([extra?.item, extra?.reference, catalogItem?.item, catalogItem?.label, catalogItem?.name, catalogItem?.reference].join(' '));
  return text.includes('VARAO') || text.includes('EXTENSIVEL') || /\bASSA\s*75\s*125\b/.test(text) || wardrobeRodLengthCmFromText(text) > 80;
}
function wardrobeRodSegments(extra) {
  return String(extra?.rodLengths || extra?.rodLengthCm || '')
    .split(/[+;,|/\n]+/)
    .map(function (value) { return num(value); })
    .filter(function (value) { return value > 0; });
}
function wardrobeRodDescription(extra) {
  const segments = wardrobeRodSegments(extra);
  if (!segments.length) return '';
  return ' / Varão: ' + segments.map(function (value) { return cmValue(value) + 'cm'; }).join(' + ');
}
function moduleStableId(module, index) {
  if (!module.id) module.id = 'module_' + Date.now() + '_' + index + '_' + Math.round(Math.random() * 100000);
  return module.id;
}
function moduleOptionLabel(module, index) {
  return (index + 1) + ' - ' + modulePreviewTitle(module) + ' ' + (module.width || 0) + 'x' + (module.height || 0) + 'x' + (module.depth || 0);
}
function isPillowEffectExtra(extra) {
  return normalizeExtraGroupName(extra?.group) === ripadoExtraGroup &&
    comparableItemText(extra?.item) === comparableItemText(pillowEffectItemName);
}
function drawerCompatibleModules(extra) {
  const modules = state.modules || [];
  if (isWardrobeDrawerExtra(extra)) return modules.filter(function (module) {
    return module && !module.blank && ['Roupeiro', 'Inferior', 'Coluna'].includes(module.type);
  });
  if (isKitchenDrawerExtra(extra)) return modules.filter(function (module) {
    return module && !module.blank && ['Inferior', 'Superior', 'Coluna'].includes(module.type);
  });
  if (isPillowEffectExtra(extra)) return modules.filter(function (module) {
    return module && !module.blank && String(module.type || '').trim();
  });
  return [];
}
function drawerTargetModule(extra) {
  const compatible = drawerCompatibleModules(extra);
  if (!compatible.length) return null;
  const selected = compatible.find(function (module) { return moduleStableId(module, state.modules.indexOf(module)) === extra.targetModuleId; });
  return selected || null;
}
function drawerModuleOptionList(extra) {
  const compatible = drawerCompatibleModules(extra);
  if (!compatible.length) return '<option value="">Sem módulo compatível</option>';
  const target = drawerTargetModule(extra);
  return '<option value=""' + (!target ? ' selected' : '') + '>Selecionar mÃ³dulo</option>' + compatible.map(function (module) {
    const index = state.modules.indexOf(module);
    const id = moduleStableId(module, index);
    return '<option value="' + attrEsc(id) + '"' + (target && id === target.id ? ' selected' : '') + '>' + esc(moduleOptionLabel(module, index)) + '</option>';
  }).join('');
}

function syncDrawerDistributionQuantity(extra, index) {
  if (!extra || (!isKitchenDrawerExtra(extra) && !isWardrobeDrawerExtra(extra))) return;
  const quantity = num(extra.quantity);
  drawerQuantityMemory.set(extra.id || String(index), quantity);
  if (!Array.isArray(extra.moduleDistribution) || !extra.moduleDistribution.length) return;
  const total = extra.moduleDistribution.reduce(function (sum, item) { return sum + num(item.quantity); }, 0);
  const diff = quantity - total;
  if (Math.abs(diff) <= 0.001) return;
  if (quantity <= 0) {
    extra.moduleDistribution = [];
    return;
  }
  if (diff > 0) {
    const target = [...extra.moduleDistribution].reverse().find(function (item) { return num(item.quantity) > 0; }) || extra.moduleDistribution[extra.moduleDistribution.length - 1];
    target.quantity = num(target.quantity) + diff;
    return;
  }
  let remainingReduction = Math.abs(diff);
  for (let itemIndex = extra.moduleDistribution.length - 1; itemIndex >= 0 && remainingReduction > 0; itemIndex -= 1) {
    const item = extra.moduleDistribution[itemIndex];
    const itemQuantity = num(item.quantity);
    const reduction = Math.min(itemQuantity, remainingReduction);
    item.quantity = itemQuantity - reduction;
    remainingReduction -= reduction;
  }
  extra.moduleDistribution = extra.moduleDistribution.filter(function (item) { return num(item.quantity) > 0; });
  if (!extra.moduleDistribution.length) {
    const module = drawerTargetModule(extra);
    if (!module) return;
    const moduleId = moduleStableId(module, state.modules.indexOf(module));
    extra.moduleDistribution = [{
      moduleId,
      quantity,
      drawerWidth: num(extra.drawerWidth) || module.width || 0,
      drawerDepth: num(extra.drawerDepth) || module.depth || 0,
      drawerHeight: num(extra.drawerHeight) || 16
    }];
  }
}
function drawerRunnerOptions(current) {
  const drawerExtras = (state.catalog.extras || []).filter(function (item) {
    return normalizeExtraGroupName(item.group) === 'Gavetas';
  });
  const components = (state.catalog.drawerComponents || []).concat(drawerExtras).filter(function (item) {
    const text = comparableText([item.item, item.reference, item.label].join(' '));
    return text.includes('CORRED');
  });
  const seen = new Set();
  const currentSelections = (state.extras || []).map(function (item) { return String(item?.drawerRunner || '').trim(); });
  return components.map(function (item) { return item.item || item.label || item.reference; }).filter(function (value) {
    const key = comparableText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).concat(currentSelections, String(current || '').trim()).filter(function (value, index, values) {
    const key = comparableText(value);
    return key && values.findIndex(function (candidate) { return comparableText(candidate) === key; }) === index;
  });
}
function ensureWardrobeDrawerExtra(extra) {
  if (!extra) return extra;
  if (!isWardrobeDrawerExtra(extra)) return extra;
  if (!String(extra.item || '').trim()) return extra;
  const initialDrawerSelection = String(extra.drawerRunner || extra.item || '').trim();
  const module = drawerTargetModule(extra);
  extra.group = wardrobeDrawerGroup;
  extra.item = wardrobeDrawerItem;
  if (module) {
    extra.targetModuleId = moduleStableId(module, state.modules.indexOf(module));
    if (!Array.isArray(extra.moduleDistribution) || !extra.moduleDistribution.length) {
      extra.drawerWidth = module.width || extra.drawerWidth || 60;
      extra.drawerDepth = module.depth || extra.drawerDepth || 50;
    }
  }
  if (!extra.drawerWidth) extra.drawerWidth = 60;
  if (!extra.drawerDepth) extra.drawerDepth = 50;
  if (!extra.drawerHeight) extra.drawerHeight = 16;
  // O material continua a ser escolhido no seletor da gaveta; a corrediça
  // mantém a seleção inicial guardada acima.
  if (!extra.drawerMaterialMode) extra.drawerMaterialMode = 'Interior';
  if (!extra.drawerRunner) extra.drawerRunner = initialDrawerSelection || drawerRunnerOptions()[0] || '';
  extra.drawerInterior = module?.interior || extra.drawerInterior || '';
  extra.drawerExterior = module?.exterior || extra.drawerExterior || extra.drawerInterior || '';
  extra.drawerPaintInterior = module?.paintInterior || extra.drawerPaintInterior || 'Nenhuma';
  extra.drawerPaintExterior = module?.paintDoor || extra.drawerPaintExterior || 'Nenhuma';
  extra.tipo = 'Roupeiro';
  extra.handleUse = 'roupeiro';
  return extra;
}
function ensureKitchenDrawerExtra(extra) {
  if (!extra || !isKitchenDrawerExtra(extra)) return extra;
  return extra;
}
function prepareWardrobeDrawerExtras() {
  (state.modules || []).forEach(moduleStableId);
  (state.extras || []).forEach(function (extra) {
    ensureWardrobeDrawerExtra(extra);
    ensureKitchenDrawerExtra(extra);
  });
}
function materialThicknessCmFromText(materialName) {
  const text = String(materialName || '');
  const match = text.match(/\b(\d+(?:[,.]\d+)?)\s*mm\b/i);
  return match ? (Number(String(match[1]).replace(',', '.')) || 0) / 10 : 0;
}
function wardrobeDrawerMaterials(extra) {
  const mode = comparableText(extra?.drawerMaterialMode || 'Interior');
  const interior = extra?.drawerInterior || '';
  const exterior = extra?.drawerExterior || interior;
  const useExteriorAll = mode === 'EXTERIOR';
  const useExteriorFront = mode.includes('FRENTE') || useExteriorAll;
  return {
    base: useExteriorAll ? exterior : interior,
    front: useExteriorFront ? exterior : interior
  };
}
function wardrobeDrawerUsefulWidth(extra, materialName) {
  return Math.max(0, (Number(extra?.drawerWidth) || 0) - (materialThicknessCmFromText(materialName) * 2));
}
function cmValue(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return String(Number.isInteger(rounded) ? rounded : rounded.toFixed(1)).replace('.', ',');
}
function wardrobeDrawerUsefulSummary(extra) {
  const materials = wardrobeDrawerMaterials(extra);
  const baseWidth = wardrobeDrawerUsefulWidth(extra, materials.base);
  const frontWidth = wardrobeDrawerUsefulWidth(extra, materials.front);
  const baseText = 'útil ' + cmValue(baseWidth) + 'cm';
  if (Math.abs(baseWidth - frontWidth) < 0.05) return baseText;
  return baseText + ' / frente ' + cmValue(frontWidth) + 'cm';
}
function wardrobeDrawerDescription(extra) {
  const distribution = Array.isArray(extra?.moduleDistribution) && extra.moduleDistribution.length;
  if (distribution) {
    return wardrobeDrawerItem + ' / Medidas por módulo / ' + (extra.drawerMaterialMode || 'Interior') + ' / Distribuído: ' +
      extra.moduleDistribution.map(function (item) { return num(item.quantity); }).filter(Boolean).join(' + ');
  }
  return wardrobeDrawerItem + ' / ' + (extra.drawerWidth || 0) + '(largura)x' + (extra.drawerDepth || 0) + '(P)x' + (extra.drawerHeight || 0) + '(A)' + ' / ' + (extra.drawerMaterialMode || 'Interior');
}
function hydrateExtra(extra) {
  const hydrated = clone(extra);
  hydrated.group = normalizeExtraGroupName(hydrated.group);
  hydrated.lacquered = isLacqueredExtra(hydrated);
  if (isWardrobeDrawerExtra(hydrated)) return ensureWardrobeDrawerExtra(hydrated);
  if (isOtherExtra(hydrated)) return hydrated;
  const items = extraItems(hydrated.group);
  if (!items.includes(hydrated.item)) {
    const legacyItem = state.catalog.extras.find(item => normalizeExtraGroupName(item.group) === hydrated.group && item.label === hydrated.item);
    hydrated.item = legacyItem ? legacyItem.item : '';
  }
  return hydrated;
}
function input(type, value, attrs) { return '<input type="' + type + '" value="' + attrEsc(value) + '" ' + (attrs || '') + '>'; }
function searchInput(value, listId, attrs) { return input('text', value, 'list="' + attrEsc(listId) + '" autocomplete="off" class="searchable-wood" ' + (attrs || '')); }

function promptText(label, fallback) {
  const value = window.prompt(label, fallback || '');
  return value === null ? null : String(value).trim();
}

function promptMoney(label, fallback) {
  const value = promptText(label, fallback === undefined ? '0' : String(fallback));
  return value === null ? null : num(value);
}

function enhanceWoodSearchFields() {
  // Em telemóvel, mantém os selects nativos: são mais fáceis de usar e têm o
  // mesmo comportamento do campo "Tipo de orla". A pesquisa fica no desktop.
  if (mobileLayoutQuery.matches) return;
  const listIds = { interior: 'moduleInteriorOptions', exterior: 'moduleExteriorOptions' };
  modulesGrid.querySelectorAll('select[data-field="interior"], select[data-field="exterior"]').forEach(function (select) {
    const field = select.dataset.field;
    const wrap = document.createElement('span');
    const el = document.createElement('input');
    el.type = 'text';
    el.value = select.value;
    el.setAttribute('list', listIds[field]);
    el.autocomplete = 'off';
    el.className = 'searchable-wood';
    el.placeholder = field === 'interior' ? 'Pesquisar interior...' : 'Pesquisar exterior...';
    el.disabled = select.disabled;
    el.dataset.module = select.dataset.module;
    el.dataset.field = field;
    el.addEventListener('change', function () {
      if (!el.value.trim() && state.modules[Number(select.dataset.module)]?.[field]) {
        updateModule(Number(select.dataset.module), field, '');
      }
    });
    el.addEventListener('focus', function () {
      el.select();
    });
    wrap.className = 'wood-search-wrap';
    wrap.appendChild(el);
    select.replaceWith(wrap);
  });
}

function enhanceExtraItemSearchFields() {
  document.querySelectorAll('[data-extra-search-menu-root="1"]').forEach(function (menu) {
    menu.remove();
  });
  finalGrid.querySelectorAll('select[data-extra-item-select][data-field="item"]').forEach(function (select) {
    const extraIndex = Number(select.dataset.extra);
    const extra = state.extras[extraIndex] || {};
    const options = Array.from(select.options).map(function (option) { return option.value; }).filter(Boolean).map(function (value) {
      return extraOptionMetadata(extra.group, value);
    }).filter(function (option, index, all) {
      return all.findIndex(function (candidate) { return comparableItemText(candidate.value) === comparableItemText(option.value); }) === index;
    });
    const wrap = document.createElement('span');
    const el = document.createElement('input');
    const button = document.createElement('button');
    const menu = document.createElement('div');
    let activeOptions = options.slice();
    el.type = 'text';
    el.value = select.value;
    el.autocomplete = 'off';
    el.className = 'searchable-wood searchable-extra';
    el.placeholder = 'Pesquisar extra...';
    el.disabled = select.disabled;
    el.dataset.extraSearchInput = String(extraIndex);
    menu.className = 'extra-search-menu';
    menu.dataset.extraSearchMenuRoot = '1';
    menu.hidden = true;

    function positionMenu() {
      const rect = el.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
      const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const width = Math.min(Math.max(rect.width, 360), Math.max(260, viewportWidth - 16));
      const left = Math.max(8, Math.min(rect.left + scrollX, scrollX + viewportWidth - width - 8));
      menu.style.left = left + 'px';
      menu.style.top = rect.bottom + scrollY + 6 + 'px';
      menu.style.width = width + 'px';
      menu.style.maxWidth = 'calc(100vw - 16px)';
      menu.style.maxHeight = 'min(320px, calc(100vh - 24px))';
      menu.style.overflowY = 'auto';
      menu.style.overflowX = 'hidden';
    }

    function filteredOptions() {
      const query = comparableText(el.value);
      if (!query) return options.slice(0, 80);
      const words = query.split(' ').filter(Boolean);
      return options.filter(function (option) {
        const text = comparableText([option.value, option.reference, option.use, option.supplier].join(' '));
        return words.every(function (word) { return text.includes(word); });
      }).slice(0, 80);
    }

    function hideMenu() {
      menu.hidden = true;
    }

    function selectOption(value) {
      el.value = value;
      hideMenu();
      updateExtra(extraIndex, 'item', value);
    }

    function renderMenu() {
      activeOptions = filteredOptions();
      positionMenu();
      if (!activeOptions.length || el.disabled) {
        menu.innerHTML = '<div class="extra-search-empty">Sem resultados</div>';
        menu.hidden = false;
        return;
      }
      menu.innerHTML = activeOptions.map(function (option) {
        const meta = [];
        if (option.reference) meta.push('<span>Ref.: ' + esc(option.reference) + '</span>');
        if (option.use) meta.push('<span>Utilização: ' + esc(option.use) + '</span>');
        if (option.supplier) meta.push('<span>Fornecedor: ' + esc(option.supplier) + '</span>');
        return '<button type="button" class="extra-search-option" data-extra-search-value="' + attrEsc(option.value) + '">' +
          '<strong class="extra-search-option-name">' + esc(option.name || option.value) + '</strong>' +
          (meta.length ? '<span class="extra-search-option-meta">' + meta.join('') + '</span>' : '') +
        '</button>';
      }).join('');
      menu.hidden = false;
    }

    button.type = 'button';
    button.className = 'wood-search-button';
    button.setAttribute('aria-label', 'Pesquisar extra');
    button.title = 'Pesquisar extra';
    button.textContent = '\u2315';
    button.disabled = select.disabled;
    button.addEventListener('click', function () {
      el.value = '';
      el.focus();
      renderMenu();
    });
    el.addEventListener('focus', function () {
      el.select();
      renderMenu();
    });
    el.addEventListener('input', function () {
      renderMenu();
    });
    el.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        hideMenu();
        return;
      }
      if (event.key === 'Enter' && !menu.hidden && activeOptions[0]) {
        event.preventDefault();
        selectOption(activeOptions[0].value);
      }
    });
    menu.addEventListener('mousedown', function (event) {
      event.preventDefault();
    });
    menu.addEventListener('click', function (event) {
      const optionButton = event.target.closest('[data-extra-search-value]');
      if (!optionButton) return;
      selectOption(optionButton.dataset.extraSearchValue);
    });
    el.addEventListener('blur', function () {
      window.setTimeout(hideMenu, 120);
    });
    window.addEventListener('resize', function () {
      if (!menu.hidden) positionMenu();
    });
    window.addEventListener('scroll', function () {
      if (!menu.hidden) positionMenu();
    }, true);
    wrap.className = 'wood-search-wrap extra-search-wrap';
    wrap.appendChild(button);
    wrap.appendChild(el);
    select.replaceWith(wrap);
    document.body.appendChild(menu);
  });
}

function extraUseLabel(item) {
  const raw = String(item?.handleUse || item?.tipo || item?.family || '').trim();
  const normalized = comparableText(raw);
  if (normalized.includes('COZINHA')) return 'Cozinha';
  if (normalized.includes('ROUPEIRO')) return 'Roupeiro';
  if (normalized === 'AMBOS' || normalized === 'OS 2' || normalized === 'OS DOIS') return 'Os 2';
  return cleanDisplayText(raw);
}

function extraOptionMetadata(group, value) {
  const wantedGroup = normalizeExtraGroupName(group);
  const wantedItem = comparableItemText(value);
  const item = (state.catalog?.extras || []).find(function (candidate) {
    if (normalizeExtraGroupName(candidate.group) !== wantedGroup) return false;
    const candidateItem = comparableItemText(candidate.item || candidate.label || candidate.name || candidate.reference);
    return candidateItem && wantedItem && (candidateItem === wantedItem || candidateItem.includes(wantedItem) || wantedItem.includes(candidateItem));
  });
  return {
    value: String(value || ''),
    name: item?.item || item?.label || item?.name || value,
    reference: String(item?.reference || '').trim(),
    use: extraUseLabel(item),
    supplier: String(item?.supplier || '').trim()
  };
}

function quoteSnapshotFromState() {
  return { client: state.client, modules: state.modules, extras: state.extras, furnitureGroups: state.furnitureGroups, pricingMode: state.pricingMode };
}

function writeQuoteSnapshot(snapshot) {
  return snapshot;
}

function persistQuote() {}
function persistQuoteSoon() {}
function flushPendingQuotePersist() {}
function persistCurrentQuoteOnly() {}

function quoteHistoryStore() {
  return state.quoteHistory || [];
}

function quoteHistoryId(value) {
  return String(value ?? '').trim();
}

function findQuoteHistoryEntry(id) {
  const wantedId = quoteHistoryId(id);
  if (!wantedId) return null;
  return quoteHistoryStore().find(function (item) {
    return quoteHistoryId(item?.id) === wantedId;
  }) || null;
}

function quoteHistoryLabel(snapshot) {
  const client = String(snapshot?.client?.name || 'Sem cliente').trim() || 'Sem cliente';
  const date = String(snapshot?.client?.date || 'Sem data').trim() || 'Sem data';
  return client + ' - ' + date;
}

function quoteSnapshotId(snapshot) {
  return comparableText(quoteHistoryLabel(snapshot)) || String(Date.now());
}

function clearQuoteDraftStorage() {
}

function saveQuoteHistorySnapshot(snapshot) {
  return snapshot;
}

function remoteHistoryEnabled() {
  return state.usesSupabase && state.isAuthenticated;
}

async function migrateLocalQuoteHistoryToRemote() {
  return false;
  /*
  if (!response.ok) throw new Error(data.error || 'Não foi possível transferir o histórico local para a base de dados.');
  */
}

async function loadQuoteHistoryList(userId, label) {
  state.quoteHistoryOwnerId = userId || '';
  state.quoteHistoryOwnerLabel = label || '';
  if (userId && quoteActions) quoteActions.hidden = false;
  if (!remoteHistoryEnabled()) {
    state.quoteHistory = [];
    renderQuoteHistory();
    return;
  }
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (state.quoteHistorySearch) params.set('q', state.quoteHistorySearch);
  const query = params.toString() ? '?' + params.toString() : '';
  const response = await fetch('/api/quote-history' + query);
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o histórico.');
  state.quoteHistory = data.entries || [];
  renderQuoteHistory();
  if (label) sourceStatus.textContent = 'Histórico de ' + label;
}

async function saveQuoteHistoryRemote(snapshot) {
  const response = await fetch('/api/quote-history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      label: quoteHistoryLabel(snapshot),
      snapshotKey: quoteSnapshotId(snapshot),
      userId: state.quoteHistoryOwnerId || undefined,
      snapshot
    })
  });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Não foi possível guardar no histórico.');
  state.quoteHistory = data.entries || [];
  renderQuoteHistory();
}

function currentQuoteSnapshot() {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    client: clone(state.client),
    modules: clone(state.modules),
    extras: clone(state.extras),
    furnitureGroups: clone(state.furnitureGroups),
    pricingMode: state.pricingMode,
    quote: clone(state.quote)
  };
}

async function saveCurrentQuoteToHistory() {
  if (!state.client) return;
  if (state.usesSupabase && !state.isAuthenticated) {
    sourceStatus.textContent = 'Faz login para guardar no histórico.';
    return;
  }
  persistCurrentQuoteOnly();
  const snapshot = currentQuoteSnapshot();
  if (!remoteHistoryEnabled()) {
    sourceStatus.textContent = 'Faz login para guardar no histórico da base de dados.';
    return;
  }
  await saveQuoteHistoryRemote(snapshot);
  sourceStatus.textContent = 'Guardado no histórico: ' + quoteHistoryLabel(snapshot);
}

function renderQuoteHistory() {
  if (!quoteHistoryList) return;
  const search = comparableText(state.quoteHistorySearch || '');
  const history = quoteHistoryStore().filter(function (entry) {
    return !search || comparableText(entry.label).includes(search);
  });
  const title = state.quoteHistoryOwnerLabel ? '<div class="quote-list-owner">A ver: ' + esc(state.quoteHistoryOwnerLabel) + '</div>' : '';
  if (search && !history.length) {
    quoteHistoryList.innerHTML = title + '<div class="quote-list-empty">Nenhum orçamento encontrado</div>';
    return;
  }
  quoteHistoryList.innerHTML = history.length
    ? title + history.map(function (entry) {
        return '<div class="quote-list-row">' +
          '<button class="quote-list-open" type="button" data-open-history="' + attrEsc(quoteHistoryId(entry.id)) + '">' + esc(entry.label) + '</button>' +
          '<button class="quote-list-delete" type="button" data-delete-history="' + attrEsc(quoteHistoryId(entry.id)) + '" title="Apagar orçamento">X</button>' +
        '</div>';
      }).join('')
    : title + '<div class="quote-list-empty">' + (state.usesSupabase && !state.isAuthenticated ? 'Faz login para ver histórico' : 'Sem histórico') + '</div>';
}

async function deleteHistoryEntry(id) {
  if (!id) return;
  const entry = findQuoteHistoryEntry(id);
  if (!entry) return;
  if (!window.confirm('Tem a certeza que pretende eliminar este orçamento do histórico?')) return;
  if (remoteHistoryEnabled()) {
    const query = state.quoteHistoryOwnerId ? '?userId=' + encodeURIComponent(state.quoteHistoryOwnerId) : '';
    const response = await fetch('/api/quote-history/' + encodeURIComponent(id) + query, { method: 'DELETE' });
    const data = await readJson(response, {});
    if (!response.ok) throw new Error(data.error || 'Não foi possível apagar o histórico.');
    state.quoteHistory = data.entries || [];
    renderQuoteHistory();
    sourceStatus.textContent = 'Orçamento apagado do histórico';
    return;
  }
  sourceStatus.textContent = 'Faz login para apagar o histórico na base de dados.';
}

async function applyQuoteSnapshot(entry, labelPrefix) {
  if (!entry || !entry.snapshot) return;
  const selectedLabel = entry.label || quoteHistoryLabel(entry.snapshot);
  persistCurrentQuoteOnly();
  state.client = clone(entry.snapshot.client);
  state.modules = (entry.snapshot.modules || []).map(hydrateModule);
  state.extras = (entry.snapshot.extras || []).map(hydrateExtra);
  state.furnitureGroups = clone(entry.snapshot.furnitureGroups || []);
  state.pricingMode = entry.snapshot.pricingMode === 'reseller' ? 'reseller' : 'normal';
  state.quote = entry.snapshot.quote ? clone(entry.snapshot.quote) : null;
  persistCurrentQuoteOnly();
  renderClient();
  renderModules();
  renderFinal();
  quoteView.hidden = false;
  supplierView.hidden = true;
  if (usersView) usersView.hidden = true;
  if (visualView) visualView.hidden = true;
  quoteActions.hidden = false;
  pageTitle.textContent = state.pricingMode === 'reseller' ? 'Orçamento revendedor' : 'Orçamento';
  quoteTitle.textContent = cleanDisplayText(state.pricingMode === 'reseller' ? 'ORÃ‡AMENTO REVENDEDOR' : 'ORÃ‡AMENTO');
  if (state.quote) {
    renderKpis();
    updateModuleTotals();
    renderFinal();
    renderPrint();
  } else {
    await calculate();
  }
  sourceStatus.textContent = labelPrefix + ': ' + selectedLabel;
}

async function loadQuoteHistory(id) {
  if (!id) return;
  const entry = findQuoteHistoryEntry(id);
  if (!entry) {
    sourceStatus.textContent = 'Não foi possível abrir este orçamento do histórico.';
    return;
  }
  await applyQuoteSnapshot(entry, 'Histórico carregado');
}

function inferModuleType(m) {
  if (state.lists.tipos.includes(m.type)) return m.type;
  const family = String(m.family || '').toUpperCase();
  if (family.includes('SUPERIOR')) return 'Superior';
  if (family.includes('ROUPEIRO')) return 'Roupeiro';
  if (family.includes('COLUNA')) return 'Coluna';
  return 'Inferior';
}

function plateAllowsPaint(name) {
  const wantedKey = plateCodeThicknessKeyFromText(name);
  const wantedText = comparableText(name);
  if (wantedText.includes('FOLHA') || wantedText.includes('FOLHEADO')) return true;
  if (wantedText.includes('H3395') && wantedText.includes('CARVALHO')) return true;
  const plate = state.catalog.plates.find(function (item) {
    if (item.name === name || comparableText(item.name) === wantedText) return true;
    if (!wantedKey) return false;
    return plateCodeThicknessKey(item) === wantedKey;
  });
  return Boolean(plate && plate.paintable);
}

function sanitizeModuleExterior(module) {
  if (!module || module.blank || isPiecePlate(module)) return;
  module.description = buildDescription(module);
}

function isPiecePlate(module) {
  return comparableText(module?.type).includes('PLACA');
}

function moduleCalculationType(module) {
  return module?.type === 'Roupeiro' ? 'Coluna' : module?.type;
}

function ensureRoupeiroModuleType() {
  if (!state.lists) state.lists = {};
  if (!Array.isArray(state.lists.tipos)) state.lists.tipos = [];
  if (!Array.isArray(state.lists.tipoLateralTopo)) state.lists.tipoLateralTopo = [];
  if (!state.typePresets) state.typePresets = {};
}

function normalizePainting(value) {
  const aliases = {
    'Verniz Mate Polioretano': 'Verniz Mate Poliretano',
    'Verniz Polioretano Brilhante': 'Verniz Poliretano Alto Brilhante',
    'Verniz Natur "AcrÃ­lico"': 'Verniz Natur / Acrilico',
    'Esmalte Cores Claras c/ AfinaÃ§Ã£o': 'Esmalte Mate Cores Claras com AfinaÃ§Ã£o',
    'Esmalte Cores Escuras c/ AfinaÃ§Ã£o': 'Esmalte Mate Cores Escuras com AfinaÃ§Ã£o'
  };
  const normalized = aliases[value] || value;
  return state.lists.pinturas.includes(normalized) ? normalized : 'Nenhuma';
}

function legacySideTopToSide(value, side) {
  const text = cleanDisplayText(value || '').toUpperCase();
  if (text === 'SIM') return 'Inteira';
  if (text === 'NAO' || text === 'NÃO') return 'Não';
  if (side === 'left' && text.includes('ESQUERDA')) return 'Inteira';
  if (side === 'right' && text.includes('DIREITA')) return 'Inteira';
  return 'Não';
}

function applyLegacySideTopFields(module) {
  if (!module) return;
  if (!module.sideLeftEdge) module.sideLeftEdge = legacySideTopToSide(module.sideEdges, 'left');
  if (!module.sideRightEdge) module.sideRightEdge = legacySideTopToSide(module.sideEdges, 'right');
}

function sideTopDescription(module) {
  applyLegacySideTopFields(module);
  function short(value) {
    const text = comparableText(value);
    if (text === 'INTEIRA') return 'inteira';
    if (text.includes('SARRAFO')) return 'sarrafo 15cm';
    return 'não';
  }
  const distribution = Array.isArray(module.sideDistribution)
    ? module.sideDistribution.filter(function (row) { return num(row.quantity) > 0; })
    : [];
  if (distribution.length) {
    const parts = distribution.filter(function (row) {
      return comparableText(row.sideLeftEdge || 'Não') !== 'NAO' ||
        comparableText(row.sideRightEdge || 'Não') !== 'NAO';
    }).map(function (row) {
      return num(row.quantity) + ' módulo(s): esquerda ' + short(cleanDisplayText(row.sideLeftEdge || 'Não')) +
        ' / direita ' + short(cleanDisplayText(row.sideRightEdge || 'Não'));
    });
    return parts.length ? 'Laterais: ' + parts.join(' + ') : '';
  }
  const left = cleanDisplayText(module.sideLeftEdge || 'Não');
  const right = cleanDisplayText(module.sideRightEdge || 'Não');
  if (comparableText(left) === 'NAO' && comparableText(right) === 'NAO') return '';
  return 'Laterais: esquerda ' + short(left) + ' / direita ' + short(right);
}

function hasSideDistribution(module) {
  return Array.isArray(module?.sideDistribution) &&
    module.sideDistribution.some(function (row) { return num(row.quantity) > 0; });
}

function moduleSideSelect(index, field, value, disabled) {
  if (disabled) {
    return '<select disabled title="Laterais divididas por módulo">' + optionList(['Dividido'], 'Dividido') + '</select>';
  }
  return '<select data-module="' + index + '" data-field="' + field + '">' +
    optionListWithBlank(state.lists.tipoLateralTopo || [], value) +
    '</select>';
}

function currentCatalogPlateName(value) {
  const wanted = comparableText(value);
  if (!wanted) return '';
  const plate = (state.catalog.plates || []).find(function (item) {
    return comparableText(item.name || item.item || item.label) === wanted;
  });
  return plate ? (plate.name || plate.item || plate.label || '') : '';
}

function clearUnavailableModuleMaterials(module) {
  if (!module) return;
  if (module.interior) module.interior = currentCatalogPlateName(module.interior);
  if (module.exterior && !isPiecePlate(module)) module.exterior = currentCatalogPlateName(module.exterior);
}

function hydrateModule(m) {
  const module = clone(m);
  if (!module.id) module.id = 'module_' + Date.now() + '_' + Math.round(Math.random() * 100000);
  if (module.blank) return module;
  module.type = inferModuleType(module);
  ensureRoupeiroModuleType();
  const preset = state.typePresets[module.type] || state.typePresets[moduleCalculationType(module)] || {};
  module.doorSystem = '';
  module.drawers = 0;
  module.drawerExtraCount = 0;
  delete module.drawerExtraType;
  ['paintInterior', 'edgeType', 'topBottomEdges', 'sideEdges', 'sideLeftEdge', 'sideRightEdge', 'back', 'divider', 'drawerExtraCount', 'drawerExtraType'].forEach(function (field) {
    if (module[field] === undefined || module[field] === null || module[field] === '') module[field] = preset[field];
  });
  // Nunca repor uma madeira vinda do preset antigo se ela não existir na base
  // atual. A seleção fica vazia para o utilizador escolher uma madeira válida.
  clearUnavailableModuleMaterials(module);
  applyLegacySideTopFields(module);
  module.paintDoor = normalizePainting(module.paintDoor);
  module.paintInterior = normalizePainting(module.paintInterior);
  if (isPiecePlate(module)) {
    if (!plateAllowsPaint(module.interior)) module.paintDoor = 'Nenhuma';
    Object.assign(module, {
      family: 'PEÃ‡AS / PLACA',
      depth: 0,
      doors: 0,
      drawers: 0,
      shelves: 0,
      back: 1,
      divider: 0,
      exterior: 'NÃ£o aplicÃ¡vel',
      paintInterior: 'Nenhuma',
      doorSystem: '',
      hinge: 'Nenhuma',
      edgeType: 'ServiÃ§o Sem Orla',
      topBottomEdges: 'NÃ£o',
      sideEdges: 'NÃ£o',
      sideLeftEdge: 'NÃ£o',
      sideRightEdge: 'NÃ£o'
    });
  } else {
    if (!plateAllowsPaint(module.exterior)) module.paintDoor = 'Nenhuma';
    if (!plateAllowsPaint(module.interior)) module.paintInterior = 'Nenhuma';
    if (num(module.doors) <= 0) {
      module.doorSystem = '';
      module.hinge = 'Nenhuma';
    } else if (!module.hinge || module.hinge === 'Nenhuma') {
      module.hinge = preset.hinge || state.lists.dobradicas[0];
    }
  }
  if (!module.pricingBase) {
    module.pricingBase = { ...clone(module), unitClient: num(module.unitClient), unitCost: num(module.unitCost) };
  }
  return module;
}

function buildDescription(m) {
  if (m.blank) return '';
  const interior = cleanMaterialName(m.interior);
  const exterior = cleanMaterialName(m.exterior);
  const paintInterior = cleanDisplayText(m.paintInterior || 'Nenhuma');
  const paintExterior = cleanDisplayText(m.paintDoor || 'Nenhuma');
  const family = moduleDisplayFamily(m);
  function isApplicable(value) {
    const text = comparableText(value);
    return Boolean(text) && text !== 'NENHUMA' && text !== 'NAO' && text !== 'NAO APLICAVEL';
  }
  if (isPiecePlate(m)) {
    const plateParts = [family + ' / Largura: ' + m.width + ' cm / Altura: ' + m.height + ' cm'];
    if (isApplicable(interior)) plateParts.push('Material interior: ' + interior);
    if (isApplicable(paintExterior)) plateParts.push('Pintura: ' + paintExterior);
    return plateParts.join(' / ');
  }
  const parts = [family + ' / Largura: ' + m.width + ' cm / Altura: ' + m.height + ' cm / Profundidade: ' + m.depth + ' cm'];
  const doors = num(m.doors);
  const shelves = num(m.shelves);
  const dividers = num(m.divider);
  if (doors > 0) parts.push(doors + '\u00a0' + (doors === 1 ? 'porta' : 'portas'));
  if (shelves > 0) parts.push(shelves + '\u00a0' + (shelves === 1 ? 'prateleira' : 'prateleiras'));
  if (dividers > 0) parts.push(dividers + '\u00a0' + (dividers === 1 ? 'divisória' : 'divisórias'));
  if (isApplicable(interior)) parts.push('Material interior: ' + interior);
  if (isApplicable(paintInterior)) parts.push('Pintura interior: ' + paintInterior);
  if (isApplicable(exterior)) parts.push('Material exterior: ' + exterior);
  if (isApplicable(exterior) && isApplicable(paintExterior)) parts.push('Pintura exterior: ' + paintExterior);
  const sides = sideTopDescription(m);
  if (sides) parts.push(sides);
  return parts.join(' / ');
}

function moduleDisplayFamily(module) {
  if (module?.type === 'Roupeiro') return 'ARMÁRIO - ROUPEIRO';
  const family = cleanDisplayText(module?.family || '');
  return family
    .replace(/^ARMÁRIO\s+COZINHA\s*-\s*/i, 'ARMÁRIO - ')
    .replace(/^ARMARIO\s+COZINHA\s*-\s*/i, 'ARMÁRIO - ')
    .replace(/\s+COZINHA\b/gi, '');
}

function moduleFinalGroup(module) {
  const group = (state.furnitureGroups || []).find(function (item) { return item.id === module?.furnitureGroupId; });
  return group ? group.name : 'GERAL';
}

function moduleFinalTitle(module) {
  return moduleDisplayFamily(module);
}

async function calculate(options) {
  applySupplierAdditions();
  syncPackagingExtraQuantities();
  canonicalizeQuoteExtras();
  syncDuriosBinCompanions();
  prepareWardrobeDrawerExtras();
  state.extras = ledTransformers.arrange(state.extras, state.catalog.extras || []).extras;
  const calculateUrl = options?.useCurrentCatalog ? '/api/calculate?current=1' : '/api/calculate';
  const response = await fetch(calculateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: state.client,
      modules: state.modules,
      extras: state.extras,
      pricingMode: state.pricingMode,
      catalog: calculationCatalogOverrides()
    })
  });
  if (!response.ok) throw new Error('Não foi possível calcular o orçamento.');
  state.quote = await readJson(response, {});
  if (Array.isArray(state.quote.warnings) && state.quote.warnings.length) {
    sourceStatus.textContent = 'Atenção: ' + cleanDisplayText(state.quote.warnings[0]) + (state.quote.warnings.length > 1 ? ' +' + (state.quote.warnings.length - 1) : '');
  } else if (sourceStatus.textContent.startsWith('Atenção:')) {
    sourceStatus.textContent = '';
  }
  (state.quote.modules || []).forEach(function (line, index) {
    if (!state.modules[index]) return;
    state.modules[index].unitClient = line.unitClient;
    state.modules[index].unitCost = line.unitCost;
  });
  (state.quote.extras || []).forEach(function (line, index) {
    if (!state.extras[index]) return;
    state.extras[index].unitClient = line.unitClient;
    state.extras[index].unitCost = line.unitCost;
  });
  renderKpis();
  updateModuleTotals();
  if (!options || options.renderFinal !== false) renderFinal();
  renderPrint();
  persistQuote();
}

function calculationCatalogOverrides() {
  syncDoorSystemExtras();
  canonicalizeQuoteExtras();
  prepareWardrobeDrawerExtras();
  const payload = calculationSupplierPayload();
  if (supplierDirtyChanges.costs.size) payload.costs = (state.costItems || []).map(clone);
  return payload;
}

function mergeCalculationPayload(target, source) {
  if (!source || typeof source !== 'object') return target;
  Object.keys(supplierDirtyChanges).concat(['doorSystems']).forEach(function (type) {
    if (!Array.isArray(source[type]) || !source[type].length) return;
    const current = Array.isArray(target[type]) ? target[type] : [];
    target[type] = dedupeSupplierItems(type, current.concat(source[type].filter(function (item) {
      return item && item.__delete !== true;
    }).map(clone)));
  });
  if (source.addMissingPlates || target.addMissingPlates) target.addMissingPlates = true;
  return target;
}

function calculationSupplierPayload() {
  let payload = {};
  mergeCalculationPayload(payload, supplierDirtyPayload());
  if (Array.isArray(payload.plates) && payload.plates.length) payload.addMissingPlates = true;
  return payload;
}

function updateModuleTotals() {
  (state.quote?.modules || []).forEach(function (line, index) {
    const clientCell = modulesGrid.querySelector('[data-module-client-total="' + index + '"]');
    const costCell = modulesGrid.querySelector('[data-module-cost-total="' + index + '"]');
    const clientInput = modulesGrid.querySelector('[data-module-client-unit="' + index + '"]');
    const costInput = modulesGrid.querySelector('[data-module-cost-unit="' + index + '"]');
    if (clientCell) clientCell.textContent = money(line.totalClient);
    if (costCell) costCell.textContent = money(line.totalCost);
    if (clientInput) clientInput.textContent = money(line.unitClient);
    if (costInput) costInput.textContent = money(line.unitCost);
  });
}

function updateClient(field, value) {
  state.client[field] = value;
  persistQuoteSoon();
}

function updateModule(index, field, value) {
  if (field === 'type') {
    const previous = state.modules[index];
    const preset = clone(state.typePresets[value]);
    const nextModule = hydrateModule({
      ...preset,
      id: previous.id,
      quantity: previous.quantity,
      furnitureGroupId: previous.furnitureGroupId || '',
      type: value,
      interior: '',
      exterior: ''
    });
    // A type supplies structural defaults only. Materials must be chosen
    // explicitly so an unconfirmed wood never enters the calculation.
    nextModule.interior = '';
    nextModule.exterior = '';
    state.modules[index] = nextModule;
    delete state.modules[index].blank;
    state.modules[index].pricingBase = {
      ...clone(preset.pricingBase || {}),
      interior: '',
      exterior: ''
    };
    state.modules[index].description = buildDescription(state.modules[index]);
    renderModules();
    calculate();
    return;
  }

  const numeric = ['quantity','width','height','depth','doors','drawers','shelves','back','divider','unitClient','unitCost'].includes(field);
  state.modules[index][field] = numeric ? num(value) : value;
  if (['quantity', 'sideLeftEdge', 'sideRightEdge'].includes(field)) {
    delete state.modules[index].sideDistribution;
  }
  if (field === 'exterior' && !plateAllowsPaint(value)) state.modules[index].paintDoor = 'Nenhuma';
  if (field === 'interior' && !plateAllowsPaint(value)) {
    state.modules[index].paintInterior = 'Nenhuma';
    if (isPiecePlate(state.modules[index])) state.modules[index].paintDoor = 'Nenhuma';
  }
  if (field === 'doors') {
    if (state.modules[index].doors <= 0) {
      state.modules[index].doorSystem = '';
      state.modules[index].hinge = 'Nenhuma';
    } else if (!state.modules[index].hinge || state.modules[index].hinge === 'Nenhuma') {
      state.modules[index].hinge = state.typePresets[state.modules[index].type]?.hinge || state.lists.dobradicas[0];
    }
  }
  state.modules[index].description = buildDescription(state.modules[index]);
  if (field === 'exterior' || field === 'interior' || field === 'doors') renderModules();
  calculate();
}

function updateExtra(index, field, value) {
  const extra = state.extras[index];
  if (!extra) return;
  if (field === 'item' && extra.autoAddedFor) delete extra.autoAddedFor;
  if (field === 'group') {
    value = normalizeExtraGroupName(value);
    state.extras[index].group = value;
    state.extras[index].item = '';
    delete state.extras[index].tipo;
    delete state.extras[index].handleUse;
    delete state.extras[index].family;
    state.extras[index].drawerRunner = '';
    state.extras[index].moduleDistribution = [];
    state.extras[index].targetModuleId = '';
    state.extras[index].quantity = '';
    state.extras[index].quantityManual = false;
    state.extras[index].unitClient = 0;
    state.extras[index].unitCost = 0;
    ensureKitchenDrawerExtra(state.extras[index]);
    if (!isSkirtingExtra(state.extras[index])) state.extras[index].lacquered = false;
    if (!isManualPricedExtra(state.extras[index])) {
      state.extras[index].unitClient = 0;
      state.extras[index].unitCost = 0;
    }
  } else {
    const numeric = ['quantity','unitClient','unitCost','drawerWidth','drawerDepth','drawerHeight'].includes(field);
    state.extras[index][field] = field === 'lacquered' ? value === 'Sim' : (numeric ? num(value) : value);
    if (field === 'item') {
      if (isInternationalPackagingItem(state.extras[index])) {
        state.extras[index].quantity = currentModuleUnitCount();
        state.extras[index].quantityManual = false;
      } else {
        delete state.extras[index].quantityManual;
      }
    }
    if (field === 'quantity' && isInternationalPackagingItem(state.extras[index])) state.extras[index].quantityManual = true;
    if (field === 'item' && normalizeExtraGroupName(state.extras[index].group) === 'Gavetas') {
      delete state.extras[index].tipo;
      delete state.extras[index].handleUse;
      delete state.extras[index].family;
      state.extras[index].drawerRunner = '';
    }
    if (field === 'quantity' && (isWardrobeDrawerExtra(state.extras[index]) || isKitchenDrawerExtra(state.extras[index]))) {
      syncDrawerDistributionQuantity(state.extras[index], index);
    }
    if (field === 'targetModuleId') {
      const module = drawerTargetModule(state.extras[index]);
      if (module && isPillowEffectExtra(state.extras[index]) && !num(state.extras[index].quantity)) {
        state.extras[index].quantity = num(module.quantity) || 1;
      }
      if (module && isWardrobeDrawerExtra(state.extras[index])) {
        state.extras[index].drawerWidth = module.width || state.extras[index].drawerWidth;
        state.extras[index].drawerDepth = module.depth || state.extras[index].drawerDepth;
        state.extras[index].drawerInterior = module.interior || state.extras[index].drawerInterior;
        state.extras[index].drawerExterior = module.exterior || state.extras[index].drawerExterior;
      }
    }
    ensureWardrobeDrawerExtra(state.extras[index]);
    ensureKitchenDrawerExtra(state.extras[index]);
  }
  syncDuriosBinCompanions();
  calculate();
}

function closeDrawerSplitModal() {
  drawerSplitState = null;
  renderDrawerSplitModal();
}

function renderDrawerSplitModal() {
  let modal = document.querySelector('#drawerSplitModal');
  if (!drawerSplitState) {
    if (modal) modal.remove();
    return;
  }
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'drawerSplitModal';
    modal.className = 'drawer-split-backdrop';
    document.body.appendChild(modal);
  }
  const total = drawerSplitState.quantities.reduce(function (sum, value) { return sum + num(value); }, 0);
  const rows = drawerSplitState.modules.map(function (module, moduleIndex) {
    const measures = drawerSplitState.measures[moduleIndex] || {};
    return '<div class="drawer-split-row">' +
      '<span>' + esc(moduleOptionLabel(module, state.modules.indexOf(module))) + '</span>' +
      '<label><small>Qtd</small><input type="number" min="0" step="1" value="' + esc(drawerSplitState.quantities[moduleIndex]) + '" data-drawer-split-qty="' + moduleIndex + '"></label>' +
      '<label><small>Larg.</small><input type="number" min="0" step="1" value="' + esc(measures.width || 0) + '" data-drawer-split-measure="' + moduleIndex + '" data-field="width"></label>' +
      '<label><small>Prof.</small><input type="number" min="0" step="1" value="' + esc(measures.depth || 0) + '" data-drawer-split-measure="' + moduleIndex + '" data-field="depth"></label>' +
      '<label><small>Alt.</small><input type="number" min="0" step="1" value="' + esc(measures.height || 0) + '" data-drawer-split-measure="' + moduleIndex + '" data-field="height"></label>' +
    '</div>';
  }).join('');
  modal.innerHTML = '<div class="drawer-split-modal" role="dialog" aria-modal="true" aria-labelledby="drawerSplitTitle">' +
    '<div class="drawer-split-head"><div><span>DISTRIBUIR GAVETAS</span><h3 id="drawerSplitTitle">Escolhe quantas gavetas ficam em cada módulo</h3></div><button type="button" data-drawer-split-close>&times;</button></div>' +
    '<p class="drawer-split-help">Preenche só os módulos que levam esta gaveta. A linha mantém a quantidade total, mas a visualização usa esta distribuição.</p>' +
    '<div class="drawer-split-list">' + rows + '</div>' +
    '<div class="drawer-split-total">Total distribuído: <strong>' + total + '</strong> / ' + num(drawerSplitState.originalQuantity) + '</div>' +
    '<div class="drawer-split-actions"><button type="button" data-drawer-split-close>Cancelar</button><button type="button" data-drawer-split-apply>Aplicar distribuição</button></div>' +
  '</div>';
}

function updateDrawerSplitTotal() {
  if (!drawerSplitState) return;
  const total = drawerSplitState.quantities.reduce(function (sum, value) { return sum + num(value); }, 0);
  const totalEl = document.querySelector('.drawer-split-total');
  if (totalEl) {
    totalEl.innerHTML = 'Total distribuído: <strong>' + total + '</strong> / ' + num(drawerSplitState.originalQuantity);
    totalEl.classList.toggle('drawer-split-total-error', Math.abs(total - num(drawerSplitState.originalQuantity)) > 0.001);
  }
}

function applyDrawerSplitModal() {
  if (!drawerSplitState) return;
  const distribution = [];
  drawerSplitState.modules.forEach(function (module, moduleIndex) {
    const quantity = num(drawerSplitState.quantities[moduleIndex]);
    if (quantity <= 0) return;
    const measures = drawerSplitState.measures[moduleIndex] || {};
    distribution.push({
      moduleId: moduleStableId(module, state.modules.indexOf(module)),
      quantity,
      drawerWidth: num(measures.width) || module.width || 0,
      drawerDepth: num(measures.depth) || module.depth || 0,
      drawerHeight: num(measures.height) || drawerSplitState.extra.drawerHeight || 16
    });
  });
  if (!distribution.length) {
    sourceStatus.textContent = 'Distribuição inválida. Coloca pelo menos uma gaveta num módulo.';
    return;
  }
  const originalQuantity = num(drawerSplitState.originalQuantity);
  const distributedQuantity = distribution.reduce(function (sum, item) { return sum + num(item.quantity); }, 0);
  if (Math.abs(originalQuantity - distributedQuantity) > 0.001) {
    sourceStatus.textContent = 'Corrige a distribuição: o total tem de continuar ' + originalQuantity + ', mas está ' + distributedQuantity + '.';
    const totalEl = document.querySelector('.drawer-split-total');
    if (totalEl) totalEl.classList.add('drawer-split-total-error');
    return;
  }
  const extra = state.extras[drawerSplitState.index];
  if (!extra) return;
  extra.quantity = originalQuantity;
  extra.moduleDistribution = distribution;
  const firstTarget = distribution[0]?.moduleId || extra.targetModuleId;
  if (firstTarget) extra.targetModuleId = firstTarget;
  drawerQuantityMemory.set(extra.id || String(drawerSplitState.index), originalQuantity);
  closeDrawerSplitModal();
  sourceStatus.textContent = 'Gavetas distribuídas por módulo.';
  renderVisualPreview();
  renderPrint();
  persistQuote();
  calculate();
}

function splitDrawerExtraByModule(index, trigger) {
  const extra = state.extras[index];
  if (!extra || (!isKitchenDrawerExtra(extra) && !isWardrobeDrawerExtra(extra))) {
    sourceStatus.textContent = 'Esta linha não é uma gaveta compatível para distribuir por módulo.';
    return;
  }
  const quantityInput = trigger?.closest('tr')?.querySelector('input[data-extra="' + index + '"][data-field="quantity"]');
  const memoryKey = extra.id || String(index);
  const rememberedQuantity = drawerQuantityMemory.has(memoryKey) ? num(drawerQuantityMemory.get(memoryKey)) : 0;
  const inputQuantity = quantityInput ? num(quantityInput.value) : 0;
  const currentQuantity = Math.max(inputQuantity, rememberedQuantity, num(extra.quantity));
  if (currentQuantity !== num(extra.quantity)) extra.quantity = currentQuantity;
  const modules = drawerCompatibleModules(extra);
  if (!modules.length) {
    sourceStatus.textContent = 'Não existem módulos compatíveis para distribuir gavetas.';
    return;
  }
  const targetId = extra.targetModuleId || '';
  const savedDistribution = Array.isArray(extra.moduleDistribution) ? extra.moduleDistribution : [];
  drawerSplitState = {
    index,
    extra: clone(extra),
    modules,
    originalQuantity: currentQuantity,
    quantities: modules.map(function (module, moduleIndex) {
      const moduleId = moduleStableId(module, state.modules.indexOf(module));
      const saved = savedDistribution.find(function (item) { return item.moduleId === moduleId; });
      if (saved) return num(saved.quantity);
      return (!targetId && moduleIndex === 0) || moduleId === targetId ? currentQuantity : 0;
    }),
    measures: modules.map(function (module) {
      const moduleId = moduleStableId(module, state.modules.indexOf(module));
      const saved = savedDistribution.find(function (item) { return item.moduleId === moduleId; }) || {};
      return {
        width: num(saved.drawerWidth) || module.width || extra.drawerWidth || 0,
        depth: num(saved.drawerDepth) || module.depth || extra.drawerDepth || 0,
        height: num(saved.drawerHeight) || extra.drawerHeight || 16
      };
    })
  };
  renderDrawerSplitModal();
}

function renderClient() {
  clientBlock.innerHTML = '<div class="client-grid">' +
    '<div class="label">CLIENTE</div><div class="input-cell"><input value="' + esc(state.client.name) + '" data-client="name"></div>' +
    '<div class="label">LOCAL</div><div class="input-cell"><input value="' + esc(state.client.location) + '" data-client="location"></div>' +
    '<div class="label">DATA</div><div class="input-cell"><input type="date" value="' + esc(state.client.date) + '" data-client="date"></div>' +
  '</div>';
  clientBlock.querySelectorAll('[data-client]').forEach(function (el) {
    el.addEventListener('input', function (event) { updateClient(event.target.dataset.client, event.target.value); });
  });
}

function renderKpis() {
  const t = state.quote?.totals || { moduleTotal: 0, extrasTotal: 0, costTotal: 0, finalTotal: 0, margin: 0 };
  const sellLabel = state.pricingMode === 'reseller' ? 'REVENDEDOR' : 'CLIENTE';
  const cards = [
    ['ORÃ‡AMENTO ' + sellLabel, t.moduleTotal],
    ['EXTRAS', t.extrasTotal],
    ['ORÃ‡AMENTO ' + sellLabel + ' + EXTRAS', t.finalTotal]
  ];
  if (canManagePrices()) {
    cards.push(['CUSTO', t.costTotal], ['MARGEM', t.margin]);
  }
  kpiBlock.innerHTML = cards.map(function (pair) { return '<div class="kpi' + (pair[0] === 'CUSTO' || pair[0] === 'MARGEM' ? ' admin-only' : '') + '"><span>' + esc(pair[0]) + '</span><strong>' + money(pair[1]) + '</strong></div>'; }).join('');
}

function previewMaterialTone(value, fallback) {
  const text = comparableText(value);
  if (!text || text === 'NENHUMA' || text.includes('NAO APLICAVEL')) return fallback || '#d8d2c8';
  if (text.includes('U999') || text.includes('N005') || text.includes('PRETO') || text.includes('NEGRO')) return '#343533';
  if (text.includes('W1000') || text.includes('W1200') || text.includes('B030') || text.includes('B117') || text.includes('B3768') || text.includes('BRANCO') || text.includes('WHITE')) return '#f1eee6';
  if (text.includes('L167') || text.includes('CINZA ESCURO')) return '#6e7372';
  if (text.includes('L166') || text.includes('G003') || text.includes('CINZA CLARO')) return '#c8ccca';
  if (text.includes('F067') || text.includes('P114') || text.includes('0026') || text.includes('CINZA ALUMINIO') || text.includes('CINZA ALUMINIO')) return '#aeb4b3';
  if (text.includes('U705') || text.includes('ANGORA') || text.includes('U750') || text.includes('RATO') || text.includes('U707') || text.includes('SEDA') || text.includes('1084') || text.includes('CINZA')) return '#9fa5a4';
  if (text.includes('B116') || text.includes('U156') || text.includes('BEGE') || text.includes('NATUR')) return '#d8c8b6';
  if (text.includes('U608') || text.includes('VERDE')) return '#9fb8a5';
  if (text.includes('F755') || text.includes('AGADIR') || text.includes('LINHO')) return '#c7bda8';
  if (text.includes('F6012') || text.includes('M100') || text.includes('CASTANHO')) return '#7f6048';
  if (text.includes('H1714') || text.includes('H1715') || text.includes('NOGUEIRA')) return '#8a6747';
  if (text.includes('H1384') || text.includes('H1386') || text.includes('H3368') || text.includes('H1316') || text.includes('H3146') || text.includes('H1357') || text.includes('CARVALHO')) return '#b78b61';
  if (text.includes('M2112') || text.includes('MADEIRA') || text.includes('SUCUPIRA')) return '#ad7b55';
  if (text.includes('METAL')) return '#9da3a7';
  return fallback || '#d8d2c8';
}

function previewPaintTone(value, fallback) {
  const text = comparableText(value);
  if (!text || text === 'NENHUMA') return fallback;
  if (text.includes('BRANCO')) return '#f3f0e8';
  if (text.includes('PRETO') || text.includes('ESCURO')) return '#3c3b38';
  if (text.includes('CLARA')) return '#d9d2c6';
  if (text.includes('NATUR') || text.includes('ACRILICO')) return '#d6c5ae';
  if (text.includes('VERNIZ')) return fallback || '#c19a6f';
  return fallback || '#d8d2c8';
}

function drawerPreviewCountForModule(module, type) {
  return Math.min(5, drawerPreviewItemsForModule(module, type).length);
}

function drawerQuantityForModule(extra, moduleId) {
  if (Array.isArray(extra?.moduleDistribution) && extra.moduleDistribution.length) {
    const distribution = extra.moduleDistribution.find(function (item) { return item.moduleId === moduleId; });
    return distribution ? num(distribution.quantity) : 0;
  }
  return extra?.targetModuleId === moduleId ? num(extra.quantity) : 0;
}

function drawerMeasuresForModule(extra, module, moduleId) {
  const distribution = Array.isArray(extra?.moduleDistribution)
    ? extra.moduleDistribution.find(function (item) { return item.moduleId === moduleId; })
    : null;
  return {
    width: num(distribution?.drawerWidth) || num(extra?.drawerWidth) || num(module?.width) || 0,
    depth: num(distribution?.drawerDepth) || num(extra?.drawerDepth) || num(module?.depth) || 0,
    height: num(distribution?.drawerHeight) || num(extra?.drawerHeight) || 0
  };
}

function drawerPreviewItemsForModule(module, type) {
  const id = moduleStableId(module, state.modules.indexOf(module));
  const matches = (state.extras || []).filter(function (extra) {
    if (type === 'wardrobe') return isWardrobeDrawerExtra(extra);
    return isKitchenDrawerExtra(extra);
  }).filter(function (extra) {
    return drawerQuantityForModule(extra, id) > 0;
  });
  const moduleWidth = Math.max(1, Number(module?.width) || 1);
  const moduleHeight = Math.max(1, Number(module?.height) || 1);
  const rawItems = [];
  let kitchenSlot = 0;
  function drawerFamilyKey(extra, text) {
    return comparableText(text)
      .replace(/\bGAVETAO?\b/g, ' ')
      .replace(/\bEXTERIOR\b/g, ' ')
      .replace(/\bINTERIOR\b/g, ' ')
      .replace(/\bFRENTE\b/g, ' ')
      .replace(/\bCOM\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || comparableText(extra.item || extra.group || '');
  }
  matches.forEach(function (extra) {
    const quantity = Math.max(0, Math.round(drawerQuantityForModule(extra, id)));
    const measures = drawerMeasuresForModule(extra, module, id);
    const drawerWidth = Math.max(0, Number(measures.width) || moduleWidth);
    const drawerHeight = Math.max(0, Number(measures.height) || 0);
    const widthPercent = Math.min(92, Math.max(12, (drawerWidth / moduleWidth) * 92));
    const heightPercent = type === 'wardrobe'
      ? (drawerHeight > 0 ? Math.min(92, Math.max(6, (drawerHeight / moduleHeight) * 92)) : 0)
      : (comparableText(extra.item).includes('GAVETAO') ? 17 : 11);
    const perRow = Math.max(1, Math.floor(92 / Math.max(widthPercent, 1)));
    const text = comparableText([extra.item, extra.drawerMaterialMode].join(' '));
    const exterior = text.includes('EXTERIOR') || text.includes('FRENTE');
    const interior = text.includes('INTERIOR') && !exterior;
    const family = drawerFamilyKey(extra, text);
    for (let count = 0; count < quantity; count += 1) {
      const slot = type === 'wardrobe' ? count : kitchenSlot;
      const column = slot % perRow;
      const row = Math.floor(slot / perRow);
      const leftPercent = widthPercent >= 91 ? 4 : 4 + (column * widthPercent);
      const bottomPercent = type === 'wardrobe'
        ? (heightPercent > 0 ? 4 + (row * heightPercent) : 0)
        : 4 + (row * (heightPercent + 2));
      rawItems.push({ widthPercent, heightPercent, leftPercent, bottomPercent, row, exterior, interior, family, type, paired: false });
      if (type !== 'wardrobe') kitchenSlot += 1;
    }
  });
  if (type !== 'wardrobe') return rawItems;
  const items = [];
  rawItems.forEach(function (item) {
    if (!item.interior || item.paired) {
      items.push(item);
      return;
    }
    const exterior = rawItems.find(function (candidate) {
      return !candidate.paired && candidate.exterior && candidate.family === item.family &&
        Math.abs(candidate.widthPercent - item.widthPercent) < 2 &&
        Math.abs(candidate.leftPercent - item.leftPercent) < 2;
    });
    if (!exterior) {
      items.push(item);
      return;
    }
    exterior.paired = true;
    item.paired = true;
    items.push(exterior);
    items.push({
      ...item,
      leftPercent: exterior.leftPercent + (exterior.widthPercent * 0.03),
      widthPercent: exterior.widthPercent * 0.94,
      heightPercent: exterior.heightPercent ? exterior.heightPercent * 0.82 : 0,
      bottomPercent: exterior.bottomPercent !== undefined ? exterior.bottomPercent + (exterior.heightPercent ? exterior.heightPercent * 0.12 : 0) : undefined,
      row: exterior.row,
      nested: true
    });
  });
  rawItems.forEach(function (item) {
    if (!item.paired && !items.includes(item)) items.push(item);
  });
  return items;
}

function modulePreviewTitle(module) {
  if (module.type === 'Roupeiro') return 'Roupeiro';
  if (module.type === 'Superior') return 'Superior';
  if (module.type === 'Inferior') return 'Inferior';
  if (module.type === 'Coluna') return 'Coluna';
  if (isPiecePlate(module)) return 'Peça / placa';
  return module.type || 'Módulo';
}

function previewFrameForType(type, width, height) {
  const text = comparableText(type);
  const maxWidth = 206;
  const maxHeight = 202;
  const minWidth = 76;
  const minHeight = 76;
  const scale = Math.min(maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1));
  const visualWidth = Math.max(minWidth, Math.round(width * scale));
  const visualHeight = Math.max(minHeight, Math.round(height * scale));
  const ratio = width / Math.max(height, 1);
  const className = [
    text === 'SUPERIOR' ? 'preview-superior' : '',
    text === 'INFERIOR' ? 'preview-inferior' : '',
    (text === 'COLUNA' || text === 'ROUPEIRO') ? 'preview-tall' : '',
    (text.includes('PECA') || text.includes('PLACA')) ? 'preview-plate' : '',
    ratio > 1.35 ? 'preview-wide' : '',
    ratio < 0.8 ? 'preview-narrow' : ''
  ].filter(Boolean).join(' ') || 'preview-square';
  return { width: visualWidth, height: visualHeight, className };
}

function renderModulePreviewDisplay(module, index) {
  if (!module || module.blank || !String(module.type || '').trim()) return '';
  const width = Math.max(40, Number(module.width) || 60);
  const height = Math.max(40, Number(module.height) || 70);
  const frame = previewFrameForType(module.type, width, height);
  const visualWidth = frame.width;
  const visualHeight = frame.height;
  const shelves = Math.max(0, Math.min(7, Math.round(Number(module.shelves) || 0)));
  const dividers = Math.max(0, Math.min(5, Math.round(Number(module.divider) || 0)));
  const doors = Math.max(0, Math.min(4, Math.round(Number(module.doors) || 0)));
  const interiorColor = previewPaintTone(module.paintInterior, previewMaterialTone(module.interior, '#d8d2c8'));
  const exteriorColor = previewPaintTone(module.paintDoor, previewMaterialTone(module.exterior, '#e5dfd5'));
  const drawerItems = drawerPreviewItemsForModule(module, 'kitchen')
    .concat(drawerPreviewItemsForModule(module, 'wardrobe'));
  const drawerCount = drawerItems.length;
  const shelfHtml = Array.from({ length: shelves }).map(function (_, shelfIndex) {
    const top = ((shelfIndex + 1) / (shelves + 1)) * 100;
    return '<span class="preview-shelf" style="top:' + top + '%"></span>';
  }).join('');
  const dividerPositions = [];
  function addDividerPosition(position) {
    if (!Number.isFinite(position)) return;
    if (position <= 4 || position >= 96) return;
    if (dividerPositions.some(function (existing) { return Math.abs(existing - position) < 1.8; })) return;
    dividerPositions.push(position);
  }
  if (doors > 1) {
    for (let doorIndex = 1; doorIndex < doors; doorIndex += 1) {
      addDividerPosition((doorIndex / doors) * 100);
    }
  }
  for (let dividerIndex = 1; dividerPositions.length < dividers && dividerIndex <= dividers + doors + 2; dividerIndex += 1) {
    addDividerPosition((dividerIndex / (dividers + 1)) * 100);
  }
  const dividerHtml = dividerPositions.slice(0, dividers).sort(function (a, b) { return a - b; }).map(function (left) {
    return '<span class="preview-divider" style="left:' + left + '%"></span>';
  }).join('');
  const drawerHtml = drawerItems.slice(0, 16).map(function (drawer, drawerIndex) {
    const row = Number.isFinite(drawer.row) ? drawer.row : drawerIndex;
    const bottom = drawer.bottomPercent !== undefined ? drawer.bottomPercent : 6 + row * 13 + (drawer.nested ? 2.4 : 0);
    const heightStyle = drawer.heightPercent ? ';height:' + drawer.heightPercent + '%' : '';
    return '<span class="preview-drawer' + (drawer.exterior ? ' preview-drawer-exterior' : '') + (drawer.nested ? ' preview-drawer-nested' : '') + '" style="bottom:' + bottom + '%;left:' + drawer.leftPercent + '%;right:auto;width:' + drawer.widthPercent + '%' + heightStyle + '"></span>';
  }).join('');
  const doorHtml = doors > 0
    ? '<div class="preview-doors" style="--door-count:' + doors + '">' + Array.from({ length: doors }).map(function (_, doorIndex) { return '<span style="background:' + attrEsc(exteriorColor) + ';--door-index:' + doorIndex + '"></span>'; }).join('') + '</div>'
    : '';
  return '<div class="visual-preview-display">' +
    '<div class="visual-preview-name">' + esc(modulePreviewTitle(module)) + '<span>' + esc(width + 'x' + height + 'x' + (module.depth || 0)) + '</span></div>' +
    '<div class="visual-cabinet-wrap">' +
      '<div class="visual-cabinet ' + attrEsc(frame.className) + '" style="width:' + visualWidth + 'px;height:' + visualHeight + 'px;background:' + attrEsc(interiorColor) + '">' +
        '<span class="preview-back"></span>' +
        shelfHtml + dividerHtml + doorHtml + drawerHtml +
      '</div>' +
    '</div>' +
    '<div class="visual-preview-meta">' +
      '<span>Prat. ' + esc(shelves) + '</span><span>Div. ' + esc(dividers) + '</span><span>Portas ' + esc(doors) + '</span>' +
      (drawerCount ? '<span>Gav. ' + esc(drawerCount) + '</span>' : '') +
    '</div>' +
  '</div>';
}

function renderModulePreview(module, index) {
  if (!module || module.blank || !String(module.type || '').trim()) return '';
  return '<article class="visual-preview-card" data-preview-card="' + index + '">' +
    renderModulePreviewDisplay(module, index) +
    '<div class="visual-preview-controls">' +
      '<label><span>Tipo</span><select data-preview-module="' + index + '" data-field="type">' + optionListWithBlank(state.lists.tipos, module.type) + '</select></label>' +
      '<label><span>Qtd</span>' + input('number', module.quantity, 'min="0" step="1" data-preview-module="' + index + '" data-field="quantity"') + '</label>' +
      '<label><span>Larg.</span>' + input('number', module.width, 'min="0" step="1" data-preview-module="' + index + '" data-field="width"') + '</label>' +
      '<label><span>Alt.</span>' + input('number', module.height, 'min="0" step="1" data-preview-module="' + index + '" data-field="height"') + '</label>' +
      '<label><span>Prof.</span>' + input('number', module.depth, 'min="0" step="1" data-preview-module="' + index + '" data-field="depth"') + '</label>' +
      '<label><span>Portas</span>' + input('number', module.doors, 'min="0" step="1" data-preview-module="' + index + '" data-field="doors"') + '</label>' +
      '<label><span>Prat.</span>' + input('number', module.shelves, 'min="0" step="1" data-preview-module="' + index + '" data-field="shelves"') + '</label>' +
      '<label><span>Div.</span>' + input('number', module.divider, 'min="0" step="1" data-preview-module="' + index + '" data-field="divider"') + '</label>' +
    '</div>' +
  '</article>';
}

function refreshPreviewCard(index) {
  if (!visualPreviewGrid || !state.modules[index]) return;
  const card = visualPreviewGrid.querySelector('[data-preview-card="' + index + '"]');
  const display = card?.querySelector('.visual-preview-display');
  if (display) display.outerHTML = renderModulePreviewDisplay(state.modules[index], index);
}

function renderVisualPreview() {
  if (!visualPreviewGrid) return;
  prepareWardrobeDrawerExtras();
  const modules = (state.modules || []).filter(function (module) { return module && !module.blank && String(module.type || '').trim(); });
  visualPreviewGrid.innerHTML = modules.length
    ? modules.map(renderModulePreview).join('')
    : '<div class="visual-preview-empty">Adiciona um módulo para ver a pré-visualização.</div>';
  visualPreviewGrid.querySelectorAll('[data-preview-module]').forEach(function (el) {
    el.addEventListener('change', function (event) {
      const index = Number(event.target.dataset.previewModule);
      const field = event.target.dataset.field;
      updateModule(index, field, event.target.value);
    });
  });
  visualPreviewGrid.querySelectorAll('input[type="number"][data-preview-module]').forEach(function (el) {
    el.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.previewModule);
      const field = event.target.dataset.field;
      state.modules[index][field] = num(event.target.value);
      state.modules[index].description = buildDescription(state.modules[index]);
      refreshPreviewCard(index);
      persistQuoteSoon();
    });
  });
}

function renderPrintVisuals() {
  const modules = (state.modules || []).filter(function (module) { return module && !module.blank && String(module.type || '').trim(); });
  if (!modules.length) return '';
  const pages = [];
  for (let start = 0; start < modules.length; start += 9) {
    pages.push(modules.slice(start, start + 9).map(function (module) {
      const index = state.modules.indexOf(module);
      return '<article class="print-visual-card">' +
        renderModulePreviewDisplay(module, index) +
      '</article>';
    }).join(''));
  }
  return pages.map(function (cardsHtml, pageIndex) {
    return '<section class="print-visual-page">' +
      '<h2>VISUALIZAÇÃO DOS MÓDULOS' + (pages.length > 1 ? ' - ' + (pageIndex + 1) : '') + '</h2>' +
      '<div class="print-visual-grid">' + cardsHtml + '</div>' +
    '</section>';
  }).join('');
}

function furnitureGroupOptions(selectedId) {
  return '<option value="">Sem móvel</option>' + (state.furnitureGroups || []).map(function (group) {
    return '<option value="' + attrEsc(group.id) + '"' + (group.id === selectedId ? ' selected' : '') + '>' + esc(group.name) + '</option>';
  }).join('');
}

function createFurnitureGroup() {
  const suggested = 'Móvel ' + ((state.furnitureGroups || []).length + 1);
  const name = window.prompt('Nome do móvel:', suggested);
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  if ((state.furnitureGroups || []).some(function (group) { return comparableText(group.name) === comparableText(cleanName); })) {
    window.alert('Já existe um móvel com esse nome.');
    return;
  }
  state.furnitureGroups.push({ id: 'furniture_' + Date.now(), name: cleanName });
  persistQuoteSoon();
  renderModules();
  renderPrint();
  sourceStatus.textContent = 'Móvel criado: ' + cleanName;
}

function manageFurnitureGroups() {
  const groups = state.furnitureGroups || [];
  if (!groups.length) {
    window.alert('Ainda não existem móveis. Usa “Criar móvel” primeiro.');
    return;
  }
  const choice = window.prompt('Escolhe o número do móvel que queres alterar:\n' + groups.map(function (group, index) {
    return (index + 1) + ' — ' + group.name;
  }).join('\n'));
  const index = Number(choice) - 1;
  if (!Number.isInteger(index) || !groups[index]) return;
  const group = groups[index];
  const name = window.prompt('Novo nome do móvel. Deixa vazio para eliminar:', group.name);
  if (name === null) return;
  if (!name.trim()) {
    if (!window.confirm('Eliminar o móvel “' + group.name + '”? Os módulos ficam em “Sem móvel”.')) return;
    state.modules.forEach(function (module) {
      if (module.furnitureGroupId === group.id) module.furnitureGroupId = '';
    });
    state.extras.forEach(function (extra) {
      if (extra.furnitureGroupId === group.id) extra.furnitureGroupId = '';
    });
    groups.splice(index, 1);
  } else {
    group.name = name.trim();
  }
  persistQuoteSoon();
  renderModules();
  renderFinal();
  renderPrint();
}

function catalogReference(category, value) {
  const item = (state.catalog?.[category] || []).find(function (candidate) {
    return comparableText(candidate.name || candidate.item || candidate.label) === comparableText(value);
  });
  return item?.reference || value || '-';
}

function removeModuleSystemFields() {
  if (!modulesGrid) return;
  modulesGrid.querySelectorAll('.modules-table thead tr').forEach(function (row) {
    if (row.children[12]) row.children[12].remove();
  });
  modulesGrid.querySelectorAll('.modules-table tbody tr').forEach(function (row) {
    const field = row.querySelector('[data-field="doorSystem"]');
    if (!field) return;
    const label = field.closest('label');
    if (label) {
      label.remove();
      return;
    }
    const cell = field.closest('td');
    if (cell) cell.remove();
  });
  modulesGrid.querySelectorAll('.modules-table colgroup col:nth-child(13)').forEach(function (column) { column.remove(); });
  modulesGrid.querySelectorAll('.module-detail-row > td').forEach(function (cell) { cell.colSpan = 17; });
}

function renderModules() {
  const sellLabel = state.pricingMode === 'reseller' ? 'REVENDEDOR' : 'CLIENTE';
  const headings = ['AÃ‡ÃƒO','MÓVEL','TIPO','QTD','LARG.','ALT.','PROF.','PORTAS','PRAT.','INTERIOR','EXTERIOR','PINTURA','SISTEMA','DOBRADIÃ‡A','P. UNIT ' + sellLabel,'TOTAL ' + sellLabel,'CUSTO UNIT.','TOTAL CUSTO'];
  modulesGrid.innerHTML = datalistOptions('moduleInteriorOptions', state.lists.interiores) + datalistOptions('moduleExteriorOptions', state.lists.exteriores) + '<table class="excel-table modules-table"><colgroup>' + '<col>'.repeat(18) + '</colgroup><thead><tr>' + headings.map(function (h, index) { return '<th' + (index >= 16 ? ' class="cost-cell"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + state.modules.map(function (m, i) {
    const piecePlate = isPiecePlate(m);
    const splitButton = num(m.quantity) > 1 ? '<div class="module-split-actions"><button class="soft-inline-button module-split-button" data-split-module="' + i + '" type="button">Dividir por modulo</button></div>' : '';
    const sideIsSplit = hasSideDistribution(m);
    return '<tr class="module-main-row">' +
      '<td class="text-center module-action-cell"><button class="remove-button" data-remove-module="' + i + '" type="button" title="Remover linha">&times;</button></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="furnitureGroupId">' + furnitureGroupOptions(m.furnitureGroupId || '') + '</select></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="type">' + optionListWithBlank(state.lists.tipos, m.type) + '</select></td>' +
      '<td class="input-cell module-quantity-cell">' + input('number', m.quantity, 'min="0" step="1" data-module="' + i + '" data-field="quantity"') + '</td>' +
      '<td class="input-cell module-dimensions-cell"><div class="module-dimensions-inline">' +
        '<label><span>Larg.</span>' + input('number', m.width, 'min="0" step="1" data-module="' + i + '" data-field="width"') + '</label>' +
        '<label><span>Alt.</span>' + input('number', m.height, 'min="0" step="1" data-module="' + i + '" data-field="height"') + '</label>' +
        '<label><span>Prof.</span>' + input('number', m.depth, 'min="0" step="1" data-module="' + i + '" data-field="depth"' + (piecePlate ? ' disabled' : '')) + '</label>' +
      '</div></td>' +
      '<td class="module-dimensions-placeholder" aria-hidden="true"></td>' +
      '<td class="module-dimensions-placeholder" aria-hidden="true"></td>' +
      '<td class="input-cell">' + input('number', m.doors, 'min="0" step="1" data-module="' + i + '" data-field="doors"' + (piecePlate ? ' disabled' : '')) + '</td>' +
      '<td class="input-cell">' + input('number', m.shelves, 'min="0" step="1" data-module="' + i + '" data-field="shelves"' + (piecePlate ? ' disabled' : '')) + '</td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="interior">' + optionListWithBlank(state.lists.interiores, m.interior) + '</select></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="exterior"' + (piecePlate ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate ? ['NÃ£o aplicÃ¡vel'] : state.lists.exteriores, m.exterior) + '</select></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="paintDoor">' + optionListWithBlank(state.lists.pinturas, m.paintDoor) + '</select></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="doorSystem"' + (piecePlate || num(m.doors) <= 0 ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate || num(m.doors) <= 0 ? [] : state.lists.sistemasPorta, m.doorSystem) + '</select></td>' +
      '<td class="input-cell"><select data-module="' + i + '" data-field="hinge"' + (piecePlate || num(m.doors) <= 0 ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate || num(m.doors) <= 0 ? ['Nenhuma'] : state.lists.dobradicas, m.hinge) + '</select></td>' +
      '<td class="input-cell text-right money-value" data-module-client-unit="' + i + '">' + money(state.quote?.modules?.[i]?.unitClient ?? m.unitClient) + '</td>' +
      '<td class="total-cell text-right" data-module-client-total="' + i + '">' + money(state.quote?.modules?.[i]?.totalClient || m.quantity * m.unitClient) + '</td>' +
      '<td class="cost-cell text-right money-value" data-module-cost-unit="' + i + '">' + money(state.quote?.modules?.[i]?.unitCost ?? m.unitCost) + '</td>' +
      '<td class="cost-cell text-right" data-module-cost-total="' + i + '">' + money(state.quote?.modules?.[i]?.totalCost || m.quantity * m.unitCost) + '</td>' +
    '</tr>' +
    '<tr class="module-detail-row"><td colspan="18"><div class="module-details">' +
      '<label><span>QUANTIDADE</span>' + input('number', m.quantity, 'min="0" step="1" data-module="' + i + '" data-field="quantity"') + '</label>' +
      '<label><span>MÓVEL</span><select data-module="' + i + '" data-field="furnitureGroupId">' + furnitureGroupOptions(m.furnitureGroupId || '') + '</select></label>' +
      '<label><span>TIPO</span><select data-module="' + i + '" data-field="type">' + optionListWithBlank(state.lists.tipos, m.type) + '</select></label>' +
      '<label><span>INTERIOR</span><select data-module="' + i + '" data-field="interior">' + optionListWithBlank(state.lists.interiores, m.interior) + '</select></label>' +
      '<label><span>EXTERIOR</span><select data-module="' + i + '" data-field="exterior"' + (piecePlate ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate ? ['Não aplicável'] : state.lists.exteriores, m.exterior) + '</select></label>' +
      '<label><span>PINTURA</span><select data-module="' + i + '" data-field="paintDoor">' + optionListWithBlank(state.lists.pinturas, m.paintDoor) + '</select></label>' +
      '<label><span>SISTEMA</span><select data-module="' + i + '" data-field="doorSystem"' + (piecePlate || num(m.doors) <= 0 ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate || num(m.doors) <= 0 ? [] : state.lists.sistemasPorta, m.doorSystem) + '</select></label>' +
      '<label><span>DOBRADIÇA</span><select data-module="' + i + '" data-field="hinge"' + (piecePlate || num(m.doors) <= 0 ? ' disabled' : '') + '>' + optionListWithBlank(piecePlate || num(m.doors) <= 0 ? ['Nenhuma'] : state.lists.dobradicas, m.hinge) + '</select></label>' +
      '<label><span>PINTURA INTERIOR</span><select data-module="' + i + '" data-field="paintInterior">' + optionListWithBlank(state.lists.pinturas, m.paintInterior) + '</select></label>' +
      '<label><span>TIPO DE ORLA</span><select data-module="' + i + '" data-field="edgeType"' + (piecePlate ? ' disabled' : '') + '>' + optionListWithBlank(state.lists.orlas, m.edgeType) + '</select></label>' +
      '<label><span>TOPOS CIMA/BAIXO</span><select data-module="' + i + '" data-field="topBottomEdges"' + (piecePlate ? ' disabled' : '') + '>' + optionListWithBlank(state.lists.toposHorizontais, m.topBottomEdges) + '</select></label>' +
      '<label class="module-side-field"><span>LATERAL ESQ.</span>' + moduleSideSelect(i, 'sideLeftEdge', m.sideLeftEdge, piecePlate || sideIsSplit) + '</label>' +
      '<label class="module-side-field"><span>LATERAL DIR.</span>' + moduleSideSelect(i, 'sideRightEdge', m.sideRightEdge, piecePlate || sideIsSplit) + '</label>' +
      splitButton +
      '<label><span>COSTA</span>' + input('number', m.back, 'min="0" step="1" data-module="' + i + '" data-field="back"' + (piecePlate ? ' disabled' : '')) + '</label>' +
      '<label><span>' + esc('DIVISÃ“RIA') + '</span>' + input('number', m.divider, 'min="0" step="1" data-module="' + i + '" data-field="divider"' + (piecePlate ? ' disabled' : '')) + '</label>' +
    '</div></td></tr>';
  }).join('') + '</tbody></table>' +
    (state.modules.length ? '' : '<div class="quote-empty-state">Ainda não há módulos neste orçamento. Usa <strong>+ Adicionar caixote</strong> para começar.</div>');
  enhanceWoodSearchFields();
  removeModuleSystemFields();

  modulesGrid.querySelectorAll('[data-module]').forEach(function (el) {
    el.addEventListener('change', function (event) { updateModule(Number(event.target.dataset.module), event.target.dataset.field, event.target.value); });
  });
  modulesGrid.querySelectorAll('input[type="number"][data-module]').forEach(function (el) {
    el.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.module);
      const field = event.target.dataset.field;
      state.modules[index][field] = num(event.target.value);
      state.modules[index].description = buildDescription(state.modules[index]);
      scheduleVisualPreview();
      persistQuoteSoon();
    });
  });
  modulesGrid.querySelectorAll('[data-remove-module]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.modules.splice(Number(button.dataset.removeModule), 1);
      renderModules();
      calculate();
    });
  });
  modulesGrid.querySelectorAll('[data-split-module]').forEach(function (button) {
    button.addEventListener('click', function () {
      splitModuleQuantity(Number(button.dataset.splitModule));
    });
  });
  renderVisualPreview();
}

function closeModuleSplitModal() {
  moduleSplitState = null;
  renderModuleSplitModal();
}

function moduleSideOptions(current) {
  return optionList(state.lists.tipoLateralTopo || [], current);
}

function renderModuleSplitModal() {
  let modal = document.querySelector('#moduleSplitModal');
  if (!moduleSplitState) {
    if (modal) modal.remove();
    return;
  }
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'moduleSplitModal';
    modal.className = 'drawer-split-backdrop';
    document.body.appendChild(modal);
  }
  const total = moduleSplitState.rows.reduce(function (sum, row) { return sum + num(row.quantity); }, 0);
  const rows = moduleSplitState.rows.map(function (row, rowIndex) {
    return '<div class="drawer-split-row module-split-row">' +
      '<span>Configuracao ' + (rowIndex + 1) + '</span>' +
      '<label><small>Qtd</small><input type="number" min="0" step="1" value="' + esc(row.quantity) + '" data-module-split-qty="' + rowIndex + '"></label>' +
      '<label><small>Lateral esq.</small><select data-module-split-side="' + rowIndex + '" data-field="sideLeftEdge">' + moduleSideOptions(row.sideLeftEdge) + '</select></label>' +
      '<label><small>Lateral dir.</small><select data-module-split-side="' + rowIndex + '" data-field="sideRightEdge">' + moduleSideOptions(row.sideRightEdge) + '</select></label>' +
    '</div>';
  }).join('');
  modal.innerHTML = '<div class="drawer-split-modal module-split-modal" role="dialog" aria-modal="true" aria-labelledby="moduleSplitTitle">' +
    '<div class="drawer-split-head"><div><span>DIVIDIR MODULOS</span><h3 id="moduleSplitTitle">Escolhe as laterais de cada modulo</h3></div><button type="button" data-module-split-close>&times;</button></div>' +
    '<p class="drawer-split-help">Divide a quantidade em configuracoes diferentes. Por exemplo: uma linha com lateral inteira e outra com sarrafo.</p>' +
    '<div class="drawer-split-list">' + rows + '</div>' +
    '<div class="drawer-split-total">Total dividido: <strong>' + total + '</strong> / ' + num(moduleSplitState.originalQuantity) + '</div>' +
    '<div class="drawer-split-actions"><button type="button" data-module-split-close>Cancelar</button><button type="button" data-module-split-apply>Aplicar divisao</button></div>' +
  '</div>';
}

function updateModuleSplitTotal() {
  if (!moduleSplitState) return;
  const total = moduleSplitState.rows.reduce(function (sum, row) { return sum + num(row.quantity); }, 0);
  const totalEl = document.querySelector('#moduleSplitModal .drawer-split-total');
  if (totalEl) {
    totalEl.innerHTML = 'Total dividido: <strong>' + total + '</strong> / ' + num(moduleSplitState.originalQuantity);
    totalEl.classList.toggle('drawer-split-total-error', Math.abs(total - num(moduleSplitState.originalQuantity)) > 0.001);
  }
}

function applyModuleSplitModal() {
  if (!moduleSplitState) return;
  const originalQuantity = num(moduleSplitState.originalQuantity);
  const total = moduleSplitState.rows.reduce(function (sum, row) { return sum + num(row.quantity); }, 0);
  if (Math.abs(total - originalQuantity) > 0.001) {
    sourceStatus.textContent = 'Corrige a divisao: o total tem de continuar ' + originalQuantity + ', mas esta ' + total + '.';
    const totalEl = document.querySelector('#moduleSplitModal .drawer-split-total');
    if (totalEl) totalEl.classList.add('drawer-split-total-error');
    return;
  }
  const source = state.modules[moduleSplitState.index];
  if (!source) return;
  const rows = moduleSplitState.rows.filter(function (row) { return num(row.quantity) > 0; }).map(function (row) {
    return {
      quantity: num(row.quantity),
      sideLeftEdge: row.sideLeftEdge,
      sideRightEdge: row.sideRightEdge
    };
  });
  source.quantity = originalQuantity;
  source.sideDistribution = rows;
  source.description = buildDescription(source);
  closeModuleSplitModal();
  renderModules();
  calculate();
  sourceStatus.textContent = 'Laterais distribuidas no mesmo modulo.';
}

function splitModuleQuantity(index) {
  const source = state.modules[index];
  if (!source) return;
  const quantity = Math.max(1, Math.floor(num(source.quantity)));
  if (quantity <= 1) return;
  const savedRows = Array.isArray(source.sideDistribution)
    ? source.sideDistribution.filter(function (row) { return num(row.quantity) > 0; })
    : [];
  moduleSplitState = {
    index,
    originalQuantity: quantity,
    rows: savedRows.length ? savedRows.map(function (row) {
      return {
        quantity: num(row.quantity),
        sideLeftEdge: row.sideLeftEdge || source.sideLeftEdge || legacySideTopToSide(source.sideEdges, 'left'),
        sideRightEdge: row.sideRightEdge || source.sideRightEdge || legacySideTopToSide(source.sideEdges, 'right')
      };
    }) : Array.from({ length: quantity }, function () {
      return {
        quantity: 1,
        sideLeftEdge: source.sideLeftEdge || legacySideTopToSide(source.sideEdges, 'left'),
        sideRightEdge: source.sideRightEdge || legacySideTopToSide(source.sideEdges, 'right')
      };
    })
  };
  renderModuleSplitModal();
}

function renderFinal() {
  state.extras = ledTransformers.arrange(state.extras, state.catalog.extras || []).extras;
  const sellLabel = state.pricingMode === 'reseller' ? 'REVENDEDOR' : 'CLIENTE';
  const headings = ['MÓVEL','GRUPO','DESCRIÃ‡ÃƒO','QTD','P. UNIT ' + sellLabel,'TOTAL ' + sellLabel,'CUSTO UNIT.','TOTAL CUSTO','DESCRIÃ‡ÃƒO FINAL','AÃ‡ÃƒO'];
  const extraGroups = Array.from(new Set((state.lists.extraGroups || []).concat([manualExtraGroup]).map(normalizeExtraGroupName).filter(Boolean)));
  prepareWardrobeDrawerExtras();
  finalGrid.innerHTML = '<table class="excel-table final-table"><colgroup>' + '<col>'.repeat(10) + '</colgroup><thead><tr>' + headings.map(function (h, index) { return '<th' + (index === 6 || index === 7 ? ' class="cost-cell"' : '') + '>' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
    state.modules.map(function (m, i) {
      return '<tr><td>' + esc(moduleFinalGroup(m)) + '</td><td>Módulos</td><td>' + esc(moduleFinalTitle(m)) + '</td><td class="text-center">' + esc(m.quantity) + '</td><td class="text-right">' + money(m.unitClient) + '</td><td class="total-cell text-right">' + money(state.quote?.modules?.[i]?.totalClient || 0) + '</td><td class="cost-cell text-right">' + money(m.unitCost) + '</td><td class="cost-cell text-right">' + money(state.quote?.modules?.[i]?.totalCost || 0) + '</td><td class="description">' + esc(buildDescription(m)) + '</td><td></td></tr>';
    }).join('') +
    state.extras.map(function (e, i) {
      const manualPriced = isManualPricedExtra(e);
      const hasExtraItem = String(e.item || '').trim();
      const wardrobeDrawer = isWardrobeDrawerExtra(e) && hasExtraItem;
      const kitchenDrawer = isKitchenDrawerExtra(e) && hasExtraItem;
      const extraItemOptions = extraItems(e.group).concat(isWardrobeDrawerExtra(e) && !hasExtraItem ? [wardrobeDrawerItem] : []);
      const unitClient = state.quote?.extras?.[i]?.unitClient ?? e.unitClient;
      const unitCost = state.quote?.extras?.[i]?.unitCost ?? e.unitCost;
      const skirting = isSkirtingExtra(e);
      const lacquerCell = skirting
        ? '<div class="extra-inline-option"><span>Lacado</span><select data-extra="' + i + '" data-field="lacquered">' + optionList(['Não', 'Sim'], isLacqueredExtra(e) ? 'Sim' : 'Não') + '</select></div>'
        : '';
      const drawerDescription = wardrobeDrawer
        ? wardrobeDrawerDescription(e)
        : '';
      const rodExtra = isWardrobeRodExtra(e);
      const description = wardrobeDrawer ? drawerDescription : (e.group ? e.group + (e.item ? ' - ' + e.item : '') + (skirting && isLacqueredExtra(e) ? ' / Lacado' : '') + (rodExtra ? wardrobeRodDescription(e) : '') : '');
      const drawerCell = '<div class="wardrobe-drawer-config">' +
        '<strong>' + esc(wardrobeDrawerItem) + '</strong>' +
        '<label><span>MÃ³dulo</span><select data-wardrobe-extra="' + i + '" data-field="targetModuleId">' + drawerModuleOptionList(e) + '</select></label>' +
        '<label><span>Material</span><select data-wardrobe-extra="' + i + '" data-field="drawerMaterialMode">' + optionList(['Interior', 'Exterior', 'Interior + frente exterior'], e.drawerMaterialMode || 'Interior') + '</select></label>' +
        '<label><span>Corrediça</span><select data-wardrobe-extra="' + i + '" data-field="drawerRunner">' + optionListWithBlank(drawerRunnerOptions(), e.drawerRunner || '') + '</select></label>' +
        '<div class="wardrobe-drawer-useful">' + esc(Array.isArray(e.moduleDistribution) && e.moduleDistribution.length ? 'Medidas por módulo' : 'Largura ' + wardrobeDrawerUsefulSummary(e)) + '</div>' +
        '<button class="soft-inline-button" type="button" data-split-drawer-extra="' + i + '">Dividir por módulo</button>' +
      '</div>';
      const rodCell = rodExtra
        ? '<div class="rod-extra-config"><select data-extra="' + i + '" data-field="item" data-extra-item-select="' + i + '">' + optionListWithBlank(extraItemOptions, e.item) + '</select><label><span>Cm usados</span>' + input('text', e.rodLengths || '', 'placeholder="Ex: 45 ou 15+85" data-extra="' + i + '" data-field="rodLengths"') + '</label></div>'
        : '';
      let itemCell = wardrobeDrawer ? drawerCell : isManualExtra(e)
        ? manualItemControl(i, e)
        : isOtherExtra(e)
        ? otherItemControl(i, e, extraItemOptions)
        : (kitchenDrawer
          ? '<div class="drawer-module-picker"><label><span>Módulo</span><select data-extra="' + i + '" data-field="targetModuleId">' + drawerModuleOptionList(e) + '</select></label><select data-extra="' + i + '" data-field="item" data-extra-item-select="' + i + '">' + optionListWithBlank(extraItemOptions, e.item) + '</select><button class="soft-inline-button" type="button" data-split-drawer-extra="' + i + '">Dividir por módulo</button></div>'
          : isPillowEffectExtra(e)
          ? '<div class="drawer-module-picker"><select data-extra="' + i + '" data-field="item" data-extra-item-select="' + i + '">' + optionListWithBlank(extraItemOptions, e.item) + '</select><label><span>Módulo (+15%)</span><select data-extra="' + i + '" data-field="targetModuleId">' + drawerModuleOptionList(e) + '</select></label></div>'
          : (rodExtra ? rodCell : '<select data-extra="' + i + '" data-field="item" data-extra-item-select="' + i + '">' + optionListWithBlank(extraItemOptions, e.item) + '</select>')) + lacquerCell;
      if (normalizeExtraGroupName(e.group) === 'Puxadores') {
        const catalogItem = findCatalogExtraForQuote(e) || e;
        const priceUnit = catalogItem.priceUnit === 'cm' ? 'cm' : (catalogItem.priceUnit === 'meter' ? 'metros' : 'unidades');
        const priceLabel = catalogItem.priceUnit === 'cm' ? 'por cm' : (catalogItem.priceUnit === 'meter' ? 'por metro' : 'por unidade');
        const reference = catalogItem.reference || e.reference || '';
        const use = extraUseLabel(catalogItem);
        itemCell += '<div class="extra-item-meta">' +
          (reference ? '<span>Referência: ' + esc(reference) + '</span>' : '') +
          (use ? '<span>Utilização: ' + esc(use) + '</span>' : '') +
          '<span>Quantidade: ' + esc(priceUnit) + '</span>' +
          '<span>Preço: ' + esc(priceLabel) + '</span>' +
        '</div>';
      }
      if (kitchenDrawer || wardrobeDrawer) {
        const drawerCatalogItem = findCatalogExtraForQuote(e) || e;
        const drawerUse = extraUseLabel(drawerCatalogItem) || (wardrobeDrawer ? 'Roupeiro' : 'Cozinha');
        if (drawerUse) itemCell += '<div class="extra-item-meta"><span>Utiliza&ccedil;&atilde;o: ' + esc(drawerUse) + '</span></div>';
      }
      const clientCell = manualPriced
        ? input('number', unitClient, 'min="0" step="0.01" data-extra="' + i + '" data-field="unitClient"')
        : money(unitClient);
      const costCell = manualPriced
        ? input('number', unitCost, 'min="0" step="0.01" data-extra="' + i + '" data-field="unitCost"')
        : money(unitCost);
      return '<tr><td class="input-cell"><select data-extra="' + i + '" data-field="furnitureGroupId">' + furnitureGroupOptions(e.furnitureGroupId || '') + '</select></td><td class="input-cell"><select data-extra="' + i + '" data-field="group">' + optionListWithBlank(extraGroups, e.group) + '</select></td><td class="input-cell extra-item-cell">' + itemCell + '</td><td class="input-cell">' + input('number', e.quantity || '', 'min="0" step="0.01" data-extra="' + i + '" data-field="quantity"') + '</td><td class="input-cell text-right">' + clientCell + '</td><td class="total-cell text-right">' + money(state.quote?.extras?.[i]?.totalClient || 0) + '</td><td class="input-cell cost-cell text-right">' + costCell + '</td><td class="cost-cell text-right">' + money(state.quote?.extras?.[i]?.totalCost || 0) + '</td><td class="description">' + esc(description) + '</td><td class="text-center"><button class="remove-button" data-remove-extra="' + i + '" type="button" title="Remover linha">&times;</button></td></tr>';
    }).join('') +
    '<tr class="final-totals-row"><td colspan="5" class="total-cell text-right">' + esc('ORÃ‡AMENTO CLIENTE + EXTRAS') + '</td><td class="total-cell text-right">' + money(state.quote?.totals?.finalTotal || 0) + '</td><td class="cost-cell text-right">CUSTO</td><td class="cost-cell text-right">' + money(state.quote?.totals?.costTotal || 0) + '</td><td class="total-cell text-right margin-cell">MARGEM: ' + money(state.quote?.totals?.margin || 0) + '</td><td></td></tr>' +
    '</tbody></table>';

  const finalModuleRows = finalGrid.querySelectorAll('tbody > tr');
  state.modules.forEach(function (module, index) {
    const row = finalModuleRows[index];
    const descriptionCell = row?.children[8];
    if (!descriptionCell) return;
    const dimensions = '<div class="final-module-dimensions final-module-dimensions-summary" title="Resumo das medidas em centímetros">' +
      '<span><small>Larg.</small><strong>' + esc(module.width || 0) + '</strong></span>' +
      '<span><small>Alt.</small><strong>' + esc(module.height || 0) + '</strong></span>' +
      '<span><small>Prof.</small><strong>' + esc(module.depth || 0) + '</strong></span>' +
    '</div>';
    descriptionCell.innerHTML = dimensions + '<div class="description">' + esc(buildDescription(module)) + '</div>';
  });

  enhanceExtraItemSearchFields();
  // A corrediça de roupeiro é informativa no orçamento: mantém a escolha
  // inicial, sem voltar a abrir uma lista de opções.
  finalGrid.querySelectorAll('[data-wardrobe-extra][data-field="drawerRunner"]').forEach(function (select) {
    const label = select.closest('label');
    if (!label) return;
    label.innerHTML = '<span>CorrediÃ§a</span><strong class="wardrobe-drawer-runner-value">' + esc(select.value || '') + '</strong>';
  });
  finalGrid.querySelectorAll('[data-extra]').forEach(function (el) {
    el.addEventListener('change', function (event) { updateExtra(Number(event.target.dataset.extra), event.target.dataset.field, event.target.value); });
  });
  finalGrid.querySelectorAll('[data-wardrobe-extra]').forEach(function (el) {
    el.addEventListener('change', function (event) { updateExtra(Number(event.target.dataset.wardrobeExtra), event.target.dataset.field, event.target.value); });
  });
  finalGrid.querySelectorAll('input[data-extra]').forEach(function (el) {
    el.addEventListener('input', function (event) {
      const field = event.target.dataset.field;
      const numeric = ['quantity','unitClient','unitCost'].includes(field);
      const extraIndex = Number(event.target.dataset.extra);
      state.extras[extraIndex][field] = numeric ? num(event.target.value) : event.target.value;
      if (field === 'quantity') syncDuriosBinCompanions();
      if (field === 'quantity' && isInternationalPackagingItem(state.extras[extraIndex])) state.extras[extraIndex].quantityManual = true;
      if (field === 'quantity' && (isWardrobeDrawerExtra(state.extras[extraIndex]) || isKitchenDrawerExtra(state.extras[extraIndex]))) {
        syncDrawerDistributionQuantity(state.extras[extraIndex], extraIndex);
        scheduleCalculate();
        return;
      }
      if (field === 'rodLengths') {
        scheduleCalculate({ renderFinal: false });
        return;
      }
      persistQuoteSoon();
      renderPrint();
    });
  });
  finalGrid.querySelectorAll('[data-remove-extra]').forEach(function (button) {
    button.addEventListener('click', function () {
      const index = Number(button.dataset.removeExtra);
      const removed = state.extras[index];
      const removedId = removed?.id ? String(removed.id) : '';
      state.extras.splice(index, 1);
      if (removedId) {
        state.extras = state.extras.filter(function (extra) {
          return String(extra.autoAddedFor || '') !== removedId;
        });
      }
      calculate();
    });
  });
  scheduleVisualPreview();
}

function displayDate(value) {
  const parts = String(value || '').split('-');
  return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : value || '';
}

function renderPrint() {
  const totals = state.quote?.totals || { finalTotal: 0 };
  const moduleRows = state.modules.map(function (module, index) {
    const calculated = state.quote?.modules?.[index] || {};
    return {
      furnitureGroupId: module.furnitureGroupId || '',
      description: buildDescription(module),
      quantity: module.quantity,
      unitClient: calculated.unitClient ?? module.unitClient,
      totalClient: calculated.totalClient ?? (module.quantity * module.unitClient)
    };
  });
  const extraRows = state.extras.map(function (extra, index) {
    const calculated = state.quote?.extras?.[index] || {};
    const drawerDescription = isWardrobeDrawerExtra(extra) && String(extra.item || '').trim()
      ? wardrobeDrawerDescription(extra)
      : '';
    const rodExtra = isWardrobeRodExtra(extra);
    const pillowModule = isPillowEffectExtra(extra) ? drawerTargetModule(extra) : null;
    return {
      furnitureGroupId: extra.furnitureGroupId || '',
      description: isWardrobeDrawerExtra(extra) ? drawerDescription : (extra.group ? extra.group + (extra.item ? ' - ' + extra.item : '') + (isSkirtingExtra(extra) && isLacqueredExtra(extra) ? ' / Lacado' : '') + (rodExtra ? wardrobeRodDescription(extra) : '') + (pillowModule ? ' / Módulo ' + moduleOptionLabel(pillowModule, state.modules.indexOf(pillowModule)) : '') : ''),
      quantity: extra.quantity,
      unitClient: calculated.unitClient ?? extra.unitClient,
      totalClient: calculated.totalClient ?? (extra.quantity * extra.unitClient)
    };
  });
  function printRowsHtml(rows, emptyMessage) {
    return rows.length ? rows.map(function (row) {
    return '<tr><td>' + esc(row.description) + '</td><td class="print-quantity">' + esc(row.quantity) + ' x ' + money(row.unitClient) + '</td><td class="print-money">' + money(row.totalClient) + '</td></tr>';
    }).join('') : '<tr class="print-empty"><td colspan="3">' + esc(emptyMessage) + '</td></tr>';
  }

  function printSectionHtml(title, rows, subtotal, className, emptyMessage) {
    return '<section class="print-budget-section ' + className + '">' +
      '<h2>' + title + '</h2>' +
      '<table class="print-lines"><thead><tr><th>DESCRI&Ccedil;&Atilde;O</th><th>QTD X P. UNIT&Aacute;RIO</th><th>TOTAL</th></tr></thead>' +
        '<tbody>' + printRowsHtml(rows, emptyMessage) + '</tbody>' +
        '<tfoot><tr><td colspan="2">SUBTOTAL:</td><td>' + money(subtotal) + '</td></tr></tfoot>' +
      '</table>' +
    '</section>';
  }

  const knownFurnitureIds = new Set((state.furnitureGroups || []).map(function (group) { return group.id; }));
  const furnitureBlocksHtml = (state.furnitureGroups || []).map(function (group) {
    const groupModules = moduleRows.filter(function (row) { return row.furnitureGroupId === group.id; });
    const groupExtras = extraRows.filter(function (row) { return row.furnitureGroupId === group.id; });
    if (!groupModules.length && !groupExtras.length) return '';
    const moduleSubtotal = groupModules.reduce(function (sum, row) { return sum + (Number(row.totalClient) || 0); }, 0);
    const extraSubtotal = groupExtras.reduce(function (sum, row) { return sum + (Number(row.totalClient) || 0); }, 0);
    return '<div class="print-furniture-block">' +
      (groupModules.length ? printSectionHtml('MÓVEL — ' + esc(group.name), groupModules, moduleSubtotal, 'print-modules-section print-furniture-section', '') : '') +
      (groupExtras.length ? printSectionHtml('EXTRAS DO MÓVEL — ' + esc(group.name), groupExtras, extraSubtotal, 'print-extras-section print-furniture-extras-section', '') : '') +
    '</div>';
  }).join('');
  const ungroupedRows = moduleRows.filter(function (row) { return !row.furnitureGroupId || !knownFurnitureIds.has(row.furnitureGroupId); });
  const ungroupedSubtotal = ungroupedRows.reduce(function (sum, row) { return sum + (Number(row.totalClient) || 0); }, 0);
  const ungroupedExtraRows = extraRows.filter(function (row) { return !row.furnitureGroupId || !knownFurnitureIds.has(row.furnitureGroupId); });
  const ungroupedExtraSubtotal = ungroupedExtraRows.reduce(function (sum, row) { return sum + (Number(row.totalClient) || 0); }, 0);
  const hasUngroupedContent = ungroupedRows.length || ungroupedExtraRows.length || (!moduleRows.length && !furnitureBlocksHtml);
  const ungroupedHtml = hasUngroupedContent ? '<div class="print-furniture-block print-ungrouped-block">' +
    (ungroupedRows.length || (!moduleRows.length && !furnitureBlocksHtml)
      ? printSectionHtml('MÓDULOS SEM MÓVEL', ungroupedRows, ungroupedSubtotal, 'print-modules-section', 'Sem módulos no orçamento')
      : '') +
    (ungroupedExtraRows.length
      ? printSectionHtml('EXTRAS SEM MÓVEL', ungroupedExtraRows, ungroupedExtraSubtotal, 'print-extras-section', '')
      : '') +
    '</div>' : '';

  printSheet.innerHTML =
    '<header class="print-header">' +
      '<div class="print-brand"><img src="/assets/silwood-logo.png" alt="Silwood"></div>' +
      '<div class="print-client">' +
        '<div class="print-client-title">DADOS DO CLIENTE</div>' +
        '<div><strong>NOME:</strong><span>' + esc(state.client.name) + '</span></div>' +
        '<div><strong>MORADA DA OBRA:</strong><span>' + esc(state.client.location) + '</span></div>' +
        '<div><strong>DATA DO OR&Ccedil;AMENTO:</strong><span>' + esc(displayDate(state.client.date)) + '</span></div>' +
        '<div class="print-client-total"><strong>OR&Ccedil;AMENTO ' + (state.pricingMode === 'reseller' ? 'REVENDEDOR' : 'CLIENTE') + ':</strong><span>' + money(totals.finalTotal) + '</span></div>' +
      '</div>' +
    '</header>' +
    furnitureBlocksHtml +
    ungroupedHtml +
    '<div class="print-grand-total"><span>TOTAL GERAL C/ EXTRAS</span><strong>' + money(totals.finalTotal) + '</strong></div>' +
    renderPrintVisuals();
}

function addModule() {
  state.modules.push({
    id: 'module_' + Date.now(),
    blank: true,
    furnitureGroupId: '',
    type: '',
    family: '',
    quantity: 0,
    width: 0,
    height: 0,
    depth: 0,
    doors: 0,
    drawers: 0,
    shelves: 0,
    interior: '',
    exterior: '',
    paintDoor: '',
    paintInterior: '',
    doorSystem: '',
    hinge: '',
    edgeType: '',
    topBottomEdges: '',
    sideEdges: '',
    sideLeftEdge: '',
    sideRightEdge: '',
    back: 0,
    divider: 0,
    unitClient: 0,
    unitCost: 0,
    description: '',
    pricingBase: { unitClient: 0, unitCost: 0 }
  });
  renderModules();
  calculate();
}

function addExtra() {
  state.extras.push({ id: 'extra_' + Date.now(), furnitureGroupId: '', group: '', item: '', quantity: '', unitClient: 0, unitCost: 0, lacquered: false });
  calculate();
}

function resetQuote() {
  clearQuoteDraftStorage();
  state.client = { name: '', location: '', date: '' };
  state.modules = [];
  state.extras = [];
  state.furnitureGroups = [];
  persistQuote();
  renderClient();
  renderModules();
  calculate();
  sourceStatus.textContent = 'Novo orçamento criado';
}


function supplierNumber(value) {
  return (Number(value) || 0).toFixed(2);
}

function supplierManualPriceInput(type, index, field, value) {
  const disabled = type === 'readonly';
  return '<span class="supplier-price-control">' +
    '<input class="supplier-price-manual-input" type="text" inputmode="decimal" autocomplete="off" value="' + supplierNumber(value) + '" data-manual-price-type="' + esc(type) + '" data-manual-price-index="' + index + '" data-manual-price-field="' + esc(field) + '"' + (disabled ? ' readonly' : '') + '>' +
    (disabled ? '' : '<button class="supplier-auto-price-button" type="button" data-auto-price-type="' + esc(type) + '" data-auto-price-index="' + index + '" data-auto-price-field="' + esc(field) + '" title="Voltar ao preço automático">Auto</button>') +
  '</span>';
}

function updateSupplierMoneyCell(cell, value, suffix) {
  if (!cell) return;
  const input = cell.querySelector('input[data-manual-price-field]');
  if (input) {
    input.value = supplierNumber(value);
    return;
  }
  cell.textContent = money(value) + (suffix || '');
}

function automaticPrice(item, field, value) {
  if (!item) return;
  if (field === 'client' && item.manualClient === true) return;
  if (field === 'reseller' && item.manualReseller === true) return;
  item[field] = salePriceValue(value);
}

function applyAutomaticClientReseller(item, clientValue, resellerValue) {
  automaticPrice(item, 'client', clientValue);
  automaticPrice(item, 'reseller', resellerValue === undefined ? item.client : resellerValue);
}

function forceAutomaticPrice(item, field, value) {
  if (!item) return;
  item[field] = salePriceValue(value);
}

function roundMeterPrice(value) {
  const number = Number(value) || 0;
  return number > 0 ? Math.round(number * 100) / 100 : 0;
}

function applyEdgeAutomaticClientReseller(item, clientValue, resellerValue) {
  if (!item) return;
  if (item.manualClient !== true) item.client = roundMeterPrice(clientValue);
  if (item.manualReseller !== true) item.reseller = roundMeterPrice(resellerValue === undefined ? item.client : resellerValue);
}

function supplierManualPriceList(type) {
  if (type === 'plates') return state.supplierPrices || [];
  if (type === 'paintings') return state.catalog.paintings || [];
  if (type === 'edges') return state.catalog.edges || [];
  if (type === 'extras') return state.catalog.extras || [];
  if (type === 'doorSystems') return state.catalog.doorSystems || [];
  if (type === 'hinges') return state.catalog.hinges || [];
  return [];
}

function trackManualPriceChange(type, item, index, before) {
  if (!item) return;
  if (type === 'plates') {
    if (item.userAdded) updateSupplierAddition('plates', before, item);
    trackSupplierChange('plates', item, index);
  } else if (type === 'paintings') {
    if (item.userAdded) updateSupplierAddition('paintings', before, item);
    trackSupplierChange('paintings', item, index);
  } else if (type === 'edges') {
    if (item.userAdded) updateSupplierAddition('edges', before, item);
    trackSupplierChange('edges', item, index);
  } else if (type === 'extras') {
    if (item.userAdded) updateSupplierAddition('extras', before, item);
    trackSupplierChange('extras', item, index);
    if (comparableText(item.group) === comparableText(doorSystemExtraGroup)) syncDoorSystemExtras();
  } else if (type === 'doorSystems') {
    if (item.userAdded) updateSupplierAddition('doorSystems', before, item);
    // O sistema principal pertence à tabela sistema_abertura. Guardá-lo
    // como se fosse um componente fazia o preço fornecedor não chegar à BD.
    trackSupplierChange('doorSystems', item, item.name);
    syncDoorSystemExtras();
  } else if (type === 'hinges') {
    if (item.userAdded) updateSupplierAddition('hinges', before, item);
    trackSupplierChange('hinges', item, index);
  }
}

function commitSupplierManualPriceInput(input) {
  if (!input || !input.dataset) return false;
  const type = input.dataset.manualPriceType;
  if (type === 'readonly') return false;
  const index = Number(input.dataset.manualPriceIndex);
  const field = input.dataset.manualPriceField;
  const list = supplierManualPriceList(type);
  const item = list[index];
  if (!item || (field !== 'client' && field !== 'reseller')) return false;
  const nextValue = type === 'edges' ? num(input.value) : salePriceValue(num(input.value));
  if (num(input.value) === num(supplierNumber(item[field]))) {
    return false;
  }
  const before = clone(item);
  ensureManualPriceBaseline(item, before);
  item[field] = nextValue;
  if (field === 'client') item.manualClient = true;
  if (field === 'reseller') item.manualReseller = true;
  if (type === 'paintings' && field === 'client') item.reseller = item.client;
  if (type === 'edges' && field === 'client' && item.manualReseller !== true) item.reseller = item.client;
  input.value = supplierNumber(item[field]);
  trackManualPriceChange(type, item, index, before);
  return true;
}

function commitVisibleSupplierManualPrices() {
  let changed = false;
  supplierPricesGrid.querySelectorAll('[data-manual-price-type]').forEach(function (input) {
    if (commitSupplierManualPriceInput(input)) changed = true;
  });
  if (changed) {
    renderModules();
    renderFinal();
  }
  return changed;
}

function ensureManualPriceBaseline(item, before) {
  if (!item) return;
  const source = before || item;
  if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(source.supplierPrice) || 0;
  if (item.baseCost === undefined) item.baseCost = Number(source.cost) || 0;
  if (item.baseClient === undefined) item.baseClient = Number(source.client) || 0;
  if (item.baseReseller === undefined) item.baseReseller = Number(source.reseller ?? source.client) || 0;
}

function inferredExtraAutoRatio(item, field) {
  const group = normalizeExtraGroupName(item?.group);
  const selfKey = comparableText(item?.item || item?.label || item?.name);
  const ratios = (state.catalog.extras || []).filter(function (candidate) {
    if (candidate === item) return false;
    if (normalizeExtraGroupName(candidate.group) !== group) return false;
    if (comparableText(candidate.item || candidate.label || candidate.name) === selfKey) return false;
    const cost = Number(candidate.cost) || 0;
    const price = Number(field === 'reseller' ? (candidate.reseller || candidate.client) : candidate.client) || 0;
    return cost > 0 && price > 0;
  }).map(function (candidate) {
    return (Number(field === 'reseller' ? (candidate.reseller || candidate.client) : candidate.client) || 0) / (Number(candidate.cost) || 1);
  }).filter(function (ratio) {
    return Number.isFinite(ratio) && ratio > 0;
  });
  return ratios.length ? median(ratios) : 0;
}

function recalculateManualPriceItem(type, item, index) {
  if (!item) return;
  const targetField = arguments.length > 3 ? arguments[3] : '';
  if (type === 'plates') {
    const prices = platePricingValues(item.supplierPrice);
    item.cost = prices.cost;
    if (targetField === 'client') forceAutomaticPrice(item, 'client', prices.client);
    else if (targetField === 'reseller') forceAutomaticPrice(item, 'reseller', prices.reseller);
    else calculateSupplierRow(item);
  } else if (type === 'paintings') {
    recalculatePaintingServices();
    item.reseller = Number(item.client) || 0;
  } else if (type === 'edges') {
    const meters = Number(item.supplierMeters) || 1000;
    item.materialPerMeter = meters ? (Number(item.supplierPrice) || 0) / meters : 0;
    item.cost = item.materialPerMeter + Number(state.pricingRules?.edgeLabor ?? 0.32);
    if (targetField === 'client') item.client = roundMeterPrice(item.cost * 3.5);
    else if (targetField === 'reseller') item.reseller = roundMeterPrice(item.cost * 3.5);
    else applyEdgeAutomaticClientReseller(item, item.cost * 3.5, item.cost * 3.5);
  } else if (type === 'doorSystems' || type === 'hinges') {
    if (targetField === 'client') {
      const base = type === 'doorSystems' ? baseDoorSystemFor(item) : null;
      forceAutomaticPrice(item, 'client', Number(base?.client) || Number(item.baseClient) || Number(item.client) || 0);
      return;
    }
    if (targetField === 'reseller') {
      const base = type === 'doorSystems' ? baseDoorSystemFor(item) : null;
      forceAutomaticPrice(item, 'reseller', Number(base?.reseller ?? base?.client) || Number(item.baseReseller) || Number(item.reseller ?? item.client) || 0);
      return;
    }
    recalculateSystemSummaries(type);
  } else if (type === 'extras') {
    const group = normalizeExtraGroupName(item.group);
    if (group === 'Gavetas') {
      recalculateDrawerExtras();
    } else if (comparableText(group) === comparableText(doorSystemExtraGroup)) {
      item.cost = openingSystemCostFromSupplier(item, item.supplierPrice);
      applyOpeningSystemSalePrices(item);
      syncDoorSystemExtras();
    } else if (ledKitRecipe(item)) {
      recalculateLedKits(item.group);
    } else {
      const markupMultiplier = supplierPriceMarkupMultiplier(item.group);
      if (markupMultiplier) {
        item.cost = Number(item.supplierPrice) || 0;
        if (targetField === 'client') forceAutomaticPrice(item, 'client', item.cost * markupMultiplier);
        else if (targetField === 'reseller') forceAutomaticPrice(item, 'reseller', item.cost * markupMultiplier);
        else applyAutomaticClientReseller(item, item.cost * markupMultiplier, item.cost * markupMultiplier);
      } else {
        if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(item.supplierPrice) || 0;
        if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
        if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
        if (item.baseReseller === undefined) item.baseReseller = Number(item.reseller ?? item.client) || 0;
        item.cost = calculatedCostFromSupplier(item, item.supplierPrice);
        const baseCost = Number(item.baseCost) || 0;
        const inferredClientRatio = inferredExtraAutoRatio(item, 'client');
        const inferredResellerRatio = inferredExtraAutoRatio(item, 'reseller') || inferredClientRatio;
        const clientRatio = baseCost ? (((Number(item.baseClient) || 0) / baseCost) || inferredClientRatio || 1) : (inferredClientRatio || 1);
        const resellerRatio = baseCost ? (((Number(item.baseReseller) || 0) / baseCost) || inferredResellerRatio || clientRatio) : (inferredResellerRatio || clientRatio);
        if (targetField === 'client') forceAutomaticPrice(item, 'client', item.cost * clientRatio);
        else if (targetField === 'reseller') forceAutomaticPrice(item, 'reseller', item.cost * resellerRatio);
        else applySummaryPricesFromCost(item);
      }
    }
  }
}

function calculateSupplierRow(item) {
  const prices = platePricingValues(item.supplierPrice);
  item.cost = prices.cost;
  applyAutomaticClientReseller(item, prices.client, prices.reseller);
}

function platePricingValues(supplierPrice) {
  const rules = state.pricingRules || { labor: state.plateLaborFallback ?? 2.02, clientMultiplier: 3, resellerMultiplier: 1.4 };
  const price = num(supplierPrice);
  const panelSawCostRate = customPanelSawCostPerSquareMeter();
  const plateLaborRate = panelSawCostRate === null ? Number(rules.labor ?? 2.02) : panelSawCostRate;
  const cost = price + plateLaborRate + customModuleAssemblyLaborPerSquareMeter();
  return {
    cost,
    client: cost * customPlateClientMultiplier,
    reseller: cost * customPlateResellerMultiplier
  };
}

function calculatedCostFromSupplier(item, supplierPrice) {
  const baseSupplier = Number(item.baseSupplierPrice);
  const baseCost = Number(item.baseCost ?? item.cost) || 0;
  const labor = Number.isFinite(baseSupplier) && baseSupplier > 0 ? baseCost - baseSupplier : 0;
  return Math.max(0, (Number(supplierPrice) || 0) + labor);
}

function openingSystemCostFromSupplier(item, supplierPrice) {
  const price = Number(supplierPrice) || 0;
  if (price <= 0) return 0;
  const storedLabor = Number(item.labor);
  // Um sistema sem componentes nao recebe mao de obra automaticamente.
  // A mao de obra so entra quando estiver explicitamente gravada no item.
  const labor = Number.isFinite(storedLabor) && storedLabor > 0 ? storedLabor : 0;
  return Math.max(0, price + labor);
}

function normalizeKnownDoorSystem(item) {
  return item;
}

function baseDoorSystemFor(item) {
  const key = itemIdentity(item?.name || item?.item || item?.label);
  return key ? baseDoorSystemsByName.get(key) : null;
}

function openingSystemSaleRatio(item) {
  const base = baseDoorSystemFor(item);
  const baseCost = Number(item.baseCost) || Number(base?.cost) || 0;
  const baseClient = Number(item.baseClient) || Number(base?.client) || 0;
  return baseCost && baseClient ? baseClient / baseCost : 1.7;
}

function applyOpeningSystemSalePrices(item) {
  const sale = (Number(item.cost) || 0) * openingSystemSaleRatio(item);
  applyAutomaticClientReseller(item, sale, sale);
}

function openingSystemClientRatio(item) {
  const currentCost = Number(item.cost) || 0;
  const currentClient = Number(item.client) || 0;
  if (currentCost > 0 && currentClient > 0) return currentClient / currentCost;
  return averageMetric(state.catalog?.doorSystems || [], function (system) {
    return (Number(system.client) || 0) / (Number(system.cost) || 0);
  }, 2);
}

function normalizeOpeningSystemPricing(item, resetBase) {
  if (!item) return;
  normalizeKnownDoorSystem(item);
  if (!(Number(item.supplierPrice) > 0)) return;
  item.cost = openingSystemCostFromSupplier(item, item.supplierPrice);
  applyOpeningSystemSalePrices(item);
  if (resetBase) {
    const base = baseDoorSystemFor(item);
    item.baseSupplierPrice = Number(item.supplierPrice) || 0;
    item.baseCost = Number(base?.cost) || Number(item.cost) || 0;
    item.baseClient = Number(base?.client) || Number(item.client) || 0;
    item.baseReseller = Number(base?.reseller ?? base?.client) || Number(item.reseller) || 0;
  }
}

function applySummaryPricesFromCost(item) {
  const baseCost = Number(item.baseCost) || 0;
  const clientRatio = baseCost ? (Number(item.baseClient) || 0) / baseCost : 1;
  const resellerRatio = baseCost ? (Number(item.baseReseller) || 0) / baseCost : clientRatio;
  applyAutomaticClientReseller(item, (Number(item.cost) || 0) * clientRatio, (Number(item.cost) || 0) * resellerRatio);
}

function searchTokens(value) {
  return comparableText(value)
    .replace(/(\d+)\s*MM\b/g, '$1')
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function applySupplierSearch() {
  const queryTokens = searchTokens(supplierSearchInput?.value || '');
  let totalVisible = 0;
  function matchesSearch(value) {
    if (!queryTokens.length) return true;
    const haystack = searchTokens(value).join(' ');
    return queryTokens.every(function (token) { return haystack.includes(token); });
  }
  supplierPricesGrid.querySelectorAll('.supplier-price-section').forEach(function (section) {
    const groups = section.querySelectorAll('.plate-compare-group');
    if (groups.length) {
      let visibleGroups = 0;
      groups.forEach(function (group) {
        const match = matchesSearch(group.dataset.supplierSearch || '');
        group.hidden = !match;
        if (match) {
          visibleGroups += 1;
          totalVisible += 1;
        }
      });
      const emptyGroup = section.querySelector('.supplier-empty');
      if (emptyGroup) emptyGroup.hidden = visibleGroups > 0;
      return;
    }
    let visible = 0;
    section.querySelectorAll('tbody tr[data-supplier-search]').forEach(function (row) {
      const match = matchesSearch(row.dataset.supplierSearch || '');
      row.hidden = !match;
      if (match) {
        visible += 1;
        totalVisible += 1;
      }
    });
    const empty = section.querySelector('.supplier-empty');
    if (empty) empty.hidden = visible > 0;
  });
  return totalVisible;
}

function searchSupplierPricesWithFeedback() {
  window.clearTimeout(supplierSearchTimer);
  const query = String(supplierSearchInput?.value || '').trim();
  const matches = applySupplierSearch();
  if (query && state.supplierTab === 'Madeiras / Placas' && matches === 0) {
    window.alert('Não foi encontrada nenhuma madeira ou placa com o nome "' + query + '".');
  }
}

function clearSupplierSearch() {
  if (!supplierSearchInput || !supplierSearchInput.value) return;
  supplierSearchInput.value = '';
}

function supplierAdditionsStore() {
  return {};
}

function persistSupplierAddition(type, item) {
  ensureSupplierLocalId(item);
}

function updateSupplierAddition(type, before, item) {}

function correctKnownSupplierPriceIssues() {
  const fixFlexa = function (item) {
    const text = comparableText([item?.item, item?.label, item?.name, item?.reference].join(' '));
    const compact = text.replace(/[^A-Z0-9]+/g, '');
    if (!text.includes('FLEXA') || !text.includes('TIRADOR PIEL') || !compact.includes('2270')) return false;
    if (Number(item.client) !== 20 || item.manualClient === true) return false;
    item.client = 18;
    item.manualClient = false;
    if (item.baseClient === 0 || item.baseClient === undefined || Number(item.baseClient) === 20) item.baseClient = 18;
    if (!Number(item.reseller)) item.reseller = 18;
    return true;
  };
  const fixDrawer760H = function (item) {
    const text = comparableText([item?.group, item?.item, item?.label, item?.name, item?.reference].join(' '));
    if (!text.includes('GAVETAS') || !text.includes('760H') || !text.includes('TICTAC') || !text.includes('40KG') || !text.includes('250')) return false;
    if ((Number(item.cost) || 0) <= 50 && (Number(item.client) || 0) <= 100) return false;
    item.cost = 37.16;
    item.client = 75;
    item.reseller = 75;
    item.baseCost = 37.16;
    item.baseClient = 75;
    item.baseReseller = 75;
    item.manualClient = true;
    item.manualReseller = true;
    return true;
  };
  (state.catalog?.extras || []).forEach(function (item) {
    fixFlexa(item);
    fixDrawer760H(item);
  });
}

function addUniqueListItem(listName, value) {
  if (!value) return;
  if (listName === 'extraGroups') value = normalizeExtraGroupName(value);
  if (!Array.isArray(state.lists[listName])) state.lists[listName] = [];
  if (!state.lists[listName].some(function (item) { return comparableText(item) === comparableText(value); })) {
    state.lists[listName].push(value);
  }
}

function supplierRemovalStore() {
  return {};
}

function supplierRemovalKey(type, item) {
  if (item?.catalogId) return type + '|ID|' + item.catalogId;
  if (item?.__supplierLocalId) return type + '|LOCAL|' + item.__supplierLocalId;
  const nameValue = item?.name || item?.item || item?.label;
  const parent = ['paintingComponents', 'drawerComponents', 'hingeComponents', 'openingSystemComponents'].includes(type)
    ? (item?.parentId || item?.usedIn || item?.family)
    : '';
  return [
    type,
    normalizeExtraGroupName(item?.group),
    cleanDuplicatedSupplierName(nameValue, item?.reference),
    parent,
    item?.supplier,
    item?.reference
  ].map(function (value) { return comparableText(value); }).filter(Boolean).join('|');
}

function cleanDuplicatedSupplierName(name, reference) {
  let value = cleanDisplayText(name);
  const ref = cleanDisplayText(reference);
  if (ref && comparableText(value).startsWith(comparableText(ref))) {
    value = value.slice(ref.length).trim() || value;
  }
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(' ');
    const right = words.slice(half).join(' ');
    if (comparableText(left) === comparableText(right)) value = left;
  }
  return value;
}

function isBadHingeSummary(item) {
  const text = comparableText([item?.name, item?.item, item?.label, item?.reference].join(' '));
  return text.includes('CORRED') || text.includes('GAVETAS ROUPEIRO');
}

const wardrobeBlumRunnerName = 'Corrediças BLUM gavetas roupeiro 760H TICTAC 40KG*250';
const wardrobeBlumRunnerLegacyNames = [
  'Corrediças BLUM gavetas roupeiro',
  'Corredicas BLUM gavetas roupeiro'
];
const drawer561ParentName = 'Corrediças BLUM gavetas roupeiro 561HT TIC-TAC 30KG*435';
const drawer561SyncComponentName = 'TIP-ON BLUM TANDEM HT EIXO SINCRON 1140M';
function isLegacyWardrobeBlumRunnerName(value) {
  const text = comparableText(value);
  const compact = text.replace(/[^A-Z0-9]+/g, '');
  return wardrobeBlumRunnerLegacyNames.some(function (name) {
    return comparableText(name) === text;
  }) || (compact.includes('CORRED') && compact.includes('BLUM') && compact.includes('GAVETAS') && compact.includes('ROUPEIRO') && compact.includes('760H') && compact.includes('40KG') && compact.includes('250'));
}

function normalizeKnownDrawerComponentName(item) {
  if (!item) return false;
  let changed = false;
  ['name', 'item', 'label', 'reference', 'usedIn', 'family'].forEach(function (field) {
    if (isLegacyWardrobeBlumRunnerName(item[field])) {
      item[field] = wardrobeBlumRunnerName;
      changed = true;
    }
  });
  const parentText = comparableText([item.usedIn, item.family].join(' '));
  const itemText = comparableText([item.name, item.item, item.label, item.reference].join(' '));
  if (parentText.includes('561HT') && (itemText.includes('EIXO SINCRON') || itemText.includes('1140'))) {
    ['name', 'item', 'label', 'reference'].forEach(function (field) {
      if (item[field] !== undefined && item[field] !== drawer561SyncComponentName) {
        item[field] = drawer561SyncComponentName;
        changed = true;
      }
    });
  }
  return changed;
}

function isMistakenDrawerBoxCapComponent(item) {
  if (!item) return false;
  const itemText = comparableText(item.name || item.item || item.label || item.reference);
  const parentText = comparableText([item.usedIn, item.family].join(' '));
  return itemText === 'BOX CAP' && parentText.includes('561HT');
}

function isDuplicateDrawer760HComponent(item) {
  if (!item) return false;
  const itemText = comparableText(item.name || item.item || item.label || item.reference);
  const parentText = comparableText([item.usedIn, item.family].join(' '));
  return parentText.includes('760H') && parentText.includes('TICTAC') &&
    itemText.includes('760H') && itemText.includes('TIC-TAC') && itemText.includes('ESQ');
}

function normalizeKnownDrawerData() {
  if (!state.catalog) return;
  state.catalog.drawerComponents = (state.catalog.drawerComponents || []).filter(function (item) {
    return !isMistakenDrawerBoxCapComponent(item) && !isDuplicateDrawer760HComponent(item);
  });
}

function dedupeSupplierItems(type, items) {
  if (!Array.isArray(items)) return items || [];
  const seen = new Map();
  return items.filter(function (item) {
    if (type === 'drawerComponents' || type === 'extras') normalizeKnownDrawerComponentName(item);
    if (type === 'hinges' && isBadHingeSummary(item)) return false;
    const cleanedName = cleanDuplicatedSupplierName(item?.name || item?.item || item?.label, item?.reference);
    if (cleanedName && !item.catalogId) {
      if (item.name) item.name = cleanedName;
      if (item.item && comparableText(item.item) !== comparableText(item.reference)) item.item = cleanedName;
      if (item.label && comparableText(item.label) !== comparableText(item.reference)) item.label = cleanedName;
    }
    const key = supplierRemovalKey(type, item);
    if (!key) return true;
    const existing = seen.get(key);
    if (existing) {
      // New rows with the same reference are separate supplier options. Do
      // not let the latest one replace an earlier local addition.
      if (item?.userAdded === true || existing?.userAdded === true) return true;
      Object.assign(existing, clone(item));
      return false;
    }
    seen.set(key, item);
    return true;
  });
}

function dedupeSupplierStores() {
  state.supplierPrices = dedupeSupplierItems('plates', state.supplierPrices);
  if (!state.catalog) return;
  state.catalog.plates = dedupeSupplierItems('plates', state.catalog.plates);
  state.catalog.paintings = dedupeSupplierItems('paintings', state.catalog.paintings);
  state.catalog.paintingComponents = dedupeSupplierItems('paintingComponents', state.catalog.paintingComponents);
  state.catalog.edges = dedupeSupplierItems('edges', state.catalog.edges);
  state.catalog.doorSystems = dedupeSupplierItems('doorSystems', state.catalog.doorSystems);
  markDoorSystemDuplicates();
  state.catalog.openingSystemComponents = dedupeSupplierItems('openingSystemComponents', state.catalog.openingSystemComponents);
  state.catalog.hinges = dedupeSupplierItems('hinges', state.catalog.hinges);
  state.catalog.hingeComponents = dedupeSupplierItems('hingeComponents', state.catalog.hingeComponents);
  state.catalog.drawerComponents = dedupeSupplierItems('drawerComponents', state.catalog.drawerComponents);
  state.catalog.extras = dedupeSupplierItems('extras', state.catalog.extras);
  normalizeKnownDrawerData();
}

function normalizeExtraGroupName(group) {
  const original = cleanDisplayText(group).replace(/\s+/g, ' ').trim();
  const text = comparableText(original);
  if (!text) return '';
  if (text === comparableText(legacyDoorSystemExtraGroup) || text === comparableText(doorSystemExtraGroup)) return doorSystemExtraGroup;
  if (text === comparableText(wardrobeDrawerGroup)) return wardrobeDrawerGroup;
  if (text === comparableText(otherExtraGroup)) return otherExtraGroup;
  if (text === comparableText(transportExtraGroup) || (text.includes('TRANSPORTE') && text.includes('EMBAL'))) return transportExtraGroup;
  if (text.includes('ACESS') && text.includes('COZINHA')) return 'Acessórios Cozinha';
  if (text.includes('ACESS') && text.includes('ROUPEIRO')) return 'Acessórios Roupeiro';
  if (text === 'RODAPES (METROS)' || text === 'RODAPES' || text.includes('RODAP')) return 'Rodapés (metros)';
  if (text === 'LEDS (METROS)' || text === "LED'S (METROS)" || text.includes('LED')) return "LED'S (metros)";
  if (text === 'CESTOS DO LIXO') return 'Cestos do Lixo';
  if (text === 'PUXADORES') return 'Puxadores';
  if (text === 'TOMADAS') return 'Tomadas';
  if (text === 'GAVETAS') return 'Gavetas';
  if (text === comparableText(manualExtraGroup)) return manualExtraGroup;
  if (text.includes('PES') && text.includes('FIXACAO') && text.includes('ORGANIZACAO')) return 'Pés, Fixação e Organização';
  return original;
}

function normalizeExtraGroupsState() {
  if (state.catalog?.extras) {
    state.catalog.extras.forEach(function (item) {
      item.group = normalizeExtraGroupName(item.group);
    });
  }
  if (!state.lists) return;
  const seen = new Set();
  state.lists.extraGroups = (state.lists.extraGroups || [])
    .concat((state.catalog?.extras || []).map(function (item) { return item.group; }))
    .concat([])
    .map(normalizeExtraGroupName)
    .filter(Boolean)
    .filter(function (group) {
      const key = comparableText(group);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isSupplierRemoved(type, item) {
  const store = supplierRemovalStore();
  return Array.isArray(store[type]) && store[type].includes(supplierRemovalKey(type, item));
}

function persistSupplierRemoval(type, item) {
  // Removals are persisted in Supabase by the delete endpoint.
}

function clearSupplierRemoval(type, item) {
  // No local deletion cache.
}

function applySupplierRemovals() {
  state.supplierPrices = (state.supplierPrices || []).filter(function (item) { return !isSupplierRemoved('plates', item); });
  if (state.catalog?.plates) state.catalog.plates = state.catalog.plates.filter(function (item) { return !isSupplierRemoved('plates', item); });
  if (state.catalog?.paintings) state.catalog.paintings = state.catalog.paintings.filter(function (item) { return !isSupplierRemoved('paintings', item); });
  if (state.catalog?.paintingComponents) state.catalog.paintingComponents = state.catalog.paintingComponents.filter(function (item) { return !isSupplierRemoved('paintingComponents', item); });
  if (state.catalog?.edges) state.catalog.edges = state.catalog.edges.filter(function (item) { return !isSupplierRemoved('edges', item); });
  if (state.catalog?.doorSystems) state.catalog.doorSystems = state.catalog.doorSystems.filter(function (item) { return !isSupplierRemoved('doorSystems', item); });
  if (state.catalog?.openingSystemComponents) state.catalog.openingSystemComponents = state.catalog.openingSystemComponents.filter(function (item) { return !isSupplierRemoved('openingSystemComponents', item); });
  if (state.catalog?.hinges) state.catalog.hinges = state.catalog.hinges.filter(function (item) { return !isSupplierRemoved('hinges', item); });
  if (state.catalog?.hingeComponents) state.catalog.hingeComponents = state.catalog.hingeComponents.filter(function (item) { return !isSupplierRemoved('hingeComponents', item); });
  if (state.catalog?.drawerComponents) state.catalog.drawerComponents = state.catalog.drawerComponents.filter(function (item) { return !isSupplierRemoved('drawerComponents', item); });
  if (state.catalog?.extras) state.catalog.extras = state.catalog.extras.filter(function (item) { return !isSupplierRemoved('extras', item); });
  if (state.lists) {
    state.lists.sistemasPorta = activeDoorSystems().filter(function (item) { return !item.rejected; }).map(function (item) { return item.name; });
    state.lists.dobradicas = (state.catalog?.hinges || []).map(function (item) { return item.name; });
    state.lists.orlas = (state.catalog?.edges || []).map(function (item) { return item.name; });
    state.lists.extraGroups = Array.from(new Set((state.catalog?.extras || []).map(function (item) { item.group = normalizeExtraGroupName(item.group); return item.group; }).filter(Boolean)));
  }
}

function supplierListByType(type) {
  if (type === 'plates') return state.supplierPrices || [];
  if (type === 'paintings') return state.catalog.paintings || [];
  if (type === 'paintingComponents') return state.catalog.paintingComponents || [];
  if (type === 'edges') return state.catalog.edges || [];
  if (type === 'doorSystems') return state.catalog.doorSystems || [];
  if (type === 'openingSystemComponents') return state.catalog.openingSystemComponents || [];
  if (type === 'hinges') return state.catalog.hinges || [];
  if (type === 'hingeComponents') return state.catalog.hingeComponents || [];
  if (type === 'drawerComponents') return state.catalog.drawerComponents || [];
  if (type === 'extras') return state.catalog.extras || [];
  return [];
}

async function deleteSupplierItem(type, index) {
  const list = supplierListByType(type);
  const item = list[Number(index)];
  if (!item) return;
  const label = item.name || item.item || item.label || 'este item';
  if (!window.confirm('Tens a certeza que pretendes eliminar "' + label + '" da lista?')) return;
  sourceStatus.textContent = 'A eliminar item no catálogo...';
  if (!item.catalogId) {
    // A linha ainda não existe na base de dados. Remove apenas esta instância
    // local; nunca envies só a referência, porque pode haver outras iguais.
    const localKey = supplierRemovalKey(type, item);
    if (type === 'plates') {
      state.supplierPrices = (state.supplierPrices || []).filter(function (candidate) { return supplierRemovalKey(type, candidate) !== localKey; });
      if (state.catalog?.plates) state.catalog.plates = state.catalog.plates.filter(function (candidate) { return supplierRemovalKey(type, candidate) !== localKey; });
    } else if (type === 'doorSystems') {
      state.catalog.doorSystems = (state.catalog.doorSystems || []).filter(function (candidate) { return supplierRemovalKey(type, candidate) !== localKey; });
    } else if (type === 'extras' && normalizeExtraGroupName(item.group) === doorSystemExtraGroup) {
      state.catalog.extras = (state.catalog.extras || []).filter(function (candidate) { return candidate !== item; });
      state.catalog.doorSystems = (state.catalog.doorSystems || []).filter(function (candidate) {
        return itemIdentity(candidate.name || candidate.item || candidate.label) !== itemIdentity(item.item || item.name || item.label);
      });
    } else if (Array.isArray(state.catalog[type])) {
      const localIndex = state.catalog[type].indexOf(item);
      if (localIndex >= 0) state.catalog[type].splice(localIndex, 1);
      else list.splice(Number(index), 1);
    }
    applySupplierRemovals();
    if (type === 'openingSystemComponents') recalculateSystemSummaries('doorSystems');
    if (type === 'hingeComponents') recalculateSystemSummaries('hinges');
    if (type === 'drawerComponents') recalculateDrawerExtras();
    if (type === 'extras' || type === 'doorSystems' || type === 'openingSystemComponents') syncDoorSystemExtras();
    renderSupplierPrices();
    calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
    sourceStatus.textContent = 'Item eliminado da lista local';
    return;
  }
  const response = await fetch('/api/supplier-prices/item', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: type, index: Number(index), catalogId: item.catalogId, reference: item.reference || item.name || item.item || item.label })
  });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Não foi possível eliminar o item.');
  applySupplierCatalogResponse(data);
  const bootstrapResponse = await fetch('/api/bootstrap');
  if (bootstrapResponse.ok) {
    const fresh = await readJson(bootstrapResponse, {});
    state.catalog = fresh.catalog;
    state.lists = fresh.lists;
    state.typePresets = fresh.typePresets;
    ensureRoupeiroModuleType();
  }
  persistSupplierRemoval(type, item);
  if (type === 'plates') {
    persistSupplierRemoval('plates', item);
    state.supplierPrices = (state.supplierPrices || []).filter(function (candidate) {
      return supplierRemovalKey('plates', candidate) !== supplierRemovalKey('plates', item);
    });
    if (state.catalog?.plates) state.catalog.plates = state.catalog.plates.filter(function (candidate) {
      return supplierRemovalKey('plates', candidate) !== supplierRemovalKey('plates', item);
    });
  } else if (type === 'extras' && normalizeExtraGroupName(item.group) === doorSystemExtraGroup) {
    const system = (state.catalog.doorSystems || []).find(function (candidate) {
      return itemIdentity(candidate.name || candidate.item || candidate.label) === itemIdentity(item.item || item.name || item.label);
    });
    if (system) persistSupplierRemoval('doorSystems', system);
    list.splice(Number(index), 1);
    state.catalog.doorSystems = (state.catalog.doorSystems || []).filter(function (candidate) {
      return itemIdentity(candidate.name || candidate.item || candidate.label) !== itemIdentity(item.item || item.name || item.label);
    });
  } else {
    list.splice(Number(index), 1);
  }
  applySupplierRemovals();
  if (type === 'openingSystemComponents') recalculateSystemSummaries('doorSystems');
  if (type === 'hingeComponents') recalculateSystemSummaries('hinges');
  if (type === 'drawerComponents') recalculateDrawerExtras();
  if (type === 'extras' || type === 'doorSystems' || type === 'openingSystemComponents') syncDoorSystemExtras();
  renderSupplierPrices();
  calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
  sourceStatus.textContent = 'Item eliminado da base de dados';
}

function supplierDeleteButton(type, index) {
  return '<button class="supplier-delete-button" type="button" data-delete-supplier-type="' + attrEsc(type) + '" data-delete-supplier-index="' + attrEsc(index) + '" title="Eliminar">X</button>';
}

function syncDoorSystemExtras() {
  if (!state.catalog || !Array.isArray(state.catalog.extras)) return;
  markDoorSystemDuplicates();
  cleanRejectedDoorSystems();
  state.catalog.extras = state.catalog.extras.filter(function (item) {
    return normalizeExtraGroupName(item.group) !== doorSystemExtraGroup && item.systemExtra !== true;
  });
  activeDoorSystems().forEach(function (system) {
    state.catalog.extras.push({
      group: doorSystemExtraGroup,
      item: system.name,
      label: system.name,
      supplier: system.supplier || '',
      reference: system.reference || '',
      supplierPrice: Number(system.supplierPrice) || 0,
      cost: Number(system.cost) || 0,
      client: Number(system.client) || 0,
      reseller: Number(system.reseller || system.client) || 0,
      baseSupplierPrice: Number(system.baseSupplierPrice) || 0,
      baseCost: Number(system.baseCost) || 0,
      baseClient: Number(system.baseClient) || 0,
      baseReseller: Number(system.baseReseller) || 0,
      manualSupplierPrice: system.manualSupplierPrice === true,
      manualClient: system.manualClient === true,
      manualReseller: system.manualReseller === true,
      userAdded: true,
      systemExtra: true
    });
  });
  if (activeDoorSystems().length) addUniqueListItem('extraGroups', doorSystemExtraGroup);
  else if (state.lists) state.lists.extraGroups = (state.lists.extraGroups || []).filter(function (group) {
    return normalizeExtraGroupName(group) !== doorSystemExtraGroup;
  });
}

function activeDoorSystems() {
  return (state.catalog?.doorSystems || []).filter(function (item) { return item && !item.duplicateOf && !item.rejected; });
}

function markDoorSystemDuplicates() {
  if (!Array.isArray(state.catalog?.doorSystems)) return;
  const seen = new Map();
  state.catalog.doorSystems.forEach(function (item) {
    if (!item) return;
    delete item.duplicateOf;
    const key = itemIdentity(item.name || item.item || item.label);
    if (!key) return;
    const existing = seen.get(key);
    if (existing) item.duplicateOf = existing.catalogId || key;
    else seen.set(key, item);
  });
  if (state.lists) state.lists.sistemasPorta = activeDoorSystems().map(function (item) { return item.name; });
}

function rejectedDoorSystemName(value) {
  return false;
}

function cleanRejectedDoorSystems() {
  if (!Array.isArray(state.catalog.doorSystems)) return;
  state.catalog.doorSystems.forEach(function (item) {
    if (rejectedDoorSystemName(item.name)) item.rejected = true;
  });
  state.lists.sistemasPorta = activeDoorSystems().filter(function (item) { return !item.rejected; }).map(function (item) { return item.name; });
}

function upsertCatalogItem(list, item, nameField) {
  if (!Array.isArray(list) || !item) return;
  const field = nameField || 'name';
  const target = list.find(function (candidate) {
    return itemIdentity(candidate[field] || candidate.item || candidate.name) === itemIdentity(item[field] || item.item || item.name) &&
      comparableText(candidate.supplier) === comparableText(item.supplier);
  });
  if (target) {
    Object.assign(target, clone(item), { userAdded: target.userAdded || item.userAdded });
  } else {
    list.push(clone(item));
  }
}

function upsertDoorSystemItem(item) {
  if (!Array.isArray(state.catalog.doorSystems) || !item) return;
  const wanted = itemIdentity(item.name || item.item || item.label);
  const target = activeDoorSystems().find(function (candidate) {
    return itemIdentity(candidate.name || candidate.item || candidate.label) === wanted;
  });
  if (target) {
    Object.assign(target, clone(item), { userAdded: target.userAdded || item.userAdded });
  } else {
    state.catalog.doorSystems.push(clone(item));
  }
}

function cleanupDoorSystemDuplicates() {
  markDoorSystemDuplicates();
}

function itemExists(items, field, name, group) {
  const wanted = comparableText(name);
  return (items || []).some(function (item) {
    if (group !== undefined && normalizeExtraGroupName(item.group) !== normalizeExtraGroupName(group)) return false;
    return comparableText(item[field]) === wanted;
  });
}

function itemIdentity(value) {
  return comparableText(value)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(\d+)\s*MM\b/g, '$1MM')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function canonicalDoorSystemBase(value) {
  return null;
  const text = comparableText(value);
  if ((text.includes('TIP ON') || text.includes('TIP-ON')) && (text.includes('PULSADOR') || text.includes('TIC TAC') || text.includes('P/PORTAS PRETO'))) {
    return {
      name: 'Tip-on (Pulsador Preto) / Tic-Tac',
      item: 'Tip-on (Pulsador Preto) / Tic-Tac',
      label: 'Tip-on (Pulsador Preto) / Tic-Tac',
      supplier: 'CASFERIM',
      reference: '1x TIP-ON P/PORTAS PRETO (CASFERIM)',
      supplierPrice: 2.25,
      cost: 4.54,
      client: 8,
      reseller: 8
    };
  }
  if (text.includes('AVENTOS HK TOP')) {
    return {
      name: 'Aventos HK Top (standard)',
      item: 'Aventos HK Top (standard)',
      label: 'Aventos HK Top (standard)',
      supplier: 'CASFERIM',
      reference: '1x AVENTOS HK TOP ACUMULADOR FORÇAS FR=1730-5200 (CASFERIM) 1x KIT CAPAS HK TOP CINZA CLARO (CASFERIM) 1x KIT FIXADOR PORTA P/AVENTOS (CASFERIM)',
      supplierPrice: 44.10,
      cost: 51.76,
      client: 95,
      reseller: 95
    };
  }
  if (text.includes('AVENTOS HL TOP')) {
    return {
      name: 'Aventos HL Top (elevador vertical)',
      item: 'Aventos HL Top (elevador vertical)',
      label: 'Aventos HL Top (elevador vertical)',
      supplier: 'LAGE & SA',
      reference: '1x ACUMULADOR AVENTOS HL TOP 22L25 390 X 580 (KIT) (LAGE & SÁ)',
      supplierPrice: 104.66,
      cost: 112.33,
      client: 235,
      reseller: 235
    };
  }
  if (text.includes('MICRO') && text.includes('ONDAS')) {
    return {
      name: 'Avento Porta Micro-ondas Kessebohmer',
      item: 'Avento Porta Micro-ondas Kessebohmer',
      label: 'Avento Porta Micro-ondas Kessebohmer',
      supplier: 'LAGE & SA',
      reference: '1x FERRAGEM MICRO-ONDAS KESSEBOHMER FREE SLIDE M060 (LAGE & SÁ)',
      supplierPrice: 78.65,
      cost: 88.23,
      client: 155,
      reseller: 155
    };
  }
  if (text.includes('AVENTOS HK XS') || text.includes('AVENTOS HK-XS')) {
    return {
      name: 'Aventos HK-XS',
      item: 'Aventos HK-XS',
      label: 'Aventos HK-XS',
      supplier: 'LAGE & SA',
      reference: '1x ACUMULADOR AVENTOS HK-XS 20K1501 (LAGE & SÁ) 1x FIXADOR FRONTAL AVENTOS HK-XS 20K4101 (LAGE & SÁ) 1x FIXADOR LATERAL AVENTOS HK-XS 20K5101 (LAGE & SÁ)',
      supplierPrice: 8.60,
      cost: 16.27,
      client: 50,
      reseller: 50
    };
  }
  if (text === 'NORMAL') {
    return {
      name: 'Normal',
      item: 'Normal',
      label: 'Normal',
      supplier: '',
      reference: 'Normal',
      supplierPrice: 0,
      cost: 0,
      client: 0,
      reseller: 0
    };
  }
  return null;
}

function plateReferenceIdentity(value) {
  return normalizePlateAliasText(value)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(\d+(?:[,.]\d+)?)\s*MM\b/g, function (_, size) {
      return size.replace(',', '.') + 'MM';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePlateAliasText(value) {
  let text = comparableText(value)
    .replace(/\bTOUCH\b/g, 'TC')
    .replace(/\bBRILHO\b/g, 'BRI')
    .replace(/\bEXTRA[\s-]+MATE\b/g, 'EXT')
    .replace(/\bDONAE\b/g, 'SONAE')
    .replace(/\bDO\s*-\s*/g, 'SONAE ');
  if ((text.includes('CINZA ESCURO') || text.includes('SONAE')) && /\bF167\b/.test(text)) {
    text = text.replace(/\bF167\b/g, 'L167');
  }
  return text;
}

function plateCodeThicknessKeyFromText(value) {
  const text = normalizePlateAliasText(value)
    .replace(/\|/g, ' ')
    // Supplier references use both centimetres (1.6CM) and millimetres
    // (16mm). Treat them as the same thickness when grouping market options.
    .replace(/\b(\d+(?:[,.]\d+)?)\s*CM\b/g, function (_, centimetres) {
      const millimetres = Number(String(centimetres).replace(',', '.')) * 10;
      return Number.isFinite(millimetres) ? String(Number(millimetres.toFixed(4))) + 'MM' : _;
    });
  if (text.includes('LUNAWOOD') && /\b212\b/.test(text) && /\b3000\s*MM\b/.test(text)) return '212|3000';
  const thicknessMatch = text.match(/\b(\d+(?:[,.]\d+)?)\s*MM\b/) || text.match(/(?:^|\s|-)(\d+(?:[,.]\d+)?)\s*$/);
  if (!thicknessMatch) return '';
  const thickness = thicknessMatch[1].replace(',', '.');
  if (text.includes('CONTRAPLACADO') && text.includes('WBP')) return 'CONTRAPLACADO WBP|' + thickness;
  if (text.includes('MDF') && /HIDR[OI]FUG/.test(text)) return 'MDF HIDROFUGO|' + thickness;
  if (text.includes('MDF') && text.includes('STANDARD')) return 'MDF STANDARD|' + thickness;
  const knownCode = knownPlateCodeFromText(text);
  const codeMatch = text.match(/\b([A-Z]{1,4}\d{2,5}|\d{3,5})\b(?:\s+(ST\d+|SC|TL|BRI|GLOSS|FUN|FA|FH|TC|SILK|EXT))?/);
  if (!codeMatch && !knownCode) return '';
  const rawCode = codeMatch && codeMatch[2] && (!knownCode || knownCode.split(' ')[0] === codeMatch[1])
    ? codeMatch[1] + ' ' + codeMatch[2]
    : knownCode || (codeMatch[1] + (codeMatch[2] ? ' ' + codeMatch[2] : ''));
  const code = canonicalPlateCode(rawCode);
  if (/^\d+$/.test(code) && !officialPlateNames[code]) return '';
  if (code === 'RAL9003') return '';
  return code + '|' + thickness;
}

function canonicalPlateCode(code) {
  const normalized = comparableText(code);
  if (normalized === 'F067') return 'F067 SC';
  return code;
}

function plateCodeThicknessKey(item) {
  return plateCodeThicknessKeyFromText(item?.reference) ||
    plateCodeThicknessKeyFromText(item?.name) ||
    plateCodeThicknessKeyFromText([item?.name, item?.reference].join(' '));
}

const officialPlateNames = {
  G029: 'G029 POLYREY CINZA PRATA',
  G075: 'G075 POLYREY CINZA CENDRE',
  N005: 'N005 POLYREY PRETO',
  C182: 'C182 POLYREY CHEN ADRIEN',
  P001: 'P001 POLYREY CASTANHO PIERRE DE LUNE',
  '0080 FH': '0080 FH NEGRO',
  '0085 FH': '0085 FH BRANCO',
  C202: 'C202 POLYREY CHENE ZERMATT',
  'F6012 TL': 'F6012 TL SONAE BROWN TWIST',
  'B3768 SC': 'B3768 SC SONAE PRIME WHITE',
  'L167 TL': 'L167 TL SONAE CINZA ESCURO',
  'F755 TL': 'F755 TL SONAE AGADIR LINHO',
  'W1200 ST9': 'W1200 ST9 EGGER BRANCO PORCELANA',
  'H1384 ST40': 'H1384 ST40 EGGER CASTANHO CASELLA',
  'F067 SC': 'F067 SC SONAE CINZA ALUMINIO',
  'H1386 ST40': 'H1386 ST40 EGGER CARVALHO CASTANHO',
  'H3395 ST12': 'H3395 ST12 EGGER CARVALHO NATURAL',
  'U156 ST9': 'U156 ST9 EGGER BEGE ROSADO',
  'U999 ST7': 'U999 ST7 EGGER PRETO',
  'U705 ST9': 'U705 ST9 EGGER CINZA ANGORA',
  'H3368 ST9': 'H3368 ST9 EGGER CARVALHO NATURAL',
  'H1316 ST17': 'H1316 ST17 EGGER CARVALHO BOOKMATCH',
  'L166 SC': 'L166 SC SONAE CINZA CLARO',
  'W1000 ST9': 'W1000 ST9 EGGER BRANCO PREMIUM',
  'H3146 ST19': 'H3146 ST19 EGGER CARVALHO LORENZO',
  'B116 BRI': 'B116 BRI POLYREY BEGE NATUR',
  'U608 ST9': 'U608 ST9 EGGER VERDE OPALA',
  'L3031 SC': 'L3031 SC SONAE PRETO',
  'U702 ST9': 'U702 ST9 EGGER CINZA CAXEMIRA',
  'U999 ST19': 'U999 ST19 EGGER PRETO',
  'H1357 ST10': 'H1357 ST10 EGGER CARVALHO CINZA BEGE',
  'H1715 ST12': 'H1715 ST12 EGGER NOGUEIRA PARONA',
  'U750 ST9': 'U750 ST9 EGGER CINZA RATO',
  'U707 ST9': 'U707 ST9 EGGER SEDA CINZA',
  'M6341 FUN': 'M6341 FUN SONAE ITALIEN ECHO',
  'D091 GLOSS': 'D091 GLOSS BRANCO BRILHO',
  'H1714 ST19': 'H1714 ST19 EGGER NOGUEIRA LINCOLN',
  'U775 ST9': 'U775 ST9 EGGER CINZA BRUMA',
  F067: 'F067 SC SONAE CINZA ALUMINIO',
  F755: 'F755 TL SONAE AGADIR LINHO',
  L167: 'L167 TL SONAE CINZA ESCURO',
  B116: 'B116 POLYREY BEGE NATUR',
  B3768: 'B3768 SC SONAE PRIME WHITE',
  L166: 'L166 SC SONAE CINZA CLARO',
  U999: 'U999 EGGER PRETO',
  W1200: 'W1200 ST9 EGGER BRANCO PORCELANA',
  H1384: 'H1384 ST40 EGGER CASTANHO CASELLA',
  H1386: 'H1386 ST40 EGGER CARVALHO CASTANHO',
  H3395: 'H3395 ST12 EGGER CARVALHO NATURAL',
  U156: 'U156 ST9 EGGER BEGE ROSADO',
  U705: 'U705 ST9 EGGER CINZA ANGORA',
  H3368: 'H3368 ST9 EGGER CARVALHO NATURAL',
  H1316: 'H1316 ST17 EGGER CARVALHO BOOKMATCH',
  W1000: 'W1000 ST9 EGGER BRANCO PREMIUM',
  H3146: 'H3146 ST19 EGGER CARVALHO LORENZO',
  U608: 'U608 ST9 EGGER VERDE OPALA',
  L3031: 'L3031 SC SONAE PRETO',
  U702: 'U702 ST9 EGGER CINZA CAXEMIRA',
  H1357: 'H1357 ST10 EGGER CARVALHO CINZA BEGE',
  H1715: 'H1715 ST12 EGGER NOGUEIRA PARONA',
  U750: 'U750 ST9 EGGER CINZA RATO',
  U707: 'U707 ST9 EGGER SEDA CINZA',
  M6341: 'M6341 FUN SONAE ITALIEN ECHO',
  D091: 'D091 GLOSS BRANCO BRILHO',
  H1714: 'H1714 ST19 EGGER NOGUEIRA LINCOLN',
  U775: 'U775 ST9 EGGER CINZA BRUMA',
  B030: 'B030 BRANCO',
  B117: 'B117 BRANCO ACETINADO',
  M2112: 'M2112 MADEIRAS',
  B070: 'B070 MEGEVE BRANCO',
  M100: 'M100 CASTANHO MOSCADO',
  P114: 'P114 CINZA',
  '0026 FH': '0026 FH CINZA',
  '0074 FH': '0074 FH CINZA',
  G003: 'G003 CINZA CLARO',
  1084: '1084 CINZA MEDIO',
  'CONTRAPLACADO WBP': 'Contraplacado WBP'
  ,
  'MDF HIDROFUGO': 'MDF Hidrófugo',
  'MDF STANDARD': 'MDF Cru Standard'
};

const officialPlateFullNames = {
  '212|3000': 'LUNAWOOD ST 212ºC TRIPLE SHAD - 3000mm (32*140)'
};

function knownPlateCodeFromText(text) {
  const normalized = comparableText(text);
  if (!knownPlateCodesCache) knownPlateCodesCache = Object.keys(officialPlateNames).sort(function (a, b) { return b.length - a.length; });
  return knownPlateCodesCache.find(function (code) {
    return new RegExp('(^|\\s|-)'+ escapeRegExp(comparableText(code)) + '(\\s|-|$)').test(normalized);
  }) || '';
}

function plateOfficialNameFromKey(key) {
  if (!key) return '';
  const parts = key.split('|');
  const code = parts[0];
  const baseCode = code.split(' ')[0];
  let officialName = officialPlateNames[code] || officialPlateNames[baseCode];
  if (officialName && !officialPlateNames[code]) {
    officialName = officialName.replace(new RegExp('^' + escapeRegExp(baseCode) + '(?:\\s+(?:ST\\d+|SC|TL|BRI|GLOSS|FUN|FA|FH|TC|SILK|EXT))?\\b'), code);
  }
  return officialName ? expandPlateFinishName(officialName) + ' - ' + parts[1] + 'mm' : '';
}

function expandPlateFinishName(value) {
  return String(value || '').replace(/\b(TC|BRI|EXT)\b/gi, function (finish) {
    return { TC: 'Touch', BRI: 'Brilho', EXT: 'Extra Mate' }[finish.toUpperCase()];
  });
}

function plateGroupLabel(item) {
  const key = plateCodeThicknessKey(item);
  if (!key) return expandPlateFinishName(cleanMaterialName(item?.name || item?.reference || ''));
  if (officialPlateFullNames[key]) return officialPlateFullNames[key];
  const officialName = plateOfficialNameFromKey(key);
  if (officialName) return officialName;
  const parts = key.split('|');
  const codeLabels = {
    F067: 'Cinza',
    B030: 'branco',
    F755: 'cinza linho agadir',
    B117: 'branco acetinado',
    M2112: 'madeiras',
    L167: 'cinza escuro',
    B116: 'bege natur',
    B070: 'MegÃ¨ve Branco',
    M100: 'castanho moscado',
    P114: 'Cinza',
    '0026': 'Cinza',
    G003: 'cinza claro',
    '1084': 'cinza medio'
  };
  const code = parts[0];
  const baseCode = code.split(' ')[0];
  const knownName = bestKnownPlateNameForKey(key);
  if (knownName) return expandPlateFinishName(knownName);
  return expandPlateFinishName(code + (codeLabels[baseCode] ? ' ' + codeLabels[baseCode] : '') + ' - ' + parts[1] + 'mm');
}

function canonicalPlateNameFromReference(value) {
  const key = plateCodeThicknessKeyFromText(value);
  if (!key) return cleanMaterialName(value);
  if (officialPlateFullNames[key]) return officialPlateFullNames[key];
  const officialName = plateOfficialNameFromKey(key);
  if (officialName) return officialName;
  const fromText = descriptivePlateNameFromText(value, key);
  if (fromText) return fromText;
  const knownName = bestKnownPlateNameForKey(key);
  if (knownName) return knownName;
  const parts = key.split('|');
  return parts[0] + ' - ' + parts[1] + 'mm';
}

function descriptivePlateNameFromText(value, key) {
  const text = cleanDisplayText(value).replace(/\s+/g, ' ').trim();
  if (!text || !key) return '';
  const parts = key.split('|');
  const code = parts[0];
  const thickness = parts[1];
  const baseCode = code.split(' ')[0];
  const codePattern = new RegExp('\\b' + escapeRegExp(baseCode) + '\\b', 'i');
  const match = text.match(codePattern);
  if (!match) return '';
  let name = text.slice(match.index).trim();
  name = name
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' - ')
    .replace(new RegExp('\\s*-?\\s*' + escapeRegExp(thickness) + '\\s*mm\\b.*$', 'i'), '')
    .replace(/\s*[-–—]\s*$/g, '')
    .trim();
  if (!name || comparableText(name) === comparableText(baseCode) || comparableText(name) === comparableText(code)) return '';
  if (!comparableText(name).includes(comparableText(baseCode))) return '';
  if (name.split(/\s+/).length < 3) return '';
  return name + ' - ' + thickness + 'mm';
}

function bestKnownPlateNameForKey(key) {
  if (!plateKnownNameCache) {
    plateKnownNameCache = new Map();
    const lists = (state.supplierPrices || []).concat(state.catalog?.plates || []);
    lists.forEach(function (item) {
      const itemKey = plateCodeThicknessKey(item);
      if (!itemKey) return;
      [item.name, item.reference].forEach(function (value) {
        const candidate = descriptivePlateNameFromText(value, itemKey);
        if (!candidate) return;
        const current = plateKnownNameCache.get(itemKey) || '';
        if (!current || candidate.length > current.length) plateKnownNameCache.set(itemKey, candidate);
      });
    });
  }
  return plateKnownNameCache.get(key) || '';
}

function normalizePlateItemName(item) {
  if (!item) return item;
  // Only supply a missing legacy name. Names and supplier references are independent.
  if (item.name === undefined || item.name === null) {
    item.name = canonicalPlateNameFromReference(item.reference || '');
  }
  return item;
}

function basePlateGroupKey(item) {
  return item && item.comparisonKey ? item.comparisonKey : itemIdentity(item?.name || item);
}

function duplicatePlateReferenceKeys() {
  if (plateDuplicateReferenceKeysCache) return plateDuplicateReferenceKeysCache;
  const refs = new Map();
  (state.catalog.plates || []).concat(state.supplierPrices || []).forEach(function (item) {
    const referenceKey = plateReferenceIdentity(item.reference);
    if (!referenceKey || referenceKey === '-' || referenceKey.length < 8) return;
    if (!refs.has(referenceKey)) refs.set(referenceKey, new Set());
    refs.get(referenceKey).add(basePlateGroupKey(item));
  });
  const duplicates = new Set();
  refs.forEach(function (groups, referenceKey) {
    if (groups.size > 1) duplicates.add(referenceKey);
  });
  plateDuplicateReferenceKeysCache = duplicates;
  return duplicates;
}

function plateGroupKey(item) {
  // The catalogue name is the user's explicit grouping choice. Supplier
  // references, codes and thicknesses are descriptive only and must never
  // move an entry to another group.
  const itemName = item?.name || item?.item || item?.label || '';
  if (String(itemName).trim()) return 'NAME|' + comparableText(itemName);
  if (item && item.compareGroupKey) return item.compareGroupKey;
  if (item && item.compareGroup) return 'MANUAL|' + comparableText(item.compareGroup);
  const codeThicknessKey = plateCodeThicknessKey(item);
  if (codeThicknessKey) {
    // A referência, o acabamento e a espessura identificam cada variante.
    return 'CODE|' + codeThicknessKey;
  }
  const referenceKey = plateReferenceIdentity(item?.reference);
  if (referenceKey && duplicatePlateReferenceKeys().has(referenceKey)) return 'REF|' + referenceKey;
  return basePlateGroupKey(item);
}

function itemSupplierExists(items, field, name, supplier, group, type, parentName) {
  const wanted = itemIdentity(name);
  const wantedSupplier = comparableText(supplier);
  return (items || []).some(function (item) {
    if (type && isSupplierRemoved(type, item)) return false;
    if (group !== undefined && normalizeExtraGroupName(item.group) !== normalizeExtraGroupName(group)) return false;
    if ((type === 'openingSystemComponents' || type === 'hingeComponents') && parentName && comparableText(item.usedIn || item.family) !== comparableText(parentName)) return false;
    if (itemIdentity(item[field]) === wanted && comparableText(item.supplier) === wantedSupplier) return true;
    if ((normalizeExtraGroupName(group) === 'Gavetas' || normalizeExtraGroupName(item.group) === 'Gavetas') && isLegacyWardrobeBlumRunnerName(name)) {
      return [item[field], item.item, item.label, item.reference].some(isLegacyWardrobeBlumRunnerName) &&
        (wantedSupplier ? comparableText(item.supplier) === wantedSupplier : true);
    }
    return false;
  });
}

function plateOptionKey(item) {
  return [
    plateGroupKey(item),
    comparableText(item.supplier),
    comparableText(item.reference),
    supplierNumber(item.supplierPrice)
  ].join('|');
}

function plateMarketOptionKey(item) {
  return comparableText(item.supplier || '');
}

function plateBestOptionKey(item) {
  return [
    plateGroupKey(item),
    comparableText(item.supplier),
    plateReferenceIdentity(item.reference) || itemIdentity(item.reference || item.name),
    supplierNumber(item.supplierPrice)
  ].join('|');
}

function plateCompareGroupName(item) {
  // The catalogue name is user-managed and must be shown exactly as entered.
  // Canonical labels are only a fallback for legacy rows without a name.
  const originalName = item?.name || item?.item || item?.label || '';
  if (String(originalName).trim()) return originalName;
  return item?.compareGroup || plateGroupLabel(item) || '';
}

function dedupePlateMarketEntries(entries) {
  if (entries.some(function (entry) { return entry.item.catalogId; })) return entries;
  const bestBySupplier = new Map();
  entries.forEach(function (entry) {
    const key = plateMarketOptionKey(entry.item);
    const current = bestBySupplier.get(key);
    const currentPrice = current ? Number(current.item.supplierPrice) || Infinity : Infinity;
    const entryPrice = Number(entry.item.supplierPrice) || Infinity;
    if (!current || entryPrice < currentPrice) bestBySupplier.set(key, entry);
  });
  return Array.from(bestBySupplier.values());
}

function dedupePlateOptions() {
  const seen = new Set();
  state.supplierPrices = (state.supplierPrices || []).filter(function (item) {
    const key = item.catalogId || plateOptionKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const catalogSeen = new Set();
  state.catalog.plates = (state.catalog.plates || []).filter(function (item) {
    const key = item.catalogId || plateOptionKey(item);
    if (catalogSeen.has(key)) return false;
    catalogSeen.add(key);
    return true;
  });
}

function warnDuplicateItem(name) {
  const message = 'O item "' + name + '" já existe.';
  sourceStatus.textContent = message;
  window.alert(message);
}

function applySupplierAdditions() {
  normalizeExtraGroupsState();
  cleanRejectedDoorSystems();
  dedupeSupplierStores();
  dedupePlateOptions();
  return;
  const store = supplierAdditionsStore();
  let cleanedStore = false;
  normalizeExtraGroupsState();
  if (Array.isArray(store.drawerComponents)) {
    store.drawerComponents.forEach(function (item) {
      if (normalizeKnownDrawerComponentName(item)) cleanedStore = true;
    });
    const nextDrawerComponents = store.drawerComponents.filter(function (item) {
      return !isMistakenDrawerBoxCapComponent(item);
    });
    cleanedStore = cleanedStore || nextDrawerComponents.length !== store.drawerComponents.length;
    store.drawerComponents = nextDrawerComponents;
    store.drawerComponents = dedupeSupplierItems('drawerComponents', store.drawerComponents);
  }
  if (Array.isArray(store.doorSystems)) {
    const nextDoorSystems = store.doorSystems.filter(function (item) {
      const key = itemIdentity(item.name || item.item || item.label);
      return !rejectedDoorSystemName(item.name) && !baseDoorSystemsByName.has(key);
    });
    cleanedStore = cleanedStore || nextDoorSystems.length !== store.doorSystems.length;
    store.doorSystems = nextDoorSystems;
  }
  if (Array.isArray(store.extras)) {
    store.extras.forEach(function (item) {
      if (normalizeKnownDrawerComponentName(item)) cleanedStore = true;
    });
    const nextExtras = store.extras.filter(function (item) {
      const key = itemIdentity(item.item || item.name || item.label);
      return !(normalizeExtraGroupName(item.group) === doorSystemExtraGroup && (rejectedDoorSystemName(item.item || item.name || item.label) || baseDoorSystemsByName.has(key)));
    });
    cleanedStore = cleanedStore || nextExtras.length !== store.extras.length;
    store.extras = dedupeSupplierItems('extras', nextExtras);
    cleanedStore = cleanedStore || store.extras.length !== nextExtras.length;
  }
  if (Array.isArray(store.hinges)) {
    const nextHinges = store.hinges.filter(function (item) { return !isBadHingeSummary(item); });
    cleanedStore = cleanedStore || nextHinges.length !== store.hinges.length;
    store.hinges = dedupeSupplierItems('hinges', nextHinges);
  }
  (store.plates || []).forEach(function (item) {
    if (item.catalogId) return; // Saved catalogue rows come from the server, not old local additions.
    item.userAdded = true;
    normalizePlateItemName(item);
    if (!itemSupplierExists(state.supplierPrices, 'name', item.name, item.supplier)) state.supplierPrices.push(clone(item));
    if (!itemSupplierExists(state.catalog.plates, 'name', item.name, item.supplier)) state.catalog.plates.push(clone(item));
    addUniqueListItem('interiores', item.name);
    addUniqueListItem('exteriores', item.name);
  });
  (store.paintings || []).forEach(function (item) {
    item.userAdded = true;
    if (itemExists(state.catalog.paintings, 'name', item.name)) return;
    state.catalog.paintings.push(clone(item));
    addUniqueListItem('pinturas', item.name);
  });
  (store.paintingComponents || []).forEach(function (item) {
    item.userAdded = true;
    if (itemSupplierExists(state.catalog.paintingComponents, 'item', item.item, item.supplier)) return;
    state.catalog.paintingComponents.push(clone(item));
  });
  (store.edges || []).forEach(function (item) {
    item.userAdded = true;
    if (itemSupplierExists(state.catalog.edges, 'name', item.name, item.supplier)) return;
    state.catalog.edges.push(clone(item));
    addUniqueListItem('orlas', item.name);
  });
  (store.doorSystems || []).forEach(function (item) {
    item.userAdded = true;
    normalizeOpeningSystemPricing(item, true);
    upsertDoorSystemItem(item);
    addUniqueListItem('sistemasPorta', item.name);
  });
  (store.hinges || []).forEach(function (item) {
    item.userAdded = true;
    if (itemSupplierExists(state.catalog.hinges, 'name', item.name, item.supplier)) return;
    state.catalog.hinges.push(clone(item));
    addUniqueListItem('dobradicas', item.name);
  });
  (store.extras || []).forEach(function (item) {
    item.userAdded = true;
    item.group = normalizeExtraGroupName(item.group);
    if (normalizeExtraGroupName(item.group) === doorSystemExtraGroup) {
      const system = {
        name: item.item || item.name || item.label,
        supplier: item.supplier || '',
        reference: item.reference || item.item || item.name || '',
        supplierPrice: Number(item.supplierPrice) || 0,
        cost: Number(item.cost) || 0,
        client: Number(item.client) || 0,
        reseller: Number(item.reseller ?? item.client) || 0,
        userAdded: true
      };
      normalizeOpeningSystemPricing(system, true);
      upsertDoorSystemItem(system);
      addUniqueListItem('sistemasPorta', system.name);
      return;
    }
    if (itemSupplierExists(state.catalog.extras, 'item', item.item, item.supplier, item.group)) return;
    state.catalog.extras.push(clone(item));
    addUniqueListItem('extraGroups', item.group);
  });
  normalizeExtraGroupsState();
  cleanRejectedDoorSystems();
  dedupeSupplierStores();
  dedupePlateOptions();
}

function findSupplierDraftTarget(list, item, nameField) {
  if (item.catalogId) return list.find(function (candidate) { return candidate.catalogId === item.catalogId; });
  const draftIndex = Number(item.__dirtyIndex);
  if (Number.isInteger(draftIndex) && draftIndex >= 0 && list[draftIndex]) return list[draftIndex];
  const wantedName = comparableText(item[nameField] || item.name || item.item);
  const wantedSupplier = comparableText(item.supplier);
  const wantedReference = comparableText(item.reference);
  return list.find(function (candidate) {
    const sameName = comparableText(candidate[nameField] || candidate.name || candidate.item) === wantedName;
    const sameSupplier = !wantedSupplier || comparableText(candidate.supplier) === wantedSupplier;
    const sameReference = !wantedReference || comparableText(candidate.reference) === wantedReference;
    return sameName && sameSupplier && sameReference;
  });
}

function mergeSupplierDraftList(list, items, nameField) {
  if (!Array.isArray(list) || !Array.isArray(items)) return;
  items.forEach(function (item) {
    if (item && item.__delete === true) {
      const deleteIndex = item.catalogId ? list.findIndex(function (candidate) { return candidate.catalogId === item.catalogId; }) : Number(item.__dirtyIndex);
      if (Number.isInteger(deleteIndex) && deleteIndex >= 0 && deleteIndex < list.length) list.splice(deleteIndex, 1);
      return;
    }
    const copy = clone(item);
    normalizeKnownDrawerComponentName(copy);
    if (nameField === 'name') normalizePlateItemName(copy);
    const target = findSupplierDraftTarget(list, copy, nameField);
    if (target) {
      Object.assign(target, copy);
    } else if (!copy.catalogId) {
      list.push(copy);
    }
  });
}

function applySupplierDraftChanges() {
  return;
  const draft = supplierDraftStore();
  (draft.extras || []).forEach(function (item) { item.group = normalizeExtraGroupName(item.group); });
  if (Array.isArray(draft.hinges)) {
    draft.hinges = dedupeSupplierItems('hinges', draft.hinges);
  }
  mergeSupplierDraftList(state.supplierPrices, draft.plates, 'name');
  mergeSupplierDraftList(state.catalog.plates, draft.plates, 'name');
  mergeSupplierDraftList(state.catalog.paintings, draft.paintings, 'name');
  mergeSupplierDraftList(state.catalog.paintingComponents, draft.paintingComponents, 'item');
  mergeSupplierDraftList(state.catalog.edges, draft.edges, 'name');
  mergeSupplierDraftList(state.catalog.extras, draft.extras, 'item');
  mergeSupplierDraftList(state.catalog.drawerComponents, draft.drawerComponents, 'item');
  mergeSupplierDraftList(state.catalog.hinges, draft.hinges, 'name');
  mergeSupplierDraftList(state.catalog.hingeComponents, draft.hingeComponents, 'item');
  (draft.hinges || []).forEach(function (item) {
    addUniqueListItem('dobradicas', item.name || item.item || item.label);
  });
  (draft.paintings || []).forEach(function (item) {
    addUniqueListItem('pinturas', item.name || item.item || item.label);
  });
  mergeSupplierDraftList(state.catalog.openingSystemComponents, (draft.openingSystemComponents || []).filter(function (item) {
    return !item.userAddedSummary && !rejectedDoorSystemName(item.item || item.name || item.label);
  }), 'item');
  (draft.openingSystemComponents || []).filter(function (item) {
    return item.userAddedSummary && !rejectedDoorSystemName(item.item || item.name || item.label);
  }).forEach(function (item) {
    const system = {
      name: item.name || item.item || item.label,
      item: item.name || item.item || item.label,
      label: item.name || item.item || item.label,
      supplier: item.supplier || '',
      reference: item.reference || item.name || item.item || '',
      supplierPrice: Number(item.supplierPrice) || 0,
      cost: Number(item.cost) || 0,
      client: Number(item.client) || 0,
      reseller: Number(item.reseller ?? item.client) || 0,
      manualSupplierPrice: item.manualSupplierPrice === true,
      manualClient: item.manualClient === true,
      manualReseller: item.manualReseller === true,
      userAdded: item.userAdded === true,
      userAddedSummary: true
    };
    normalizeOpeningSystemPricing(system, true);
    upsertDoorSystemItem(system);
  });
  (draft.extras || []).filter(function (item) {
    return normalizeExtraGroupName(item.group) === doorSystemExtraGroup && !rejectedDoorSystemName(item.item || item.name || item.label);
  }).forEach(function (item) {
    const system = {
      name: item.name || item.item || item.label,
      item: item.name || item.item || item.label,
      label: item.name || item.item || item.label,
      supplier: item.supplier || '',
      reference: item.reference || item.name || item.item || '',
      supplierPrice: Number(item.supplierPrice) || 0,
      cost: Number(item.cost) || 0,
      client: Number(item.client) || 0,
      reseller: Number(item.reseller ?? item.client) || 0,
      manualSupplierPrice: item.manualSupplierPrice === true,
      manualClient: item.manualClient === true,
      manualReseller: item.manualReseller === true,
      userAdded: item.userAdded === true
    };
    normalizeOpeningSystemPricing(system, true);
    upsertDoorSystemItem(system);
  });
  cleanRejectedDoorSystems();
  cleanupDoorSystemDuplicates();
  dedupeSupplierStores();
  if (restoreSupplierDirtyChanges()) markSupplierPricesDirty();
}

function applySupplierPayloadChanges(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.laborPrices && typeof payload.laborPrices === 'object') {
    if (Number.isFinite(Number(payload.laborPrices.plates))) state.plateLaborFallback = Math.max(0, Number(payload.laborPrices.plates));
    state.pricingRules = Object.assign({}, state.pricingRules || {}, {
      labor: Number(payload.laborPrices.plates) || 0,
      edgeLabor: Number(payload.laborPrices.edges) || 0,
      drawerLabor: Number(payload.laborPrices.drawers) || 0
    });
  }
  const activeItems = function (items) { return (items || []).filter(function (item) { return item && item.__delete !== true; }); };
  activeItems(payload.extras).forEach(function (item) { item.group = normalizeExtraGroupName(item.group); });
  mergeSupplierDraftList(state.supplierPrices, activeItems(payload.plates), 'name');
  mergeSupplierDraftList(state.catalog.plates, activeItems(payload.plates), 'name');
  mergeSupplierDraftList(state.catalog.paintings, activeItems(payload.paintings), 'name');
  mergeSupplierDraftList(state.catalog.paintingComponents, activeItems(payload.paintingComponents), 'item');
  mergeSupplierDraftList(state.catalog.edges, activeItems(payload.edges), 'name');
  mergeSupplierDraftList(state.catalog.extras, activeItems(payload.extras), 'item');
  mergeSupplierDraftList(state.catalog.drawerComponents, activeItems(payload.drawerComponents), 'item');
  mergeSupplierDraftList(state.catalog.hinges, activeItems(payload.hinges), 'name');
  mergeSupplierDraftList(state.catalog.hingeComponents, activeItems(payload.hingeComponents), 'item');
  mergeSupplierDraftList(state.catalog.openingSystemComponents, activeItems(payload.openingSystemComponents).filter(function (item) {
    return !item.userAddedSummary;
  }), 'item');
  mergeSupplierDraftList(state.catalog.doorSystems, activeItems(payload.openingSystemComponents).filter(function (item) {
    return item.userAddedSummary === true;
  }).map(function (item) {
    return {
      name: item.name || item.item || item.label,
      item: item.name || item.item || item.label,
      label: item.name || item.item || item.label,
      supplier: item.supplier || '',
      reference: item.reference || item.name || item.item || '',
      supplierPrice: Number(item.supplierPrice) || 0,
      cost: Number(item.cost) || 0,
      client: Number(item.client) || 0,
      reseller: Number(item.reseller ?? item.client) || 0,
      manualSupplierPrice: item.manualSupplierPrice === true,
      manualClient: item.manualClient === true,
      manualReseller: item.manualReseller === true,
      userAdded: item.userAdded === true,
      userAddedSummary: true
    };
  }), 'name');
  dedupeSupplierStores();
  recalculateCustomCostPrices();
}

function normalizeAllPlateNames() {
  plateKnownNameCache = null;
  (state.supplierPrices || []).forEach(normalizePlateItemName);
  (state.catalog.plates || []).forEach(normalizePlateItemName);
  const names = bestPlateNames();
  if (names.length) {
    state.lists.interiores = names;
    state.lists.exteriores = names;
    (state.modules || []).forEach(function (module) {
      module.interior = canonicalModulePlateSelection(module.interior);
      module.exterior = canonicalModulePlateSelection(module.exterior);
    });
  }
  syncDoorSystemExtras();
}

function runSupplierRecalculation(needsPlateRefresh) {
  if (needsPlateRefresh) {
    normalizeAllPlateNames();
    refreshPlateComparatorBestRows();
  }
  renderModules();
  calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
}

function scheduleSupplierRecalculation(needsPlateRefresh) {
  supplierRecalculationNeedsPlateRefresh = supplierRecalculationNeedsPlateRefresh || !!needsPlateRefresh;
  if (supplierRecalculationTimer) clearTimeout(supplierRecalculationTimer);
  supplierRecalculationTimer = setTimeout(function () {
    const refreshPlates = supplierRecalculationNeedsPlateRefresh;
    supplierRecalculationTimer = null;
    supplierRecalculationNeedsPlateRefresh = false;
    runSupplierRecalculation(refreshPlates);
  }, 350);
}

function supplierItemsForTab(tab) {
  tab = normalizeExtraGroupName(tab) || tab;
  if (tab === 'Madeiras / Placas') return state.supplierPrices || [];
  if (tab === 'Pinturas') return (state.catalog.paintings || []).concat(state.catalog.paintingComponents || []);
  if (tab === 'Orlas') return state.catalog.edges || [];
  if (tab === 'Sistemas de abertura') return activeDoorSystems();
  if (tab === doorSystemExtraGroup) return activeDoorSystems();
  if (tab === 'Dobradicas / Ferragens') return state.catalog.hinges || [];
  return (state.catalog.extras || []).filter(function (item) { return normalizeExtraGroupName(item.group) === tab; });
}

function bestSupplierPriceGroups() {
  const groups = new Map();
  (state.supplierPrices || []).forEach(function (item) {
    const key = plateGroupKey(item);
    const current = groups.get(key);
    const currentPrice = current ? Number(current.supplierPrice) || Infinity : Infinity;
    const itemPrice = Number(item.supplierPrice) || Infinity;
    if (!current || itemPrice < currentPrice) groups.set(key, item);
  });
  return groups;
}

function bestSupplierPriceSummary() {
  return Array.from(bestSupplierPriceGroups().values()).sort(function (a, b) {
    return String(plateCompareGroupName(a)).localeCompare(
      String(plateCompareGroupName(b)),
      'pt',
      { sensitivity: 'base', numeric: true }
    );
  });
}

function bestSupplierPrices() {
  return bestSupplierPriceSummary().map(function (item) {
    const normalized = normalizePlateItemName(clone(item));
    if (normalized.userAdded || normalized.paintable === undefined) normalized.paintable = true;
    return normalized;
  });
}

function bestPlateNames() {
  const seen = new Set();
  return bestSupplierPrices()
    .map(function (item) { return item.name; })
    .filter(function (name) {
      const key = comparableText(name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(function (a, b) { return a.localeCompare(b, 'pt-PT', { numeric: true, sensitivity: 'base' }); });
}

function canonicalModulePlateSelection(value) {
  const currentKey = plateCodeThicknessKeyFromText(value);
  if (!currentKey) return value;
  const best = bestSupplierPrices().find(function (item) {
    return plateCodeThicknessKey(item) === currentKey;
  });
  return best ? best.name : canonicalPlateNameFromReference(value);
}

function averageMetric(items, getter, fallback) {
  const values = (items || []).map(getter).filter(function (value) { return Number.isFinite(value) && value > 0; });
  return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : fallback;
}

function salePriceValue(value) {
  const number = Number(value) || 0;
  return number > 0 ? number : 0;
}

function roundSaleFields(item) {
  if (!item) return item;
  if ('client' in item) item.client = salePriceValue(item.client);
  if ('reseller' in item) item.reseller = salePriceValue(item.reseller ?? item.client);
  return item;
}

function normalizeCatalogSalePrices() {
  (state.supplierPrices || []).forEach(roundSaleFields);
  if (!state.catalog) return;
  [
    state.catalog.plates,
    state.catalog.paintings,
    state.catalog.doorSystems,
    state.catalog.hinges,
    state.catalog.extras
  ].forEach(function (items) {
    (items || []).forEach(roundSaleFields);
  });
}

function supplierPriceMarkupMultiplier(group) {
  const normalized = normalizeExtraGroupName(group);
  if (normalized === 'Acessórios Cozinha') return 1.8;
  if (normalized === otherExtraGroup) return 1.7;
  return null;
}

function pricingFromClosestExistingItem(tab, supplierPrice) {
  const price = num(supplierPrice);
  const candidates = supplierItemsForTab(tab)
    .filter(function (item) {
      return Number(item.supplierPrice) > 0 && Number(item.cost) > 0 && Number(item.client) > 0;
    })
    .sort(function (a, b) {
      return Math.abs((Number(a.supplierPrice) || 0) - price) - Math.abs((Number(b.supplierPrice) || 0) - price);
    });
  if (!candidates.length) return null;
  const closest = candidates[0];
  const closestSupplier = Number(closest.supplierPrice) || 0;
  const closestCost = Number(closest.cost) || closestSupplier;
  const labor = Math.max(0, closestCost - closestSupplier);
  const cost = price + labor;
  const clientRatio = closestCost ? (Number(closest.client) || 0) / closestCost : 1.7;
  const resellerRatio = closestCost ? (Number(closest.reseller || closest.client) || 0) / closestCost : clientRatio;
  return {
    supplierPrice: price,
    cost,
    client: salePriceValue(cost * clientRatio),
    reseller: salePriceValue(cost * resellerRatio)
  };
}

function newItemPricing(tab, supplierPrice, options) {
  const price = num(supplierPrice);
  options = options || {};
  if (tab === 'Madeiras / Placas') {
    const item = { supplierPrice: price };
    calculateSupplierRow(item);
    item.client = salePriceValue(item.client);
    item.reseller = salePriceValue(item.reseller);
    return item;
  }
  const markupMultiplier = supplierPriceMarkupMultiplier(tab);
  if (markupMultiplier) {
    const sale = salePriceValue(price * markupMultiplier);
    return { supplierPrice: price, cost: price, client: sale, reseller: sale };
  }
  if (tab === 'Orlas') {
    const meters = Number(options.supplierMeters) || 1000;
    const materialPerMeter = meters ? price / meters : 0;
    const cost = materialPerMeter + Number(state.pricingRules?.edgeLabor ?? 0.32);
    const sale = roundMeterPrice(cost * 3.5);
    return { supplierPrice: price, cost, client: sale, reseller: sale, materialPerMeter, supplierMeters: meters };
  }
  if (tab === 'Pinturas') {
    const items = supplierItemsForTab(tab);
    const cost = price * 1.08;
    const ratio = averageMetric(items, function (item) { return (Number(item.client) || 0) / (Number(item.cost) || 0); }, 2.5);
    const sale = salePriceValue(cost * ratio);
    return { supplierPrice: price, cost, client: sale, reseller: sale };
  }
  if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) {
    const cost = openingSystemCostFromSupplier({}, price);
    const sale = salePriceValue(cost * 1.7);
    return { supplierPrice: price, cost, client: sale, reseller: sale };
  }
  const closestPricing = pricingFromClosestExistingItem(tab, price);
  if (closestPricing) return closestPricing;
  const items = supplierItemsForTab(tab);
  const laborItems = items.filter(function (item) { return Number(item.supplierPrice) > 0; });
  const labor = averageMetric(laborItems, function (item) { return (Number(item.cost) || 0) - (Number(item.supplierPrice) || 0); }, 0);
  const ratio = averageMetric(items, function (item) { return (Number(item.client) || 0) / (Number(item.cost) || 0); }, 2.5);
  const cost = price + labor;
  const sale = salePriceValue(cost * ratio);
  return { supplierPrice: price, cost, client: sale, reseller: sale };
}

function supplierNamesForTab(tab) {
  const names = new Map();
  supplierItemsForTab(tab).forEach(function (item) {
    const key = comparableText(item.supplier);
    if (!key) return;
    names.set(key, supplierDisplayName(names.get(key), item.supplier));
  });
  return Array.from(names.values()).sort(function (a, b) { return comparableText(a).localeCompare(comparableText(b)); });
}

function supplierComponentConfig(tab) {
  if (tab === 'Pinturas') {
    return {
      componentType: 'paintingComponents',
      principalType: 'paintings',
      principals: (state.catalog.paintings || []).filter(function (item) { return item.name !== 'Nenhuma'; }).map(function (item) { return item.name; })
    };
  }
  if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) {
    return {
      componentType: 'openingSystemComponents',
      principalType: 'doorSystems',
      principals: activeDoorSystems().map(function (item) { return item.name; })
    };
  }
  if (tab === 'Dobradicas / Ferragens') {
    return {
      componentType: 'hingeComponents',
      principalType: 'hinges',
      principals: (state.catalog.hinges || []).map(function (item) { return item.name; })
    };
  }
  if (tab === 'Gavetas') {
    return {
      componentType: 'drawerComponents',
      principalType: 'extras',
      principals: (state.catalog.extras || []).filter(function (item) { return normalizeExtraGroupName(item.group) === 'Gavetas'; }).map(function (item) { return item.item; })
    };
  }
  return null;
}

function supplierAddModeHtml(config) {
  if (!config) return '';
  return '<label><span>Tipo de item</span><select data-new-item-field="itemMode">' +
    '<option value="principal">Principal</option>' +
    '<option value="component">Componente</option>' +
  '</select></label>' +
  '<label data-component-parent-field hidden><span>Componente de</span><select data-new-item-field="componentParent">' +
    optionListWithBlank(config.principals || [], '') +
  '</select></label>';
}

function newItemMode() {
  return supplierPricesGrid.querySelector('[data-new-item-field="itemMode"]')?.value || 'principal';
}

function newItemParentName() {
  return String(supplierPricesGrid.querySelector('[data-new-item-field="componentParent"]')?.value || '').trim();
}

function updateSupplierAddModeFields() {
  const componentMode = newItemMode() === 'component';
  const hasComponentConfig = !!supplierComponentConfig(state.supplierTab);
  supplierPricesGrid.querySelectorAll('[data-component-parent-field]').forEach(function (field) {
    field.hidden = !componentMode;
    field.querySelectorAll('select, input').forEach(function (input) { input.disabled = !componentMode; });
  });
  supplierPricesGrid.querySelectorAll('[data-new-item-field="supplierPrice"]').forEach(function (input) {
    if (!hasComponentConfig) return;
    const principalPriceAllowed = normalizeExtraGroupName(state.supplierTab) === 'Gavetas';
    const blockPrincipalPrice = !componentMode && !principalPriceAllowed;
    input.disabled = blockPrincipalPrice;
    input.classList.toggle('input-locked', blockPrincipalPrice);
    if (blockPrincipalPrice) input.value = '';
    const label = input.closest('label');
    if (label) label.classList.toggle('supplier-field-disabled', blockPrincipalPrice);
  });
  supplierPricesGrid.querySelectorAll('[data-new-item-client-preview], [data-new-item-reseller-preview]').forEach(function (element) {
    const previewBox = element.closest('.supplier-add-preview');
    if (previewBox) previewBox.hidden = false;
  });
  supplierPricesGrid.querySelectorAll('[data-paint-quantity-field]').forEach(function (field) {
    field.hidden = state.supplierTab === 'Pinturas' && !componentMode;
    field.querySelectorAll('input').forEach(function (input) { input.disabled = state.supplierTab === 'Pinturas' && !componentMode; });
  });
}

function supplierAddFormHtml() {
  const suppliers = supplierNamesForTab(state.supplierTab);
  const componentConfig = supplierComponentConfig(state.supplierTab);
  if (state.supplierTab === 'Madeiras / Placas') {
    return '<div class="supplier-add-row supplier-add-row-plate">' +
      '<label><span>Destino da madeira</span><select data-new-item-field="plateItemMode"><option value="existing">Associar a um item existente</option><option value="new">Criar um novo item</option></select></label>' +
      '<label data-plate-existing-item><span>Item</span><input data-new-item-field="plateParent" list="plateParentOptions" autocomplete="off" placeholder="Escrever e escolher item"><datalist id="plateParentOptions">' + plateParentOptions().map(function (entry) { return '<option value="' + attrEsc(entry.label) + '"></option>'; }).join('') + '</datalist></label>' +
      '<label data-plate-new-item hidden><span>Nome do novo item</span><input data-new-item-field="name" autocomplete="off" placeholder="Nome do item" disabled></label>' +
      '<label><span>Refer&ecirc;ncia da madeira</span><input data-new-item-field="reference" autocomplete="off" placeholder="Refer&ecirc;ncia do fornecedor"></label>' +
      '<label><span>Fornecedor</span><input data-new-item-field="supplier" name="silwood_supplier" autocomplete="new-password" autocapitalize="off" spellcheck="false" list="supplierNameOptions" placeholder="Escolher fornecedor"></label>' +
      '<datalist id="supplierNameOptions">' + suppliers.map(function (supplier) { return '<option value="' + esc(supplier) + '"></option>'; }).join('') + '</datalist>' +
      '<label><span>Tipo de pre&ccedil;o</span><select data-new-item-field="platePriceMode"><option value="m2">Valor por m&sup2;</option><option value="sheet">Valor da placa</option></select></label>' +
      '<label><span>Pre&ccedil;o fornecedor / m&sup2;</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="supplierPrice" placeholder="0,00"></label>' +
      '<label data-plate-sheet-field hidden><span>Largura placa (mm)</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="sheetWidth" placeholder="2500"></label>' +
      '<label data-plate-sheet-field hidden><span>Altura placa (mm)</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="sheetHeight" placeholder="1250"></label>' +
      '<label data-plate-sheet-field hidden><span>Pre&ccedil;o da placa</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="sheetPrice" placeholder="0,00"></label>' +
      '<div class="supplier-add-preview" data-plate-sheet-field hidden><span>Fornecedor / m&sup2;</span><strong data-new-item-sheet-preview>0,00 EUR</strong></div>' +
      '<div class="supplier-add-preview"><span>Pre&ccedil;o cliente</span><strong data-new-item-client-preview>0,00 EUR</strong></div>' +
      '<div class="supplier-add-preview"><span>Pre&ccedil;o revendedor</span><strong data-new-item-reseller-preview>0,00 EUR</strong></div>' +
      '<button type="button" data-add-supplier-item>Adicionar</button>' +
    '</div>';
  }
  if (state.supplierTab === 'Pinturas') {
    return '<div class="supplier-add-row supplier-add-row-painting">' +
      supplierAddModeHtml(componentConfig) +
      '<label><span>Item</span><input data-new-item-field="name" name="silwood_paint_item" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Nome do item"></label>' +
      '<label><span>Fornecedor</span><input data-new-item-field="supplier" name="silwood_paint_supplier" autocomplete="new-password" autocapitalize="off" spellcheck="false" list="supplierNameOptions" placeholder="Escolher fornecedor"></label>' +
      '<datalist id="supplierNameOptions">' + suppliers.map(function (supplier) { return '<option value="' + esc(supplier) + '"></option>'; }).join('') + '</datalist>' +
      '<label><span>Refer&ecirc;ncia</span><input data-new-item-field="reference" name="silwood_paint_reference" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Nome / refer&ecirc;ncia do componente"></label>' +
      '<label data-paint-quantity-field><span>Qtd. comprada (L)</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="quantity" placeholder="0"></label>' +
      '<label><span>Pre&ccedil;o fornecedor</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="supplierPrice" placeholder="0,00"></label>' +
      '<strong data-new-item-client-preview hidden>0,00 EUR</strong>' +
      '<strong data-new-item-reseller-preview hidden>0,00 EUR</strong>' +
      '<button type="button" data-add-supplier-item>Adicionar</button>' +
    '</div>';
  }
  if (state.supplierTab === 'Orlas') {
    return '<div class="supplier-add-row supplier-add-row-edge">' +
      '<label><span>Item</span><input data-new-item-field="name" name="silwood_edge_item" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Nome da orla"></label>' +
      '<label><span>Fornecedor</span><input data-new-item-field="supplier" name="silwood_edge_supplier" autocomplete="new-password" autocapitalize="off" spellcheck="false" list="supplierNameOptions" placeholder="Escolher fornecedor"></label>' +
      '<datalist id="supplierNameOptions">' + suppliers.map(function (supplier) { return '<option value="' + esc(supplier) + '"></option>'; }).join('') + '</datalist>' +
      '<label><span>Pre&ccedil;o fornecedor / rolo</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="supplierPrice" placeholder="0,00"></label>' +
      '<label><span>Metros comprados</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="supplierMeters" placeholder="1000"></label>' +
      '<div class="supplier-add-preview"><span>Custo / ml</span><strong data-new-item-cost-preview>0,00 EUR/ml</strong></div>' +
      '<div class="supplier-add-preview"><span>Pre&ccedil;o cliente / ml</span><strong data-new-item-client-preview>0,00 EUR/ml</strong></div>' +
      '<button type="button" data-add-supplier-item>Adicionar</button>' +
    '</div>';
  }
  const isOtherTab = normalizeExtraGroupName(state.supplierTab) === otherExtraGroup;
  return '<div class="supplier-add-row">' +
    supplierAddModeHtml(componentConfig) +
    (normalizeExtraGroupName(state.supplierTab) === 'Puxadores' ? '<label><span>Preco por</span><select data-new-item-field="priceUnit"><option value="unit">Unidade</option><option value="cm">Centimetro (cm)</option></select></label>' : '') +
    (['Puxadores', otherExtraGroup, 'Gavetas'].includes(normalizeExtraGroupName(state.supplierTab)) ? '<label><span>Utilizacao</span><select data-new-item-field="handleUse"><option value="">Escolher</option><option value="cozinha">Cozinha</option><option value="roupeiro">Roupeiro</option>' + (['Puxadores', otherExtraGroup].includes(normalizeExtraGroupName(state.supplierTab)) ? '<option value="ambos">Os 2</option>' : '') + '</select></label>' : '') +
    '<label><span>Item / referencia</span><input data-new-item-field="name" name="silwood_extra_item_reference" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="Referencia do item"></label>' +
    '<label><span>Fornecedor</span><input data-new-item-field="supplier" name="silwood_extra_supplier" autocomplete="new-password" autocapitalize="off" spellcheck="false" list="supplierNameOptions" placeholder="Escolher fornecedor"></label>' +
    '<datalist id="supplierNameOptions">' + suppliers.map(function (supplier) { return '<option value="' + esc(supplier) + '"></option>'; }).join('') + '</datalist>' +
    '<label><span>Preco fornecedor</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="supplierPrice" placeholder="0,00"></label>' +
    '<div class="supplier-add-preview"><span>Preco cliente</span><strong data-new-item-client-preview>0,00 EUR</strong></div>' +
    (isOtherTab
      ? '<label><span>Preco revendedor</span><input type="text" inputmode="decimal" autocomplete="off" data-new-item-field="resellerPrice" placeholder="Automatico"></label>'
      : '<div class="supplier-add-preview"><span>Preco revendedor</span><strong data-new-item-reseller-preview>0,00 EUR</strong></div>') +
    '<button type="button" data-add-supplier-item>Adicionar</button>' +
  '</div>';
}

function refreshNewItemPreview() {
  const priceInput = supplierPricesGrid.querySelector('[data-new-item-field="supplierPrice"]');
  const costPreview = supplierPricesGrid.querySelector('[data-new-item-cost-preview]');
  const clientPreview = supplierPricesGrid.querySelector('[data-new-item-client-preview]');
  const resellerPreview = supplierPricesGrid.querySelector('[data-new-item-reseller-preview]');
  if (!clientPreview || !priceInput) return;
  updatePlateSheetFields();
  updateSupplierAddModeFields();
  if (supplierComponentConfig(state.supplierTab) && newItemMode() !== 'component' && normalizeExtraGroupName(state.supplierTab) !== 'Gavetas') {
    if (costPreview) costPreview.textContent = money(0);
    clientPreview.textContent = money(0);
    if (resellerPreview) resellerPreview.textContent = money(0);
    return;
  }
  if (newItemMode() === 'component') {
    const componentPricing = newItemPricing(state.supplierTab, newSupplierPriceValue(), { supplierMeters: newSupplierMetersValue() });
    if (costPreview) costPreview.textContent = money(componentPricing.cost);
    clientPreview.textContent = money(componentPricing.client);
    if (resellerPreview) resellerPreview.textContent = money(componentPricing.reseller || componentPricing.client);
    return;
  }
  const sheetPreview = supplierPricesGrid.querySelector('[data-new-item-sheet-preview]');
  if (sheetPreview) sheetPreview.textContent = money(newSupplierPriceValue());
  if (state.supplierTab === 'Pinturas') {
    const quantityInput = supplierPricesGrid.querySelector('[data-new-item-field="quantity"]');
    const cost = num(priceInput.value) * 1.08;
    const quantity = num(quantityInput?.value || 0);
    clientPreview.textContent = money(cost);
    if (resellerPreview) resellerPreview.textContent = quantity ? money(cost / quantity) : money(0);
    return;
  }
  const pricing = newItemPricing(state.supplierTab, newSupplierPriceValue(), { supplierMeters: newSupplierMetersValue() });
  if (normalizeExtraGroupName(state.supplierTab) === 'Puxadores') {
    const cm = supplierPricesGrid.querySelector('[data-new-item-field="priceUnit"]')?.value === 'cm';
    priceInput.closest('label').querySelector('span').textContent = cm ? 'Preco cliente / cm' : 'Preco fornecedor';
    if (cm) {
      clientPreview.textContent = money(num(priceInput.value)) + '/cm';
      if (resellerPreview) resellerPreview.textContent = money(num(priceInput.value)) + '/cm';
      return;
    }
  }
  if (costPreview) costPreview.textContent = money(pricing.cost) + (state.supplierTab === 'Orlas' ? '/ml' : '');
  clientPreview.textContent = money(pricing.client) + (state.supplierTab === 'Orlas' ? '/ml' : '');
  if (resellerPreview) resellerPreview.textContent = money(pricing.reseller);
}

function findPrincipalForComponent(tab, parentName) {
  const wanted = comparableText(parentName);
  if (tab === 'Pinturas') return (state.catalog.paintings || []).find(function (item) { return comparableText(item.name) === wanted; });
  if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) return activeDoorSystems().find(function (item) { return comparableText(item.name) === wanted; });
  if (tab === 'Dobradicas / Ferragens') return (state.catalog.hinges || []).find(function (item) { return comparableText(item.name) === wanted; });
  if (tab === 'Gavetas') return (state.catalog.extras || []).find(function (item) { return normalizeExtraGroupName(item.group) === 'Gavetas' && comparableText(item.item) === wanted; });
  return null;
}

function appendComponentReference(parent, component) {
  if (!parent || !component) return;
  const line = '1x ' + (component.item || component.name || component.label) + (component.supplier ? ' (' + component.supplier + ')' : '');
  const current = String(parent.reference || '').trim();
  if (!current) {
    parent.reference = line;
    return;
  }
  if (!comparableText(current).includes(comparableText(component.item || component.name || component.label))) {
    parent.reference = current + '\n' + line;
  }
}

function addComponentToPrincipal(tab, parentName, component) {
  const parent = findPrincipalForComponent(tab, parentName);
  if (!parent) return;
  if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) {
    appendComponentReference(parent, component);
    recalculateSystemSummaries('doorSystems');
    syncDoorSystemExtras();
    return;
  }
  if (tab === 'Dobradicas / Ferragens') {
    appendComponentReference(parent, component);
    if (!Array.isArray(parent.recipeItems)) parent.recipeItems = [];
    if (!parent.recipeItems.some(function (item) { return comparableText(item) === comparableText(component.item); })) parent.recipeItems.push(component.item);
    recalculateSystemSummaries('hinges');
    return;
  }
  if (tab === 'Gavetas') {
    const recipe = ensureCustomDrawerRecipe(parent.item);
    if (!Array.isArray(recipe.components)) recipe.components = [];
    if (!recipe.components.some(function (entry) {
      return comparableText(entry.item) === comparableText(component.item) &&
        comparableText(entry.supplier) === comparableText(component.supplier);
    })) {
      recipe.components.push({ item: component.item, supplier: component.supplier, quantity: 1 });
    }
    component.usedIn = parent.item;
    recalculateDrawerExtras();
    return;
  }
  if (tab === 'Pinturas') {
    component.usedIn = parent.name;
    component.detail = (component.detail || '') + (parent.name ? ' / usado em: ' + parent.name : '');
  }
}

function newSupplierPriceValue() {
  if (state.supplierTab !== 'Madeiras / Placas') {
    return supplierPricesGrid.querySelector('[data-new-item-field="supplierPrice"]')?.value || 0;
  }
  const mode = supplierPricesGrid.querySelector('[data-new-item-field="platePriceMode"]')?.value || 'm2';
  if (mode !== 'sheet') return supplierPricesGrid.querySelector('[data-new-item-field="supplierPrice"]')?.value || 0;
  const width = num(supplierPricesGrid.querySelector('[data-new-item-field="sheetWidth"]')?.value || 0);
  const height = num(supplierPricesGrid.querySelector('[data-new-item-field="sheetHeight"]')?.value || 0);
  const sheetPrice = num(supplierPricesGrid.querySelector('[data-new-item-field="sheetPrice"]')?.value || 0);
  const areaM2 = (width * height) / 1000000;
  return areaM2 ? sheetPrice / areaM2 : 0;
}

function newSupplierMetersValue() {
  return num(supplierPricesGrid.querySelector('[data-new-item-field="supplierMeters"]')?.value || 0);
}

function plateParentOptions() {
  const entries = Array.from(bestSupplierPriceGroups()).map(function (entry) {
    return { key: entry[0], item: entry[1], label: plateCompareGroupName(entry[1]) };
  });
  const counts = new Map();
  entries.forEach(function (entry) {
    const name = comparableText(entry.label);
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return entries.map(function (entry, index) {
    if (counts.get(comparableText(entry.label)) > 1) entry.label += ' (' + (index + 1) + ')';
    return entry;
  });
}

function updatePlateSheetFields() {
  if (state.supplierTab !== 'Madeiras / Placas') return;
  const createItem = supplierPricesGrid.querySelector('[data-new-item-field="plateItemMode"]')?.value === 'new';
  ['existing', 'new'].forEach(function (kind) {
    const field = supplierPricesGrid.querySelector('[data-plate-' + kind + '-item]');
    if (!field) return;
    const active = kind === 'new' ? createItem : !createItem;
    field.hidden = !active;
    field.querySelectorAll('input, select').forEach(function (input) { input.disabled = !active; });
  });
  const mode = supplierPricesGrid.querySelector('[data-new-item-field="platePriceMode"]')?.value || 'm2';
  const sheetMode = mode === 'sheet';
  supplierPricesGrid.querySelectorAll('[data-plate-sheet-field]').forEach(function (field) {
    field.hidden = !sheetMode;
    field.querySelectorAll('input').forEach(function (input) { input.disabled = !sheetMode; });
  });
  const supplierPriceInput = supplierPricesGrid.querySelector('[data-new-item-field="supplierPrice"]');
  if (!supplierPriceInput) return;
  supplierPriceInput.closest('label').hidden = sheetMode;
  supplierPriceInput.disabled = sheetMode;
}

async function addSupplierItem() {
  const tab = state.supplierTab;
  const componentConfig = supplierComponentConfig(tab);
  const itemMode = componentConfig ? newItemMode() : 'principal';
  const parentName = itemMode === 'component' ? newItemParentName() : '';
  const nameInput = supplierPricesGrid.querySelector('[data-new-item-field="name"]');
  const supplierInput = supplierPricesGrid.querySelector('[data-new-item-field="supplier"]');
  const referenceInput = supplierPricesGrid.querySelector('[data-new-item-field="reference"]');
  const quantityInput = supplierPricesGrid.querySelector('[data-new-item-field="quantity"]');
  const priceInput = supplierPricesGrid.querySelector('[data-new-item-field="supplierPrice"]');
  const resellerPriceInput = supplierPricesGrid.querySelector('[data-new-item-field="resellerPrice"]');
  const manualResellerPrice = resellerPriceInput && String(resellerPriceInput.value || '').trim() !== ''
    ? num(resellerPriceInput.value)
    : null;
  const referenceValue = String(referenceInput?.value || '').trim();
  let name = String((tab === 'Pinturas' && itemMode === 'component' ? referenceValue : nameInput?.value) || '').trim();
  let plateParent = null;
  let plateDestinationKey = '';
  if (tab === 'Madeiras / Placas') {
    const createItem = supplierPricesGrid.querySelector('[data-new-item-field="plateItemMode"]')?.value === 'new';
    if (!createItem) {
      const selectedName = supplierPricesGrid.querySelector('[data-new-item-field="plateParent"]')?.value || '';
      const selected = plateParentOptions().find(function (entry) { return comparableText(entry.label) === comparableText(selectedName); });
      plateDestinationKey = selected?.key || '';
      plateParent = selected?.item;
      if (!plateParent) {
        sourceStatus.textContent = 'Escolhe um item existente ou seleciona Criar um novo item.';
        return;
      }
      name = plateParent.name;
    } else {
      if (!name) { sourceStatus.textContent = 'Preenche o nome do novo item.'; return; }
      if (Array.from(bestSupplierPriceGroups().values()).some(function (item) { return comparableText(plateCompareGroupName(item)) === comparableText(name); })) return warnDuplicateItem(name);
      plateDestinationKey = 'MANUAL|' + comparableText(name);
    }
    if (!referenceValue) { sourceStatus.textContent = 'Preenche a referencia da madeira.'; return; }
  }
  if (!name) return;
  const supplier = canonicalSupplierName(supplierInput?.value || '', tab);
  const pricing = newItemPricing(tab, newSupplierPriceValue(), { supplierMeters: newSupplierMetersValue() });
  const drawerTab = normalizeExtraGroupName(tab) === 'Gavetas';
  const supplierPriceRequired = !drawerTab;
  const principalFromComponents = !!componentConfig && itemMode === 'principal' && normalizeExtraGroupName(tab) !== 'Gavetas';
  const supplierPrice = principalFromComponents ? 0 : pricing.supplierPrice;
  let cost = pricing.cost;
  let client = pricing.client;
  let reseller = pricing.reseller;
  if (principalFromComponents) {
    cost = 0;
    client = 0;
    reseller = 0;
  }
  const reference = referenceValue || name;
  if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) {
    if (principalFromComponents) {
      cost = 0;
      client = 0;
      reseller = 0;
    } else {
      cost = openingSystemCostFromSupplier({ reference, name, item: name, label: name }, supplierPrice);
      client = salePriceValue(cost * 1.7);
      reseller = client;
    }
  }
  let addedPlate = null;
  let addedExtra = false;
  const handleCm = tab === 'Puxadores' && supplierPricesGrid.querySelector('[data-new-item-field="priceUnit"]')?.value === 'cm';

  if (tab !== 'Pinturas' && !principalFromComponents && (!name || (!supplier && !handleCm) || (supplierPriceRequired && !supplierPrice))) {
    sourceStatus.textContent = 'Preenche nome, fornecedor e preço fornecedor.';
    window.alert('Preenche nome, fornecedor e preço fornecedor.');
    return;
  }
  if (tab === 'Orlas' && !pricing.supplierMeters) {
    sourceStatus.textContent = 'Preenche os metros comprados.';
    window.alert('Preenche os metros comprados.');
    return;
  }

  if (itemMode === 'component' && componentConfig) {
    if (!parentName) {
      sourceStatus.textContent = 'Escolhe o item principal deste componente.';
      window.alert('Escolhe o item principal deste componente.');
      return;
    }
    if (!supplier || (supplierPriceRequired && !supplierPrice)) {
      sourceStatus.textContent = 'Preenche fornecedor e preço fornecedor.';
      window.alert('Preenche fornecedor e preço fornecedor.');
      return;
    }
    if (componentConfig.componentType === 'paintingComponents') {
      const quantity = num(quantityInput?.value || 0);
      if (!reference || !quantity) {
        sourceStatus.textContent = 'Preenche referência e quantidade.';
        window.alert('Preenche referência e quantidade.');
        return;
      }
      if (itemSupplierExists(state.catalog.paintingComponents, 'item', name, supplier, undefined, 'paintingComponents')) return warnDuplicateItem(name);
      const item = {
        group: 'Pinturas - componentes',
        item: name,
        supplier,
        reference,
        supplierPrice,
        cost: supplierPrice * 1.08,
        client: 0,
        detail: 'Qtd: ' + String(quantity).replace('.', ',') + 'L',
        usedIn: parentName,
        userAdded: true
      };
      addComponentToPrincipal(tab, parentName, item);
      clearSupplierRemoval('paintingComponents', item);
      state.catalog.paintingComponents.push(item);
      persistSupplierAddition('paintingComponents', item);
      trackSupplierChange('paintingComponents', item, name);
      recalculatePaintingServices();
      trackComponentParentChanges('paintingComponents', item);
    } else if (componentConfig.componentType === 'openingSystemComponents') {
      if (itemSupplierExists(state.catalog.openingSystemComponents, 'item', name, supplier, undefined, 'openingSystemComponents', parentName)) return warnDuplicateItem(name);
      const item = { group: 'Sistemas de abertura', item: name, label: name, supplier, reference, supplierPrice, cost: openingSystemCostFromSupplier({ reference, item: name, label: name }, supplierPrice), client: 0, usedIn: parentName, userAdded: true };
      clearSupplierRemoval('openingSystemComponents', item);
      state.catalog.openingSystemComponents.push(item);
      addComponentToPrincipal(tab, parentName, item);
      recalculateSystemSummaries('doorSystems');
      syncDoorSystemExtras();
      persistSupplierAddition('openingSystemComponents', item);
      trackSupplierChange('openingSystemComponents', item, name);
      trackComponentParentChanges('openingSystemComponents', item);
    } else if (componentConfig.componentType === 'hingeComponents') {
      if (itemSupplierExists(state.catalog.hingeComponents, 'item', name, supplier, undefined, 'hingeComponents', parentName)) return warnDuplicateItem(name);
      const item = { group: 'Dobradicas / Ferragens', item: name, label: name, supplier, reference, supplierPrice, cost: supplierPrice, client: 0, usedIn: parentName, family: parentName, userAdded: true };
      clearSupplierRemoval('hingeComponents', item);
      state.catalog.hingeComponents.push(item);
      addComponentToPrincipal(tab, parentName, item);
      recalculateSystemSummaries('hinges');
      persistSupplierAddition('hingeComponents', item);
      trackSupplierChange('hingeComponents', item, name);
      trackComponentParentChanges('hingeComponents', item);
    } else if (componentConfig.componentType === 'drawerComponents') {
      if (itemSupplierExists(state.catalog.drawerComponents, 'item', name, supplier, undefined, 'drawerComponents')) return warnDuplicateItem(name);
      const item = { group: 'Gavetas - componentes', family: parentName, item: name, label: name, supplier, reference, supplierPrice, cost: supplierPrice, client: 0, usedIn: parentName, userAdded: true };
      clearSupplierRemoval('drawerComponents', item);
      state.catalog.drawerComponents.push(item);
      addComponentToPrincipal(tab, parentName, item);
      recalculateDrawerExtras();
      persistSupplierAddition('drawerComponents', item);
      trackSupplierChange('drawerComponents', item, name);
      trackComponentParentChanges('drawerComponents', item);
    }
    renderSupplierPrices();
    renderModules();
    renderFinal();
    calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
    sourceStatus.textContent = 'Componente adicionado em ' + parentName + '.';
    return;
  }

  if (tab === 'Madeiras / Placas') {
    const item = normalizePlateItemName({ name, supplier, reference, supplierPrice, cost, client, reseller, paintable: plateParent?.paintable ?? true, userAdded: true,
      compareGroup: plateParent ? plateCompareGroupName(plateParent) : name, compareGroupKey: plateDestinationKey });
    if ((state.supplierPrices || []).some(function (existing) { return plateOptionKey(existing) === plateOptionKey(item) && !isSupplierRemoved('plates', existing); })) return warnDuplicateItem(name);
    clearSupplierRemoval('plates', item);
    state.supplierPrices.push(item);
    state.catalog.plates.push(clone(item));
    normalizeAllPlateNames();
    persistSupplierAddition('plates', item);
    state.platePriceView = 'summary';
    addedPlate = item;
  } else if (tab === 'Pinturas') {
    if (itemSupplierExists(state.catalog.paintings, 'name', name, supplier, undefined, 'paintings')) return warnDuplicateItem(name);
    const item = { name, supplier, reference, supplierPrice, cost, client, reseller: client, userAdded: true };
    clearSupplierRemoval('paintings', item);
    state.catalog.paintings.push(item);
    addUniqueListItem('pinturas', name);
    persistSupplierAddition('paintings', item);
    trackSupplierChange('paintings', item, name);
  } else if (tab === 'Orlas') {
    if (itemSupplierExists(state.catalog.edges, 'name', name, supplier, undefined, 'edges')) return warnDuplicateItem(name);
    const item = { name, supplier, reference, supplierPrice, supplierMeters: pricing.supplierMeters, cost, client, reseller, materialPerMeter: pricing.materialPerMeter || supplierPrice / pricing.supplierMeters, userAdded: true };
    clearSupplierRemoval('edges', item);
    state.catalog.edges.push(item);
    addUniqueListItem('orlas', name);
    persistSupplierAddition('edges', item);
    trackSupplierChange('edges', item, name);
  } else if (tab === 'Sistemas de abertura' || tab === doorSystemExtraGroup) {
    if (itemSupplierExists(state.catalog.doorSystems, 'name', name, supplier, undefined, 'doorSystems')) return warnDuplicateItem(name);
    const item = { name, supplier, reference, supplierPrice, cost, client, reseller, manualSupplierPrice: true, userAdded: true };
    normalizeOpeningSystemPricing(item, true);
    item.client = salePriceValue(item.client);
    item.reseller = salePriceValue(item.reseller ?? item.client);
    clearSupplierRemoval('doorSystems', item);
    clearSupplierRemoval('openingSystemComponents', { item: name, label: name, supplier, reference });
    clearSupplierRemoval('extras', { group: doorSystemExtraGroup, item: name, label: name, supplier, reference });
    upsertDoorSystemItem(item);
    addUniqueListItem('sistemasPorta', name);
    persistSupplierAddition('doorSystems', item);
    trackSupplierChange('doorSystems', item, name);
    trackSupplierChange('openingSystemComponents', { item: name, label: name, supplier, reference, supplierPrice: item.supplierPrice, cost: item.cost, client: item.client, reseller: item.reseller, userAdded: true, userAddedSummary: true }, name);
    persistSupplierDraftChanges();
    syncDoorSystemExtras();
  } else if (tab === 'Dobradicas / Ferragens') {
    if (itemSupplierExists(state.catalog.hinges, 'name', name, supplier, undefined, 'hinges')) return warnDuplicateItem(name);
    const item = { name, supplier, reference, supplierPrice, cost, client, reseller, userAdded: true };
    clearSupplierRemoval('hinges', item);
    state.catalog.hinges.push(item);
    addUniqueListItem('dobradicas', name);
    persistSupplierAddition('hinges', item);
    trackSupplierChange('hinges', item, name);
  } else {
    const group = normalizeExtraGroupName(tab);
    const handleUse = supplierPricesGrid.querySelector('[data-new-item-field="handleUse"]')?.value || '';
    const allowedUses = ['Puxadores', otherExtraGroup].includes(group) ? ['cozinha', 'roupeiro', 'ambos'] : ['cozinha', 'roupeiro'];
    if (['Puxadores', otherExtraGroup, 'Gavetas'].includes(group) && !allowedUses.includes(handleUse)) {
      sourceStatus.textContent = 'Escolhe se o item e de cozinha ou de roupeiro.';
      return;
    }
    if (itemSupplierExists(state.catalog.extras, 'item', name, supplier, group, 'extras')) return warnDuplicateItem(name);
    const item = { group, item: name, label: name, supplier, reference, supplierPrice, cost, client, reseller, userAdded: true, createdAt: Date.now() };
    if (group === otherExtraGroup && manualResellerPrice !== null) {
      item.reseller = manualResellerPrice;
      item.manualReseller = true;
    }
    if (group === 'Puxadores') item.priceUnit = supplierPricesGrid.querySelector('[data-new-item-field="priceUnit"]')?.value === 'cm' ? 'cm' : 'unit';
    if (['Puxadores', otherExtraGroup, 'Gavetas'].includes(group)) item.handleUse = handleUse;
    if (handleCm) Object.assign(item, { supplierPrice: 0, cost: 0, client: num(priceInput.value), reseller: num(priceInput.value), manualClient: true, manualReseller: true });
    clearSupplierRemoval('extras', item);
    state.catalog.extras.push(item);
    addUniqueListItem('extraGroups', group);
    persistSupplierAddition('extras', item);
    trackSupplierChange('extras', item, name);
    state.supplierTab = group;
    addedExtra = true;
  }

  clearSupplierSearch();
  renderSupplierPrices();
  if (addedExtra) supplierPricesGrid.scrollTop = 0;
  if (false && saveButton) {
    const excel = data.saved || {};
    const total = Number(excel.updated || 0) + Number(excel.updatedPaint || 0) + Number(excel.updatedEdges || 0) +
      Number(excel.updatedDrawers || 0) + Number(excel.updatedSystems || 0) + Number(excel.updatedExtras || 0) +
      Number(excel.insertedPlates || 0) + Number(excel.insertedPlateSuppliers || 0) + Number(excel.updatedComparison || 0);
    sourceStatus.textContent = total ? 'Preços guardados no catálogo' : 'Guardar terminado';
    saveButton.disabled = false;
    return;
  }
  renderModules();
  renderFinal();
  calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
  if (addedPlate) {
    sourceStatus.textContent = 'A guardar madeira no catálogo...';
    try {
      const refreshed = await saveSupplierPlate(addedPlate);
      sourceStatus.textContent = refreshed === false
        ? 'Madeira guardada. Atualiza a pagina para atualizar os dados apresentados.'
        : 'Madeira adicionada e gravada no catálogo.';
    } catch (error) {
      trackSupplierChange('plates', addedPlate, addedPlate.name);
      sourceStatus.textContent = 'Madeira adicionada na app, mas nao foi gravada no catálogo: ' + error.message;
    }
    return;
  }
  sourceStatus.textContent = 'Item adicionado. Ainda não foi gravado no catálogo.';
}

function readonlyPriceRow(search, name, supplier, reference, supplierPrice, cost, client, reseller, deleteType, deleteIndex) {
  if (arguments.length <= 5) {
    const oldCost = supplier;
    const oldClient = reference;
    const oldReseller = supplierPrice;
    const catalogs = [state.catalog.paintings, state.catalog.doorSystems, state.catalog.hinges, state.catalog.edges, state.catalog.extras, state.catalog.paintingComponents, state.catalog.paintingMixDetails, state.catalog.paintRecipes, state.catalog.drawerComponents].flat().filter(Boolean);
    const found = catalogs.find(function (item) { return item.name === name || item.item === name; }) || {};
    supplier = found.supplier || (String(found.reference || '').match(/\(([^()]+)\)\s*$/)?.[1] || '');
    reference = found.reference || found.item || '';
    supplierPrice = found.supplierPrice || found.cost || 0;
    cost = oldCost;
    client = oldClient;
    reseller = oldReseller;
  }
  return '<tr data-supplier-search="' + esc(String(search || '').toLowerCase()) + '">' +
    '<td>' + esc(name) + '</td>' +
    '<td>' + (supplier ? esc(supplier) : '') + '</td>' +
    '<td>' + (reference ? esc(reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td class="supplier-money">' + (supplierPrice ? money(supplierPrice) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td class="supplier-money">' + money(cost) + '</td>' +
    '<td class="supplier-money">' + supplierManualPriceInput(deleteType || 'readonly', deleteIndex ?? '', 'client', client) + '</td>' +
    '<td class="supplier-money">' + supplierManualPriceInput(deleteType || 'readonly', deleteIndex ?? '', 'reseller', reseller ?? client) + '</td>' +
    '<td>' + (deleteType ? supplierDeleteButton(deleteType, deleteIndex) : '') + '</td>' +
  '</tr>';
}

function supplierFromReference(reference) {
  return String(reference || '').match(/\(([^()]+)\)\s*$/)?.[1] || '';
}

function paintingPriceRow(item, index) {
  const clientPriceCell = supplierManualPriceInput('paintings', index, 'client', item.client);
  return '<tr data-supplier-search="' + esc(['pinturas servico', item.name, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc('Serviço - ' + item.name) + '</td>' +
    '<td>' + esc(item.supplier || 'Lage & SÃ¡') + '</td>' +
    '<td>' + (item.reference ? esc(item.reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td class="supplier-money" data-painting-client="' + index + '">' + clientPriceCell + '</td>' +
    '<td class="supplier-money" data-painting-cost="' + index + '">' + money(num(item.cost) + num(item.serviceCostPerM2)) + '</td>' +
    '<td>' + supplierDeleteButton('paintings', index) + '</td>' +
  '</tr>';
}

function paintingComponentLiters(item) {
  const match = String(item.detail || '').match(/Qtd:\s*([\d.,]+)/i);
  return match ? num(match[1]) : 0;
}

function paintingComponentRow(item, index) {
  const liters = paintingComponentLiters(item);
  const costPerLiter = liters ? (Number(item.cost) || 0) / liters : 0;
  return '<tr data-supplier-search="' + esc(['pinturas componentes', item.item, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc('Componente - ' + item.item) + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td>' + (item.reference ? esc(item.reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td>' + (liters ? esc(String(liters).replace('.', ',') + ' L') : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td><input type="text" inputmode="decimal" value="' + supplierNumber(item.supplierPrice) + '" data-component-type="paintingComponents" data-component-index="' + index + '" data-component-field="supplierPrice"></td>' +
    '<td class="supplier-money" data-component-cost="paintingComponents-' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money" data-component-liter-cost="paintingComponents-' + index + '">' + money(costPerLiter) + '</td>' +
    '<td>' + supplierDeleteButton('paintingComponents', index) + '</td>' +
  '</tr>';
}

function editableComponentRow(type, index, search, name, supplier, reference, supplierPrice, cost) {
  return '<tr data-supplier-search="' + esc(String(search || '').toLowerCase()) + '">' +
    '<td>' + esc(name) + '</td>' +
    '<td>' + (supplier ? esc(supplier) : '') + '</td>' +
    '<td>' + (reference ? esc(reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td><input type="number" min="0" step="0.001" value="' + supplierNumber(supplierPrice) + '" data-component-type="' + esc(type) + '" data-component-index="' + index + '" data-component-field="supplierPrice"></td>' +
    '<td class="supplier-money" data-component-cost="' + esc(type) + '-' + index + '">' + money(cost) + '</td>' +
    '<td class="supplier-money"><span class="supplier-muted">-</span></td>' +
    '<td class="supplier-money"><span class="supplier-muted">-</span></td>' +
    '<td>' + supplierDeleteButton(type, index) + '</td>' +
  '</tr>';
}

function drawerTypeLabel(item) {
  const explicit = cleanDisplayText(item?.tipo || item?.handleUse || '').trim();
  const explicitKey = comparableText(explicit);
  if (explicitKey === 'COZINHA') return 'Cozinha';
  if (explicitKey === 'ROUPEIRO') return 'Roupeiro';
  if (explicit) return explicit;
  const text = comparableText(item?.item || item?.label || item?.name || '');
  const kind = text.includes('GAVETAO') ? 'Gavetão' : text.includes('GAVETA') ? 'Gaveta' : '';
  const position = text.includes('INTERIOR') ? 'Interior' : text.includes('EXTERIOR') ? 'Exterior' : '';
  return [kind, position].filter(Boolean).join(' ') || cleanDisplayText(item?.family || '');
}

function drawerComponentRow(index, item) {
  const name = item.item || item.label || item.reference || '';
  const reference = item.reference || item.label || item.item || '';
  const type = drawerTypeLabel(item);
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc(['gavetas componentes', name, item.supplier, reference, type].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(name) + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td>' + (reference ? esc(reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td>' + (type ? esc(type) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td><input type="text" inputmode="decimal" autocomplete="off" value="' + supplierNumber(item.supplierPrice) + '" data-component-type="drawerComponents" data-component-index="' + index + '" data-component-field="supplierPrice"></td>' +
    '<td class="supplier-money" data-component-cost="drawerComponents-' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money"><span class="supplier-muted">-</span></td>' +
    '<td class="supplier-money"><span class="supplier-muted">-</span></td>' +
    '<td>' + supplierDeleteButton('drawerComponents', index) + '</td>' +
  '</tr>';
}

function supplierRowClass(item) {
  return item?.userAdded ? ' class="supplier-user-row"' : '';
}

function supplierExtraSort(a, b) {
  const aUser = a.item?.userAdded ? 1 : 0;
  const bUser = b.item?.userAdded ? 1 : 0;
  if (aUser !== bUser) return bUser - aUser;
  const aTime = Number(a.item?.createdAt) || 0;
  const bTime = Number(b.item?.createdAt) || 0;
  if (aTime !== bTime) return bTime - aTime;
  return String(a.item?.item || '').localeCompare(String(b.item?.item || ''), 'pt-PT', { numeric: true, sensitivity: 'base' });
}

function editableExtraPriceRow(index, item) {
  const handleCm = normalizeExtraGroupName(item.group) === 'Puxadores' && item.priceUnit === 'cm';
  if (handleCm) Object.assign(item, { cost: 0, supplierPrice: 0, manualClient: true, reseller: item.client, manualReseller: true });
  const handleUseControl = normalizeExtraGroupName(item.group) === 'Puxadores'
    ? '<label><span>Utilizacao</span><select data-handle-use="' + index + '"><option value="">Por definir</option><option value="cozinha"' + (item.handleUse === 'cozinha' ? ' selected' : '') + '>Cozinha</option><option value="roupeiro"' + (item.handleUse === 'roupeiro' ? ' selected' : '') + '>Roupeiro</option><option value="ambos"' + (item.handleUse === 'ambos' ? ' selected' : '') + '>Os 2</option></select></label>' : '';
  const priceUnitControl = normalizeExtraGroupName(item.group) === 'Puxadores'
    ? '<label><span>Preco por</span><select data-handle-price-unit="' + index + '"><option value="unit"' + (!['cm', 'meter'].includes(item.priceUnit) ? ' selected' : '') + '>Unidade</option><option value="cm"' + (item.priceUnit === 'cm' ? ' selected' : '') + '>Centimetro (cm)</option>' + (item.priceUnit === 'meter' ? '<option value="meter" selected>Metro (anterior)</option>' : '') + '</select></label>' : '';
  const kitRecipe = ledKitRecipe(item);
  const isDrawerMainItem = normalizeExtraGroupName(item.group) === 'Gavetas';
  const reference = kitRecipe ? ledKitRecipeText(item) : (item.reference || item.label || item.item);
  const supplierInput = isDrawerMainItem || handleCm
    ? '<span class="supplier-muted">-</span>'
    : kitRecipe
    ? '<input type="number" min="0" step="0.001" value="" disabled>'
    : '<input type="number" min="0" step="0.001" value="' + supplierNumber(item.supplierPrice) + '" data-extra-price-index="' + index + '">';
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc([item.group, item.item, item.label, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.item) + handleUseControl + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td>' + esc(reference) + '</td>' +
    '<td>' + supplierInput + priceUnitControl + '</td>' +
    '<td class="supplier-money" data-extra-cost="' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money" data-extra-client="' + index + '">' + supplierManualPriceInput('extras', index, 'client', item.client) + '</td>' +
    '<td class="supplier-money" data-extra-reseller="' + index + '">' + supplierManualPriceInput('extras', index, 'reseller', item.reseller ?? item.client) + '</td>' +
    '<td>' + supplierDeleteButton('extras', index) + '</td>' +
  '</tr>';
}

function editableDoorSystemExtraRow(index, item) {
  const supplierPriceCell = '<td><input type="number" min="0" step="0.01" value="' + supplierNumber(item.supplierPrice ?? item.cost) + '" data-extra-edit-index="' + index + '" data-extra-edit-field="supplierPrice"></td>';
  const supplier = item.supplier || supplierFromReference(item.reference);
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc([item.group, item.item, item.label, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.item) + '</td>' +
    '<td><input value="' + esc(supplier || '') + '" data-extra-edit-index="' + index + '" data-extra-edit-field="supplier"></td>' +
    '<td><input value="' + esc(item.reference || item.label || item.item || '') + '" data-extra-edit-index="' + index + '" data-extra-edit-field="reference"></td>' +
    supplierPriceCell +
    '<td class="supplier-money" data-extra-cost="' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money" data-extra-client="' + index + '">' + supplierManualPriceInput('extras', index, 'client', item.client) + '</td>' +
    '<td class="supplier-money" data-extra-reseller="' + index + '">' + supplierManualPriceInput('extras', index, 'reseller', item.reseller ?? item.client) + '</td>' +
    '<td>' + supplierDeleteButton('extras', index) + '</td>' +
  '</tr>';
}

function extraSummaryRow(index, item) {
  const isDrawer = normalizeExtraGroupName(item.group) === 'Gavetas';
  const drawerType = isDrawer ? '<td>' + (drawerTypeLabel(item) ? esc(drawerTypeLabel(item)) : '<span class="supplier-muted">-</span>') + '</td>' : '';
  const supplierPriceCell = isDrawer
    ? '<input type="text" inputmode="decimal" autocomplete="off" value="' + supplierNumber(item.supplierPrice) + '" data-extra-price-index="' + index + '">'
    : (item.supplierPrice ? money(item.supplierPrice) : '<span class="supplier-muted">-</span>');
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc([item.group, item.item, item.label, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.item) + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td>' + (item.reference ? esc(item.reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    drawerType +
    '<td class="supplier-money">' + supplierPriceCell + '</td>' +
    '<td class="supplier-money" data-extra-cost="' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money" data-extra-client="' + index + '">' + supplierManualPriceInput('extras', index, 'client', item.client) + '</td>' +
    '<td class="supplier-money" data-extra-reseller="' + index + '">' + supplierManualPriceInput('extras', index, 'reseller', item.reseller ?? item.client) + '</td>' +
    '<td>' + supplierDeleteButton('extras', index) + '</td>' +
  '</tr>';
}

function transportPriceRow(item, index) {
  const calculated = isInternationalPackagingItem(item);
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc([item.group, item.item, item.label, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.item || item.label || item.name || '') + '</td>' +
    '<td><input value="' + esc(item.reference || item.label || item.item || '') + '" data-transport-edit-index="' + index + '"></td>' +
    '<td class="supplier-money"><input type="text" inputmode="decimal" autocomplete="off" value="' + supplierNumber(item.cost) + '" data-transport-cost-index="' + index + '" title="Custo base"></td>' +
    '<td class="supplier-money" data-transport-total-cost="' + index + '">' + money(calculated ? internationalPackagingInternalCost(item) : item.cost) + '</td>' +
    '<td class="supplier-money" data-extra-client="' + index + '">' + supplierManualPriceInput(calculated ? 'readonly' : 'extras', index, 'client', item.client) + '</td>' +
    '<td>' + (syntheticInternationalPackagingItems.has(item) ? '<span class="supplier-muted">Item padrão</span>' : supplierDeleteButton('extras', index)) + '</td>' +
  '</tr>';
}

function edgePriceRow(item, index) {
  const meters = Number(item.supplierMeters) || (Number(item.materialPerMeter) ? Number(item.supplierPrice) / Number(item.materialPerMeter) : 0);
  return '<tr data-supplier-search="' + esc(['orlas orlagem', item.name, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.name) + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td><input type="text" inputmode="decimal" autocomplete="off" value="' + supplierNumber(item.supplierPrice) + '" data-component-type="edges" data-component-index="' + index + '" data-component-field="supplierPrice"></td>' +
    '<td><input type="text" inputmode="decimal" autocomplete="off" value="' + (meters ? supplierNumber(meters) : '') + '" data-component-type="edges" data-component-index="' + index + '" data-component-field="supplierMeters"></td>' +
    '<td class="supplier-money" data-component-cost="edges-' + index + '">' + money(item.cost) + '/ml</td>' +
    '<td class="supplier-money" data-edge-client="' + index + '">' + supplierManualPriceInput('edges', index, 'client', item.client) + '/ml</td>' +
    '<td>' + supplierDeleteButton('edges', index) + '</td>' +
  '</tr>';
}

function systemSummaryRow(kind, index, item) {
  const supplierPriceCell = '<td><input type="number" min="0" step="0.01" value="' + supplierNumber(item.supplierPrice ?? item.cost) + '" data-system-summary-kind="' + esc(kind) + '" data-system-summary-index="' + index + '" data-system-summary-field="supplierPrice"></td>';
  const supplier = item.supplier || (kind === 'doorSystems' ? supplierFromReference(item.reference) : '');
  return '<tr data-supplier-search="' + esc([kind, item.name, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(item.name) + '</td>' +
    '<td><input value="' + esc(supplier || '') + '" data-system-summary-kind="' + esc(kind) + '" data-system-summary-index="' + index + '" data-system-summary-field="supplier"></td>' +
    '<td><input value="' + esc(item.reference || '') + '" data-system-summary-kind="' + esc(kind) + '" data-system-summary-index="' + index + '" data-system-summary-field="reference"></td>' +
    supplierPriceCell +
    '<td class="supplier-money" data-system-cost="' + esc(kind) + '-' + index + '">' + money(item.cost) + '</td>' +
    '<td class="supplier-money" data-system-client="' + esc(kind) + '-' + index + '">' + supplierManualPriceInput(kind, index, 'client', item.client) + '</td>' +
    '<td class="supplier-money" data-system-reseller="' + esc(kind) + '-' + index + '">' + supplierManualPriceInput(kind, index, 'reseller', item.reseller ?? item.client) + '</td>' +
    '<td>' + supplierDeleteButton(kind, index) + '</td>' +
  '</tr>';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function catalogNumericId(item) {
  const match = String(item?.catalogId || '').match(/:(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function componentBelongsToSummary(summary, component) {
  const summaryId = catalogNumericId(summary);
  const componentParentId = Number(component?.parentId) || 0;
  if (summaryId && componentParentId && summaryId === componentParentId) return true;
  const parentName = comparableText(component?.usedIn || component?.family || '');
  if (!parentName) return false;
  const summaryName = comparableText(summary?.name || summary?.item || summary?.label || '');
  return parentName === summaryName;
}

function referencedQuantity(reference, component) {
  const text = String(reference || '');
  if (!component?.item || !text.toLocaleLowerCase().includes(String(component.item).toLocaleLowerCase())) return 0;
  const pattern = new RegExp('(\\d+(?:[\\.,]\\d+)?)\\s*x\\s+' + escapeRegExp(component.item), 'i');
  const match = text.match(pattern);
  return match ? num(match[1]) : 1;
}

function systemRecipeTotals(summary, componentList) {
  const totals = { supplier: 0, cost: 0, components: 0 };
  componentList.forEach(function (component) {
    const hasExplicitParent = Boolean(
      Number(component?.parentId) ||
      String(component?.usedIn || component?.family || '').trim()
    );
    const belongsToSummary = componentBelongsToSummary(summary, component);
    // Quando a BD conhece o pai, a relacao tem prioridade. A referencia
    // textual so serve como compatibilidade para dados antigos sem relacao.
    const quantity = belongsToSummary
      ? (referencedQuantity(summary?.reference, component) || 1)
      : (hasExplicitParent ? 0 : referencedQuantity(summary?.reference, component));
    if (!quantity) return;
    totals.components += quantity;
    totals.supplier += quantity * (Number(component.supplierPrice) || 0);
    totals.cost += quantity * (Number(component.cost) || 0);
  });
  return totals;
}

function applySystemSupplierTotal(summary) {
  const baseSupplier = Number(summary.baseSupplierPrice) || 0;
  const baseCost = Number(summary.baseCost) || 0;
  const labor = Math.max(0, baseCost - baseSupplier);
  summary.cost = (Number(summary.supplierPrice) || 0) + labor;
  applySummaryPricesFromCost(summary);
}

function comparableText(value) {
  return cleanDisplayText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function comparableItemText(value) {
  return comparableText(value)
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCatalogExtraForQuote(extra) {
  if (!extra || !String(extra.group || '').trim() || !String(extra.item || '').trim()) return null;
  const wantedGroup = normalizeExtraGroupName(extra.group);
  const wantedItem = comparableItemText(extra.item);
  return (state.catalog.extras || []).find(function (item) {
    if (normalizeExtraGroupName(item.group) !== wantedGroup) return false;
    const candidate = comparableItemText(item.item || item.label || item.name || item.reference);
    return candidate && wantedItem && (candidate === wantedItem || candidate.includes(wantedItem) || wantedItem.includes(candidate));
  }) || null;
}

function canonicalizeQuoteExtras() {
  (state.extras || []).forEach(function (extra) {
    const catalogItem = findCatalogExtraForQuote(extra);
    if (!catalogItem) return;
    extra.group = normalizeExtraGroupName(catalogItem.group);
    extra.item = catalogItem.item;
  });
}

function supplierDisplayName(existing, next) {
  const left = String(existing || '').trim();
  const right = String(next || '').trim();
  if (!left) return right;
  if (!right) return left;
  const leftAccentScore = left.length - left.normalize('NFD').replace(/[\u0300-\u036f]/g, '').length;
  const rightAccentScore = right.length - right.normalize('NFD').replace(/[\u0300-\u036f]/g, '').length;
  if (rightAccentScore > leftAccentScore) return right;
  if (rightAccentScore === leftAccentScore && right.length > left.length) return right;
  return left;
}

function canonicalSupplierName(value, tab) {
  const wanted = comparableText(value);
  if (!wanted) return '';
  const match = supplierItemsForTab(tab).find(function (item) {
    return comparableText(item.supplier) === wanted;
  });
  return match ? supplierDisplayName(value, match.supplier) : String(value || '').trim();
}

function componentByFragments(componentList, fragments, excludes) {
  return componentList.find(function (component) {
    const text = comparableText(component.item);
    const hasFragments = fragments.every(function (fragment) { return text.includes(comparableText(fragment)); });
    const hasExcludes = (excludes || []).some(function (fragment) { return text.includes(comparableText(fragment)); });
    return hasFragments && !hasExcludes;
  });
}

function hingeRecipeCost(name, componentList) {
  const base = componentByFragments(componentList, ['V500', 'BASE CRUZ']);
  const label = String(name || '').toUpperCase();
  let hinge = null;
  if (label.includes('STANDARD')) {
    hinge = componentByFragments(componentList, ['V250', 'C/ MOLA'], ['BLUMOTION']);
  } else if (label.includes('AMORTECIDA')) {
    hinge = componentByFragments(componentList, ['DOBRAD COPO 35 BLUM 110']);
  } else if (label.includes('LIVRE')) {
    hinge = componentByFragments(componentList, ['V50', 'S/ MOLA']);
  }
  return (hinge ? Number(hinge.cost) || 0 : 0) + (base ? Number(base.cost) || 0 : 0);
}

function summaryRecipeCost(summary, componentList) {
  if (!Array.isArray(summary.recipeItems) || !summary.recipeItems.length) return 0;
  return summary.recipeItems.reduce(function (total, itemName) {
    const wanted = comparableText(itemName);
    const matches = componentList.filter(function (candidate) {
      const candidateText = comparableText(candidate.item);
      return candidateText === wanted || candidateText.includes(wanted) || wanted.includes(candidateText);
    });
    const component = matches.find(function (candidate) {
      return componentBelongsToSummary(summary, candidate);
    }) || (matches.some(function (candidate) {
      return Number(candidate?.parentId) || String(candidate?.usedIn || candidate?.family || '').trim();
    }) ? null : matches[0]);
    if (!component) return total;
    const quantity = referencedQuantity(summary.reference, component) || referencedQuantity(summary.reference, { item: itemName }) || 1;
    return total + ((Number(component.cost) || 0) * quantity);
  }, 0);
}

function hingeExtraLinkedItems(name) {
  const label = comparableText(name);
  if (label.includes('AMORTECIDA')) return ['V250 DOBRADIÇA 110º RECTA C/ BLUMOTION'];
  return [];
}

function componentByComparableName(componentList, itemName) {
  const wanted = comparableText(itemName);
  return componentList.find(function (candidate) {
    const candidateText = comparableText(candidate.item);
    return candidateText === wanted || candidateText.includes(wanted) || wanted.includes(candidateText);
  });
}

function hingeExtraDelta(summary, componentList) {
  return hingeExtraLinkedItems(summary.name).reduce(function (total, itemName) {
    const component = componentByComparableName(componentList, itemName);
    if (!component) return total;
    const originalCost = component.baseCost === undefined ? Number(component.cost) || 0 : Number(component.baseCost) || 0;
    return total + ((Number(component.cost) || 0) - originalCost);
  }, 0);
}

function recalculateSystemSummaries(kind) {
  const summaryList = kind === 'hinges' ? (state.catalog.hinges || []) : activeDoorSystems();
  const componentList = kind === 'hinges' ? (state.catalog.hingeComponents || []) : (state.catalog.openingSystemComponents || []);
  summaryList.forEach(function (summary, index) {
    let recipeTotals = systemRecipeTotals(summary, componentList);
    if (kind === 'doorSystems') {
      normalizeKnownDoorSystem(summary);
      recipeTotals = systemRecipeTotals(summary, componentList);
      if (!summary.supplier && summary.reference) summary.supplier = supplierFromReference(summary.reference);
      if (!summary.manualSupplierPrice && recipeTotals.supplier) summary.supplierPrice = recipeTotals.supplier;
      if (Number(summary.supplierPrice) > 0) {
        const base = baseDoorSystemFor(summary);
        const hasComponents = recipeTotals.components > 0;
        if (!hasComponents) {
          const supplierPrice = Number(summary.supplierPrice) || 0;
          const explicitLabor = Number(summary.labor) > 0 ? Number(summary.labor) : 0;
          summary.baseSupplierPrice = supplierPrice;
          summary.baseCost = supplierPrice + explicitLabor;
          if (summary.baseClient === undefined) summary.baseClient = Number(base?.client) || Number(summary.client) || 0;
          if (summary.baseReseller === undefined) summary.baseReseller = Number(base?.reseller ?? base?.client) || Number(summary.reseller ?? summary.client) || 0;
          summary.cost = openingSystemCostFromSupplier(summary, supplierPrice);
          applyOpeningSystemSalePrices(summary);
          const supplierCell = supplierPricesGrid.querySelector('[data-system-supplier="' + kind + '-' + index + '"]');
          const costCell = supplierPricesGrid.querySelector('[data-system-cost="' + kind + '-' + index + '"]');
          const clientCell = supplierPricesGrid.querySelector('[data-system-client="' + kind + '-' + index + '"]');
          const resellerCell = supplierPricesGrid.querySelector('[data-system-reseller="' + kind + '-' + index + '"]');
          if (supplierCell) supplierCell.textContent = money(summary.supplierPrice);
          if (costCell) costCell.textContent = money(summary.cost);
          updateSupplierMoneyCell(clientCell, summary.client);
          updateSupplierMoneyCell(resellerCell, summary.reseller);
          return;
        }
        if (summary.baseSupplierPrice === undefined) summary.baseSupplierPrice = recipeTotals.supplier || Number(summary.supplierPrice) || 0;
        if (summary.baseCost === undefined) summary.baseCost = recipeTotals.cost || Number(base?.cost) || openingSystemCostFromSupplier(summary, summary.supplierPrice);
        if (summary.baseClient === undefined) summary.baseClient = Number(base?.client) || Number(summary.client) || 0;
        if (summary.baseReseller === undefined) summary.baseReseller = Number(base?.reseller ?? base?.client) || Number(summary.reseller ?? summary.client) || 0;
        const labor = Math.max(0, (Number(summary.baseCost) || 0) - (Number(summary.baseSupplierPrice) || 0));
        summary.cost = (Number(summary.supplierPrice) || 0) + labor;
        applyOpeningSystemSalePrices(summary);
        const supplierCell = supplierPricesGrid.querySelector('[data-system-supplier="' + kind + '-' + index + '"]');
        const costCell = supplierPricesGrid.querySelector('[data-system-cost="' + kind + '-' + index + '"]');
        const clientCell = supplierPricesGrid.querySelector('[data-system-client="' + kind + '-' + index + '"]');
        const resellerCell = supplierPricesGrid.querySelector('[data-system-reseller="' + kind + '-' + index + '"]');
        if (supplierCell) supplierCell.textContent = money(summary.supplierPrice);
        if (costCell) costCell.textContent = money(summary.cost);
        updateSupplierMoneyCell(clientCell, summary.client);
        updateSupplierMoneyCell(resellerCell, summary.reseller);
      }
      return;
    }
    let totalCost = 0;
    const hingeRecipe = kind === 'hinges'
      ? ((summaryRecipeCost(summary, componentList) || hingeRecipeCost(summary.name, componentList)) + hingeExtraDelta(summary, componentList))
      : 0;
    if (hingeRecipe) {
      totalCost = hingeRecipe;
    } else {
      totalCost = systemRecipeTotals(summary, componentList).cost;
    }
    if (!totalCost) return;
    if (summary.baseSupplierPrice === undefined && recipeTotals.supplier) summary.baseSupplierPrice = recipeTotals.supplier;
    if (summary.baseCost === undefined) summary.baseCost = Number(summary.cost) || totalCost;
    if (summary.baseClient === undefined) summary.baseClient = Number(summary.client) || 0;
    if (summary.baseReseller === undefined) summary.baseReseller = Number(summary.reseller ?? summary.client) || 0;
    const inferredClientRatio = summary.cost > 0 && summary.client > 0 ? summary.client / summary.cost : 1.7;
    const inferredResellerRatio = summary.cost > 0 && (summary.reseller || summary.client) > 0
      ? (summary.reseller || summary.client) / summary.cost
      : inferredClientRatio;
    const clientRatio = summary.baseCost ? (summary.baseClient / summary.baseCost || inferredClientRatio) : inferredClientRatio;
    const resellerRatio = summary.baseCost ? (summary.baseReseller / summary.baseCost || inferredResellerRatio) : inferredResellerRatio;
    if (summary.manualSupplierPrice) {
      summary.cost = kind === 'doorSystems'
        ? openingSystemCostFromSupplier(summary, summary.supplierPrice)
        : (Number(summary.supplierPrice) || 0) + Math.max(0, (Number(summary.baseCost) || 0) - (Number(summary.baseSupplierPrice) || 0));
    } else {
      if (recipeTotals.supplier) summary.supplierPrice = recipeTotals.supplier;
      summary.cost = totalCost;
    }
    if (kind === 'doorSystems') {
      applyOpeningSystemSalePrices(summary);
    } else {
      applyAutomaticClientReseller(summary, summary.cost * clientRatio, summary.cost * resellerRatio);
    }
    const supplierCell = supplierPricesGrid.querySelector('[data-system-supplier="' + kind + '-' + index + '"]');
    const costCell = supplierPricesGrid.querySelector('[data-system-cost="' + kind + '-' + index + '"]');
    const clientCell = supplierPricesGrid.querySelector('[data-system-client="' + kind + '-' + index + '"]');
    const resellerCell = supplierPricesGrid.querySelector('[data-system-reseller="' + kind + '-' + index + '"]');
    if (supplierCell) supplierCell.textContent = money(summary.supplierPrice);
    if (costCell) costCell.textContent = money(summary.cost);
    updateSupplierMoneyCell(clientCell, summary.client);
    updateSupplierMoneyCell(resellerCell, summary.reseller);
  });
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length : 0;
}

function paintingCostPerLiter(rowNumber) {
  const item = (state.catalog.paintingComponents || [])[rowNumber - 18] || {};
  const litersMatch = String(item.detail || '').match(/Qtd:\s*([\d.,]+)/i);
  const liters = litersMatch ? num(litersMatch[1]) : 0;
  return liters ? (Number(item.cost) || 0) / liters : 0;
}

function paintingComponentBaseCostPerLiter(rowNumber) {
  const item = (state.catalog.paintingComponents || [])[rowNumber - 18] || {};
  const liters = paintingComponentLiters(item);
  return liters ? (Number(item.baseCost ?? item.cost) || 0) / liters : 0;
}

function paintingLinkedComponents(item) {
  return (state.catalog.paintingComponents || []).filter(function (component) {
    return componentBelongsToSummary(item, component);
  });
}

function paintingLinkedCost(item, field) {
  return paintingLinkedComponents(item).reduce(function (total, component) {
    return total + (Number(component[field] ?? component.cost) || 0);
  }, 0);
}

function paintingComponentsUseDatabaseRelations() {
  return (state.catalog.paintingComponents || []).some(function (component) {
    return Number(component.parentId) > 0 || String(component.usedIn || component.family || '').trim();
  });
}

function ensurePaintingBaselines() {
  (state.catalog.paintingComponents || []).forEach(function (item) {
    if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(item.supplierPrice) || 0;
    if (item.baseCost === undefined) item.baseCost = Number(item.cost) || ((Number(item.supplierPrice) || 0) * 1.08);
  });
  (state.catalog.paintings || []).forEach(function (item) {
    if (item.baseCost === undefined) item.baseCost = Number(item.cost) || paintingLinkedCost(item, 'cost');
    if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
  });
}

function addPaintingWeight(weights, rowNumber, coefficient) {
  weights[rowNumber] = (weights[rowNumber] || 0) + coefficient;
}

function addPaintingGroupWeight(weights, rows, coefficient) {
  const share = rows.length ? coefficient / rows.length : 0;
  rows.forEach(function (rowNumber) { addPaintingWeight(weights, rowNumber, share); });
}

function mixWeight(totalLiters, coats, litersInMix) {
  return totalLiters ? (litersInMix / totalLiters / 4) * coats : 0;
}

function paintingServiceWeights() {
  const groups = {
    h18: [44, 64],
    h20: [19, 21, 30, 32, 45, 47, 58, 65],
    h22: [46, 67],
    h28: [31],
    h30: [20, 23],
    h32: [25, 40],
    h36: [37, 52, 53, 55, 56, 63],
    h38: [18, 22, 28, 33, 34, 35, 36, 39, 70, 71, 72],
    h40: [42, 54, 57, 59, 69],
    h44: [24, 41, 62, 68, 61],
    h46: [27, 38, 43, 48, 73]
  };
  function w() { return {}; }
  function addR18(weights, factor) { addPaintingGroupWeight(weights, groups.h18, factor * mixWeight(37.5, 1, 25)); addPaintingGroupWeight(weights, groups.h20, factor * mixWeight(37.5, 1, 12.5)); }
  function addR19(weights, factor) { addPaintingGroupWeight(weights, groups.h22, factor * mixWeight(37.5, 1, 25)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(37.5, 1, 12.5)); }
  function addR20(weights, factor) { addPaintingGroupWeight(weights, groups.h22, factor * mixWeight(37.5, 1, 25) * 0.5); addPaintingWeight(weights, 29, factor * mixWeight(37.5, 1, 25) * 0.5); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(37.5, 1, 12.5)); }
  function addR21(weights, factor) { addPaintingWeight(weights, 29, factor * mixWeight(37.5, 1, 25)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(37.5, 1, 12.5)); }
  function addR22(weights, factor) { addPaintingGroupWeight(weights, groups.h28, factor * mixWeight(24, 1, 20)); addPaintingGroupWeight(weights, groups.h20, factor * mixWeight(24, 1, 4)); }
  function addR23(weights, factor) { addPaintingGroupWeight(weights, groups.h30, factor * mixWeight(22, 1, 20)); addPaintingGroupWeight(weights, groups.h20, factor * mixWeight(22, 1, 2)); }
  function addR24(weights, factor) { addPaintingGroupWeight(weights, groups.h32, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR25(weights, factor) { addPaintingWeight(weights, 66, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR26(weights, factor) { addPaintingGroupWeight(weights, groups.h36, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR27(weights, factor) { addPaintingGroupWeight(weights, groups.h38, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR28(weights, factor) { addPaintingGroupWeight(weights, groups.h40, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR29(weights, factor) { addPaintingWeight(weights, 57, factor * mixWeight(30, 2, 20)); addPaintingGroupWeight(weights, groups.h44, factor * mixWeight(30, 2, 10)); }
  function addR30(weights, factor) { addPaintingGroupWeight(weights, groups.h46, factor / 4); }
  const result = {};
  result[comparableText('Verniz Mate Poliretano')] = w(); addR18(result[comparableText('Verniz Mate Poliretano')], 2); addR19(result[comparableText('Verniz Mate Poliretano')], 1);
  result[comparableText('Verniz Poliretano Meio Brilhante')] = w(); addR18(result[comparableText('Verniz Poliretano Meio Brilhante')], 2); addR20(result[comparableText('Verniz Poliretano Meio Brilhante')], 1);
  result[comparableText('Verniz Poliretano Alto Brilhante')] = w(); addR18(result[comparableText('Verniz Poliretano Alto Brilhante')], 3); addR21(result[comparableText('Verniz Poliretano Alto Brilhante')], 2);
  result[comparableText('Verniz Natur / Acrilico')] = w(); addR23(result[comparableText('Verniz Natur / Acrilico')], 2);
  result[comparableText('Velaturas Claras c/ Afinação')] = w(); addR30(result[comparableText('Velaturas Claras c/ Afinação')], 1); addR22(result[comparableText('Velaturas Claras c/ Afinação')], 1); addR23(result[comparableText('Velaturas Claras c/ Afinação')], 1);
  result[comparableText('Velaturas Escuras c/ Afinação')] = w(); addR30(result[comparableText('Velaturas Escuras c/ Afinação')], 1); addR18(result[comparableText('Velaturas Escuras c/ Afinação')], 2); addR19(result[comparableText('Velaturas Escuras c/ Afinação')], 1 / 3); addR20(result[comparableText('Velaturas Escuras c/ Afinação')], 1 / 3); addR21(result[comparableText('Velaturas Escuras c/ Afinação')], 1 / 3);
  result[comparableText('Esmalte Mate Branco')] = w(); addR24(result[comparableText('Esmalte Mate Branco')], 1); addR26(result[comparableText('Esmalte Mate Branco')], 1);
  result[comparableText('Esmalte Mate Cores Claras com Afinação')] = w(); addR24(result[comparableText('Esmalte Mate Cores Claras com Afinação')], 1); addR27(result[comparableText('Esmalte Mate Cores Claras com Afinação')], 1);
  result[comparableText('Esmalte Mate Cores Escuras com Afinação')] = w(); addR25(result[comparableText('Esmalte Mate Cores Escuras com Afinação')], 1); addR28(result[comparableText('Esmalte Mate Cores Escuras com Afinação')], 1);
  result[comparableText('Esmalte Brilhante')] = w(); addR24(result[comparableText('Esmalte Brilhante')], 0.5); addR25(result[comparableText('Esmalte Brilhante')], 0.5); addR29(result[comparableText('Esmalte Brilhante')], 2);
  return result;
}

function recalculatePaintingServices() {
  ensurePaintingBaselines();
  syncDerivedPaintingServiceCosts();
  const weightsByService = paintingServiceWeights();
  (state.catalog.paintings || []).forEach(function (item, index) {
    const weights = weightsByService[comparableText(item.name)];
    const linkedComponents = paintingLinkedComponents(item);
    // In the database each paint can have its own component relation. If a
    // paint has no component, changing another paint must not recalculate it
    // with missing rows and turn its existing cost/client price into zero.
    if (!linkedComponents.length && paintingComponentsUseDatabaseRelations()) return;
    if (!weights && !linkedComponents.length) return;
    const componentDelta = linkedComponents.length
      ? paintingLinkedCost(item, 'cost') - paintingLinkedCost(item, 'baseCost')
      : Object.keys(weights).reduce(function (sum, rowNumber) {
        return sum + weights[rowNumber] * (paintingCostPerLiter(Number(rowNumber)) - paintingComponentBaseCostPerLiter(Number(rowNumber)));
      }, 0);
    const serviceCost = Number(item.baseCost) + componentDelta;
    item.cost = serviceCost;
    const cell = supplierPricesGrid.querySelector('[data-painting-cost="' + index + '"]');
    const clientCell = supplierPricesGrid.querySelector('[data-painting-client="' + index + '"]');
    if (cell) cell.textContent = money(num(item.cost) + num(item.serviceCostPerM2));
    updateSupplierMoneyCell(clientCell, item.client);
  });
}

function renderSupplierSection(title, rows) {
  if (title === 'Pinturas') {
    return '<section class="supplier-price-section">' +
      '<h3>' + esc(title) + '</h3>' +
      '<table class="supplier-table"><thead><tr>' +
      '<th>ITEM</th><th>FORNECEDOR</th><th>PRODUTOS / REFER&Ecirc;NCIA</th><th>PRE&Ccedil;O CLIENTE</th><th>CUSTO</th><th>A&Ccedil;&Atilde;O</th>' +
      '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="6">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
    '</section>';
  }
  if (title === 'Orlas') {
    return '<section class="supplier-price-section">' +
      '<h3>' + esc(title) + '</h3>' +
      '<table class="supplier-table"><thead><tr>' +
      '<th>ITEM</th><th>FORNECEDOR</th><th>PRE&Ccedil;O FORNECEDOR / ROLO</th><th>METROS COMPRADOS</th><th>CUSTO / ML</th><th>PRE&Ccedil;O CLIENTE / ML</th><th>A&Ccedil;&Atilde;O</th>' +
      '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="7">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
    '</section>';
  }
  if (title === otherExtraGroup) {
    return '<section class="supplier-price-section">' +
      '<h3>' + esc(title) + '</h3>' +
      '<table class="supplier-table"><thead><tr>' +
      '<th>ITEM</th><th>FORNECEDOR</th><th>REFER&Ecirc;NCIA</th><th>TIPO</th><th>CUSTO</th>' +
      '<th>PRE&Ccedil;O FORNECEDOR</th><th>PRE&Ccedil;O CLIENTE</th><th>PRE&Ccedil;O REVENDEDOR</th><th>A&Ccedil;&Atilde;O</th>' +
      '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="9">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
    '</section>';
  }
  if (title === transportExtraGroup) {
    return '<section class="supplier-price-section">' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="supplier-help">Embalamento Internacional Standard: custo base + (mão de obra horária × 20 ÷ 60). Embalamento Internacional Lacado: custo base + (mão de obra horária × 35 ÷ 60). Embalamento Nacional Standard: custo base + (mão de obra horária × 10 ÷ 60). Embalamento Nacional Lacado: custo base + (mão de obra horária × 25 ÷ 60). Em todos, preço cliente = custo total × 2.</p>' +
      '<table class="supplier-table"><thead><tr>' +
      '<th>ITEM</th><th>REFERÊNCIA</th><th>CUSTO BASE</th><th>CUSTO TOTAL</th><th>PREÇO CLIENTE</th><th>AÇÃO</th>' +
      '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="6">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
      '</section>';
  }
  const priceTitle = title === 'Pinturas' ? 'PRE&Ccedil;O SERVI&Ccedil;O' : 'PRE&Ccedil;O FORNECEDOR';
  const hasDrawerType = normalizeExtraGroupName(title) === 'Gavetas';
  return '<section class="supplier-price-section">' +
    '<h3>' + esc(title) + '</h3>' +
    '<table class="supplier-table"><thead><tr>' +
    '<th>ITEM</th><th>FORNECEDOR</th><th>REFER&Ecirc;NCIA</th>' + (hasDrawerType ? '<th>TIPO</th>' : '') + '<th>' + priceTitle + '</th>' +
    '<th>CUSTO</th><th>PRE&Ccedil;O CLIENTE</th><th>PRE&Ccedil;O REVENDEDOR</th><th>A&Ccedil;&Atilde;O</th>' +
    '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="' + (hasDrawerType ? '9' : '8') + '">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
  '</section>';
}

function renderPaintingSupplierSection(serviceRows, componentRows) {
  return '<section class="supplier-price-section">' +
    '<h3>Pinturas</h3>' +
    '<h4 class="supplier-subtitle">Servi&ccedil;os de pintura</h4>' +
    '<table class="supplier-table supplier-table-paint-services"><thead><tr>' +
    '<th>ITEM</th><th>FORNECEDOR</th><th>PRODUTOS / REFER&Ecirc;NCIA</th><th>PRE&Ccedil;O CLIENTE</th><th>CUSTO SERVI&Ccedil;O / M&sup2;</th><th>A&Ccedil;&Atilde;O</th>' +
    '</tr></thead><tbody>' + serviceRows + '<tr class="supplier-empty" hidden><td colspan="6">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
    '<h4 class="supplier-subtitle">Componentes / pre&ccedil;o fornecedor</h4>' +
    '<table class="supplier-table supplier-table-paint-components"><thead><tr>' +
    '<th>ITEM</th><th>FORNECEDOR</th><th>REFER&Ecirc;NCIA</th><th>QTD COMPRADA</th><th>PRE&Ccedil;O FORNECEDOR</th><th>CUSTO + 8%</th><th>CUSTO / L</th><th>A&Ccedil;&Atilde;O</th>' +
    '</tr></thead><tbody>' + componentRows + '<tr class="supplier-empty" hidden><td colspan="8">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
  '</section>';
}

function plateSummaryRow(item) {
  const title = plateCompareGroupName(item);
  return '<tr data-supplier-search="' + esc([title, item.name, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<td>' + esc(title) + '</td>' +
    '<td>' + esc(item.supplier || '') + '</td>' +
    '<td class="supplier-money">' + money(item.supplierPrice) + '</td>' +
    '<td class="supplier-money">' + supplierManualPriceInput('plates', state.supplierPrices.indexOf(item), 'client', item.client) + '</td>' +
    '<td class="supplier-money">' + supplierManualPriceInput('plates', state.supplierPrices.indexOf(item), 'reseller', item.reseller) + '</td>' +
  '</tr>';
}

function otherPriceRow(search, item, index) {
  return '<tr' + supplierRowClass(item) + ' data-supplier-search="' + esc(String(search || '').toLowerCase()) + '">' +
    '<td>' + esc(item.item || item.label || item.name || '') + '</td>' +
    '<td>' + (item.supplier ? esc(item.supplier) : '') + '</td>' +
    '<td>' + (item.reference ? esc(item.reference) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td>' + (item.tipo ? esc(item.tipo) : '<span class="supplier-muted">-</span>') + '</td>' +
    '<td class="supplier-money">' + money(item.cost) + '</td>' +
    '<td class="supplier-money"><input type="number" min="0" step="0.001" value="' + supplierNumber(item.supplierPrice) + '" data-extra-price-index="' + index + '"></td>' +
    '<td class="supplier-money" data-extra-client="' + index + '">' + supplierManualPriceInput('extras', index, 'client', item.client) + '</td>' +
    '<td class="supplier-money" data-extra-reseller="' + index + '">' + supplierManualPriceInput('extras', index, 'reseller', item.reseller ?? item.client) + '</td>' +
    '<td>' + supplierDeleteButton('extras', index) + '</td>' +
  '</tr>';
}

function plateComparatorRow(item, index, bestKeys) {
  const best = bestKeys.has(plateBestOptionKey(item));
  return '<div class="plate-option-row ' + (best ? 'supplier-best-row' : '') + '" draggable="true" data-drag-plate-index="' + attrEsc(index) + '" data-plate-key="' + esc(plateGroupKey(item)) + '" data-plate-option="' + esc(plateBestOptionKey(item)) + '" data-supplier-search="' + esc([item.name, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
    '<label class="plate-reference"><span>Referencia</span><input value="' + esc(item.reference || item.name) + '" data-supplier-index="' + index + '" data-supplier-field="reference"></label>' +
    '<label class="plate-supplier"><span>Fornecedor</span><input value="' + esc(item.supplier || '') + '" data-supplier-index="' + index + '" data-supplier-field="supplier"></label>' +
    '<label class="plate-price-input"><span>Preco fornecedor</span><input type="number" min="0" step="0.01" value="' + supplierNumber(item.supplierPrice) + '" data-supplier-index="' + index + '" data-supplier-field="supplierPrice"></label>' +
    '<div class="plate-cost"><span>Custo</span><strong data-supplier-cost="' + index + '">' + money(item.cost) + '</strong></div>' +
    '<button class="supplier-delete-button plate-delete-button" type="button" data-delete-supplier-type="plates" data-delete-supplier-index="' + attrEsc(index) + '" title="Eliminar">X</button>' +
  '</div>';
}

function plateComparatorGroupsHtml() {
  const bestByKey = bestSupplierPriceGroups();
  const bestKeys = new Set(Array.from(bestByKey.values()).map(function (best) {
    return plateBestOptionKey(best);
  }));
  const grouped = new Map();
  state.supplierPrices.forEach(function (item, index) {
    const key = plateGroupKey(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ item, index });
  });
  return Array.from(grouped.entries()).map(function ([key, entries]) {
    entries.sort(function (a, b) {
      return String(a.item.supplier || '').localeCompare(String(b.item.supplier || ''), 'pt', { sensitivity: 'base' }) ||
        String(a.item.reference || '').localeCompare(String(b.item.reference || ''), 'pt', { sensitivity: 'base', numeric: true });
    });
    const best = bestByKey.get(key) || entries[0].item;
    const search = entries.map(function (entry) {
      return [entry.item.name, entry.item.supplier, entry.item.reference].join(' ');
    }).join(' ').toLowerCase();
    const rows = entries.map(function (entry) {
      return plateComparatorRow(entry.item, entry.index, bestKeys);
    }).join('');
    return {
      label: plateCompareGroupName(best),
      html: '<div class="plate-compare-group" data-plate-drop-key="' + attrEsc(key) + '" data-plate-drop-name="' + attrEsc(plateCompareGroupName(best)) + '" data-supplier-search="' + esc(search) + '">' +
      '<div class="plate-compare-header">' +
        '<div><input class="plate-compare-title-input" value="' + esc(plateCompareGroupName(best)) + '" data-plate-group-name="' + attrEsc(key) + '"><small>' + entries.length + ' ' + (entries.length === 1 ? 'opcao' : 'opcoes') + ' de mercado</small></div>' +
        '<span>Melhor: ' + esc(best.supplier || '') + ' - ' + money(best.supplierPrice) + '</span>' +
      '</div>' +
      '<div class="plate-options-list">' + rows + '</div>' +
      '</div>'
    };
  }).sort(function (a, b) {
    return String(a.label).localeCompare(String(b.label), 'pt', { sensitivity: 'base', numeric: true });
  }).map(function (group) {
    return group.html;
  }).join('') + '<div class="supplier-empty" hidden>Sem resultados para esta pesquisa.</div>';
}

function refreshPlateComparatorBestRows() {
  if (state.supplierTab !== 'Madeiras / Placas' || state.platePriceView !== 'compare') return;
  supplierPricesGrid.querySelectorAll('.plate-compare-group').forEach(function (group) {
    const rows = Array.from(group.querySelectorAll('.plate-option-row[data-plate-key]'));
    let firstBest = null;
    rows.forEach(function (row) {
      const priceInput = row.querySelector('[data-supplier-field="supplierPrice"]');
      const price = priceInput ? num(priceInput.value) : Infinity;
      if (!firstBest || price < firstBest.price) firstBest = { row, price };
    });
    rows.forEach(function (row) { row.classList.toggle('supplier-best-row', firstBest && row === firstBest.row); });
    if (!firstBest) return;
    const supplier = firstBest.row.querySelector('[data-supplier-field="supplier"]')?.value || '';
    const price = money(firstBest.price);
    const subtitle = group.querySelector('.plate-compare-header span');
    if (subtitle) subtitle.textContent = 'Melhor: ' + supplier + ' - ' + price;
  });
}

function renderPlatePriceSection() {
  const summaryActive = state.platePriceView !== 'compare';
  const viewButtons = '<div class="supplier-subtabs">' +
    '<button type="button" class="' + (summaryActive ? 'active' : '') + '" data-plate-price-view="summary">Melhor preco</button>' +
    '<button type="button" class="' + (!summaryActive ? 'active' : '') + '" data-plate-price-view="compare">Comparador de precos</button>' +
  '</div>';
  const rows = summaryActive
    ? bestSupplierPriceSummary().map(plateSummaryRow).join('')
    : plateComparatorGroupsHtml();
  if (!summaryActive) {
    return '<section class="supplier-price-section plate-compare-section">' +
      '<h3>Madeiras / Placas</h3>' +
      viewButtons +
      rows +
    '</section>';
  }
  return '<section class="supplier-price-section">' +
    '<h3>Madeiras / Placas</h3>' +
    viewButtons +
    '<table class="supplier-table"><thead><tr>' +
    '<th>ITEM</th><th>FORNECEDOR</th><th>PRECO FORNECEDOR</th><th>PRECO CLIENTE</th><th>PRECO REVENDEDOR</th>' +
    '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="5">Sem resultados para esta pesquisa.</td></tr></tbody></table>' +
  '</section>';
}

function isEditableExtraGroup(group) {
  const text = comparableText(group);
  return text.includes('PUXADORES') ||
    text.includes('RODAP') ||
    text.includes('ACESSORIOS COZINHA') ||
    text.includes('CESTOS DO LIXO') ||
    text.includes('LED') ||
    text.includes('TOMADAS') ||
    text.includes('PES') ||
    text.includes('FIXACAO') ||
    text.includes('ORGANIZACAO') ||
    text.includes('RIPADO') ||
    text.includes('ACESSORIOS ROUPEIRO');
}

function ledKitRecipe(item) {
  const label = comparableText(item.label || item.item);
  if (!label.includes('KIT LED')) return null;
  const profile = label.includes('ALEN') ? 'Perfil LED Canto 22Âº Preto (Alen)' : 'Perfil LED Embutir AlumÃ­nio (Ares)';
  return [
    { label: profile, factor: 1 },
    { label: 'Difusor Fosco p/ Perfil (3MT)', factor: 1 / 3 },
    { label: 'Rolo Fita LED Luz Neutra (50MT)', factor: 1 }
  ];
}

function findExtraByLabel(group, label) {
  const wanted = comparableText(label);
  const normalizedGroup = normalizeExtraGroupName(group);
  return (state.catalog.extras || []).find(function (item) {
    return normalizeExtraGroupName(item.group) === normalizedGroup && comparableText(item.label || item.item) === wanted;
  });
}

function ledKitRecipeText(item) {
  const recipe = ledKitRecipe(item);
  if (!recipe) return item.reference || item.label || item.item;
  const group = item.group;
  const total = recipe.reduce(function (sum, part) {
    const component = findExtraByLabel(group, part.label);
    return sum + (component ? (Number(component.cost) || 0) * part.factor : 0);
  }, 0);
  return recipe.map(function (part) {
    const component = findExtraByLabel(group, part.label);
    const value = component ? (Number(component.cost) || 0) * part.factor : 0;
    const share = total ? Math.round((value / total) * 100) : 0;
    return part.label + ' (' + share + '%)';
  }).join(' + ');
}

function recalculateLedKits(group) {
  const normalizedGroup = normalizeExtraGroupName(group);
  (state.catalog.extras || []).forEach(function (item, index) {
    if (normalizeExtraGroupName(item.group) !== normalizedGroup) return;
    const recipe = ledKitRecipe(item);
    if (!recipe) return;
    if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
    if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
    const ratio = item.baseCost ? item.baseClient / item.baseCost : 1;
    const totalCost = recipe.reduce(function (sum, part) {
      const component = findExtraByLabel(group, part.label);
      return sum + (component ? (Number(component.cost) || 0) * part.factor : 0);
    }, 0);
    item.cost = totalCost;
    applyAutomaticClientReseller(item, totalCost * ratio, totalCost * ratio);
    const costCell = supplierPricesGrid.querySelector('[data-extra-cost="' + index + '"]');
    const clientCell = supplierPricesGrid.querySelector('[data-extra-client="' + index + '"]');
    const resellerCell = supplierPricesGrid.querySelector('[data-extra-reseller="' + index + '"]');
    if (costCell) costCell.textContent = money(item.cost);
    updateSupplierMoneyCell(clientCell, item.client);
    updateSupplierMoneyCell(resellerCell, item.reseller ?? item.client);
  });
}

function drawerRecipeLabel(recipe) {
  if (recipe?.customLabel) return comparableText(recipe.customLabel);
  const type = comparableText(recipe.type);
  const family = comparableText(recipe.family);
  const kind = type.includes('GAVETAO') ? 'GAVETAO' : 'GAVETA';
  const place = type.includes('INTERIOR') ? 'INTERIOR' : 'EXTERIOR';
  let familyName = '';
  if (family.includes('ANTARO')) familyName = 'ANTARO';
  if (family.includes('MERIVOBOX')) familyName = 'MERIVOBOX';
  if (family.includes('LEGRABOX')) familyName = 'LEGRABOX';
  return [kind, familyName, place].join(' ');
}

function ensureCustomDrawerRecipe(parentName) {
  if (!state.catalog) state.catalog = {};
  if (!Array.isArray(state.catalog.drawerRecipes)) state.catalog.drawerRecipes = [];
  const wanted = comparableText(parentName);
  let recipe = state.catalog.drawerRecipes.find(function (candidate) {
    return drawerRecipeLabel(candidate) === wanted;
  });
  if (!recipe) {
    recipe = { family: parentName, type: parentName, customLabel: parentName, labor: 0, components: [], userAdded: true };
    state.catalog.drawerRecipes.push(recipe);
  }
  return recipe;
}

function ensureCustomDrawerRecipesFromComponents() {
  (state.catalog.drawerComponents || []).forEach(function (component) {
    const parentName = component.usedIn || component.family;
    if (!parentName) return;
    const parent = (state.catalog.extras || []).find(function (item) {
      return normalizeExtraGroupName(item.group) === 'Gavetas' &&
        comparableText(item.item) === comparableText(parentName);
    });
    if (!parent) return;
    const recipe = ensureCustomDrawerRecipe(parent.item);
    if (!Array.isArray(recipe.components)) recipe.components = [];
    if (recipe.components.some(function (entry) {
      return comparableText(entry.item) === comparableText(component.item) &&
        comparableText(entry.supplier) === comparableText(component.supplier);
    })) return;
    recipe.components.push({ item: component.item, supplier: component.supplier, quantity: 1 });
  });
}

function drawerComponentCost(recipeComponent) {
  const wantedItem = comparableText(recipeComponent.item);
  const wantedSupplier = comparableText(recipeComponent.supplier);
  const component = (state.catalog.drawerComponents || []).find(function (item) {
    return comparableText(item.item) === wantedItem && comparableText(item.supplier) === wantedSupplier;
  });
  if (!component) return 0;
  const supplierPrice = Number(component.supplierPrice);
  return Number.isFinite(supplierPrice) ? supplierPrice : (Number(component.cost) || 0);
}

function uniqueDrawerRecipeComponents(components) {
  const seen = new Set();
  return (components || []).filter(function (component) {
    const key = [component.item, component.supplier].map(comparableText).join('|');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDrawerAssemblyCostName(value) {
  const name = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return name === 'montagem de gavetas' ||
    (name.includes('montagem') && name.includes('gaveta')) ||
    (name.includes('mao') && name.includes('obra') && name.includes('gaveta'));
}

function drawerAssemblyCostFromItems(items, assemblyType) {
  const wantedType = assemblyType === 'roupeiro' ? 'roupeiro' : 'cozinha';
  const assembly = (Array.isArray(items) ? items : []).find(function (item) {
    if (!isDrawerAssemblyCostName(item?.name)) return false;
    const name = String(item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes('roupeiro') || normalizeCustomCostType(item.type) === 'roupeiro'
      ? wantedType === 'roupeiro'
      : wantedType === 'cozinha';
  });
  if (assembly) return Math.max(0, Number(assembly.cost) || 0);
  const hourly = (Array.isArray(items) ? items : []).find(function (item) {
    const name = String(item?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes('mao') && name.includes('obra');
  });
  const hourlyPrice = num(hourly?.cost) > 0 ? num(hourly.cost) : num(hourly?.client);
  return wantedType === 'roupeiro' ? (4 * 0.07) + hourlyPrice * 10 / 60 : (8 * 0.06) + hourlyPrice * 7 / 60;
}

function recalculateDrawerExtras() {
  ensureCustomDrawerRecipesFromComponents();
  (state.catalog.extras || []).forEach(function (item, index) {
    if (normalizeExtraGroupName(item.group) !== 'Gavetas') return;
    const itemName = comparableText(item.item);
    const recipe = (state.catalog.drawerRecipes || []).find(function (candidate) {
      return drawerRecipeLabel(candidate) === itemName;
    });
    if (!recipe) return;
    recipe.components = uniqueDrawerRecipeComponents(recipe.components);
    if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
    if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
    const clientRatio = item.baseCost ? item.baseClient / item.baseCost : 1;
    const materialCost = (recipe.components || []).reduce(function (sum, component) {
      return sum + drawerComponentCost(component) * (Number(component.quantity) || 0);
    }, 0);
    const directSupplierPrice = Number(item.supplierPrice) || 0;
    const assemblyType = isWardrobeDrawerExtra(item) ? 'roupeiro' : 'cozinha';
    const drawerAssemblyCost = drawerAssemblyCostFromItems(state.costItems, assemblyType);
    const totalCost = directSupplierPrice + materialCost + Number(drawerAssemblyCost ?? recipe.labor ?? state.pricingRules?.drawerLabor ?? 0);
    item.cost = totalCost;
    automaticPrice(item, 'client', totalCost * clientRatio);
    automaticPrice(item, 'reseller', item.client);
    const costCell = supplierPricesGrid.querySelector('[data-extra-cost="' + index + '"]');
    const clientCell = supplierPricesGrid.querySelector('[data-extra-client="' + index + '"]');
    const resellerCell = supplierPricesGrid.querySelector('[data-extra-reseller="' + index + '"]');
    if (costCell) costCell.textContent = money(item.cost);
    updateSupplierMoneyCell(clientCell, item.client);
    updateSupplierMoneyCell(resellerCell, item.reseller ?? item.client);
  });
}

function normalizeCustomCostType(value) {
  const text = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (text.includes('ambos') || text.includes('os 2') || text.includes('os dois') || text === '2') return 'ambos';
  if (text.includes('roupeiro')) return 'roupeiro';
  if (text.includes('cozinha')) return 'cozinha';
  return 'ambos';
}

function customLaborHourlyPrice() {
  const labor = (state.costItems || []).find(function (item) {
    const name = String(item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return name.includes('mao') && name.includes('obra');
  });
  return num(labor?.cost) > 0 ? num(labor.cost) : num(labor?.client);
}

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
const customPaintingDivisor = 8;
const customPaintingClientMultiplier = 1.5;
const internationalPackagingClientMultiplier = 2;

function isInternationalPackagingItem(item) {
  return internationalPackagingLaborMinutesFor(item) > 0;
}

function currentModuleUnitCount() {
  return (state.modules || []).reduce(function (total, module) {
    if (!module || module.blank || !String(module.type || '').trim()) return total;
    return total + Math.max(0, Math.round(num(module.quantity)));
  }, 0);
}

function syncPackagingExtraQuantities() {
  const quantity = currentModuleUnitCount();
  (state.extras || []).forEach(function (extra) {
    if (!isInternationalPackagingItem(extra) || extra.quantityManual === true) return;
    extra.quantity = quantity;
  });
}

function internationalPackagingLaborMinutesFor(item) {
  const name = comparableItemText(item?.item || item?.label || item?.name || item?.reference);
  if (name === comparableItemText(internationalPackagingItemName)) return 20;
  if (name === comparableItemText(lacqueredInternationalPackagingItemName)) return 35;
  if (name === comparableItemText(nationalPackagingItemName)) return 10;
  if (name === comparableItemText(lacqueredNationalPackagingItemName)) return 25;
  return 0;
}

function ensureInternationalPackagingCatalogItem() {
  state.catalog = state.catalog || {};
  state.catalog.extras = Array.isArray(state.catalog.extras) ? state.catalog.extras : [];
  const missingItems = [internationalPackagingItemName, lacqueredInternationalPackagingItemName, nationalPackagingItemName, lacqueredNationalPackagingItemName]
    .filter(function (name) {
      return !state.catalog.extras.some(function (item) {
        return normalizeExtraGroupName(item.group) === transportExtraGroup && comparableItemText(item.item || item.label || item.name || item.reference) === comparableItemText(name);
      });
    });
  missingItems.forEach(function (name) {
    const item = {
      group: transportExtraGroup,
      item: name,
      label: name,
      reference: name,
      supplier: '',
      supplierPrice: 0,
      cost: 0,
      client: 0,
      reseller: 0,
      manualClient: false,
      manualReseller: false
    };
    syntheticInternationalPackagingItems.add(item);
    state.catalog.extras.push(item);
  });
  return state.catalog.extras.find(function (item) {
    return normalizeExtraGroupName(item.group) === transportExtraGroup && isInternationalPackagingItem(item);
  });
}

function internationalPackagingInternalCost(item) {
  return num(item?.cost) + customLaborHourlyPrice() * internationalPackagingLaborMinutesFor(item) / 60;
}

function recalculateInternationalPackagingPrices() {
  (state.catalog?.extras || []).forEach(function (item, index) {
    if (normalizeExtraGroupName(item.group) !== transportExtraGroup || !isInternationalPackagingItem(item)) return;
    const totalCost = internationalPackagingInternalCost(item);
    item.client = salePriceValue(totalCost * internationalPackagingClientMultiplier);
    item.reseller = item.client;
    item.manualClient = false;
    item.manualReseller = false;
    const totalCell = supplierPricesGrid?.querySelector('[data-transport-total-cost="' + index + '"]');
    const clientCell = supplierPricesGrid?.querySelector('[data-extra-client="' + index + '"]');
    if (totalCell) totalCell.textContent = money(totalCost);
    updateSupplierMoneyCell(clientCell, item.client);
  });
}

function customEdgebanderClientPrice() {
  const item = (state.costItems || []).find(function (candidate) {
    return String(candidate.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('orladora');
  });
  return item ? num(item.client) : null;
}

function customPanelSawCostPerSquareMeter() {
  const item = (state.costItems || []).find(function (candidate) {
    return String(candidate.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('seccionadora');
  });
  return item ? ((customLaborHourlyPrice() + num(item.cost)) / customPanelSawDivisor) * customPanelSawClientMultiplier : null;
}

function customModuleAssemblyLaborPerSquareMeter() {
  return (customLaborHourlyPrice() * (customModuleAssemblyLaborMinutes / 60)) / customModuleAssemblyAreaSquareMeters;
}

function customPaintingServiceCostPerSquareMeter() {
  const item = (state.costItems || []).find(function (candidate) {
    return String(candidate.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('pintura');
  });
  return item ? num(item.client) : null;
}

function syncDerivedPaintingServiceCosts() {
  const serviceCostPerM2 = customPaintingServiceCostPerSquareMeter() ?? 0;
  (state.catalog?.paintings || []).forEach(function (item, index) {
    if (comparableText(item.name) === comparableText('Nenhuma')) return;
    item.serviceCostPerM2 = serviceCostPerM2;
    const costCell = supplierPricesGrid?.querySelector('[data-painting-cost="' + index + '"]');
    if (costCell) costCell.textContent = money(num(item.cost) + serviceCostPerM2);
  });
}

function syncDerivedPlateLaborPrice() {
  const derived = customPanelSawCostPerSquareMeter();
  const fallback = Math.max(0, num(state.plateLaborFallback ?? 2.02));
  state.pricingRules = Object.assign({}, state.pricingRules || {}, { labor: derived === null ? fallback : derived });
  const updatePlate = function (plate) {
    if (!plate) return;
    const prices = platePricingValues(plate.supplierPrice);
    plate.cost = prices.cost;
    if (plate.manualClient !== true) plate.client = salePriceValue(prices.client);
    if (plate.manualReseller !== true) plate.reseller = salePriceValue(prices.reseller);
  };
  (state.supplierPrices || []).forEach(updatePlate);
  (state.catalog?.plates || []).forEach(updatePlate);
}

function trackDerivedPlatePriceChanges() {
  (state.supplierPrices || []).forEach(function (plate, index) {
    trackSupplierChange('plates', plate, index);
  });
}

function syncDerivedEdgeLaborPrice() {
  const derived = customEdgebanderClientPrice();
  if (derived === null) return;
  state.pricingRules = Object.assign({}, state.pricingRules || {}, { edgeLabor: derived });
  (state.catalog?.edges || []).forEach(function (edge) {
    const meters = Number(edge.supplierMeters) || 1000;
    edge.materialPerMeter = meters ? (Number(edge.supplierPrice) || 0) / meters : 0;
    edge.cost = edge.materialPerMeter + derived;
  });
}

function recalculateCustomCostPrices() {
  const laborHourlyPrice = customLaborHourlyPrice();
  (state.costItems || []).forEach(function (item) {
    const name = String(item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (isDrawerAssemblyCostName(item.name)) {
      const wardrobe = name.includes('roupeiro') || normalizeCustomCostType(item.type) === 'roupeiro';
      item.type = wardrobe ? 'roupeiro' : 'cozinha';
      item.name = wardrobe ? 'Montagem de gavetas - Roupeiro' : 'Montagem de gavetas - Cozinha';
      item.cost = wardrobe ? (4 * 0.07) + laborHourlyPrice * 10 / 60 : (8 * 0.06) + laborHourlyPrice * 7 / 60;
      item.client = 0;
    }
    if (name.includes('orladora')) {
      const hourlyCost = laborHourlyPrice + num(item.cost);
      item.client = (hourlyCost / customEdgebanderMetersPerHour) * customEdgebanderClientMultiplier;
    }
    if (name.includes('cnc')) {
      const hourlyCost = laborHourlyPrice + num(item.cost);
      item.client = (hourlyCost / customCncDivisor) * customCncClientMultiplier;
    }
    if (name.includes('seccionadora')) {
      const hourlyCost = laborHourlyPrice + num(item.cost);
      item.client = (hourlyCost / customPanelSawDivisor) * customPanelSawClientMultiplier;
    }
    if (name.includes('pintura')) {
      const totalCost = num(item.cost) + laborHourlyPrice;
      item.client = (totalCost / customPaintingDivisor) * customPaintingClientMultiplier;
    }
    if (name.includes('nivelador')) {
      const laborCost = laborHourlyPrice * (customLevelerLaborMinutes / 60);
      const consumables = (customLevelerConsumableUnit * customLevelerConsumableMultiplier) * customLevelerConsumableMultiplier;
      const levelerCost = num(item.cost) * customLevelerCostMultiplier;
      item.client = (laborCost + consumables + levelerCost) * customLevelerClientMultiplier;
    }
    if (name.includes('pes') && ['cozinha', 'roupeiro'].includes(normalizeCustomCostType(item.type))) {
      const laborCost = laborHourlyPrice * (customFeetLaborSeconds / 3600);
      const consumables = customFeetScrewUnit * customFeetScrewCount;
      const feetCost = num(item.cost);
      item.client = (laborCost + consumables + feetCost) * customFeetClientMultiplier;
    }
  });
  syncDerivedEdgeLaborPrice();
  syncDerivedPlateLaborPrice();
  syncDerivedPaintingServiceCosts();
  recalculateInternationalPackagingPrices();
}

function syncCustomCostComputedFields() {
  recalculateCustomCostPrices();
  (state.costItems || []).forEach(function (item, index) {
    const name = String(item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isCalculatedFeet = name.includes('pes') && ['cozinha', 'roupeiro'].includes(normalizeCustomCostType(item.type));
    if (!name.includes('orladora') && !name.includes('cnc') && !name.includes('seccionadora') && !name.includes('pintura') && !name.includes('nivelador') && !isCalculatedFeet && !isDrawerAssemblyCostName(item.name)) return;
    const input = supplierPricesGrid?.querySelector('[data-cost-index="' + index + '"][data-cost-field="client"]');
    if (input) input.value = supplierNumber(item.client);
    const costInput = supplierPricesGrid?.querySelector('[data-cost-index="' + index + '"][data-cost-field="cost"]');
    if (costInput && isDrawerAssemblyCostName(item.name)) costInput.value = supplierNumber(item.cost);
  });
}

function renderCostSection() {
  recalculateCustomCostPrices();
  const costTypes = [
    { value: 'cozinha', label: 'Cozinha' },
    { value: 'roupeiro', label: 'Roupeiro' },
    { value: 'ambos', label: 'Os 2' }
  ];
  const costTypeOptions = function (selected) {
    return costTypes.map(function (type) {
      return '<option value="' + type.value + '"' + (type.value === selected ? ' selected' : '') + '>' + type.label + '</option>';
    }).join('');
  };
  const costs = Array.isArray(state.costItems) ? state.costItems : [];
  const costRows = costs.length ? costs.map(function (item, index) {
    const type = normalizeCustomCostType(item.type);
    const name = String(item.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isDrawerAssembly = isDrawerAssemblyCostName(item.name);
    const isEdgebander = name.includes('orladora');
    const isCnc = name.includes('cnc');
    const isPanelSaw = name.includes('seccionadora');
    const isPainting = name.includes('pintura');
    const isLeveler = name.includes('nivelador');
    const isCalculatedFeet = name.includes('pes') && ['cozinha', 'roupeiro'].includes(normalizeCustomCostType(item.type));
    const clientCell = isDrawerAssembly
      ? '<span class="supplier-muted">Incluído no custo de cada gaveta</span>'
      : '<input type="text" inputmode="decimal" value="' + supplierNumber(item.client) + '" data-cost-index="' + index + '" data-cost-field="client"' + (isEdgebander ? ' readonly title="Calculado automaticamente para a Orladora"' : isCnc ? ' readonly title="Calculado automaticamente para a CNC"' : isPanelSaw ? ' readonly title="Calculado automaticamente para a Seccionadora"' : isLeveler ? ' readonly title="Calculado automaticamente para o Nivelador"' : isCalculatedFeet ? ' readonly title="Calculado automaticamente para os pés"' : '') + '>';
    const renderedClientCell = isPainting
      ? clientCell.replace('data-cost-field="client"', 'data-cost-field="client" readonly title="Calculado automaticamente"')
      : clientCell;
    return '<tr>' +
      '<td><input value="' + esc(item.name) + '" data-cost-index="' + index + '" data-cost-field="name"' + (isDrawerAssembly ? ' readonly title="Calculado automaticamente"' : '') + '></td>' +
      '<td><select data-cost-index="' + index + '" data-cost-field="type"' + (isDrawerAssembly ? ' disabled title="Tipo de gaveta associado a esta fórmula"' : '') + '>' + costTypeOptions(type) + '</select></td>' +
      '<td><input type="text" inputmode="decimal" value="' + supplierNumber(item.cost) + '" data-cost-index="' + index + '" data-cost-field="cost"' + (isDrawerAssembly ? ' readonly title="Calculated from hourly labor and screws"' : '') + '></td>' +
      '<td>' + renderedClientCell + '</td>' +
      '<td>' + (isDrawerAssembly ? '<span class="supplier-muted">Integrado</span>' : '<button class="supplier-delete-button" type="button" data-delete-cost-index="' + index + '" title="Eliminar">X</button>') + '</td>' +
      '</tr>';
  }).join('') : '<tr class="supplier-empty"><td colspan="5">Ainda não existem custos adicionados.</td></tr>';
  return '<section class="supplier-price-section labor-price-section">' +
    '<h3>Custos</h3>' +
    '<p class="supplier-help">Montagem de gavetas - Cozinha: (8 parafusos × 0,06 €) + (mão de obra horária × 7 ÷ 60). Acrescentado ao custo de cada gaveta de cozinha.</p>' +
    '<p class="supplier-help">Montagem de gavetas - Roupeiro: (4 parafusos × 0,07 €) + (mão de obra horária × 10 ÷ 60). Acrescentado ao custo de cada gaveta de roupeiro.</p>' +
    '<p class="supplier-help">Adiciona custos específicos, como uma cozinha ou um roupeiro, e define o custo interno e o preço para o cliente.</p>' +
    '<p class="supplier-help">Orladora: (custo horário da mão de obra + custo dos consumíveis da Orladora) ÷ 120 m × 1,5. Este preço por metro é usado no custo das orlas.</p>' +
    '<p class="supplier-help">CNC: ((custo horário da mão de obra + custo da CNC) ÷ 5,769) × 1,5 por m², aplicado à área conjunta das duas laterais de cada módulo.</p>' +
    '<p class="supplier-help">Seccionadora: ((custo da Seccionadora + custo horário da mão de obra) ÷ 23,184) × 1,5.</p>' +
    '<p class="supplier-help">Pintura: ((custo da Pintura + custo horário da mão de obra) ÷ 8) × 1,5. O preço cliente por m² calculado aqui soma-se ao custo da tinta na aba Pinturas.</p>' +
    '<p class="supplier-help"><strong>Placas — fórmulas dos preços automáticos</strong></p>' +
    '<p class="supplier-help">Custo da placa por m²: preço fornecedor + taxa da Seccionadora por m² (ou taxa Placas / madeira, se não houver Seccionadora) + mão de obra de montagem por m².</p>' +
    '<p class="supplier-help">Preço cliente: custo total da placa por m² × 1,92.</p>' +
    '<p class="supplier-help">Preço revendedor: custo total da placa por m² × 1,45.</p>' +
    '<p class="supplier-help">Mão de obra de montagem por m²: custo horário da mão de obra × 30 ÷ 60 ÷ 2,64. Com €23/h, corresponde a €4,36/m².</p>' +
    '<p class="supplier-help">Nivelador: (custo de 5 minutos de mão de obra + ((0,06 × 2) × 2) + (custo do próprio Nivelador × 2)) × 1,5. O valor sem margem entra no custo do par nos módulos superiores.</p>' +
    '<p class="supplier-help">Pés de cozinha: (custo de 1 minuto de mão de obra + (0,06 × 4 para os parafusos) + custo unitário dos pés) × 1,5. O valor sem margem entra no custo por pé do módulo.</p>' +
    '<p class="supplier-help">Pés de roupeiro: (custo de 1 minuto de mão de obra + (0,06 × 4 para os parafusos) + custo unitário dos pés) × 1,5. O valor sem margem entra no custo por pé do módulo.</p>' +
    '<p class="supplier-help">A montagem (30 minutos por módulo) fica distribuída por 2,64 m² e já está incluída no custo da placa, sem ser somada novamente ao custo do módulo.</p>' +
    '<div class="supplier-add-row cost-add-row">' +
      '<label><span>Nome</span><input data-new-cost-field="name" placeholder="Ex.: Cozinha completa"></label>' +
      '<label><span>Tipo</span><select data-new-cost-field="type">' + costTypeOptions('cozinha') + '</select></label>' +
      '<label><span>Custo</span><input type="text" inputmode="decimal" data-new-cost-field="cost" placeholder="0,00"></label>' +
      '<label><span>Preço cliente</span><input type="text" inputmode="decimal" data-new-cost-field="client" placeholder="0,00"></label>' +
      '<button type="button" data-add-cost>Adicionar</button>' +
    '</div>' +
    '<table class="supplier-table cost-items-table"><thead><tr><th>NOME</th><th>TIPO</th><th>CUSTO</th><th>PREÇO CLIENTE</th><th>AÇÃO</th></tr></thead><tbody>' + costRows + '</tbody></table>' +
    '</section>';
}

function renderSupplierPrices() {
  plateDuplicateReferenceKeysCache = null;
  plateKnownNameCache = null;
  state.supplierTab = normalizeExtraGroupName(state.supplierTab) || state.supplierTab;
  if (state.supplierTab === 'Mão de obra') state.supplierTab = 'Custos';
  applySupplierAdditions();
  applySupplierRemovals();
  dedupeSupplierStores();
  normalizeCatalogSalePrices();
  normalizeExtraGroupsState();
  ensureInternationalPackagingCatalogItem();
  recalculateCustomCostPrices();
  recalculateInternationalPackagingPrices();
  correctKnownSupplierPriceIssues();
  recalculateSystemSummaries('doorSystems');
  recalculateSystemSummaries('hinges');
  recalculateDrawerExtras();
  syncDoorSystemExtras();
  applySupplierRemovals();
  dedupeSupplierStores();
  const rows = state.supplierPrices.map(function (item, index) {
    return '<tr data-supplier-search="' + esc([item.name, item.supplier, item.reference].join(' ').toLowerCase()) + '">' +
      '<td><input value="' + esc(item.name) + '" data-supplier-index="' + index + '" data-supplier-field="name"></td>' +
      '<td><input value="' + esc(item.supplier) + '" data-supplier-index="' + index + '" data-supplier-field="supplier"></td>' +
      '<td><input value="' + esc(item.reference) + '" data-supplier-index="' + index + '" data-supplier-field="reference"></td>' +
      '<td><input type="number" min="0" step="0.01" value="' + supplierNumber(item.supplierPrice) + '" data-supplier-index="' + index + '" data-supplier-field="supplierPrice"></td>' +
      '<td class="supplier-money" data-supplier-cost="' + index + '">' + money(item.cost) + '</td>' +
      '<td class="supplier-money" data-supplier-client="' + index + '">' + supplierManualPriceInput('plates', index, 'client', item.client) + '</td>' +
      '<td class="supplier-money" data-supplier-reseller="' + index + '">' + supplierManualPriceInput('plates', index, 'reseller', item.reseller) + '</td>' +
      '<td>' + supplierDeleteButton('plates', index) + '</td>' +
    '</tr>';
  }).join('');

  supplierPricesGrid.innerHTML = '<table class="supplier-table"><thead><tr>' +
    '<th>PLACA</th><th>MELHOR FORNECEDOR</th><th>REFERÃŠNCIA</th><th>PREÃ‡O FORNECEDOR / MÂ²</th>' +
    '<th>CUSTO C/ MÃƒO DE OBRA</th><th>PREÃ‡O CLIENTE</th><th>PREÃ‡O REVENDEDOR</th><th>A&Ccedil;&Atilde;O</th>' +
    '</tr></thead><tbody>' + rows + '<tr class="supplier-empty" hidden><td colspan="8">Sem resultados para esta pesquisa.</td></tr></tbody></table>';
  const paintCleanRowsHtml = state.catalog.paintings.filter(function (item) { return item.name !== 'Nenhuma'; }).map(function (item) {
    return paintingPriceRow(item, state.catalog.paintings.indexOf(item));
  }).join('');
  const paintComponentRowsHtml = (state.catalog.paintingComponents || []).map(function (item, index) {
    return paintingComponentRow(item, index);
  }).join('');

  const sections = [
    renderPlatePriceSection(),
    renderSupplierSection('Pinturas', state.catalog.paintings.map(function (item) {
      return readonlyPriceRow('pinturas serviÃ§o ' + item.name + ' ' + item.reference, item.name, item.supplier, item.reference, item.supplierPrice, item.cost, item.client, item.client);
    }).join('') + (state.catalog.paintingMixDetails || []).map(function (item) {
      return readonlyPriceRow('pinturas mistura ' + item.item + ' ' + item.detail, 'Mistura - ' + item.item, item.supplier, item.reference + ' / ' + item.detail, item.supplierPrice, item.cost, item.client, item.client);
    }).join('') + (state.catalog.paintingComponents || []).map(function (item) {
      return readonlyPriceRow('pinturas tinta diluente endurecedor catalizador ' + item.item + ' ' + item.detail, 'Componente - ' + item.item, item.supplier, item.reference + ' / ' + item.detail, item.supplierPrice, item.cost, item.client, item.client);
    }).join('')),
    renderSupplierSection('Sistemas de abertura', activeDoorSystems().map(function (item) {
      return readonlyPriceRow('sistemas abertura portas ' + item.name + ' ' + item.reference, item.name, item.supplier, item.reference, item.supplierPrice || item.cost, item.cost, item.client, item.client);
    }).join('') + (state.catalog.openingSystemComponents || []).filter(function (item) {
      return item.userAddedSummary !== true;
    }).map(function (item, index) {
      return editableComponentRow('openingSystemComponents', index, 'sistemas abertura componentes ' + item.item + ' ' + item.supplier + ' ' + item.label, 'Componente - ' + item.label, item.supplier, item.reference, item.supplierPrice, item.cost);
    }).join('')),
    renderSupplierSection('Dobradicas / Ferragens', state.catalog.hinges.map(function (item) {
      return readonlyPriceRow('dobradicas ferragens ' + item.name, item.name, item.cost, item.client, item.client);
    }).join('')),
    renderSupplierSection('Orlas', state.catalog.edges.map(function (item, index) {
      return edgePriceRow(item, index);
    }).join(''))
  ];
  sections[1] = renderPaintingSupplierSection(paintCleanRowsHtml, paintComponentRowsHtml);
  sections[2] = renderSupplierSection('Sistemas de abertura', activeDoorSystems().map(function (item) {
    return systemSummaryRow('doorSystems', state.catalog.doorSystems.indexOf(item), item);
  }).join('') + (state.catalog.openingSystemComponents || []).filter(function (item) {
    return item.userAddedSummary !== true;
  }).map(function (item, index) {
    return editableComponentRow('openingSystemComponents', index, 'sistemas abertura componentes ' + item.item + ' ' + item.supplier + ' ' + item.label, 'Componente - ' + item.label, item.supplier, item.reference, item.supplierPrice, item.cost);
  }).join(''));
  sections[3] = renderSupplierSection('Dobradicas / Ferragens', state.catalog.hinges.map(function (item) {
    return systemSummaryRow('hinges', state.catalog.hinges.indexOf(item), item);
  }).join('') + (state.catalog.hingeComponents || []).map(function (item, index) {
    const usedIn = (state.catalog.hinges || [])
      .filter(function (hinge) {
        return (hinge.recipeItems || []).some(function (recipeItem) { return comparableText(recipeItem) === comparableText(item.item); }) ||
          hingeExtraLinkedItems(hinge.name).some(function (recipeItem) { return comparableText(recipeItem) === comparableText(item.item); });
      })
      .map(function (hinge) { return hinge.name; })
      .join(', ');
    const detail = item.reference + (usedIn ? ' / usado em: ' + usedIn : ' / nao usado nos 3 itens principais');
    return editableComponentRow('hingeComponents', index, 'dobradicas ferragens componentes ' + item.item + ' ' + item.supplier + ' ' + item.label + ' ' + usedIn, 'Componente - ' + item.label, item.supplier, detail, item.supplierPrice, item.cost);
  }).join(''));
  const supplierExtraGroups = new Set((state.lists.extraGroups || []).map(normalizeExtraGroupName).filter(Boolean));
  // A aba de gavetas deve estar sempre disponivel para criar o item
  // principal e os respetivos componentes, mesmo antes de existir uma
  // gaveta no orcamento atual.
  supplierExtraGroups.add('Gavetas');
  supplierExtraGroups.add(transportExtraGroup);
  supplierExtraGroups.add(ripadoExtraGroup);
  Array.from(supplierExtraGroups).filter(function (group) {
    return normalizeExtraGroupName(group) !== doorSystemExtraGroup;
  }).forEach(function (group) {
    group = normalizeExtraGroupName(group);
    const extraRows = state.catalog.extras
      .map(function (item, index) { return { item, index }; })
      .filter(function (entry) { return normalizeExtraGroupName(entry.item.group) === group; })
      .sort(supplierExtraSort)
      .map(function (entry) {
        const item = entry.item;
        const index = entry.index;
        if (normalizeExtraGroupName(group) === doorSystemExtraGroup) return editableDoorSystemExtraRow(index, item);
        if (normalizeExtraGroupName(group) === transportExtraGroup) return transportPriceRow(item, index);
        if (isEditableExtraGroup(group)) return editableExtraPriceRow(index, item);
        if (normalizeExtraGroupName(group) === 'Gavetas') return extraSummaryRow(index, item);
        if (normalizeExtraGroupName(group) === otherExtraGroup) return otherPriceRow(group + ' ' + item.item + ' ' + item.label + ' ' + item.reference, item, index);
        return readonlyPriceRow(group + ' ' + item.item + ' ' + item.label, item.item, item.supplier, item.reference, item.supplierPrice, item.cost, item.client, item.client, 'extras', index);
      })
      .join('');
    const drawerRows = normalizeExtraGroupName(group) === 'Gavetas'
      ? (state.catalog.drawerComponents || []).map(function (item, index) {
          return drawerComponentRow(index, item);
        }).join('')
      : '';
    sections.push(renderSupplierSection(group, extraRows + drawerRows));
  });
  sections.push(renderCostSection());
  const tabOrder = ['Madeiras / Placas', 'Puxadores', 'Rodapés (metros)', "LED'S (metros)", 'Pinturas', 'Orlas', 'Sistemas de abertura', 'Dobradicas / Ferragens', 'Outros', ripadoExtraGroup, 'Gavetas', 'Transporte e embalamento', 'Custos'];
  sections.sort(function (a, b) {
    const title = html => (html.match(/<h3>(.*?)<\/h3>/) || [null, ''])[1];
    const ai = tabOrder.indexOf(title(a));
    const bi = tabOrder.indexOf(title(b));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  if (!sections.some(function (html) { return html.includes('<h3>' + esc(state.supplierTab) + '</h3>'); })) {
    state.supplierTab = 'Madeiras / Placas';
  }
  const tabs = sections.map(function (html) {
    const title = (html.match(/<h3>(.*?)<\/h3>/) || [null, ''])[1];
    const active = title === esc(state.supplierTab);
    return '<button class="' + (active ? 'active' : '') + '" type="button" data-supplier-tab="' + title + '">' + title + '</button>';
  }).join('');
  const activeSection = sections.find(function (html) { return html.includes('<h3>' + esc(state.supplierTab) + '</h3>'); }) || sections[0];
  const laborTabActive = state.supplierTab === 'Custos';
  supplierPricesGrid.innerHTML = '<div class="supplier-tabs">' + tabs + '</div>' + (laborTabActive ? '' : supplierAddFormHtml()) + activeSection;
  applySupplierSearch();

  supplierPricesGrid.querySelectorAll('[data-supplier-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.supplierTab = normalizeExtraGroupName(button.textContent) || button.textContent;
      renderSupplierPrices();
    });
  });
  supplierPricesGrid.querySelectorAll('[data-plate-price-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      state.platePriceView = button.dataset.platePriceView;
      renderSupplierPrices();
    });
  });
  const addCostButton = supplierPricesGrid.querySelector('[data-add-cost]');
  if (addCostButton) addCostButton.addEventListener('click', function () {
    const field = function (name) { return supplierPricesGrid.querySelector('[data-new-cost-field="' + name + '"]'); };
    const name = String(field('name')?.value || '').trim();
    if (!name) {
      sourceStatus.textContent = 'Indica o nome do custo.';
      field('name')?.focus();
      return;
    }
    if (isDrawerAssemblyCostName(name)) {
      sourceStatus.textContent = 'A montagem de gavetas já está na tabela de custos.';
      field('name')?.focus();
      return;
    }
    const item = {
      id: 'cost:local:' + Date.now() + ':' + Math.random().toString(36).slice(2),
      name: name,
      type: normalizeCustomCostType(field('type')?.value || 'cozinha'),
      cost: Math.max(0, num(field('cost')?.value)),
      client: Math.max(0, num(field('client')?.value))
    };
    state.costItems = Array.isArray(state.costItems) ? state.costItems : [];
    state.costItems.push(item);
    recalculateCustomCostPrices();
    trackDerivedPlatePriceChanges();
    supplierDirtyChanges.costs.set(item.id, clone(item));
    markSupplierPricesDirty();
    renderSupplierPrices();
    scheduleSupplierRecalculation(true);
    sourceStatus.textContent = 'Custo adicionado.';
  });
  supplierPricesGrid.querySelectorAll('[data-cost-index][data-cost-field]').forEach(function (input) {
    input.addEventListener(input.tagName === 'SELECT' || input.dataset.costField === 'name' ? 'change' : 'input', function (event) {
      const index = Number(event.target.dataset.costIndex);
      const item = state.costItems?.[index];
      if (!item) return;
      const field = event.target.dataset.costField;
      if (field === 'name') item.name = String(event.target.value || '').trim();
      if (field === 'type') item.type = normalizeCustomCostType(event.target.value || 'ambos');
      if (field === 'cost') item.cost = Math.max(0, num(event.target.value));
      if (field === 'client') item.client = Math.max(0, num(event.target.value));
      if (field === 'type') {
        recalculateCustomCostPrices();
        trackDerivedPlatePriceChanges();
        supplierDirtyChanges.costs.set(item.id || index, clone(item));
        markSupplierPricesDirty();
        renderSupplierPrices();
        scheduleSupplierRecalculation(true);
        return;
      }
      if (field === 'name') {
        recalculateCustomCostPrices();
        trackDerivedPlatePriceChanges();
        supplierDirtyChanges.costs.set(item.id || index, clone(item));
        markSupplierPricesDirty();
        renderSupplierPrices();
        scheduleSupplierRecalculation(true);
        return;
      }
      recalculateCustomCostPrices();
      syncCustomCostComputedFields();
      recalculateDrawerExtras();
      trackDerivedPlatePriceChanges();
      supplierDirtyChanges.costs.set(item.id || index, clone(item));
      markSupplierPricesDirty();
      scheduleSupplierRecalculation(true);
    });
  });
  supplierPricesGrid.querySelectorAll('[data-delete-cost-index]').forEach(function (button) {
    button.addEventListener('click', async function () {
      const index = Number(button.dataset.deleteCostIndex);
      const item = state.costItems?.[index];
      if (!item) return;
      if (!window.confirm('Tens a certeza que pretendes eliminar este custo?')) return;
      const isUnsaved = !state.savedCostIds?.has(String(item.id || ''));
      if (isUnsaved) {
        state.costItems.splice(index, 1);
        supplierDirtyChanges.costs.delete(item.id);
        recalculateCustomCostPrices();
        trackDerivedPlatePriceChanges();
        markSupplierPricesDirty();
        renderSupplierPrices();
        scheduleSupplierRecalculation(true);
        return;
      }
      try {
        sourceStatus.textContent = 'A eliminar custo...';
        const response = await fetch('/api/supplier-prices/cost', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        });
        const data = await readJson(response, {});
        if (!response.ok) throw new Error(data.error || 'Não foi possível eliminar o custo.');
        applySupplierCatalogResponse(data);
        supplierDirtyChanges.costs.clear();
        renderSupplierPrices();
        scheduleSupplierRecalculation(true);
        sourceStatus.textContent = 'Custo eliminado da base de dados.';
      } catch (error) {
        sourceStatus.textContent = error.message;
      }
    });
  });
  supplierPricesGrid.querySelectorAll('[data-plate-group-name]').forEach(function (input) {
    input.addEventListener('change', function (event) {
      const key = event.target.dataset.plateGroupName;
      const name = String(event.target.value || '').trim();
      if (!key || !name) return;
      const indexes = state.supplierPrices.map(function (item, index) {
        return plateGroupKey(item) === key ? index : -1;
      }).filter(function (index) { return index >= 0; });
      indexes.forEach(function (index) {
        const item = state.supplierPrices[index];
        item.name = name;
        item.item = name;
        item.label = name;
        item.compareGroup = name;
        item.compareGroupKey = key;
        trackSupplierChange('plates', item, index);
      });
      plateDuplicateReferenceKeysCache = null;
      renderSupplierPrices();
      sourceStatus.textContent = 'Nome do grupo atualizado.';
    });
  });
  supplierPricesGrid.querySelectorAll('[data-drag-plate-index]').forEach(function (row) {
    row.addEventListener('dragstart', function (event) {
      event.dataTransfer.setData('text/plain', row.dataset.dragPlateIndex);
      event.dataTransfer.effectAllowed = 'move';
    });
  });
  supplierPricesGrid.querySelectorAll('[data-plate-drop-key]').forEach(function (group) {
    group.addEventListener('dragover', function (event) {
      event.preventDefault();
      group.classList.add('plate-compare-drop-active');
      event.dataTransfer.dropEffect = 'move';
    });
    group.addEventListener('dragleave', function () {
      group.classList.remove('plate-compare-drop-active');
    });
    group.addEventListener('drop', function (event) {
      event.preventDefault();
      group.classList.remove('plate-compare-drop-active');
      const index = Number(event.dataTransfer.getData('text/plain'));
      const item = state.supplierPrices[index];
      const targetName = group.dataset.plateDropName || '';
      const targetKey = group.dataset.plateDropKey || '';
      if (!item || !targetName) return;
      item.compareGroup = targetName;
      item.compareGroupKey = targetKey;
      trackSupplierChange('plates', item, index);
      plateDuplicateReferenceKeysCache = null;
      renderSupplierPrices();
      sourceStatus.textContent = 'Material movido para o comparador.';
    });
  });
  const addButton = supplierPricesGrid.querySelector('[data-add-supplier-item]');
  if (addButton) addButton.addEventListener('click', addSupplierItem);
  supplierPricesGrid.querySelectorAll('[data-delete-supplier-type]').forEach(function (button) {
    button.addEventListener('click', function () {
      deleteSupplierItem(button.dataset.deleteSupplierType, button.dataset.deleteSupplierIndex)
        .catch(function (error) { sourceStatus.textContent = error.message; });
    });
  });
  supplierPricesGrid.querySelectorAll('[data-new-item-field]').forEach(function (element) {
    const updateNewItemField = function () {
      if (element.dataset.newItemField === 'itemMode') {
        updateSupplierAddModeFields();
      }
      if (state.supplierTab === 'Pinturas' && newItemMode() === 'component' && element.dataset.newItemField === 'reference') {
        const nameInput = supplierPricesGrid.querySelector('[data-new-item-field="name"]');
        if (nameInput) nameInput.value = element.value;
      }
      refreshNewItemPreview();
    };
    element.addEventListener('input', updateNewItemField);
    element.addEventListener('change', updateNewItemField);
  });
  refreshNewItemPreview();

  supplierPricesGrid.querySelectorAll('[data-transport-edit-index]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.transportEditIndex);
      const item = state.catalog.extras[index];
      if (!item) return;
      item.reference = event.target.value;
      trackSupplierChange('extras', item, index);
      scheduleSupplierRecalculation(false);
    });
  });
  supplierPricesGrid.querySelectorAll('[data-transport-cost-index]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.transportCostIndex);
      const item = state.catalog.extras[index];
      if (!item) return;
      item.cost = num(event.target.value);
      recalculateInternationalPackagingPrices();
      const costCell = supplierPricesGrid.querySelector('[data-transport-total-cost="' + index + '"]');
      if (costCell && !isInternationalPackagingItem(item)) costCell.textContent = money(item.cost);
      trackSupplierChange('extras', item, index);
      scheduleSupplierRecalculation(false);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-supplier-index]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.supplierIndex);
      const field = event.target.dataset.supplierField;
      const item = state.supplierPrices[index];
      const before = clone(item);
      if (field === 'reference') {
        item.compareGroupKey = plateGroupKey(item);
        item.compareGroup = plateCompareGroupName(item);
      }
      item[field] = field === 'supplierPrice' ? num(event.target.value) : event.target.value;
      calculateSupplierRow(item);
      if (item.userAdded) updateSupplierAddition('plates', before, item);
      plateDuplicateReferenceKeysCache = null;
      plateKnownNameCache = null;
      const supplierCostCell = supplierPricesGrid.querySelector('[data-supplier-cost="' + index + '"]');
      const supplierClientCell = supplierPricesGrid.querySelector('[data-supplier-client="' + index + '"]');
      const supplierResellerCell = supplierPricesGrid.querySelector('[data-supplier-reseller="' + index + '"]');
      if (supplierCostCell) supplierCostCell.textContent = money(item.cost);
      updateSupplierMoneyCell(supplierClientCell, item.client);
      updateSupplierMoneyCell(supplierResellerCell, item.reseller);
      const row = event.target.closest('.plate-option-row[data-plate-key]');
      if (row) {
        row.dataset.plateKey = plateGroupKey(item);
        row.dataset.plateOption = plateBestOptionKey(item);
      }
      trackSupplierChange('plates', item, index);
      scheduleSupplierRecalculation(true);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-handle-use]').forEach(function (element) {
    element.addEventListener('change', function () {
      const index = Number(element.dataset.handleUse);
      const item = state.catalog.extras[index];
      const before = clone(item);
      item.handleUse = element.value;
      if (item.userAdded) updateSupplierAddition('extras', before, item);
      trackSupplierChange('extras', item, index);
      renderFinal();
    });
  });
  supplierPricesGrid.querySelectorAll('[data-handle-price-unit]').forEach(function (element) {
    element.addEventListener('change', function () {
      const index = Number(element.dataset.handlePriceUnit);
      const item = state.catalog.extras[index];
      const before = clone(item);
      item.priceUnit = element.value === 'cm' ? 'cm' : 'unit';
      if (item.priceUnit === 'cm') Object.assign(item, { cost: 0, supplierPrice: 0, manualClient: true, reseller: item.client, manualReseller: true });
      if (item.userAdded) updateSupplierAddition('extras', before, item);
      trackSupplierChange('extras', item, index);
      renderFinal();
      scheduleSupplierRecalculation(false);
      renderSupplierPrices();
    });
  });
  supplierPricesGrid.querySelectorAll('[data-extra-price-index]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.extraPriceIndex);
      const item = state.catalog.extras[index];
      if (!item) return;
      if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(item.supplierPrice) || 0;
      if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
      if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
      item.supplierPrice = num(event.target.value);
      const markupMultiplier = supplierPriceMarkupMultiplier(item.group);
      if (markupMultiplier) {
        item.cost = item.supplierPrice;
        applyAutomaticClientReseller(item, item.supplierPrice * markupMultiplier, item.supplierPrice * markupMultiplier);
      } else {
        const labor = item.baseCost - item.baseSupplierPrice;
        const clientRatio = item.baseCost ? item.baseClient / item.baseCost : 1;
        item.cost = item.supplierPrice + labor;
        applyAutomaticClientReseller(item, item.cost * clientRatio, item.cost * clientRatio);
      }
      if (comparableText(item.group).includes('LED') && !ledKitRecipe(item)) recalculateLedKits(item.group);
      const costCell = supplierPricesGrid.querySelector('[data-extra-cost="' + index + '"]');
      const clientCell = supplierPricesGrid.querySelector('[data-extra-client="' + index + '"]');
      const resellerCell = supplierPricesGrid.querySelector('[data-extra-reseller="' + index + '"]');
      if (costCell) costCell.textContent = money(item.cost);
      updateSupplierMoneyCell(clientCell, item.client);
      updateSupplierMoneyCell(resellerCell, item.reseller ?? item.client);
      trackSupplierChange('extras', item, index);
      scheduleSupplierRecalculation(false);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-extra-edit-index]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const index = Number(event.target.dataset.extraEditIndex);
      const field = event.target.dataset.extraEditField;
      const item = state.catalog.extras[index];
      if (!item) return;
      if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
      if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(item.supplierPrice) || 0;
      if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
      if (item.baseReseller === undefined) item.baseReseller = Number(item.reseller ?? item.client) || 0;
      const before = clone(item);
      if (field === 'supplier' || field === 'reference') {
        item[field] = event.target.value;
        if (field === 'reference' && comparableText(item.group) === comparableText(doorSystemExtraGroup) && Number(item.supplierPrice) > 0) {
          item.cost = openingSystemCostFromSupplier(item, item.supplierPrice);
          applyOpeningSystemSalePrices(item);
        }
      } else if (field === 'supplierPrice') {
        item.supplierPrice = num(event.target.value);
        item.manualSupplierPrice = comparableText(item.group) === comparableText(doorSystemExtraGroup);
        item.cost = item.manualSupplierPrice
          ? openingSystemCostFromSupplier(item, item.supplierPrice)
          : calculatedCostFromSupplier(item, item.supplierPrice);
      }
      if (comparableText(item.group) === comparableText(doorSystemExtraGroup) && Number(item.supplierPrice) > 0) {
        applyOpeningSystemSalePrices(item);
      } else {
        applySummaryPricesFromCost(item);
      }
      if (comparableText(item.group) === comparableText(doorSystemExtraGroup)) {
        const system = (state.catalog.doorSystems || []).find(function (candidate) {
          return comparableText(candidate.name || candidate.item) === comparableText(item.item || item.name);
        });
        if (system) {
          if (system.baseCost === undefined) system.baseCost = item.baseCost;
          if (system.baseSupplierPrice === undefined) system.baseSupplierPrice = item.baseSupplierPrice;
          if (system.baseClient === undefined) system.baseClient = item.baseClient;
          if (system.baseReseller === undefined) system.baseReseller = item.baseReseller;
          Object.assign(system, {
            supplier: item.supplier,
            reference: item.reference,
            supplierPrice: item.supplierPrice,
            cost: item.cost,
            client: item.client,
            reseller: item.reseller,
            manualSupplierPrice: item.manualSupplierPrice === true
          });
        }
      }
      const costCell = supplierPricesGrid.querySelector('[data-extra-cost="' + index + '"]');
      const clientCell = supplierPricesGrid.querySelector('[data-extra-client="' + index + '"]');
      const resellerCell = supplierPricesGrid.querySelector('[data-extra-reseller="' + index + '"]');
      if (costCell) costCell.textContent = money(item.cost);
      updateSupplierMoneyCell(clientCell, item.client);
      updateSupplierMoneyCell(resellerCell, item.reseller ?? item.client);
      if (item.userAdded) updateSupplierAddition('extras', before, item);
      trackSupplierChange('extras', item, index);
      if (comparableText(item.group) === comparableText(doorSystemExtraGroup)) {
        const system = (state.catalog.doorSystems || []).find(function (candidate) {
          return comparableText(candidate.name || candidate.item) === comparableText(item.item || item.name);
        });
        if (system) trackSupplierChange('doorSystems', system, system.name);
        trackSupplierChange('openingSystemComponents', {
          item: item.item,
          label: item.item,
          name: item.item,
          supplier: item.supplier,
          reference: item.reference,
          supplierPrice: item.supplierPrice,
          cost: item.cost,
          client: item.client,
          reseller: item.reseller,
          manualSupplierPrice: item.manualSupplierPrice === true,
          userAdded: item.userAdded === true,
          userAddedSummary: true
        }, item.item);
      }
      syncDoorSystemExtras();
      scheduleSupplierRecalculation(false);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-system-summary-kind]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const kind = event.target.dataset.systemSummaryKind;
      const index = Number(event.target.dataset.systemSummaryIndex);
      const field = event.target.dataset.systemSummaryField;
      const list = kind === 'hinges' ? (state.catalog.hinges || []) : (state.catalog.doorSystems || []);
      const item = list[index];
      if (!item) return;
      if (item.baseCost === undefined) item.baseCost = Number(item.cost) || 0;
      if (item.baseSupplierPrice === undefined) item.baseSupplierPrice = Number(item.supplierPrice) || 0;
      if (item.baseClient === undefined) item.baseClient = Number(item.client) || 0;
      if (item.baseReseller === undefined) item.baseReseller = Number(item.reseller ?? item.client) || 0;
      const before = clone(item);
      if (field === 'supplier' || field === 'reference') {
        item[field] = event.target.value;
        if (field === 'reference' && kind === 'doorSystems' && Number(item.supplierPrice) > 0) {
          item.cost = openingSystemCostFromSupplier(item, item.supplierPrice);
          applyOpeningSystemSalePrices(item);
        }
      } else if (field === 'supplierPrice') {
        item.supplierPrice = num(event.target.value);
        item.manualSupplierPrice = kind === 'doorSystems';
        item.cost = item.manualSupplierPrice
          ? openingSystemCostFromSupplier(item, item.supplierPrice)
          : calculatedCostFromSupplier(item, item.supplierPrice);
      }
      if (kind === 'doorSystems' && Number(item.supplierPrice) > 0) {
        applyOpeningSystemSalePrices(item);
      } else {
        applySummaryPricesFromCost(item);
      }
      const costCell = supplierPricesGrid.querySelector('[data-system-cost="' + kind + '-' + index + '"]');
      const clientCell = supplierPricesGrid.querySelector('[data-system-client="' + kind + '-' + index + '"]');
      const resellerCell = supplierPricesGrid.querySelector('[data-system-reseller="' + kind + '-' + index + '"]');
      if (costCell) costCell.textContent = money(item.cost);
      updateSupplierMoneyCell(clientCell, item.client);
      updateSupplierMoneyCell(resellerCell, item.reseller);
      if (item.userAdded) updateSupplierAddition(kind === 'hinges' ? 'hinges' : 'doorSystems', before, item);
      trackSupplierChange(kind === 'hinges' ? 'hinges' : 'doorSystems', item, index);
      if (kind === 'doorSystems') syncDoorSystemExtras();
      scheduleSupplierRecalculation(false);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-component-type]').forEach(function (element) {
    element.addEventListener('input', function (event) {
      const type = event.target.dataset.componentType;
      const index = Number(event.target.dataset.componentIndex);
      const list = state.catalog[type] || [];
      if (!list[index]) return;
      if (type === 'paintingComponents') ensurePaintingBaselines();
      const before = clone(list[index]);
      if (list[index].baseCost === undefined) list[index].baseCost = Number(list[index].cost) || 0;
      const field = event.target.dataset.componentField || 'supplierPrice';
      list[index][field] = num(event.target.value);
      if (type === 'paintingComponents') {
        list[index].cost = list[index].supplierPrice * 1.08;
        recalculatePaintingServices();
        trackComponentParentChanges(type, list[index]);
      } else if (type === 'edges') {
        const meters = Number(list[index].supplierMeters) || 1000;
        list[index].materialPerMeter = meters ? list[index].supplierPrice / meters : 0;
        list[index].cost = list[index].materialPerMeter + Number(state.pricingRules?.edgeLabor ?? 0.32);
        applyEdgeAutomaticClientReseller(list[index], list[index].cost * 3.5, list[index].cost * 3.5);
      } else if (type === 'hingeComponents' || type === 'openingSystemComponents') {
        list[index].cost = type === 'openingSystemComponents'
          ? openingSystemCostFromSupplier(list[index], list[index].supplierPrice)
          : list[index].supplierPrice + (Number(list[index].labor) || 0);
        recalculateSystemSummaries(type === 'hingeComponents' ? 'hinges' : 'doorSystems');
        if (type === 'openingSystemComponents') syncDoorSystemExtras();
        trackComponentParentChanges(type, list[index]);
      } else if (type === 'drawerComponents') {
        list[index].cost = list[index].supplierPrice;
        recalculateDrawerExtras();
        trackComponentParentChanges(type, list[index]);
      } else {
        list[index].cost = list[index].supplierPrice;
      }
      const costCell = supplierPricesGrid.querySelector('[data-component-cost="' + type + '-' + index + '"]');
      if (costCell) costCell.textContent = money(list[index].cost) + (type === 'edges' ? '/ml' : '');
      const literCostCell = supplierPricesGrid.querySelector('[data-component-liter-cost="' + type + '-' + index + '"]');
      if (literCostCell) {
        const liters = type === 'paintingComponents' ? paintingComponentLiters(list[index]) : 0;
        literCostCell.textContent = liters ? money((Number(list[index].cost) || 0) / liters) : money(0);
      }
      const edgeClientCell = supplierPricesGrid.querySelector('[data-edge-client="' + index + '"]');
      updateSupplierMoneyCell(edgeClientCell, list[index].client, '/ml');
      if (list[index].userAdded && type === 'edges') updateSupplierAddition('edges', before, list[index]);
      if (list[index].userAdded && type === 'paintingComponents') updateSupplierAddition('paintingComponents', before, list[index]);
      if (list[index].userAdded && type === 'drawerComponents') updateSupplierAddition('drawerComponents', before, list[index]);
      trackSupplierChange(type, list[index], index);
      scheduleSupplierRecalculation(false);
    });
  });

  supplierPricesGrid.querySelectorAll('[data-manual-price-type]').forEach(function (element) {
    const updateManualPrice = function (event) {
      const type = event.target.dataset.manualPriceType;
      if (type === 'readonly') return;
      const index = Number(event.target.dataset.manualPriceIndex);
      const field = event.target.dataset.manualPriceField;
      const list = supplierManualPriceList(type);
      const item = list[index];
      if (!item || (field !== 'client' && field !== 'reseller')) return;
      if (!commitSupplierManualPriceInput(event.target)) return;
      renderModules();
      renderFinal();
      calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
      scheduleSupplierRecalculation(false);
    };
    element.addEventListener('change', updateManualPrice);
  });

  supplierPricesGrid.querySelectorAll('[data-auto-price-type]').forEach(function (button) {
    button.addEventListener('click', function () {
      const type = button.dataset.autoPriceType;
      const index = Number(button.dataset.autoPriceIndex);
      const field = button.dataset.autoPriceField;
      const list = supplierManualPriceList(type);
      const item = list[index];
      if (!item || (field !== 'client' && field !== 'reseller')) return;
      const before = clone(item);
      if (field === 'client') item.manualClient = false;
      if (field === 'reseller') item.manualReseller = false;
      recalculateManualPriceItem(type, item, index, field);
      const input = supplierPricesGrid.querySelector('[data-manual-price-type="' + type + '"][data-manual-price-index="' + index + '"][data-manual-price-field="' + field + '"]');
      if (input) input.value = supplierNumber(item[field]);
      trackManualPriceChange(type, item, index, before);
      renderModules();
      renderFinal();
      calculate({ renderFinal: false }).catch(function (error) { sourceStatus.textContent = error.message; });
      scheduleSupplierRecalculation(false);
    });
  });
}

async function saveSupplierPlate(item) {
  const response = await fetch('/api/supplier-prices/plate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plate: item })
  });
  const data = await readJson(response, {});
  if (!response.ok) throw new Error(data.error || 'Nao foi possivel gravar a madeira no catálogo.');
  try {
  applySupplierCatalogResponse(data);
  const bootstrapResponse = await fetch('/api/bootstrap');
  if (bootstrapResponse.ok) {
    const fresh = await readJson(bootstrapResponse, {});
    state.catalog = fresh.catalog;
    state.lists = fresh.lists;
    state.typePresets = fresh.typePresets;
    ensureRoupeiroModuleType();
    applySupplierAdditions();
    applySupplierDraftChanges();
    normalizeAllPlateNames();
    normalizeCatalogSalePrices();
  }
  try {
    await refreshSupplierCatalogFromServer();
  } catch (refreshError) {
    console.warn('Preços guardados, mas não foi possível confirmar a leitura final:', refreshError);
  }
  renderSupplierPrices();
  if (false && saveButton) {
    const excel = data.saved || {};
    const total = Number(excel.updated || 0) + Number(excel.updatedPaint || 0) + Number(excel.updatedEdges || 0) +
      Number(excel.updatedDrawers || 0) + Number(excel.updatedSystems || 0) + Number(excel.updatedExtras || 0) +
      Number(excel.insertedPlates || 0) + Number(excel.insertedPlateSuppliers || 0) + Number(excel.updatedComparison || 0);
    sourceStatus.textContent = total ? 'Preços guardados no catálogo' : 'Guardar terminado';
    saveButton.disabled = false;
    return;
  }
  renderModules();
  renderFinal();
  await calculate({ renderFinal: false });
  return true;
  } catch (error) {
    console.error('Madeira guardada; falha ao atualizar a pagina:', error);
    return false;
  }
}

async function saveSupplierPrices() {
  setSupplierSaveNotice('A preparar a grava\u00e7\u00e3o de todas as altera\u00e7\u00f5es...', 'saving');
  if (!canManagePrices()) {
    setSupplierSaveNotice('Faz login como administrador para guardar pre\u00e7os.', 'error');
    sourceStatus.textContent = 'Faz login como administrador para guardar preços.';
    return;
  }
  const saveButton = document.querySelector('#saveSupplierPricesButton');
  // Garante que principais adicionados recentemente também seguem para o servidor.
  (state.catalog.hinges || []).filter(function (item) { return item && item.userAdded === true; }).forEach(function (item) {
    trackSupplierChange('hinges', item, item.name || item.reference);
  });
  commitVisibleSupplierManualPrices();
  flushSupplierDraftPersist();
  if (supplierRecalculationTimer) {
    clearTimeout(supplierRecalculationTimer);
    supplierRecalculationTimer = null;
    supplierRecalculationNeedsPlateRefresh = false;
  }
  if (!hasSupplierDirtyChanges()) restoreSupplierDirtyChanges();
  if (!hasSupplierDirtyChanges()) {
    setSupplierSaveNotice('N\u00e3o existem altera\u00e7\u00f5es para guardar.', 'pending');
    sourceStatus.textContent = 'Sem alterações para guardar';
    return;
  }
  setSupplierSaveButtonState(true);
  sourceStatus.textContent = 'A guardar preços no catálogo...';
  setSupplierSaveNotice('A guardar todas as altera\u00e7\u00f5es...', 'saving');
  let savedSuccessfully = false;
  try {
    // Sistemas com componentes precisam de gravar tambem o resumo principal.
    // Isto corrige valores calculados a partir da BD antes desta sessao.
    recalculateSystemSummaries('doorSystems');
    const openingComponents = state.catalog.openingSystemComponents || [];
    activeDoorSystems().forEach(function (system) {
      const index = state.catalog.doorSystems.indexOf(system);
      if (systemRecipeTotals(system, openingComponents).components > 0) {
        trackSupplierChange('doorSystems', system, index);
      }
    });
    syncDoorSystemExtras();
    const payload = supplierSavePayload();
    const response = await fetch('/api/supplier-prices', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await readJson(response, {});
    if (!response.ok) throw new Error(data.error || 'Nao foi possivel guardar os precos.');
    savedSuccessfully = true;
    acknowledgeSupplierChanges(payload);
    clearSupplierDirtyChanges();
    applySupplierCatalogResponse(data);
    // The save response contains the price subset only. Reload the full
    // catalogue so newly inserted rows receive their database IDs; otherwise
    // editing one of them in a later save could be mistaken for another new
    // row and create an extra copy.
    const bootstrapResponse = await fetch('/api/bootstrap?fresh=' + Date.now(), { cache: 'no-store' });
    if (bootstrapResponse.ok) {
      const fresh = await readJson(bootstrapResponse, {});
      if (fresh.catalog) {
        state.catalog = fresh.catalog;
        state.lists = fresh.lists;
        state.typePresets = fresh.typePresets;
        markDoorSystemDuplicates();
        ensureRoupeiroModuleType();
      }
    }
    applySupplierAdditions();
    applySupplierDraftChanges();
    normalizeAllPlateNames();
    normalizeCatalogSalePrices();
    renderSupplierPrices();
    const excel = data.saved || {};
    const total = Number(excel.updated || 0) + Number(excel.updatedPaint || 0) + Number(excel.updatedEdges || 0) +
      Number(excel.updatedDrawers || 0) + Number(excel.updatedSystems || 0) + Number(excel.updatedExtras || 0) +
      Number(excel.insertedPlates || 0) + Number(excel.insertedPlateSuppliers || 0) + Number(excel.updatedComparison || 0);
    renderModules();
    renderFinal();
    await calculate({ renderFinal: false, useCurrentCatalog: true });
    sourceStatus.textContent = excel.queued
      ? 'Preços guardados no catálogo.'
      : (total ? 'Preços guardados no catálogo' : 'Guardar terminado');
    if (hasSupplierDirtyChanges()) sourceStatus.textContent = 'Precos guardados. Existem novas alteracoes por guardar.';
    setSupplierSaveNotice(
      hasSupplierDirtyChanges()
        ? 'Pre\u00e7os guardados, mas existem novas altera\u00e7\u00f5es por guardar.'
        : 'Todas as altera\u00e7\u00f5es foram guardadas com sucesso.',
      hasSupplierDirtyChanges() ? 'pending' : 'success'
    );
  } catch (error) {
    if (!savedSuccessfully) {
      setSupplierSaveNotice('N\u00e3o foi poss\u00edvel guardar: ' + error.message, 'error');
      // O catálogo só existe depois de ser gravado no Supabase.
      // Se a gravação falhar, elimina também os rascunhos locais e repõe os dados do servidor.
      clearSupplierDirtyChanges();
      sourceStatus.textContent = 'Não foi guardado: ' + error.message;
      return;
    }
    console.error('Precos guardados; falha ao atualizar a pagina:', error);
    setSupplierSaveNotice('Os pre\u00e7os foram guardados, mas a atualiza\u00e7\u00e3o da p\u00e1gina falhou.', 'error');
    sourceStatus.textContent = hasSupplierDirtyChanges()
      ? 'Precos guardados. Existem novas alteracoes por guardar; nao foi possivel atualizar a pagina.'
      : 'Precos guardados. Atualiza a pagina para atualizar os dados apresentados.';
  } finally {
    setSupplierSaveButtonState(false);
  }
}

async function showView(view, mode, recalculate) {
  if (view !== 'users' && state.quoteHistoryOwnerId) {
    await loadQuoteHistoryList().catch(function (error) { sourceStatus.textContent = error.message; });
  }
  if ((view === 'suppliers' || view === 'users') && !canManagePrices()) {
    sourceStatus.textContent = view === 'users'
      ? 'Faz login como administrador para gerir utilizadores.'
      : 'Faz login como administrador para mudar preços.';
    view = 'quote';
    mode = canUseQuoteMode(state.pricingMode) ? state.pricingMode : (canUseResellerQuote() ? 'reseller' : 'normal');
    recalculate = false;
  }
  if (view === 'quote' && !canUseQuoteMode(mode === 'reseller' ? 'reseller' : 'normal')) {
    const role = currentRole();
    sourceStatus.textContent = role === 'reseller'
      ? 'Revendedor só pode usar o orçamento revendedor.'
      : 'Convidado só pode usar o orçamento normal.';
    mode = role === 'reseller' ? 'reseller' : 'normal';
    recalculate = false;
  }
  document.querySelectorAll('.side-nav button').forEach(function (button) {
    const selected = view === 'quote'
      ? button.dataset.view === 'quote' && button.dataset.mode === mode
      : button.dataset.view === view;
    button.classList.toggle('active', selected);
  });

  if (view === 'suppliers') {
    quoteView.hidden = true;
    if (visualView) visualView.hidden = true;
    if (usersView) usersView.hidden = true;
    supplierView.hidden = false;
    quoteActions.hidden = true;
    pageTitle.textContent = 'Mudar preço fornecedores';
    await refreshSupplierCatalogFromServer().catch(function (error) {
      sourceStatus.textContent = error.message;
    });
    renderSupplierPrices();
    return;
  }

  if (view === 'users') {
    quoteView.hidden = true;
    supplierView.hidden = true;
    if (visualView) visualView.hidden = true;
    if (usersView) usersView.hidden = false;
    quoteActions.hidden = true;
    pageTitle.textContent = 'Utilizadores';
    await loadUsers();
    return;
  }

  if (view === 'visual') {
    quoteView.hidden = true;
    supplierView.hidden = true;
    if (usersView) usersView.hidden = true;
    if (visualView) visualView.hidden = false;
    quoteActions.hidden = false;
    pageTitle.textContent = 'Visualização';
    renderVisualPreview();
    return;
  }

  state.pricingMode = mode === 'reseller' ? 'reseller' : 'normal';
  quoteView.hidden = false;
  if (visualView) visualView.hidden = true;
  supplierView.hidden = true;
  if (usersView) usersView.hidden = true;
  quoteActions.hidden = false;
  pageTitle.textContent = state.pricingMode === 'reseller' ? 'Orçamento revendedor' : 'Orçamento';
  quoteTitle.textContent = cleanDisplayText(state.pricingMode === 'reseller' ? 'ORÃ‡AMENTO REVENDEDOR' : 'ORÃ‡AMENTO');
  renderModules();
  renderKpis();
  renderFinal();
  persistQuote();
  if (recalculate !== false) await calculate();
}

function waitForInitialPaint() {
  return new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function boot() {
  await loadSession();
  const response = await fetch('/api/bootstrap?fresh=' + Date.now(), { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível carregar os dados base.');
  const data = await readJson(response, {});
  state.lists = data.lists;
  state.catalog = data.catalog;
  markDoorSystemDuplicates();
  baseDoorSystemsByName = new Map(activeDoorSystems().map(function (item) {
    return [itemIdentity(item.name || item.item || item.label), clone(item)];
  }));
  state.typePresets = data.typePresets;
  ensureRoupeiroModuleType();
  data.modules = data.modules.map(hydrateModule);
  data.extras = data.extras.map(hydrateExtra);
  state.original = { client: clone(data.client), modules: clone(data.modules), extras: clone(data.extras) };
  clearQuoteDraftStorage();
  state.client = { name: '', location: '', date: '' };
  state.modules = [];
  state.extras = [];
  state.pricingMode = 'normal';
  sourceStatus.textContent = data.source.present ? 'Novo orçamento vazio' : 'Catálogo não encontrada; novo orçamento vazio';
  const supplierResponse = await fetch('/api/supplier-prices?fresh=' + Date.now(), { cache: 'no-store' });
  if (!supplierResponse.ok) throw new Error('Não foi possível carregar os preços dos fornecedores.');
  const supplierData = await readJson(supplierResponse, {});
  applySupplierCatalogResponse(supplierData);

  const quoteResponse = await fetch('/api/calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: state.client, modules: state.modules, extras: state.extras, pricingMode: state.pricingMode, catalog: calculationCatalogOverrides() }) });
  if (!quoteResponse.ok) throw new Error('Não foi possível calcular o orçamento inicial.');
  state.quote = await readJson(quoteResponse, {});
  renderClient();
  renderKpis();
  renderModules();
  renderFinal();
  await loadQuoteHistoryList().catch(function (error) { sourceStatus.textContent = error.message; });
  clearQuoteDraftStorage();
  // Ativa a vista inicial pelo mesmo fluxo usado ao mudar de tab. O recálculo
  // final garante que controlos, totais e dependências ficam funcionais logo
  // na primeira entrada na aplicação.
  updateAccessUi();
  // Espera que o browser conclua o primeiro desenho e ativa novamente a vista
  // inicial. Isto executa automaticamente o mesmo fluxo que antes só era
  // disparado ao clicar em "Orçamento revendedor".
  await waitForInitialPaint();
  await showView('quote', state.pricingMode, true);
  scheduleSupplierAutoRefresh();
}

document.querySelectorAll('.side-nav button').forEach(function (button) {
  button.addEventListener('click', function () {
    closeMobileMenu();
    showView(button.dataset.view, button.dataset.mode || state.pricingMode).catch(function (error) {
      sourceStatus.textContent = error.message;
    });
  });
});
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
}

setSidebarCollapsed(false);

document.querySelector('#sidebarToggle').addEventListener('click', function () {
  if (mobileLayoutQuery.matches) closeMobileMenu();
  else setSidebarCollapsed(true);
});

document.querySelector('#sidebarOpenButton').addEventListener('click', function () {
  setSidebarCollapsed(false);
});

if (mobileMenuButton) mobileMenuButton.addEventListener('click', function () {
  setMobileMenuOpen(!document.body.classList.contains('mobile-menu-open'));
});
if (mobileMenuBackdrop) mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && document.body.classList.contains('mobile-menu-open')) {
    closeMobileMenu();
    if (mobileMenuButton) mobileMenuButton.focus();
  }
});

if (supplierSearchButton) supplierSearchButton.addEventListener('click', function () {
  searchSupplierPricesWithFeedback();
});
if (supplierSearchInput) {
  supplierSearchInput.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    searchSupplierPricesWithFeedback();
  });
  supplierSearchInput.addEventListener('search', function () {
    if (!supplierSearchInput.value) scheduleSupplierSearch(0);
  });
}
if (loginButton) {
  loginButton.addEventListener('click', function () {
    loginAdmin().catch(function (error) { sourceStatus.textContent = error.message; });
  });
}
if (guestButton) {
  guestButton.addEventListener('click', function () {
    continueAsGuest().catch(function (error) { sourceStatus.textContent = error.message; });
  });
}
if (loginUser) loginUser.addEventListener('input', function () { setLoginError(''); });
if (loginPassword) loginPassword.addEventListener('input', function () { setLoginError(''); });
if (loginPassword) {
  loginPassword.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      loginAdmin().catch(function (error) { sourceStatus.textContent = error.message; });
    }
  });
}
if (logoutButton) {
  logoutButton.addEventListener('click', function () {
    logoutAdmin().catch(function (error) { sourceStatus.textContent = error.message; });
  });
}
if (mobileLogoutButton) {
  mobileLogoutButton.addEventListener('click', function () {
    closeMobileMenu();
    logoutAdmin().catch(function (error) { sourceStatus.textContent = error.message; });
  });
}
window.addEventListener('beforeunload', function () {
});
window.addEventListener('focus', function () {
  scheduleSupplierAutoRefresh(0);
});
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') scheduleSupplierAutoRefresh(0);
});

function triggerSaveSupplierPrices(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  const saveButton = document.querySelector('#saveSupplierPricesButton');
  if (saveButton?.dataset.saving === '1') return;
  if (saveButton) saveButton.dataset.saving = '1';
  setSupplierSaveButtonState(true);
  setSupplierSaveNotice('A preparar a grava\u00e7\u00e3o de todas as altera\u00e7\u00f5es...', 'saving');
  sourceStatus.textContent = 'A preparar gravação...';
  setTimeout(function () {
    saveSupplierPrices()
      .catch(function (error) { sourceStatus.textContent = 'Erro ao guardar: ' + error.message; })
      .finally(function () {
        const button = document.querySelector('#saveSupplierPricesButton');
        if (button) {
          setSupplierSaveButtonState(false);
          delete button.dataset.saving;
        }
      });
  }, 0);
}

document.querySelector('#saveSupplierPricesButton').onclick = triggerSaveSupplierPrices;
document.addEventListener('click', function (event) {
  if (event.target.closest('#saveSupplierPricesButton')) triggerSaveSupplierPrices(event);
}, true);
document.addEventListener('click', function (event) {
  const createButton = event.target.closest('#createUserButton');
  const saveButton = event.target.closest('[data-save-user]');
  const historyButton = event.target.closest('[data-show-user-history]');
  if (!createButton && !saveButton && !historyButton) return;
  event.preventDefault();
  const action = createButton
    ? createUserFromForm()
    : (saveButton
        ? saveUserFromRow(saveButton.dataset.saveUser)
        : loadQuoteHistoryList(historyButton.dataset.showUserHistory, historyButton.dataset.userHistoryLabel));
  action
    .then(function () {
      if (createButton) sourceStatus.textContent = 'Utilizador criado.';
      else if (saveButton) sourceStatus.textContent = 'Utilizador guardado.';
      else if (historyButton) sourceStatus.textContent = 'Histórico de ' + historyButton.dataset.userHistoryLabel;
    })
    .catch(function (error) { sourceStatus.textContent = error.message; });
});
document.addEventListener('click', function (event) {
  const splitButton = event.target.closest('[data-split-drawer-extra]');
  if (!splitButton) return;
  event.preventDefault();
  splitDrawerExtraByModule(Number(splitButton.dataset.splitDrawerExtra), splitButton);
});
document.addEventListener('input', function (event) {
  const input = event.target.closest('[data-drawer-split-qty]');
  const measureInput = event.target.closest('[data-drawer-split-measure]');
  if (input) {
    if (!drawerSplitState) return;
    drawerSplitState.quantities[Number(input.dataset.drawerSplitQty)] = num(input.value);
    updateDrawerSplitTotal();
    return;
  }
  if (measureInput) {
    if (!drawerSplitState) return;
    const index = Number(measureInput.dataset.drawerSplitMeasure);
    const field = measureInput.dataset.field;
    if (!drawerSplitState.measures[index]) drawerSplitState.measures[index] = {};
    drawerSplitState.measures[index][field] = num(measureInput.value);
    return;
  }
  const moduleQty = event.target.closest('[data-module-split-qty]');
  if (moduleQty) {
    if (!moduleSplitState) return;
    const index = Number(moduleQty.dataset.moduleSplitQty);
    if (!moduleSplitState.rows[index]) return;
    moduleSplitState.rows[index].quantity = num(moduleQty.value);
    updateModuleSplitTotal();
  }
});
document.addEventListener('change', function (event) {
  const sideSelect = event.target.closest('[data-module-split-side]');
  if (!sideSelect || !moduleSplitState) return;
  const index = Number(sideSelect.dataset.moduleSplitSide);
  const field = sideSelect.dataset.field;
  if (!moduleSplitState.rows[index]) return;
  moduleSplitState.rows[index][field] = sideSelect.value;
});
document.addEventListener('click', function (event) {
  if (event.target.closest('[data-drawer-split-close]') || event.target.id === 'drawerSplitModal') {
    closeDrawerSplitModal();
    return;
  }
  if (event.target.closest('[data-drawer-split-apply]')) {
    applyDrawerSplitModal();
  }
  if (event.target.closest('[data-module-split-close]') || event.target.id === 'moduleSplitModal') {
    closeModuleSplitModal();
    return;
  }
  if (event.target.closest('[data-module-split-apply]')) {
    applyModuleSplitModal();
  }
});
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && drawerSplitState) closeDrawerSplitModal();
  if (event.key === 'Escape' && moduleSplitState) closeModuleSplitModal();
});

document.querySelector('#addModuleButton').addEventListener('click', addModule);
document.querySelector('#addFurnitureButton').addEventListener('click', createFurnitureGroup);
document.querySelector('#manageFurnitureButton').addEventListener('click', manageFurnitureGroups);
document.querySelector('#addExtraButton').addEventListener('click', addExtra);
document.querySelector('#resetButton').addEventListener('click', resetQuote);
if (saveHistoryButton) {
  saveHistoryButton.addEventListener('click', function () {
    saveCurrentQuoteToHistory().catch(function (error) { sourceStatus.textContent = error.message; });
  });
}
if (quoteHistorySearch) {
  let quoteHistorySearchTimer = null;
  quoteHistorySearch.addEventListener('input', function () {
    state.quoteHistorySearch = quoteHistorySearch.value.trim();
    renderQuoteHistory();
    clearTimeout(quoteHistorySearchTimer);
    quoteHistorySearchTimer = setTimeout(function () {
      loadQuoteHistoryList(state.quoteHistoryOwnerId, state.quoteHistoryOwnerLabel)
        .catch(function (error) { sourceStatus.textContent = error.message; });
    }, 300);
  });
}
if (quoteHistoryList) {
  quoteHistoryList.addEventListener('click', function (event) {
    const openButton = event.target.closest('[data-open-history]');
    const deleteButton = event.target.closest('[data-delete-history]');
    if (deleteButton) {
      deleteHistoryEntry(deleteButton.dataset.deleteHistory).catch(function (error) { sourceStatus.textContent = error.message; });
      return;
    }
    if (openButton) {
      loadQuoteHistory(openButton.dataset.openHistory).catch(function (error) { sourceStatus.textContent = error.message; });
    }
  });
}
function waitForPrintImages() {
  const images = Array.from(printSheet.querySelectorAll('img'));
  return Promise.all(images.map(function (image) {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise(function (resolve) {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }));
}

function safeFilePart(value, fallback) {
  const text = cleanDisplayText(value || fallback || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback || '';
}

function printDocumentTitle() {
  const client = safeFilePart(state.client?.name, 'Sem cliente').replace(/\s+/g, '_');
  const date = safeFilePart(state.client?.date, new Date().toLocaleDateString('pt-PT')).replace(/[.\s/]+/g, '-');
  return ['Silwood_Orçamento', client, date].filter(Boolean).join('_');
}

document.querySelector('#printButton').addEventListener('click', async function () {
  const previousTitle = document.title;
  document.title = printDocumentTitle();
  renderPrint();
  await waitForPrintImages();
  window.print();
  setTimeout(function () { document.title = previousTitle; }, 1000);
});

boot().catch(function (error) {
  sourceStatus.textContent = 'Erro';
  document.querySelector('.excel-sheet').innerHTML = '<div class="sheet-title">Erro</div><div style="padding:16px">' + esc(error.message) + '</div>';
});
