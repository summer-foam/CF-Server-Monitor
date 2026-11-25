import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parse, compileScript } from 'vue/compiler-sfc'
import { computed, effectScope, reactive, ref, watch, nextTick } from 'vue'
import { useTheme } from '../src/frontend/composables/useTheme.js'
import { isNewerVersion } from '../src/frontend/utils/version.js'
import { getMikusAssetUrl } from '../src/frontend/utils/themeOptions.js'

const readFrontend = (relPath) =>
  fs.readFileSync(new URL(`../src/frontend/${relPath}`, import.meta.url), 'utf8')

const installMinimalBrowserEnv = () => {
  const store = new Map()
  const classSet = new Set()
  const prevWindow = globalThis.window
  const prevDocument = globalThis.document
  const prevLocalStorage = globalThis.localStorage

  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) }
  }
  globalThis.document = {
    body: {
      classList: {
        add: (...names) => names.forEach(n => classSet.add(n)),
        remove: (...names) => names.forEach(n => classSet.delete(n)),
        toggle: (name, force) => {
          const next = force !== undefined ? Boolean(force) : !classSet.has(name)
          if (next) classSet.add(name)
          else classSet.delete(name)
          return next
        },
        contains: (name) => classSet.has(name)
      }
    }
  }
  globalThis.window = {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
  }

  return () => {
    globalThis.window = prevWindow
    globalThis.document = prevDocument
    globalThis.localStorage = prevLocalStorage
  }
}

test('useTheme onThemeChange returns an unsubscribe cleanup that stops future notifications', (t) => {
  const restore = installMinimalBrowserEnv()
  t.after(restore)

  const { onThemeChange, setTheme } = useTheme()
  const received = []
  const stop = onThemeChange((theme) => received.push(theme))

  setTheme('light')
  assert.deepEqual(received, ['light'])

  stop()
  setTheme('dark')
  assert.deepEqual(received, ['light'])
})

test('ServerRingCard unlimited traffic bar does not render stray ">" text', () => {
  const source = readFrontend('components/ServerRingCard.vue')
  assert.equal(source.includes(';">></div>'), false)
})

test('ServerTable custom group input stays open while clearing or typing a known group name, and select-all computeds stay in sync', async (t) => {
  const source = readFrontend('views/admin/components/ServerTable.vue')
  const script = compileScript(parse(source).descriptor, { id: 'server-table-test' }).content
  const cleaned = script
    .replace(/^import .* from ['"].*['"]\s*$/gm, '')
    .replace('export default', 'return')

  const createComponent = new Function('deps', `
    const {
      computed, onBeforeUnmount, ref, watch,
      useModel: _useModel, mergeModels: _mergeModels,
      getFlagRegionCode, formatBytes, getPublicAssetUrl, currentLang,
      detectBillingCycle, detectCurrencySymbol, getBillingCycleOption,
      getLocalizedOptionField, isEnabledFlag, isFreePrice, normalizeCurrency, normalizePrice
    } = deps
    const stub = {}
    const Bot = stub, Check = stub, Copy = stub, Flag = stub, GripVertical = stub,
      Loader2 = stub, Package = stub, Pencil = stub, Plus = stub, RefreshCw = stub,
      SquareCheck = stub, Trash2 = stub, X = stub, OsIcon = stub, HelpTooltip = stub
    ${cleaned}
  `)

  const props = reactive({
    trans: { default: 'Default', custom: 'Custom', free: 'Free' },
    servers: [{ id: 's1' }, { id: 's2' }],
    selectedServers: [],
    groups: ['Default', 'Prod'],
    activeTab: 'servers',
    selectedApiIndex: 0,
    newServerName: '',
    newServerGroup: ''
  })

  const useModel = (p, key) => computed({
    get: () => p[key],
    set: (v) => { p[key] = v }
  })

  const component = createComponent({
    computed,
    onBeforeUnmount: () => {},
    ref,
    watch,
    useModel,
    mergeModels: (a, b) => ({ ...a, ...b }),
    getFlagRegionCode: (r) => r,
    formatBytes: (v) => String(v),
    getPublicAssetUrl: (v) => v,
    currentLang: ref('zh'),
    detectBillingCycle: () => 'month',
    detectCurrencySymbol: () => '¥',
    getBillingCycleOption: () => ({ shortLabelZh: '月', shortLabelEn: 'mo' }),
    getLocalizedOptionField: () => '月',
    isEnabledFlag: Boolean,
    isFreePrice: () => false,
    normalizeCurrency: (v) => v,
    normalizePrice: (v) => v
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(props, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  // Switch to custom group mode
  state.selectedServerGroup.value = '__custom__'
  await nextTick()
  assert.equal(state.showCustomServerGroup.value, true)

  // Typing a prefix that matches an existing group ("Prod") or clearing must NOT collapse custom input
  props.newServerGroup = 'Prod'
  await nextTick()
  assert.equal(state.showCustomServerGroup.value, true)

  props.newServerGroup = ''
  await nextTick()
  assert.equal(state.showCustomServerGroup.value, true)

  // Explicit clear exits custom mode
  state.clearServerGroup()
  await nextTick()
  assert.equal(state.showCustomServerGroup.value, false)

  // Select-all and indeterminate computeds track selectedServers accurately
  assert.equal(state.allServersSelected.value, false)
  assert.equal(state.someServersSelected.value, false)

  props.selectedServers = ['s1']
  assert.equal(state.allServersSelected.value, false)
  assert.equal(state.someServersSelected.value, true)

  props.selectedServers = ['s1', 's2']
  assert.equal(state.allServersSelected.value, true)
  assert.equal(state.someServersSelected.value, false)
})

test('EditServerModal shows offline notification option when webhook channel is enabled without tg_bot_token', (t) => {
  const source = readFrontend('views/admin/components/EditServerModal.vue')
  const script = compileScript(parse(source).descriptor, { id: 'edit-server-modal-test' }).content
  const cleaned = script
    .replace(/^import .* from ['"].*['"]\s*$/gm, '')
    .replace('export default', 'return')

  const createComponent = new Function('deps', `
    const {
      computed, watch, useModel: _useModel, mergeModels: _mergeModels,
      PING_NODE_FIELDS, validatePingNode, currentLang,
      BILLING_CYCLES, CURRENCY_OPTIONS, getLocalizedOptionField,
      normalizePrice, renewExpireDateIfNeeded
    } = deps
    const X = {}, HelpTooltip = {}
    ${cleaned}
  `)

  const props = reactive({
    trans: {},
    show: true,
    currentServerName: 'node-1',
    editForm: {
      currency: '¥',
      price: '',
      billing_cycle: 'month',
      auto_renewal: false,
      expire_date: '',
      connection_mode: 'auto'
    },
    settings: {
      tg_notify: '5',
      tg_bot_token: '',
      notification_webhook_enabled: true,
      wss_report_enabled: true
    }
  })

  const useModel = (p, key) => computed({
    get: () => p[key],
    set: (v) => { p[key] = v }
  })

  const component = createComponent({
    computed,
    watch,
    useModel,
    mergeModels: (a, b) => ({ ...a, ...b }),
    PING_NODE_FIELDS: [],
    validatePingNode: () => ({ valid: true }),
    currentLang: ref('zh'),
    BILLING_CYCLES: [],
    CURRENCY_OPTIONS: [{ symbol: '¥', nameZh: '人民币', nameEn: 'CNY' }],
    getLocalizedOptionField: (item) => item.nameZh,
    normalizePrice: (v) => v,
    renewExpireDateIfNeeded: () => ({ renewed: false, expire_date: '' })
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(props, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  assert.equal(state.hasNodeNotificationOptions.value, true)

  props.settings.notification_webhook_enabled = false
  assert.equal(state.hasNodeNotificationOptions.value, false)

  props.settings.tg_bot_token = '123:token'
  assert.equal(state.hasNodeNotificationOptions.value, true)
})

const compileSfcSetup = (relPath, id) => {
  const source = readFrontend(relPath)
  const script = compileScript(parse(source).descriptor, { id }).content
  return {
    source,
    cleaned: script
      .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
      .replace('export default', 'return')
  }
}

test('isNewerVersion performs numeric semver comparison and Footer adds rel="noopener noreferrer" (#19)', () => {
  assert.equal(isNewerVersion('2.8.8', '2.8.7'), true)
  assert.equal(isNewerVersion('v2.10.0', '2.9.9'), true)
  assert.equal(isNewerVersion('2.9', '2.8.7'), true)
  assert.equal(isNewerVersion('2.8.7', '2.8.7'), false)
  assert.equal(isNewerVersion('v2.8.7', '2.8.7'), false)
  assert.equal(isNewerVersion('2.8.6', '2.8.7'), false)
  assert.equal(isNewerVersion('2.8.8-beta.1', '2.8.8'), false)
  assert.equal(isNewerVersion('2.8.8', '2.8.8-beta.1'), true)
  assert.equal(isNewerVersion('', '2.8.7'), false)
  assert.equal(isNewerVersion('invalid', '2.8.7'), false)

  const footerSource = readFrontend('components/Footer.vue')
  assert.match(footerSource, /rel="noopener noreferrer"/)
  assert.match(footerSource, /isNewerVersion\(/)
})

test('useServerCardData pingList filters 0/false values, uses sysConfig labels, and ServerLatencyPanel renders without extra filter (#17)', (t) => {
  const raw = readFrontend('composables/useServerCardData.js')
    .replace(/^import .* from ['"].*['"]\s*$/gm, '')
    .replace(/export const /g, 'const ')
    .replace('export function useServerCardData', 'function useServerCardData')

  const factory = new Function('deps', `
    const {
      computed, formatBytes, getFlagRegionCode, isServerOnline,
      getPublicAssetUrl, currentLang, useTranslation, getThreeNetPanelCount,
      LATENCY_WINDOW, PING, formatBillingPrice
    } = deps
    ${raw}
    return { useServerCardData }
  `)

  const trans = ref({
    online: 'Online',
    offline: 'Offline',
    timeout: 'Timeout',
    noSamples: 'No samples',
    expireDays: 'd',
    expired: 'Expired',
    customCt: 'Telecom',
    customCu: 'Unicom',
    customCm: 'Mobile'
  })

  const { useServerCardData } = factory({
    computed,
    formatBytes: (v) => String(v || 0),
    getFlagRegionCode: (r) => r || 'xx',
    isServerOnline: () => true,
    getPublicAssetUrl: (p) => `./${p}`,
    currentLang: ref('en'),
    useTranslation: () => trans,
    getThreeNetPanelCount: () => 3,
    LATENCY_WINDOW: { POINTS: 20, HOURS: 2 },
    PING: { GOOD_THRESHOLD: 100, WARNING_THRESHOLD: 200, CRITICAL_THRESHOLD: 300 },
    formatBillingPrice: () => ''
  })

  const props = reactive({
    server: {
      id: 's1',
      ping_ct: 0,
      ping_cu: '0',
      ping_cm: false,
      ping_bd: 'false',
      ping_node_1: 0,
      node_1_name: 'IgnoredServerNodeName'
    },
    sysConfig: {
      custom_ct_name: '',
      custom_cu_name: 'CU-Custom',
      node_1_name: 'HK-Relay'
    }
  })

  const scope = effectScope()
  const card = scope.run(() => useServerCardData(props))
  t.after(() => scope.stop())

  assert.equal(card.pingList.value.length, 0)
  assert.equal(card.hasPingData.value, false)

  props.server.ping_ct = 25
  props.server.ping_cu = null
  props.server.ping_node_1 = 42
  assert.equal(card.hasPingData.value, true)
  assert.deepEqual(card.pingList.value, [
    { key: 'ct', label: 'Telecom', value: 25 },
    { key: 'cu', label: 'CU-Custom', value: null },
    { key: 'node_1', label: 'HK-Relay', value: 42 }
  ])

  const panelSource = readFrontend('components/ServerLatencyPanel.vue')
  assert.equal(panelSource.includes('.filter(x => x.value !== 0)'), false)
  assert.match(panelSource, /:key="p\.key \|\| p\.label"/)
})

test('HelpTooltip registers global listeners only while open and cleans them up on close and unmount (#23)', (t) => {
  const { cleaned } = compileSfcSetup('components/HelpTooltip.vue', 'help-tooltip-test')

  const winListeners = new Map()
  const docListeners = new Map()
  const prevWindow = globalThis.window
  const prevDocument = globalThis.document

  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn, opts) => {
      winListeners.set(type, { fn, opts })
    },
    removeEventListener: (type, fn) => {
      if (winListeners.get(type)?.fn === fn) winListeners.delete(type)
    },
    setTimeout: () => 1,
    clearTimeout: () => {}
  }
  globalThis.document = {
    addEventListener: (type, fn) => {
      docListeners.set(type, fn)
    },
    removeEventListener: (type, fn) => {
      if (docListeners.get(type) === fn) docListeners.delete(type)
    }
  }
  t.after(() => {
    globalThis.window = prevWindow
    globalThis.document = prevDocument
  })

  let unmountHook = null
  const createComponent = new Function('deps', `
    const { nextTick, onBeforeUnmount, ref, watch } = deps
    ${cleaned}
  `)
  const component = createComponent({
    nextTick: () => Promise.resolve(),
    onBeforeUnmount: (fn) => { unmountHook = fn },
    ref,
    watch
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup({ text: 'Tip', ariaLabel: 'Help', passive: false, placement: 'top' }, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  assert.equal(winListeners.size, 0)
  assert.equal(docListeners.size, 0)

  state.openTooltip()
  assert.equal(winListeners.has('resize'), true)
  assert.equal(winListeners.has('scroll'), true)
  assert.equal(winListeners.get('scroll').opts, true)
  assert.equal(docListeners.has('pointerdown'), true)

  state.closeTooltip()
  assert.equal(winListeners.size, 0)
  assert.equal(docListeners.size, 0)

  state.openTooltip()
  assert.equal(winListeners.size, 2)
  assert.equal(docListeners.size, 1)
  unmountHook?.()
  assert.equal(winListeners.size, 0)
  assert.equal(docListeners.size, 0)
})

test('Dashboard isolates servers with identical id across multiple sites using source-qualified keys (#5)', (t) => {
  const { source, cleaned } = compileSfcSetup('views/Dashboard.vue', 'dashboard-multi-site-test')
  assert.match(source, /:key="getServerKey\(server\) \+ '-' \+ currentView"/)
  assert.match(source, /:key="getServerKey\(server\)"/)

  const createComponent = new Function('deps', `
    const {
      ref, computed, inject, nextTick, onMounted, onUnmounted, watch,
      useRouter, BarChart3, Flag, Gauge, Map: MapIcon, Table, X, XCircle,
      TerminalHeader, ServerBarCard, ServerRingCard, Footer, OsIcon, LiveConnectionTimeoutModal,
      fetchConfig, fetchServersAll, fetchServersAllWithProgress, formatBytes, createLiveSocket,
      getFlagRegionCode, isServerOnline, normalizeLiveSocketTimeoutMinutes,
      calcTrafficUsagePercent, getUsageColor, getTitle, hasConfiguredApiBase,
      hasMultipleApiBases, getApiBases, getPublicAssetUrl, currentLang, useTranslation,
      TIME, DEFAULT_SITE_TITLE, STORAGE, LATENCY_WINDOW, normalizeMetricTimestamp,
      normalizeDashboardView, normalizeDisplayMode, resolveDisplayMode,
      getPlaybackElapsedMs, resolvePlaybackCursor, getMikusAssetUrl, isMikusThemeEnabled,
      normalizeThemeOptions, setMikusThemeClass, CURRENCY_SYMBOLS, DEFAULT_EXCHANGE_RATES,
      DISPLAY_FINANCE_CURRENCIES, calculateFinanceSummary, convertCnyAmount, formatFinanceAmount,
      getDailyExchangeRates, getStoredFinanceCurrency, normalizeFinanceCurrency, setStoredFinanceCurrency
    } = deps
    const Map = globalThis.Map
    const stub = {}
    ${cleaned}
  `)

  const siteA = 'https://site-a.example'
  const siteB = 'https://site-b.example'
  const socketCallbacks = []

  const prevWindow = globalThis.window
  const prevDocument = globalThis.document
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    removeEventListener() {}
  }
  globalThis.document = { hidden: false, body: { classList: { toggle() {}, contains: () => false } } }
  t.after(() => {
    globalThis.window = prevWindow
    globalThis.document = prevDocument
  })

  const component = createComponent({
    ref,
    computed,
    inject: () => ({}),
    nextTick: () => Promise.resolve(),
    onMounted: () => {},
    onUnmounted: () => {},
    watch,
    useRouter: () => ({ push() {} }),
    BarChart3: {}, Flag: {}, Gauge: {}, Map: {}, Table: {}, X: {}, XCircle: {},
    TerminalHeader: {}, ServerBarCard: {}, ServerRingCard: {}, Footer: {}, OsIcon: {}, LiveConnectionTimeoutModal: {},
    fetchConfig: async () => ({}),
    fetchServersAll: async () => ({}),
    fetchServersAllWithProgress: async () => ({}),
    formatBytes: (v) => String(v),
    createLiveSocket: (_scope, handlers, index) => {
      socketCallbacks.push({ index, handlers })
      return { close() {}, reconnect() {}, isConnected: true }
    },
    getFlagRegionCode: (r) => r,
    isServerOnline: () => true,
    normalizeLiveSocketTimeoutMinutes: () => 0,
    calcTrafficUsagePercent: () => 0,
    getUsageColor: () => '#000',
    getTitle: () => 'Monitor',
    hasConfiguredApiBase: () => false,
    hasMultipleApiBases: () => true,
    getApiBases: () => [siteA, siteB],
    getPublicAssetUrl: (p) => `./${p}`,
    currentLang: ref('en'),
    useTranslation: () => ref({}),
    TIME: { ONLINE_THRESHOLD_MS: 120000 },
    DEFAULT_SITE_TITLE: 'Monitor',
    STORAGE: { VIEW_PREFERENCE: 'view' },
    LATENCY_WINDOW: { POINTS: 20, HOURS: 2 },
    normalizeMetricTimestamp: (ts, fallback = null) => (typeof ts === 'number' && ts > 0 ? ts : fallback),
    normalizeDashboardView: (v) => v || 'bar',
    normalizeDisplayMode: (v) => v || 'bar',
    resolveDisplayMode: () => 'bar',
    getPlaybackElapsedMs: () => 1000,
    resolvePlaybackCursor: (ts) => ts,
    getMikusAssetUrl: (f) => `./mikus/${f}`,
    isMikusThemeEnabled: () => false,
    normalizeThemeOptions: (o) => o || {},
    setMikusThemeClass: () => {},
    CURRENCY_SYMBOLS: { CNY: '¥' },
    DEFAULT_EXCHANGE_RATES: { CNY: 1 },
    DISPLAY_FINANCE_CURRENCIES: ['CNY'],
    calculateFinanceSummary: () => ({ remainingValueCNY: 0, totalValueCNY: 0, monthlyAverageCostCNY: 0, configuredCount: 0, expiredCount: 0, missingExpireCount: 0 }),
    convertCnyAmount: (v) => v,
    formatFinanceAmount: (v) => String(v),
    getDailyExchangeRates: async () => ({ rates: { CNY: 1 }, source: 'default' }),
    getStoredFinanceCurrency: () => 'CNY',
    normalizeFinanceCurrency: (c) => c,
    setStoredFinanceCurrency: () => {}
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup({}, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  const baseTs = Date.now() - 5000
  state.servers.value = state.mergeServersIntoList([
    { id: '1', name: 'SiteA-Node', source: siteA, cpu: 10, sample_timestamp: baseTs, report_timestamp: baseTs, last_updated: baseTs },
    { id: '1', name: 'SiteB-Node', source: siteB, cpu: 20, sample_timestamp: baseTs, report_timestamp: baseTs, last_updated: baseTs }
  ])

  state.startLiveSocket()
  assert.equal(socketCallbacks.length, 2)

  // Site A receives sample for id '1'
  socketCallbacks[0].handlers.onMessage({
    type: 'batchUpdate',
    ts: baseTs + 1000,
    updates: [{ serverId: '1', samples: [{ ts: baseTs + 1000, data: { cpu: 55 } }] }]
  })

  // Site B receives buffered multi-sample batch for id '1'
  socketCallbacks[1].handlers.onMessage({
    type: 'batchUpdate',
    ts: baseTs + 2000,
    updates: [{
      serverId: '1',
      samples: [
        { ts: baseTs + 1000, data: { cpu: 77 } },
        { ts: baseTs + 2000, data: { cpu: 88 } }
      ]
    }]
  })

  const serverA = state.servers.value.find(s => s.source === siteA && s.id === '1')
  const serverB = state.servers.value.find(s => s.source === siteB && s.id === '1')
  assert.equal(serverA.cpu, 55)
  assert.equal(serverA.name, 'SiteA-Node')
  assert.equal(serverB.cpu, 77)
  assert.equal(serverB.name, 'SiteB-Node')
  assert.equal(state.playbackBuffers.has(state.makeServerKey('1', siteB)), true)
  assert.equal(state.playbackBuffers.has(state.makeServerKey('1', siteA)), false)
})

test('SettingsPanel keeps resourceAlertRules pure, prunes deleted server IDs, and uses current date for DST (#16)', (t) => {
  const { source, cleaned } = compileSfcSetup('views/admin/components/SettingsPanel.vue', 'settings-panel-test')
  assert.doesNotMatch(source, /new Date\(2000,\s*0,\s*1/)

  const createComponent = new Function('deps', `
    const {
      computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch,
      Eye, EyeOff, Loader2, Save, Search, Send, Upload, X, HelpTooltip, PasskeyManager,
      FRONTEND_WS_TIMEOUT_MINUTES_MAX, HISTORY, PING_NODE_FIELDS, validatePingNode,
      LANGUAGES, LANGUAGE_MAP, NOTIFICATION_LANGUAGE_CODES
    } = deps
    ${cleaned}
  `)

  const prevDocument = globalThis.document
  globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] }
  t.after(() => { globalThis.document = prevDocument })

  const props = reactive({
    trans: { all: 'All', servers: 'Servers', noServers: 'No servers' },
    settings: {
      resource_alert_rules: [
        { id: 'r1', name: 'Rule 1', metric: 'cpu', threshold: '80', servers: ['deleted-id'], intervalMinutes: '5', mode: 'average' }
      ]
    },
    servers: [
      { id: 's1', name: 'Node 1' },
      { id: 's2', name: 'Node 2' }
    ],
    passwordVisible: {},
    activeTab: 'settings',
    selectedApiBase: '',
    selectedApiIndex: 0,
    passkeyAvailable: false,
    currentOrigin: '',
    saving: false,
    changeAdminPassword: false,
    testNotificationLoading: false,
    d1UsageLoading: false
  })

  const component = createComponent({
    computed,
    nextTick,
    onBeforeUnmount: () => {},
    onMounted: () => {},
    reactive,
    ref,
    watch,
    Eye: {}, EyeOff: {}, Loader2: {}, Save: {}, Search: {}, Send: {}, Upload: {}, X: {},
    HelpTooltip: {}, PasskeyManager: {},
    FRONTEND_WS_TIMEOUT_MINUTES_MAX: 1440,
    HISTORY: { LONG_RANGE_POINT_OPTIONS: [60, 120] },
    LANGUAGES: [],
    LANGUAGE_MAP: {},
    NOTIFICATION_LANGUAGE_CODES: [],
    PING_NODE_FIELDS: [],
    validatePingNode: () => ({ valid: true })
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(props, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  // Stale deleted server ID was pruned and fell back to existing servers rather than showing "0/2 Servers"
  assert.deepEqual(props.settings.resource_alert_rules[0].servers, ['s1', 's2'])
  assert.equal(state.resourceAlertServerSelectLabel(state.resourceAlertRules.value[0]), 'All (2)')

  // Computed remains pure even when settings.resource_alert_rules is non-array
  const bareProps = reactive({ ...props, settings: { resource_alert_rules: null } })
  const bareScope = effectScope()
  const bareState = bareScope.run(() => component.setup(bareProps, { emit() {}, expose() {} }))
  bareScope.stop()
  assert.deepEqual(bareState.resourceAlertRules.value, [])
})

test('ThemeConfigButton rolls back previewed colors on Escape and unmount without saving, and removes dead savedMessage (#15)', (t) => {
  const { source, cleaned } = compileSfcSetup('components/ThemeConfigButton.vue', 'theme-config-button-test')
  assert.equal(source.includes('savedMessage'), false)
  assert.match(source, /@click\.self="closeModal"/)

  const restore = installMinimalBrowserEnv()
  const events = []
  const keyListeners = new Set()
  globalThis.window.addEventListener = (type, fn) => { if (type === 'keydown') keyListeners.add(fn) }
  globalThis.window.removeEventListener = (type, fn) => { if (type === 'keydown') keyListeners.delete(fn) }
  globalThis.window.dispatchEvent = (evt) => { events.push(evt) }
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }
  t.after(restore)

  const appliedColors = []
  const appliedMikus = []
  let unmountFn = null

  const createComponent = new Function('deps', `
    const {
      inject, onUnmounted, ref, Minus, Plus, SlidersHorizontal, X, http,
      useTranslation, STORAGE, applyCustomColors, applyMikusThemeOptions,
      COLOR_PRESETS, DEFAULT_THREE_NET_PANEL_COUNT, getColorPresetKey,
      getThreeNetPanelCount, MAX_THREE_NET_PANEL_COUNT, MIN_THREE_NET_PANEL_COUNT,
      normalizeThemeOptions
    } = deps
    ${cleaned}
  `)

  const component = createComponent({
    inject: () => ({ theme_options: { color_preset: 'default', three_net_panel_count: 3 } }),
    onUnmounted: (fn) => { unmountFn = fn },
    ref,
    Minus: {}, Plus: {}, SlidersHorizontal: {}, X: {},
    http: { post: async () => ({ error: 'Unauthorized', status: 401 }) },
    useTranslation: () => ref({ themeConfigLoginRequired: 'Login required' }),
    STORAGE: { JWT_TOKEN: 'jwt' },
    applyCustomColors: (opts) => appliedColors.push(opts.color_preset),
    applyMikusThemeOptions: (opts) => appliedMikus.push(opts),
    COLOR_PRESETS: [{ key: 'default', labelKey: 'd', dark: {}, light: {} }, { key: 'ocean', labelKey: 'o', dark: {}, light: {} }],
    DEFAULT_THREE_NET_PANEL_COUNT: 3,
    getColorPresetKey: (o) => o?.color_preset || 'default',
    getThreeNetPanelCount: (o) => o?.three_net_panel_count ?? 3,
    MAX_THREE_NET_PANEL_COUNT: 8,
    MIN_THREE_NET_PANEL_COUNT: 0,
    normalizeThemeOptions: (o) => o || {}
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup({}, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  state.openModal()
  assert.equal(state.modalOpen.value, true)
  assert.equal(keyListeners.size, 1)

  state.setPreset('ocean')
  assert.equal(appliedColors.at(-1), 'ocean')

  // Escape closes and rolls back
  for (const fn of [...keyListeners]) fn({ key: 'Escape' })
  assert.equal(state.modalOpen.value, false)
  assert.equal(keyListeners.size, 0)
  assert.equal(appliedColors.at(-1), 'default')
  assert.equal(events.at(-1).detail.color_preset, 'default')

  // Unmount while open also rolls back
  state.openModal()
  state.setPreset('ocean')
  unmountFn?.()
  assert.equal(state.modalOpen.value, false)
  assert.equal(keyListeners.size, 0)
  assert.equal(appliedColors.at(-1), 'default')
  assert.equal(appliedMikus.length >= 2, true)
})

test('DatabasePanel emits imported instead of reloading so importResult remains visible (#14)', async (t) => {
  const { source, cleaned } = compileSfcSetup('views/admin/components/DatabasePanel.vue', 'database-panel-test')
  assert.equal(source.includes('window.location.reload'), false)

  const emitted = []
  const createComponent = new Function('deps', `
    const {
      ref, watch, CheckCircle2, CircleArrowUp, Download, Loader2, Trash2, Upload, XCircle,
      adminApi, parseServerBackup
    } = deps
    ${cleaned}
  `)

  const component = createComponent({
    ref,
    watch,
    CheckCircle2: {}, CircleArrowUp: {}, Download: {}, Loader2: {}, Trash2: {}, Upload: {}, XCircle: {},
    adminApi: async () => ({
      data: { success: true, imported: 2, skipped: 1, skippedIds: ['dup-1'], settings: { imported: true } }
    }),
    parseServerBackup: (text) => JSON.parse(text)
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(
    { trans: {}, activeTab: 'database', dbLoading: false, selectedApiIndex: 0 },
    { emit: (event, payload) => emitted.push({ event, payload }), expose() {} }
  ))
  t.after(() => scope.stop())

  await state.handleFileSelect({
    target: {
      files: [{
        text: async () => JSON.stringify({ servers: [{ id: 's1' }], settings: { site_title: 'x' } })
      }]
    }
  })

  assert.deepEqual(state.importResult.value, {
    success: true,
    imported: 2,
    skipped: 1,
    skippedIds: ['dup-1']
  })
  assert.deepEqual(emitted, [
    { event: 'imported', payload: { serversImported: true, settingsImported: true } }
  ])
})

test('ThemeStorePanel passes selectedApiIndex to /theme and notifies when preview popup is blocked (#18)', async (t) => {
  const { cleaned } = compileSfcSetup('views/admin/components/ThemeStorePanel.vue', 'theme-store-test')

  const getByIndexCalls = []
  const emitted = []
  const prevWindow = globalThis.window
  globalThis.window = { open: () => null }
  t.after(() => { globalThis.window = prevWindow })

  const createComponent = new Function('deps', `
    const {
      computed, ref, watch, reactive,
      ArrowLeftRight, Calendar, Check, ExternalLink, Eye, Plus, RefreshCw, RotateCcw, TriangleAlert, X, XCircle,
      http, currentLang, adminApi, normalizeDisplayMode, getPublicAssetUrl, isMikusThemeEnabled, APPEARANCE_FIELDS
    } = deps
    ${cleaned}
  `)

  const component = createComponent({
    computed,
    ref,
    watch,
    reactive,
    ArrowLeftRight: {}, Calendar: {}, Check: {}, ExternalLink: {}, Eye: {}, Plus: {}, RefreshCw: {}, RotateCcw: {}, TriangleAlert: {}, X: {}, XCircle: {},
    http: {
      getByIndex: async (url, index) => {
        getByIndexCalls.push({ url, index })
        return { data: { schema: 1, themes: [] } }
      }
    },
    currentLang: ref('en'),
    adminApi: async () => ({ data: { preview_url: 'https://preview.example/123' } }),
    normalizeDisplayMode: (v) => v || 'bar',
    getPublicAssetUrl: (p) => `./${p}`,
    isMikusThemeEnabled: () => false,
    APPEARANCE_FIELDS: []
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(
    { trans: { preview: 'Preview' }, activeTab: 'themeStore', selectedApiIndex: 2, currentThemeUrl: '', settings: {} },
    { emit: (event, payload) => emitted.push({ event, payload }), expose() {} }
  ))
  t.after(() => scope.stop())

  await Promise.resolve()
  assert.deepEqual(getByIndexCalls, [{ url: '/theme', index: 2 }])

  await state.previewThemeUrl('https://github.com/org/theme/tree/1234', 't1')
  assert.deepEqual(emitted, [
    { event: 'alert-message', payload: 'Preview: https://preview.example/123' }
  ])
})

test('Subpath deployment avoids hardcoded root asset/route paths and TerminalHeader updates isAdminPage reactively (#20)', (t) => {
  assert.equal(getMikusAssetUrl('loli.gif'), './mikus/loli.gif')
  assert.equal(readFrontend('views/admin/components/ThemeStorePanel.vue').includes('src="/mikus/'), false)
  assert.equal(readFrontend('views/admin/components/DonationPanel.vue').includes('src="/donate/'), false)
  assert.equal(readFrontend('views/Dashboard.vue').includes('href="/admin#/admin"'), false)

  const { source, cleaned } = compileSfcSetup('components/TerminalHeader.vue', 'terminal-header-test')
  assert.match(source, /:aria-label="t\('dashboard'\)"/)
  assert.match(source, /:aria-label="t\('adminPanel'\)"/)

  const prevWindow = globalThis.window
  globalThis.window = { addEventListener() {}, removeEventListener() {} }
  t.after(() => { globalThis.window = prevWindow })

  const route = reactive({ path: '/' })
  const configuredApiBase = ref(true)
  const createComponent = new Function('deps', `
    const {
      computed, ref, onMounted, onUnmounted,
      ChevronDown, Globe, Home, Monitor, Moon, Settings, Sun,
      useRoute, LANGUAGES, t, setLanguage, getLanguage, useTheme,
      ThemeConfigButton, DEFAULT_SITE_TITLE, hasConfiguredApiBase
    } = deps
    ${cleaned}
  `)

  const component = createComponent({
    computed,
    ref,
    onMounted: () => {},
    onUnmounted: () => {},
    ChevronDown: {}, Globe: {}, Home: {}, Monitor: {}, Moon: {}, Settings: {}, Sun: {},
    useRoute: () => route,
    LANGUAGES: [],
    t: (k) => k,
    setLanguage: async () => true,
    getLanguage: () => 'en',
    useTheme: () => ({ currentTheme: ref('dark'), setTheme() {} }),
    ThemeConfigButton: {},
    DEFAULT_SITE_TITLE: 'Monitor',
    hasConfiguredApiBase: () => configuredApiBase.value
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup({ title: 'Test' }, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  assert.equal(state.isAdminPage.value, false)
  assert.equal(state.adminHref.value, '#/admin')
  assert.equal(state.homeHref.value, '#/')

  route.path = '/admin'
  assert.equal(state.isAdminPage.value, true)

  configuredApiBase.value = false
  assert.equal(state.adminHref.value, '/admin#/admin')
  assert.equal(state.homeHref.value, '/#/')
})

test('Modals use v-if for hidden focus isolation and ghProxyOptions reacts to language changes (#21, #22)', (t) => {
  for (const modalPath of [
    'views/admin/components/EditServerModal.vue',
    'views/admin/components/BatchEditServersModal.vue',
    'views/admin/components/DeleteServerModal.vue',
    'views/admin/components/CopyCommandModal.vue',
    'views/admin/components/AutoDiscoveryCommandModal.vue'
  ]) {
    const src = readFrontend(modalPath)
    assert.match(src, /v-if="show"/)
    assert.equal(src.includes(':class="{ active: show }"'), false)
    assert.match(src, /@click\.self=/)
  }

  const { cleaned } = compileSfcSetup('views/admin/components/CopyCommandModal.vue', 'copy-modal-test')
  const createComponent = new Function('deps', `
    const {
      computed, ref, watch, Check, Copy, Pencil, X, HelpTooltip, hasInvalidInstanceChars
    } = deps
    ${cleaned}
  `)

  const props = reactive({
    trans: { ghProxyPlaceholder: 'Direct' },
    settings: {},
    show: true
  })

  const component = createComponent({
    computed,
    ref,
    watch,
    Check: {}, Copy: {}, Pencil: {}, X: {},
    HelpTooltip: {},
    hasInvalidInstanceChars: () => false
  })

  const scope = effectScope()
  const state = scope.run(() => component.setup(props, { emit() {}, expose() {} }))
  t.after(() => scope.stop())

  assert.equal(state.ghProxyOptions.value[0].label, 'Direct')
  props.trans = { ghProxyPlaceholder: '直连' }
  assert.equal(state.ghProxyOptions.value[0].label, '直连')
})

test('ServerDetail watches route.params.id and route.query.apiIndex to reload server data (#24)', () => {
  const source = readFrontend('views/ServerDetail.vue')
  assert.match(source, /watch\(\s*\(\)\s*=>\s*\[route\.name,\s*route\.params\.id,\s*route\.query\.apiIndex\]/)
  assert.match(source, /if\s*\(route\.name !== 'Server'\)\s*return/)
  assert.match(source, /resetDetailState\(\)/)
  assert.match(source, /const serverId = ref\(resolveRouteServerId\(\)\)/)
})
