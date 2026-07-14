import { useEffect, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { App as AntApp, ConfigProvider } from 'antd';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './queryClient';
import { isRtl } from '../i18n';
import { antdTheme } from '../theme/antdTheme';

function DirectionSync({ children }: PropsWithChildren) {
  const { i18n } = useTranslation();
  const direction = isRtl(i18n.resolvedLanguage ?? i18n.language) ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.dir = direction;
    document.documentElement.lang = i18n.resolvedLanguage ?? i18n.language;
  }, [direction, i18n.resolvedLanguage, i18n.language]);

  return (
    <ConfigProvider direction={direction} theme={antdTheme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
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
