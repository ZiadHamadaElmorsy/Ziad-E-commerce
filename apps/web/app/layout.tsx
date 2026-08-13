import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { I18nProvider } from '@/lib/i18n/i18n-context';

export const metadata: Metadata = {
  title: {
    default: 'Ziad E-commerce',
    template: '%s | Ziad E-commerce',
  },
  description: 'Ziad E-commerce — Egypt-first SaaS e-commerce platform for merchants.',
};

/**
 * Applies the persisted locale (lang + dir) to <html> before React hydrates so
 * there is no RTL/LTR flash on reload. The I18nProvider keeps it in sync.
 */
const LOCALE_BOOTSTRAP_SCRIPT = `(function(){try{var l=localStorage.getItem('ziad.locale');if(l==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl';}else{document.documentElement.lang='en';document.documentElement.dir='ltr';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <I18nProvider>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
