<template>
  <div class="terminal-header">
    <div class="terminal-dots">
      <span class="terminal-dot red"></span>
      <span class="terminal-dot yellow"></span>
      <span class="terminal-dot green"></span>
    </div>
    <div class="terminal-title">{{ title }}</div>
    <div class="terminal-header-controls">
      <div class="lang-select-wrapper">
        <Globe class="lang-select-icon" :size="14" aria-hidden="true" />
        <select
          class="lang-select"
          :value="currentLang"
          :disabled="switching"
          :aria-label="t('language')"
          @change="handleLangSelect"
        >
          <option v-for="language in languages" :key="language.code" :value="language.code">
            {{ language.nativeLabel }}
          </option>
        </select>
        <ChevronDown class="lang-select-chevron" :size="12" aria-hidden="true" />
      </div>
      <div class="theme-toggle-wrapper">
        <div class="theme-toggle">
          <button 
            class="theme-btn" 
            :class="{ active: currentTheme === 'auto' }"
            @click="setTheme('auto')"
            aria-label="Auto - Follow System"
          ><Monitor :size="16" aria-hidden="true" /></button>
          <button 
            class="theme-btn" 
            :class="{ active: currentTheme === 'dark' }"
            @click="setTheme('dark')"
            aria-label="Dark Mode"
          ><Moon :size="16" aria-hidden="true" /></button>
          <button 
            class="theme-btn" 
            :class="{ active: currentTheme === 'light' }"
            @click="setTheme('light')"
            aria-label="Light Mode"
          ><Sun :size="16" aria-hidden="true" /></button>
        </div>
      </div>
      <ThemeConfigButton v-if="!isAdminPage" />
      <a
        v-if="isAdminPage"
        :href="homeHref"
        class="admin-link-header"
        :aria-label="t('dashboard')"
        :title="t('dashboard')"
      ><Home :size="16" aria-hidden="true" /></a>
      <a
        v-else
        :href="adminHref"
        class="admin-link-header"
        :aria-label="t('adminPanel')"
        :title="t('adminPanel')"
      ><Settings :size="16" aria-hidden="true" /></a>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Globe, Home, Monitor, Moon, Settings, Sun } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { LANGUAGES, t, setLanguage, getLanguage } from '../utils/i18n'
import { useTheme } from '../composables/useTheme'
import ThemeConfigButton from './ThemeConfigButton.vue'
import { DEFAULT_SITE_TITLE } from '../utils/constants'
import { hasConfiguredApiBase } from '../utils/config'

defineProps({
  title: {
    type: String,
    default: DEFAULT_SITE_TITLE
  }
})

const { currentTheme, setTheme } = useTheme()
const currentLang = ref(getLanguage())
const languages = LANGUAGES
const switching = ref(false)
const route = useRoute()
const isAdminPage = computed(() => route.path === '/admin')
const homeHref = computed(() => hasConfiguredApiBase() ? '#/' : '/#/')
const adminHref = computed(() => hasConfiguredApiBase() ? '#/admin' : '/admin#/admin')

const handleLangSelect = async (event) => {
  const lang = event.target.value
  if (lang === currentLang.value) return
  switching.value = true
  const changed = await setLanguage(lang)
  switching.value = false
  if (!changed) {
    event.target.value = currentLang.value
  }
}

const handleLanguageChange = (e) => {
  currentLang.value = e.detail.lang
}

onMounted(() => {
  window.addEventListener('languageChanged', handleLanguageChange)
})

onUnmounted(() => {
  window.removeEventListener('languageChanged', handleLanguageChange)
})
</script>
