'use client';

import { ChevronDown, Globe2, Languages } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

export type ToolLanguage = 'zh' | 'en';

export type ToolHeaderLabels = {
  appTitle: string;
  appSubtitle: string;
};

export function ToolHeader({
  language,
  labels,
  logoSrc,
  onLanguageChange,
}: {
  language: ToolLanguage;
  labels: ToolHeaderLabels;
  logoSrc: string;
  onLanguageChange: (language: ToolLanguage) => void;
}) {
  const [languageOpen, setLanguageOpen] = useState(false);

  function chooseLanguage(nextLanguage: ToolLanguage) {
    onLanguageChange(nextLanguage);
    setLanguageOpen(false);
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1480px] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <Image src={logoSrc} alt="UnionAM" width={186} height={56} priority className="h-10 w-auto" />
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-lg font-black tracking-normal">{labels.appTitle}</div>
              </div>
              <div className="mt-0.5 text-xs font-medium text-slate-500">{labels.appSubtitle}</div>
            </div>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setLanguageOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b4f9c] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#083f7e]"
            >
              <Globe2 className="h-4 w-4" />
              <span>{language === 'zh' ? '中文' : 'English'}</span>
              <ChevronDown className={`h-4 w-4 transition ${languageOpen ? 'rotate-180' : ''}`} />
            </button>
            {languageOpen ? (
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-36 rounded-md border border-slate-200 bg-white p-2 shadow-xl">
                <button
                  type="button"
                  onClick={() => chooseLanguage('zh')}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-bold ${language === 'zh' ? 'text-[#0b4f9c]' : 'text-slate-950 hover:bg-slate-50'}`}
                >
                  <Languages className="h-4 w-4" />
                  中文
                </button>
                <button
                  type="button"
                  onClick={() => chooseLanguage('en')}
                  className={`mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-bold ${language === 'en' ? 'text-[#0b4f9c]' : 'text-slate-950 hover:bg-slate-50'}`}
                >
                  <Languages className="h-4 w-4" />
                  English
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
