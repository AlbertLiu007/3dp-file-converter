'use client';

import { useMemo } from 'react';
import { useSharedLanguage } from '@unionam/shared-i18n';
import { dictionaries, type Language } from './dictionaries';

export function useLanguage() {
  const { language, setLanguage } = useSharedLanguage();

  return useMemo(
    () => ({
      language: language as Language,
      setLanguage: setLanguage as (language: Language) => void,
      t: dictionaries[language],
    }),
    [language],
  );
}
