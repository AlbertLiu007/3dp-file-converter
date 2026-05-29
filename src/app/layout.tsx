import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { UnionAMLanguageProvider, type UnionAMLanguage } from '@unionam/shared-i18n';
import './globals.css';

const languageBootstrapScript = `
(function () {
  try {
    var storageKey = 'unionam.language';
    var cookieKey = 'unionam.language';
    var legacyKeys = ['unionam-tool-homepage.language', '3dp-auto-quote.language', '3dp-file-converter.language'];
    var language = window.localStorage.getItem(storageKey);
    if (language !== 'zh' && language !== 'en') {
      for (var index = 0; index < legacyKeys.length; index += 1) {
        var legacyLanguage = window.localStorage.getItem(legacyKeys[index]);
        if (legacyLanguage === 'zh' || legacyLanguage === 'en') {
          language = legacyLanguage;
          window.localStorage.setItem(storageKey, language);
          break;
        }
      }
    }
    if (language !== 'zh' && language !== 'en') return;
    var match = document.cookie.match(new RegExp('(?:^|; )' + cookieKey.replace(/[.$?*|{}()\\[\\]\\\\/+^]/g, '\\\\$&') + '=([^;]*)'));
    var cookieLanguage = match ? decodeURIComponent(match[1]) : '';
    if (cookieLanguage === language) return;
    document.cookie = cookieKey + '=' + language + '; path=/; max-age=31536000; SameSite=Lax';
    window.location.reload();
  } catch (error) {}
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL('https://unionam.com'),
  title: '联泰科技3D打印文件格式转换器',
  description: 'STL、OBJ、PLY、GLB、STEP、STP 模型文件在浏览器本地解析转换，文件不会上传服务器。',
  icons: {
    icon: [{ url: '/converter/icon.png?v=2', type: 'image/png' }],
    shortcut: ['/converter/icon.png?v=2'],
    apple: [{ url: '/converter/icon.png?v=2', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const language = cookies().get('unionam.language')?.value === 'en' ? 'en' : 'zh';

  return (
    <html lang={language === 'en' ? 'en' : 'zh-CN'}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: languageBootstrapScript }} />
      </head>
      <body>
        <UnionAMLanguageProvider initialLanguage={language as UnionAMLanguage}>{children}</UnionAMLanguageProvider>
      </body>
    </html>
  );
}
