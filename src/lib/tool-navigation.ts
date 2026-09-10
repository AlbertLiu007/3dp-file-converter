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
  eventName: string;
};

export function createToolNavigation(labels: ToolNavigationLabels, active?: ToolNavigationKey): ToolNavigationItem[] {
  return [
    { label: labels.navQuote, href: '/quote', active: active === 'quote', eventName: 'header_quote_click' },
    { label: labels.navConverter, href: '/converter', active: active === 'converter', eventName: 'header_converter_click' },
    { label: labels.navGift, href: '/gift', active: active === 'gift', eventName: 'header_gift_click' },
    { label: labels.navCrm, href: '/crm/', active: active === 'crm', eventName: 'header_crm_click' },
  ];
}
