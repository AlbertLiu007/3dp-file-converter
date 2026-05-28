'use client';

import { useEffect, useMemo, useState } from 'react';
import { dictionaries, type Language } from './dictionaries';

const STORAGE_KEY = '3dp-file-converter.language';

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'zh';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'zh';
}

export function useLanguage() {
  const [language, setLanguageState] = useState<Language>('zh');

  useEffect(() => {
    setLanguageState(readStoredLanguage());
  }, []);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
  }

  return useMemo(
    () => ({
      language,
      setLanguage,
      t: dictionaries[language],
    }),
    [language],
  );
}
