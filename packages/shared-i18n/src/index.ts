'use client';

import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type UnionAMLanguage = 'zh' | 'en';

export const UNIONAM_LANGUAGE_STORAGE_KEY = 'unionam.language';
export const UNIONAM_LANGUAGE_COOKIE_KEY = 'unionam.language';
const LEGACY_LANGUAGE_STORAGE_KEYS = ['unionam-tool-homepage.language', '3dp-auto-quote.language', '3dp-file-converter.language'];
const LANGUAGE_CHANGE_EVENT = 'unionam-language-change';
const LanguageContext = createContext<UnionAMLanguage>('zh');

function normalizeLanguage(value: string | null): UnionAMLanguage {
  return value === 'en' ? 'en' : 'zh';
}

function readStoredLanguage(initialLanguage: UnionAMLanguage): UnionAMLanguage {
  if (typeof window === 'undefined') return initialLanguage;
  const stored = window.localStorage.getItem(UNIONAM_LANGUAGE_STORAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;

  for (const key of LEGACY_LANGUAGE_STORAGE_KEYS) {
    const legacy = window.localStorage.getItem(key);
    if (legacy === 'zh' || legacy === 'en') {
      window.localStorage.setItem(UNIONAM_LANGUAGE_STORAGE_KEY, legacy);
      return legacy;
    }
  }

  return initialLanguage;
}

export function useSharedLanguage() {
  const initialLanguage = useContext(LanguageContext);
  const [language, setLanguageState] = useState<UnionAMLanguage>(initialLanguage);

  useEffect(() => {
    const nextLanguage = readStoredLanguage(initialLanguage);
    setLanguageState(nextLanguage);
    window.localStorage.setItem(UNIONAM_LANGUAGE_STORAGE_KEY, nextLanguage);
    document.cookie = `${UNIONAM_LANGUAGE_COOKIE_KEY}=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;

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
  }, [initialLanguage]);

  function setLanguage(nextLanguage: UnionAMLanguage) {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(UNIONAM_LANGUAGE_STORAGE_KEY, nextLanguage);
    document.cookie = `${UNIONAM_LANGUAGE_COOKIE_KEY}=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: nextLanguage }));
  }

  return useMemo(() => ({ language, setLanguage }), [language]);
}

export function UnionAMLanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage: UnionAMLanguage;
}) {
  return createElement(LanguageContext.Provider, { value: initialLanguage }, children);
}
