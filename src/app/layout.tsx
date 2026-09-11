import type { Metadata } from 'next';
import { UnionAMLanguageProvider } from '@unionam/shared-i18n';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://unionam.com'),
  title: '联泰科技3D打印文件格式转换器',
  description: 'STL、OBJ、PLY、GLB、STEP、STP 模型文件解析、格式转换和 PDF 报告生成均在浏览器本地完成，模型文件不会上传服务器。',
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
        <UnionAMLanguageProvider initialLanguage="zh">
          {children}
          <footer className="border-t border-slate-200 bg-white px-5 py-4 text-center text-xs font-semibold text-slate-500 print:hidden">
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-[#0b4f9c]"
            >隐私政策 / Privacy Policy</a>
          </footer>
        </UnionAMLanguageProvider>
      </body>
    </html>
  );
}
