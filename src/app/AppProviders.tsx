import { useEffect, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfigProvider } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './queryClient';
import { isRtl } from '../i18n';

function DirectionSync({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const direction = isRtl(i18n.resolvedLanguage ?? i18n.language) ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
  }, [direction, i18n.resolvedLanguage, i18n.language]);

  return <ConfigProvider direction={direction}>{children}</ConfigProvider>;
}

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DirectionSync>{children}</DirectionSync>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
