import assert from 'node:assert/strict';
import test from 'node:test';
import { dictionaries } from './i18n/dictionaries.ts';
import { createToolNavigation } from './tool-navigation.ts';

const expectedHrefs = ['/quote', '/converter', '/gift', '/crm/'];

test('uses the homepage navigation order and localized labels', () => {
  assert.deepEqual(createToolNavigation(dictionaries.zh).map(({ label, href }) => ({ label, href })), [
    { label: '自动报价', href: '/quote' },
    { label: '格式转换', href: '/converter' },
    { label: '联泰礼品', href: '/gift' },
    { label: 'CRM 工作台', href: '/crm/' },
  ]);
  assert.deepEqual(createToolNavigation(dictionaries.en).map(({ label, href }) => ({ label, href })), [
    { label: 'Auto Quote', href: '/quote' },
    { label: 'Converter', href: '/converter' },
    { label: 'UnionTech Gifts', href: '/gift' },
    { label: 'CRM Workspace', href: '/crm/' },
  ]);
});

test('highlights only the converter navigation item', () => {
  const navigation = createToolNavigation(dictionaries.zh, 'converter');

  assert.deepEqual(navigation.map((item) => item.href), expectedHrefs);
  assert.deepEqual(navigation.filter((item) => item.active).map((item) => item.href), ['/converter']);
});
