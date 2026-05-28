import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '联泰科技3D打印文件格式转换器',
  description: 'STL、OBJ、PLY、GLB、STEP、STP 模型文件在浏览器本地解析转换，文件不会上传服务器。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
