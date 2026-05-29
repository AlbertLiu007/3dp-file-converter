import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { UnionAMLanguageProvider, type UnionAMLanguage } from '@unionam/shared-i18n';
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
  const language = cookies().get('unionam.language')?.value === 'en' ? 'en' : 'zh';

  return (
    <html lang={language === 'en' ? 'en' : 'zh-CN'}>
      <body>
        <UnionAMLanguageProvider initialLanguage={language as UnionAMLanguage}>{children}</UnionAMLanguageProvider>
      </body>
    </html>
  );
}
