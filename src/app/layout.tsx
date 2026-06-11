import type { Metadata } from 'next';
import Script from 'next/script';
import { UnionAMLanguageProvider } from '@unionam/shared-i18n';
import './globals.css';

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
  return (
    <html lang="zh-CN">
      <body>
        <Script defer src="https://cloud.umami.is/script.js" data-website-id="05e5f00c-82a3-4dcf-9d5a-b50f434eb92e" />
        <UnionAMLanguageProvider initialLanguage="zh">{children}</UnionAMLanguageProvider>
      </body>
    </html>
  );
}
