import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ar from './locales/ar.json';

export const RTL_LANGUAGES = new Set(['ar']);

export function isRtl(language: string): boolean {
  return RTL_LANGUAGES.has(language);
}

void i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'ar',
    supportedLngs: ['ar', 'en'],
    // Arabic is the product's primary language (see PRD §7). Only an explicit
    // in-app switch (persisted to localStorage) should move a user to English —
    // we deliberately don't auto-detect from the browser/OS locale.
    detection: {
      order: ['localStorage'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;
