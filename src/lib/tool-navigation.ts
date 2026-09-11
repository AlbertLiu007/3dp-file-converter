export type ToolNavigationKey = 'quote' | 'converter' | 'gift' | 'crm';

type ToolNavigationLabels = {
  navQuote: string;
  navConverter: string;
  navGift: string;
  navCrm: string;
};

export type ToolNavigationItem = {
  label: string;
  href: string;
  active: boolean;
};

export function createToolNavigation(labels: ToolNavigationLabels, active?: ToolNavigationKey): ToolNavigationItem[] {
  return [
    { label: labels.navQuote, href: '/quote', active: active === 'quote' },
    { label: labels.navConverter, href: '/converter', active: active === 'converter' },
    { label: labels.navGift, href: '/gift', active: active === 'gift' },
    { label: labels.navCrm, href: '/crm/', active: active === 'crm' },
  ];
}
