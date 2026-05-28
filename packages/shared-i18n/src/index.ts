'use client';

import { useEffect, useMemo, useState } from 'react';

export type UnionAMLanguage = 'zh' | 'en';

export const UNIONAM_LANGUAGE_STORAGE_KEY = 'unionam.language';
const LEGACY_LANGUAGE_STORAGE_KEYS = ['unionam-tool-homepage.language', '3dp-auto-quote.language', '3dp-file-converter.language'];
const LANGUAGE_CHANGE_EVENT = 'unionam-language-change';

function normalizeLanguage(value: string | null): UnionAMLanguage {
  return value === 'en' ? 'en' : 'zh';
}

function readStoredLanguage(): UnionAMLanguage {
  if (typeof window === 'undefined') return 'zh';
  const stored = window.localStorage.getItem(UNIONAM_LANGUAGE_STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;

  for (const key of LEGACY_LANGUAGE_STORAGE_KEYS) {
    const legacy = window.localStorage.getItem(key);
    if (legacy === 'zh' || legacy === 'en') {
      window.localStorage.setItem(UNIONAM_LANGUAGE_STORAGE_KEY, legacy);
      return legacy;
    }
  }

  return 'zh';
}

export function useSharedLanguage() {
  const [language, setLanguageState] = useState<UnionAMLanguage>('zh');

  useEffect(() => {
    setLanguageState(readStoredLanguage());

    function handleStorage(event: StorageEvent) {
      if (event.key === UNIONAM_LANGUAGE_STORAGE_KEY) {
        setLanguageState(normalizeLanguage(event.newValue));
      }
    }

    function handleLanguageChange(event: Event) {
      setLanguageState(normalizeLanguage((event as CustomEvent<string>).detail));
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleLanguageChange);
    };
  }, []);

  function setLanguage(nextLanguage: UnionAMLanguage) {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(UNIONAM_LANGUAGE_STORAGE_KEY, nextLanguage);
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: nextLanguage }));
  }

  return useMemo(() => ({ language, setLanguage }), [language]);
}
