<template>
  <button
    type="button"
    class="admin-link-header theme-config-btn"
    aria-label="Theme Config"
    title="Theme Config"
    @click="openModal"
  >
    <SlidersHorizontal :size="16" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <Transition name="theme-config-drawer">
      <div v-if="modalOpen" class="theme-config-overlay" @click.self="closeModal">
      <div class="theme-config-drawer" role="dialog" aria-modal="true">
        <div class="drawer-header">
          <div class="modal-title">$ Theme Config</div>
          <button type="button" class="modal-close" :aria-label="trans.close" @click="closeModal"><X :size="18" aria-hidden="true" /></button>
        </div>

        <div class="drawer-body">
          <section class="drawer-section">
            <label class="theme-config-label" for="three-net-panel-count">{{ trans.threeNetPanelCount }}</label>
            <div class="theme-config-stepper">
              <button type="button" class="btn" :disabled="countValue <= MIN_THREE_NET_PANEL_COUNT" @click="stepCount(-1)"><Minus :size="14" aria-hidden="true" /></button>
              <input
                id="three-net-panel-count"
                v-model.number="countValue"
                class="form-input theme-config-input"
                type="number"
                :min="MIN_THREE_NET_PANEL_COUNT"
                :max="MAX_THREE_NET_PANEL_COUNT"
                step="1"
                @input="applyDraftPreview"
              >
              <button type="button" class="btn" :disabled="countValue >= MAX_THREE_NET_PANEL_COUNT" @click="stepCount(1)"><Plus :size="14" aria-hidden="true" /></button>
            </div>
          </section>

          <section class="drawer-section">
            <h3 class="drawer-section-title">{{ trans.colorPresetTitle }}</h3>
            <div class="preset-grid">
              <button
                v-for="preset in COLOR_PRESETS"
                :key="preset.key"
                type="button"
                class="preset-card"
                :class="{ active: presetValue === preset.key }"
                @click="setPreset(preset.key)"
              >
                <span class="preset-swatches" title="Dark">
                  <span v-for="(color, index) in presetSwatches(preset, 'dark')" :key="'dark-' + index" :style="{ background: color }"></span>
                </span>
                <span class="preset-swatches" title="Light">
                  <span v-for="(color, index) in presetSwatches(preset, 'light')" :key="'light-' + index" :style="{ background: color }"></span>
                </span>
                <span class="preset-name">{{ trans[preset.labelKey] }}</span>
              </button>
            </div>
          </section>

          <p v-if="errorMessage" class="theme-config-error">{{ errorMessage }}</p>
        </div>

        <div class="drawer-footer">
          <button type="button" class="btn" @click="resetConfig">{{ trans.themeConfigReset }}</button>
          <button type="button" class="btn" @click="closeModal">{{ trans.cancel }}</button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveConfig">
            {{ saving ? trans.saving : trans.save }}
          </button>
        </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { inject, onUnmounted, ref } from 'vue'
import { Minus, Plus, SlidersHorizontal, X } from 'lucide-vue-next'
import { http } from '../utils/http'
import { useTranslation } from '../utils/i18n'
import { STORAGE } from '../utils/constants'
import {
  applyCustomColors,
  applyMikusThemeOptions,
  COLOR_PRESETS,
  DEFAULT_THREE_NET_PANEL_COUNT,
  getColorPresetKey,
  getThreeNetPanelCount,
  MAX_THREE_NET_PANEL_COUNT,
  MIN_THREE_NET_PANEL_COUNT,
  normalizeThemeOptions
} from '../utils/themeOptions'

const trans = useTranslation()
const appConfig = inject('appConfig', null)

const modalOpen = ref(false)
const countValue = ref(DEFAULT_THREE_NET_PANEL_COUNT)
const presetValue = ref('default')
const saving = ref(false)
const errorMessage = ref('')

const setPageShift = (open) => {
  if (typeof document === 'undefined' || !document.body) return
  document.body.classList.toggle('theme-config-open', open)
}

const restoreSavedThemeOptions = () => {
  const saved = normalizeThemeOptions(appConfig?.theme_options)
  applyMikusThemeOptions(saved)
  applyCustomColors(saved)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('theme-options-changed', { detail: saved }))
  }
}

const handleKeyDown = (event) => {
  if (event.key === 'Escape' && modalOpen.value) {
    closeModal()
  }
}

const bindEscListener = () => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', handleKeyDown)
  window.addEventListener('keydown', handleKeyDown)
}

const unbindEscListener = () => {
  if (typeof window === 'undefined') return
  window.removeEventListener('keydown', handleKeyDown)
}

const presetSwatches = (preset, mode) => [
  preset[mode].accent_primary,
  preset[mode].accent_secondary,
  preset[mode].bg_card,
  preset[mode].text_primary
]

const buildDraftOptions = () => ({
  ...normalizeThemeOptions(appConfig?.theme_options),
  three_net_panel_count: countValue.value === '' ? DEFAULT_THREE_NET_PANEL_COUNT : Number(countValue.value),
  color_preset: presetValue.value
})

const applyDraftPreview = () => {
  if (!modalOpen.value) return
  const options = buildDraftOptions()
  applyCustomColors(options)
  window.dispatchEvent(new CustomEvent('theme-options-changed', { detail: options }))
}

const openModal = () => {
  countValue.value = getThreeNetPanelCount(appConfig?.theme_options)
  presetValue.value = getColorPresetKey(appConfig?.theme_options)
  errorMessage.value = ''
  modalOpen.value = true
  setPageShift(true)
  bindEscListener()
}

const closeModal = () => {
  if (saving.value) return
  const wasOpen = modalOpen.value
  modalOpen.value = false
  setPageShift(false)
  unbindEscListener()
  if (wasOpen) {
    restoreSavedThemeOptions()
  }
}

const setPreset = (key) => {
  presetValue.value = key
  applyDraftPreview()
}

const stepCount = (delta) => {
  const next = Number(countValue.value) + delta
  if (!Number.isFinite(next)) return
  countValue.value = Math.max(MIN_THREE_NET_PANEL_COUNT, Math.min(MAX_THREE_NET_PANEL_COUNT, Math.trunc(next)))
  applyDraftPreview()
}

const resetConfig = () => {
  countValue.value = DEFAULT_THREE_NET_PANEL_COUNT
  presetValue.value = 'default'
  errorMessage.value = ''
  applyDraftPreview()
}

const saveConfig = async () => {
  if (saving.value) return
  errorMessage.value = ''

  const count = Number(countValue.value)
  if (countValue.value === '' || !Number.isInteger(count) || count < MIN_THREE_NET_PANEL_COUNT || count > MAX_THREE_NET_PANEL_COUNT) {
    errorMessage.value = trans.value.themeConfigInvalidCount
    return
  }

  if (!localStorage.getItem(STORAGE.JWT_TOKEN)) {
    errorMessage.value = trans.value.themeConfigLoginRequired
    return
  }

  const themeOptions = buildDraftOptions()
  saving.value = true
  const result = await http.post('/api/theme_options', { theme_options: themeOptions }, { autoRedirect: false })
  saving.value = false

  if (result.error) {
    errorMessage.value = result.status === 401
      ? trans.value.themeConfigLoginRequired
      : `${trans.value.saveFailed}${result.error}`
    return
  }

  const savedOptions = normalizeThemeOptions(result.data?.theme_options || themeOptions)
  if (appConfig) appConfig.theme_options = savedOptions
  applyMikusThemeOptions(savedOptions)
  applyCustomColors(savedOptions)
  window.dispatchEvent(new CustomEvent('theme-options-changed', { detail: savedOptions }))
  modalOpen.value = false
  setPageShift(false)
  unbindEscListener()
}

onUnmounted(() => {
  unbindEscListener()
  setPageShift(false)
  if (modalOpen.value) {
    modalOpen.value = false
    restoreSavedThemeOptions()
  }
})
</script>
