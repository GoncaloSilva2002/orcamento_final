const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createPricingEngine } = require('../src/pricing-engine');
const { createCatalogStore } = require('../src/catalog-store');
const seed = require('../data/catalog-seed.json');

test('pricing matches pre-migration results for every type and pricing mode', () => {
  const engine = createPricingEngine(structuredClone(seed));
  for (const entry of require('./fixtures/pricing-baseline.json')) {
    assert.deepEqual(engine.calculateModulePrice(entry.input, entry.mode), entry.result);
  }
});

test('feet come from the Custos tab: inferior and column modules use kitchen feet, wardrobes their own', () => {
  const baseInput = require('./fixtures/pricing-baseline.json')[0].input;
  const withoutCosts = createPricingEngine(structuredClone(seed));
  const costs = [
    { name: 'Pés', type: 'Cozinha', cost: 1, client: 3 },
    { name: 'Pés', type: 'Roupeiro', cost: 2, client: 5 }
  ];
  const withCosts = createPricingEngine({ ...structuredClone(seed), costs });
  const feetClient = input => withCosts.calculateModulePrice(input).unitClient - withoutCosts.calculateModulePrice(input).unitClient;
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.001, actual + ' != ' + expected);
  near(feetClient({ ...baseInput, type: 'Inferior', width: 60 }), 4 * 3);
  near(feetClient({ ...baseInput, type: 'Inferior', width: 80 }), 6 * 3);
  near(feetClient({ ...baseInput, type: 'Coluna', width: 60, height: 210 }), 4 * 3);
  near(feetClient({ ...baseInput, type: 'Coluna', width: 80, height: 210 }), 6 * 3);
  near(feetClient({ ...baseInput, type: 'Roupeiro', width: 80, height: 240 }), 6 * 5);
  near(feetClient({ ...baseInput, type: 'Superior', width: 80, height: 70 }), 0);
});

test('painting service cost is added per m² while the entered client price is preserved', () => {
  const input = { ...require('./fixtures/pricing-baseline.json').find(entry => entry.input.paintDoor && entry.input.paintDoor !== 'Nenhuma').input };
  input.paintDoor = seed.catalog.paintings.find(item => item.name.toLowerCase().startsWith('velaturas claras')).name;
  const baseline = createPricingEngine(structuredClone(seed)).calculateModulePrice(input);
  const updatedSeed = structuredClone(seed);
  const serviceRate = 3.25;
  const clientRate = 123.45;
  const selectedPaint = updatedSeed.catalog.paintings.find(item => item.name === input.paintDoor);
  selectedPaint.serviceCostPerM2 = serviceRate;
  selectedPaint.client = clientRate;
  const updated = createPricingEngine(updatedSeed).calculateModulePrice(input);

  const clientOnlySeed = structuredClone(seed);
  clientOnlySeed.catalog.paintings.find(item => item.name === input.paintDoor).client = clientRate;
  const clientOnly = createPricingEngine(clientOnlySeed).calculateModulePrice(input);

  assert.ok(updated.unitCost > baseline.unitCost);
  assert.equal(updated.unitClient, clientOnly.unitClient);
});

test('local persistence survives reload and rejects stale revisions', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'silwood-store-'));
  const options = {mode:'local', file:path.join(directory,'catalog.json')};
  const store = createCatalogStore(options);
  const row = await store.read();
  row.data.catalog.plates[0].supplierPrice = 123.45;
  await store.save(row.data, row.revision);
  assert.equal((await createCatalogStore(options).read()).data.catalog.plates[0].supplierPrice, 123.45);
  await assert.rejects(store.save(row.data, row.revision), /alterado/);
});

test('Supabase failures and write conflicts are reported without local fallback', async () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  try {
    const store = createCatalogStore({mode:'supabase',url:'https://example.supabase.co',key:'test'});
    global.fetch = async () => new Response('[]',{status:200});
    // Uma base de dados vazia devolve um catálogo vazio, nunca o ficheiro local.
    const empty = await store.read();
    assert.equal(empty.data.catalog.plates.length, 0);
    global.fetch = async () => new Response('conflict',{status:409});
    await assert.rejects(store.save(empty.data, empty.revision, { plates: [{ catalogId: 'placas_madeira:1', reference: 'X', supplierPrice: 1 }] }), /outro utilizador/);
    console.error = () => {};
    global.fetch = async () => new Response('secret remote error',{status:500});
    await assert.rejects(store.read(), error => error.message.includes('HTTP 500') && !error.message.includes('secret'));
  } finally { global.fetch = originalFetch; console.error = originalConsoleError; }
});

test('painting title and editable client price load from and save to the tintas table', async () => {
  const originalFetch = global.fetch;
  let savedPainting;
  const databasePainting = {
    id: 2,
    nome: 'Verniz Poliuretano Alto Brilhante',
    referencia: 'subcapa + esmalte alto brilho',
    preco_fornecedor: 0,
    custo: 81,
    preco_cliente: 110,
    preco_revendedor: 150
  };
  try {
    global.fetch = async (input, init = {}) => {
      const url = new URL(input);
      const table = url.pathname.split('/').pop();
      if (init.method === 'PATCH' && table === 'tintas') {
        savedPainting = JSON.parse(init.body);
        return new Response(JSON.stringify([{ ...databasePainting, ...savedPainting }]), { status: 200 });
      }
      const rows = table === 'tintas' ? [databasePainting] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    };
    const store = createCatalogStore({ mode: 'supabase', url: 'https://example.supabase.co', key: 'test-key' });
    const loaded = await store.read();
    const painting = loaded.data.catalog.paintings[0];
    assert.equal(painting.name, databasePainting.nome);
    assert.equal(painting.client, 110);
    assert.equal(painting.reseller, 110);
    assert.equal(painting.cost, 81);

    await store.save(loaded.data, loaded.revision, {
      paintings: [{ ...painting, name: 'Titulo editado', client: 125 }]
    });
    assert.equal(savedPainting.nome, 'Titulo editado');
    assert.equal(savedPainting.preco_cliente, 125);
    assert.equal(savedPainting.preco_revendedor, 125);
    assert.equal(savedPainting.referencia, databasePainting.referencia);
  } finally {
    global.fetch = originalFetch;
  }
});

test('application works without Excel: bootstrap, calculate, authorization, save and reload', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'silwood-api-'));
  Object.assign(process.env, {CATALOG_STORAGE:'local', CATALOG_LOCAL_FILE:path.join(directory,'catalog.json'), SUPABASE_URL:'', SUPABASE_ANON_KEY:'', SUPABASE_SERVICE_ROLE_KEY:'', SILWOOD_ADMIN_USER:'test-admin', SILWOOD_ADMIN_PASSWORD:'test-password'});
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function(name, ...args) {
    if (name === 'xlsx' || name === 'child_process') throw new Error('Excel dependency attempted');
    return originalLoad.call(this,name,...args);
  };
  const originalRead = fs.readFileSync;
  fs.readFileSync = function(file, ...args) {
    if (/\.(xlsm|xlsx|xls)$/i.test(String(file))) throw new Error('Excel read attempted');
    return originalRead.call(this,file,...args);
  };
  let server;
  try {
    const { app } = require('../src/server');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = (url,method='GET',body,cookie='') => fetch(base+url,{method,headers:{'Content-Type':'application/json',Cookie:cookie},body:body?JSON.stringify(body):undefined});
    const bootstrap = await (await request('/api/bootstrap')).json();
    assert.equal(bootstrap.source.storage,'local');
    assert.equal(bootstrap.catalog.plates.length,seed.catalog.plates.length);
    const kitchenDrawerResponse = await request('/api/calculate','POST',{
      modules:[],
      extras:[{
        group:'Gavetas',item:'GAVETA ANTARO EXTERIOR',quantity:1,
        tipo:'Roupeiro',handleUse:'roupeiro',family:'Roupeiro'
      }]
    });
    const kitchenDrawerQuote = await kitchenDrawerResponse.json();
    assert.equal(kitchenDrawerQuote.extras[0].item,'GAVETA ANTARO EXTERIOR');
    assert.equal(kitchenDrawerQuote.extras[0].unitClient,70);
    const drawerMaterial = bootstrap.catalog.plates[0].name;
    const wardrobeDrawer = {
      group:'Gavetas Roupeiro',item:'Gaveta Roupeiro',quantity:3,
      drawerMaterialMode:'Interior',drawerInterior:drawerMaterial,drawerExterior:drawerMaterial,
      moduleDistribution:[{moduleId:'column_1',quantity:3,drawerWidth:50,drawerDepth:40,drawerHeight:16}]
    };
    const narrowDrawerQuote = await (await request('/api/calculate','POST',{modules:[],extras:[wardrobeDrawer]})).json();
    const widerDrawerQuote = await (await request('/api/calculate','POST',{modules:[],extras:[{
      ...wardrobeDrawer,
      moduleDistribution:[{...wardrobeDrawer.moduleDistribution[0],drawerWidth:60}]
    }]})).json();
    assert.ok(widerDrawerQuote.extras[0].totalClient > narrowDrawerQuote.extras[0].totalClient);
    const quote = await (await request('/api/calculate','POST',bootstrap)).json();
    assert.ok(Number.isFinite(quote.totals.finalTotal));
    const payload = {plates:[{...bootstrap.catalog.plates[0],supplierPrice:123.45}]};
    assert.equal((await request('/api/supplier-prices','PUT',payload)).status,401);
    const login = await request('/api/login','POST',{username:'test-admin',password:'test-password'});
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const initialSupplierCosts = await (await request('/api/supplier-prices')).json();
    const internationalPackagingSave = await request('/api/supplier-prices','PUT',{extras:[{
      group:'Transporte e embalamento',item:'Embalamento Internacional Standard',
      reference:'Embalamento Internacional Standard',cost:10,client:20
    },{
      group:'Transporte e embalamento',item:'Embalamento Internacional Lacado',
      reference:'Embalamento Internacional Lacado',cost:12,client:24
    },{
      group:'Transporte e embalamento',item:'Embalamento Nacional Standard',
      reference:'Embalamento Nacional Standard',cost:8,client:16
    },{
      group:'Transporte e embalamento',item:'Embalamento Nacional Lacado',
      reference:'Embalamento Nacional Lacado',cost:9,client:18
    }]},cookie);
    assert.equal(internationalPackagingSave.status,200,await internationalPackagingSave.clone().text());
    const paintInput = { ...require('./fixtures/pricing-baseline.json').find(entry => entry.input.paintDoor && entry.input.paintDoor !== 'Nenhuma').input };
    paintInput.paintDoor = bootstrap.catalog.paintings.find(item => item.name.toLowerCase().startsWith('velaturas claras')).name;
    const paintQuoteBefore = await (await request('/api/calculate','POST',{modules:[paintInput]})).json();
    const paintCostItem = initialSupplierCosts.costs.find(item => item.name.toLowerCase().includes('pintura')) || {
      id:'cost:test:painting',name:'Pintura',type:'ambos',cost:0,client:0
    };
    const laborItem = initialSupplierCosts.costs.find(item => item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes('mao') && item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes('obra'));
    const hourlyLabor = Number(laborItem?.cost) > 0 ? Number(laborItem.cost) : Number(laborItem?.client) || 0;
    const paintCatalogItem = bootstrap.catalog.paintings.find(item => item.name === paintInput.paintDoor);
    const paintCostSave = await request('/api/supplier-prices','PUT',{
      costs:[{...paintCostItem,cost:paintCostItem.cost + 3}],
      paintings:[{...paintCatalogItem,client:123}]
    },cookie);
    assert.equal(paintCostSave.status,200,await paintCostSave.clone().text());
    const savedPaintCost = (await paintCostSave.json()).costs.find(item => item.name.toLowerCase().includes('pintura'));
    const expectedServiceRate = ((paintCostItem.cost + 3 + hourlyLabor) / 8) * 1.5;
    assert.ok(Math.abs(savedPaintCost.client - expectedServiceRate) < 0.0001);
    const paintQuoteAfter = await (await request('/api/calculate','POST',{modules:[paintInput]})).json();
    assert.ok(paintQuoteAfter.modules[0].unitCost > paintQuoteBefore.modules[0].unitCost);
    assert.ok(paintQuoteAfter.modules[0].unitClient > paintQuoteBefore.modules[0].unitClient);
    const kitchenAssembly = initialSupplierCosts.costs.find(item => item.name === 'Montagem de gavetas - Cozinha');
    const wardrobeAssembly = initialSupplierCosts.costs.find(item => item.name === 'Montagem de gavetas - Roupeiro');
    assert.ok(kitchenAssembly);
    assert.ok(wardrobeAssembly);
    assert.equal(kitchenAssembly.type,'cozinha');
    assert.equal(wardrobeAssembly.type,'roupeiro');
    assert.ok(Math.abs(kitchenAssembly.cost - (8 * 0.06)) < 0.0001);
    assert.ok(Math.abs(wardrobeAssembly.cost - (4 * 0.07)) < 0.0001);
    const kitchenDrawerQuoteInput = {
      modules:[],
      extras:[{group:'Gavetas',item:'GAVETA ANTARO EXTERIOR',quantity:1}]
    };
    const baselineKitchenDrawerWithCostTable = await (await request('/api/calculate','POST',{
      modules:[],extras:[{group:'Gavetas',item:'GAVETA ANTARO EXTERIOR',quantity:1}],
      catalog:{costs:initialSupplierCosts.costs}
    })).json();
    const assemblyOnlyWardrobe = {
      ...wardrobeDrawer,quantity:1,
      moduleDistribution:[{moduleId:'column_1',quantity:1,drawerWidth:0,drawerDepth:0,drawerHeight:0}]
    };
    const baselineWardrobeAssemblyOnly = await (await request('/api/calculate','POST',{
      modules:[],extras:[assemblyOnlyWardrobe],catalog:{costs:initialSupplierCosts.costs}
    })).json();
    assert.ok(Math.abs(baselineWardrobeAssemblyOnly.extras[0].unitCost - (4 * 0.07)) < 0.01);
    const drawerAssemblySave = await request('/api/supplier-prices','PUT',{
      costs:[{name:'Mão de obra',type:'ambos',cost:23,client:23}]
    },cookie);
    assert.equal(drawerAssemblySave.status,200,await drawerAssemblySave.clone().text());
    const drawerAssemblySaved = await drawerAssemblySave.json();
    const savedKitchenAssembly = drawerAssemblySaved.costs.find(item => item.name === 'Montagem de gavetas - Cozinha');
    const savedWardrobeAssembly = drawerAssemblySaved.costs.find(item => item.name === 'Montagem de gavetas - Roupeiro');
    assert.ok(Math.abs(savedKitchenAssembly.cost - (8 * 0.06 + 23 * 7 / 60)) < 0.0001);
    assert.ok(Math.abs(savedWardrobeAssembly.cost - (4 * 0.07 + 23 * 10 / 60)) < 0.0001);
    assert.ok(Math.abs(drawerAssemblySaved.rules.drawerLabor - savedKitchenAssembly.cost) < 0.0001);
    assert.ok(Math.abs(drawerAssemblySaved.rules.wardrobeDrawerLabor - savedWardrobeAssembly.cost) < 0.0001);
    const internationalPackagingQuote = await (await request('/api/calculate','POST',{
      modules:[],extras:[{group:'Transporte e embalamento',item:'Embalamento Internacional Standard',quantity:1}],
      catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    assert.ok(Math.abs(internationalPackagingQuote.extras[0].unitCost - (10 + 23 * 20 / 60)) < 0.0001);
    assert.ok(Math.abs(internationalPackagingQuote.extras[0].unitClient - (10 + 23 * 20 / 60) * 2) < 0.0001);
    const lacqueredInternationalPackagingQuote = await (await request('/api/calculate','POST',{
      modules:[],extras:[{group:'Transporte e embalamento',item:'Embalamento Internacional Lacado',quantity:1}],
      catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    assert.ok(Math.abs(lacqueredInternationalPackagingQuote.extras[0].unitCost - (12 + 23 * 35 / 60)) < 0.0001);
    assert.ok(Math.abs(lacqueredInternationalPackagingQuote.extras[0].unitClient - (12 + 23 * 35 / 60) * 2) < 0.0001);
    const nationalPackagingQuote = await (await request('/api/calculate','POST',{
      modules:[],extras:[{group:'Transporte e embalamento',item:'Embalamento Nacional Standard',quantity:1}],
      catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    assert.ok(Math.abs(nationalPackagingQuote.extras[0].unitCost - (8 + 23 * 10 / 60)) < 0.0001);
    assert.ok(Math.abs(nationalPackagingQuote.extras[0].unitClient - (8 + 23 * 10 / 60) * 2) < 0.0001);
    const lacqueredNationalPackagingQuote = await (await request('/api/calculate','POST',{
      modules:[],extras:[{group:'Transporte e embalamento',item:'Embalamento Nacional Lacado',quantity:1}],
      catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    assert.ok(Math.abs(lacqueredNationalPackagingQuote.extras[0].unitCost - (9 + 23 * 25 / 60)) < 0.0001);
    assert.ok(Math.abs(lacqueredNationalPackagingQuote.extras[0].unitClient - (9 + 23 * 25 / 60) * 2) < 0.0001);
    const updatedKitchenQuote = await (await request('/api/calculate','POST',{
      ...kitchenDrawerQuoteInput,catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    const updatedWardrobeQuote = await (await request('/api/calculate','POST',{
      modules:[],extras:[assemblyOnlyWardrobe],catalog:{costs:drawerAssemblySaved.costs}
    })).json();
    assert.ok(Math.abs(updatedKitchenQuote.extras[0].unitCost - baselineKitchenDrawerWithCostTable.extras[0].unitCost - 23 * 7 / 60) < 0.01,
      JSON.stringify({baseline:baselineKitchenDrawerWithCostTable.extras[0].unitCost,updated:updatedKitchenQuote.extras[0].unitCost}));
    assert.ok(Math.abs(updatedWardrobeQuote.extras[0].unitCost - savedWardrobeAssembly.cost) < 0.01,
      JSON.stringify({baseline:baselineWardrobeAssemblyOnly.extras[0].unitCost,updated:updatedWardrobeQuote.extras[0].unitCost,expected:savedWardrobeAssembly.cost}));
    assert.equal(updatedKitchenQuote.extras[0].unitClient,baselineKitchenDrawerWithCostTable.extras[0].unitClient);
    assert.equal(updatedWardrobeQuote.extras[0].unitClient,baselineWardrobeAssemblyOnly.extras[0].unitClient);
    const save = await request('/api/supplier-prices','PUT',payload,cookie);
    assert.equal(save.status,200,await save.clone().text());
    assert.equal((await save.json()).saved.updated,1);
    const loaded = await (await request('/api/bootstrap')).json();
    assert.equal(loaded.catalog.plates[0].supplierPrice,123.45);
    assert.ok(Math.abs(loaded.catalog.plates[0].cost - (123.45 + 2.02 + (23 * 0.5) / 2.64)) < 0.005);
    const renamed = {...loaded.catalog.plates[0],__dirtyIndex:0,name:'Placa teste editada'};
    const editSave = await request('/api/supplier-prices','PUT',{plates:[renamed]},cookie);
    assert.equal(editSave.status,200,await editSave.clone().text());
    const edited = await (await request('/api/bootstrap')).json();
    assert.equal(edited.catalog.plates[0].name,'Placa teste editada');
    assert.equal(edited.catalog.plates.filter(item => item.name === 'Placa teste editada').length,1);
    const referenceSave = await request('/api/supplier-prices','PUT',{plates:[{__dirtyIndex:0,reference:'REF independente 123'}]},cookie);
    assert.equal(referenceSave.status,200,await referenceSave.clone().text());
    const referenceEdited = await (await request('/api/bootstrap')).json();
    assert.equal(referenceEdited.catalog.plates[0].name,'Placa teste editada');
    assert.equal(referenceEdited.catalog.plates[0].reference,'REF independente 123');
    assert.equal(referenceEdited.catalog.plates.length,seed.catalog.plates.length);
    const groupChange = {__dirtyIndex:0,compareGroup:'Nome escolhido no comparador',compareGroupKey:'grupo-estavel'};
    const groupSave = await request('/api/supplier-prices','PUT',{plates:[groupChange]},cookie);
    assert.equal(groupSave.status,200,await groupSave.clone().text());
    const groupSaved = await groupSave.json();
    assert.equal(groupSaved.plates[0].compareGroup,groupChange.compareGroup);
    assert.equal(groupSaved.plates[0].compareGroupKey,groupChange.compareGroupKey);
    const groupReloaded = await (await request('/api/supplier-prices')).json();
    assert.equal(groupReloaded.plates[0].compareGroup,groupChange.compareGroup);
    assert.equal(groupReloaded.plates[0].compareGroupKey,groupChange.compareGroupKey);
    assert.equal(groupReloaded.plates[0].name,'Placa teste editada');
    assert.equal(groupReloaded.plates[0].reference,'REF independente 123');
    const staleRename = {...edited.catalog.plates[0],name:'Nome sem indice antigo'};
    delete staleRename.__dirtyIndex;
    delete staleRename.catalogId;
    const staleSave = await request('/api/supplier-prices','PUT',{plates:[staleRename]},cookie);
    assert.equal(staleSave.status,200,await staleSave.clone().text());
    const afterStale = await (await request('/api/bootstrap')).json();
    assert.equal(afterStale.catalog.plates.some(item => item.name === 'Nome sem indice antigo'),false);
    assert.equal(afterStale.catalog.plates.length,seed.catalog.plates.length);
    const deletedName = edited.catalog.plates[1].name;
    const directDelete = await request('/api/supplier-prices/item','DELETE',{type:'plates',index:1},cookie);
    assert.equal(directDelete.status,200,await directDelete.clone().text());
    const deleted = await (await request('/api/bootstrap')).json();
    assert.equal(deleted.catalog.plates.some(item => item.name === deletedName),false);
    assert.equal(deleted.catalog.plates.filter(item => item.name === 'Placa teste editada').length,1);
    assert.equal(deleted.catalog.plates.length,seed.catalog.plates.length - 1);
    const target = deleted.catalog.plates[2];
    const untouched = structuredClone(deleted.catalog.plates[0]);
    const stableSave = await request('/api/supplier-prices','PUT',{plates:[{catalogId:target.catalogId,__dirtyIndex:0,reference:untouched.reference}]},cookie);
    assert.equal(stableSave.status,200,await stableSave.clone().text());
    const stableReload = await (await request('/api/bootstrap')).json();
    assert.deepEqual(stableReload.catalog.plates[0],untouched);
    assert.equal(stableReload.catalog.plates[2].catalogId,target.catalogId);
    assert.equal(stableReload.catalog.plates[2].name,target.name);
    assert.equal(stableReload.catalog.plates[2].reference,untouched.reference);
    assert.equal(stableReload.catalog.plates.length,deleted.catalog.plates.length);
    const migrated = {...stableReload.catalog.plates[2],catalogId:'old-browser-id',supplierPrice:22.34};
    const migratedSave = await request('/api/supplier-prices','PUT',{plates:[migrated]},cookie);
    assert.equal(migratedSave.status,200,await migratedSave.clone().text());
    const migratedReload = await (await request('/api/bootstrap')).json();
    assert.equal(migratedReload.catalog.plates[2].catalogId,target.catalogId);
    assert.equal(migratedReload.catalog.plates[2].supplierPrice,22.34);
    const invalidSave = await request('/api/supplier-prices','PUT',{plates:[
      {catalogId:untouched.catalogId,supplierPrice:999},
      {catalogId:'missing-id',name:'Material inexistente',__dirtyIndex:0}
    ]},cookie);
    assert.equal(invalidSave.status,500);
    assert.match((await invalidSave.json()).error,/Material inexistente/);
    const afterInvalid = await (await request('/api/bootstrap')).json();
    assert.deepEqual(afterInvalid.catalog.plates,migratedReload.catalog.plates);
    const disk = await createCatalogStore({mode:'local',file:process.env.CATALOG_LOCAL_FILE}).read();
    assert.equal(disk.data.catalog.plates[0].name,'Placa teste editada');

    const sawSave = await request('/api/supplier-prices','PUT',{costs:[
      {name:'Mão de obra',type:'ambos',cost:23,client:23},
      {name:'Seccionadora',type:'ambos',cost:3.42976}
    ]},cookie);
    assert.equal(sawSave.status,200,await sawSave.clone().text());
    const savedCosts = await sawSave.json();
    const sawCost = savedCosts.costs.find(item => item.name === 'Seccionadora');
    assert.ok(sawCost);
    const partialCostSave = await request('/api/supplier-prices','PUT',{costs:[{...sawCost,cost:3.42976}]},cookie);
    assert.equal(partialCostSave.status,200,await partialCostSave.clone().text());
    const partialCostResult = await partialCostSave.json();
    assert.ok(partialCostResult.costs.some(item => item.name === 'Mão de obra' && item.cost === 23));
    const withSaw = await (await request('/api/bootstrap')).json();
    const sawPlate = withSaw.catalog.plates[0];
    const assemblyLaborPerSquareMeter = (23 * 0.5) / 2.64;
    assert.ok(Math.abs(sawPlate.cost - (sawPlate.supplierPrice + 1.71 + assemblyLaborPerSquareMeter)) < 0.005);
    assert.ok(Math.abs(sawPlate.client - sawPlate.cost * 1.92) < 0.005);
    const forcedAutomatic = await request('/api/supplier-prices/plate','POST',{
      plate:{...sawPlate,manualClient:false,manualReseller:false}
    },cookie);
    assert.equal(forcedAutomatic.status,200,await forcedAutomatic.clone().text());
    const automaticReseller = (await forcedAutomatic.json()).plates[0];
    assert.ok(Math.abs(automaticReseller.reseller - automaticReseller.cost * 1.45) < 0.005);
  } finally {
    Module._load = originalLoad;
    fs.readFileSync = originalRead;
    if (server) await new Promise(resolve=>server.close(resolve));
  }
});
