'use client';

import { ChevronDown, Globe2, Languages } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';

export type ToolLanguage = 'zh' | 'en';

export type ToolHeaderLabels = {
  appTitle: string;
  appSubtitle: string;
  languageZh: string;
  languageEn: string;
};

export type ToolHeaderNavItem = {
  label: string;
  href: string;
  active?: boolean;
};

export function ToolHeader({
  language,
  labels,
  logoSrc,
  homeHref = '/',
  navItems = [],
  onLanguageChange,
}: {
  language: ToolLanguage;
  labels: ToolHeaderLabels;
  logoSrc: string;
  homeHref?: string;
  navItems?: ToolHeaderNavItem[];
  onLanguageChange: (language: ToolLanguage) => void;
}) {
  const [languageOpen, setLanguageOpen] = useState(false);

  function chooseLanguage(nextLanguage: ToolLanguage) {
    onLanguageChange(nextLanguage);
    setLanguageOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-[1480px] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
            <Link href={homeHref} className="flex min-w-0 items-center gap-4">
              <Image src={logoSrc} alt="UnionAM" width={186} height={56} priority className="h-10 w-auto shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-medium tracking-normal text-slate-800">{labels.appTitle}</div>
                <div className="mt-0.5 text-[11px] font-normal text-slate-500">{labels.appSubtitle}</div>
              </div>
            </Link>

            {navItems.length > 0 ? (
              <nav className="flex flex-wrap items-center gap-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex h-10 items-center rounded-md px-3.5 text-base font-black transition ${
                      item.active ? 'bg-cyan-50 text-[#0b4f9c]' : 'text-[#0b4f9c] hover:bg-cyan-50 hover:text-[#083f7e]'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            ) : null}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setLanguageOpen((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b4f9c] px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#083f7e]"
            >
              <Globe2 className="h-4 w-4" />
              <span>{language === 'zh' ? labels.languageZh : labels.languageEn}</span>
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
                  {labels.languageZh}
                </button>
                <button
                  type="button"
                  onClick={() => chooseLanguage('en')}
                  className={`mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-bold ${language === 'en' ? 'text-[#0b4f9c]' : 'text-slate-950 hover:bg-slate-50'}`}
                >
                  <Languages className="h-4 w-4" />
                  {labels.languageEn}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
