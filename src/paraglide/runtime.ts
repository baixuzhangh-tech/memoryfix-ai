type LanguageTag = 'en' | 'zh'

let currentLanguageTag: LanguageTag = 'en'
const listeners = new Set<() => void>()

export function languageTag() {
  return currentLanguageTag
}

export function setLanguageTag(nextLanguageTag: LanguageTag) {
  currentLanguageTag = nextLanguageTag
  listeners.forEach(listener => listener())
}

export function onSetLanguageTag(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
