import type { ReactNode } from 'react';
import { Layout, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './LanguageSwitcher';

interface AppHeaderProps {
  extra?: ReactNode;
}

export function AppHeader({ extra }: AppHeaderProps) {
  const { t } = useTranslation();

  return (
    <Layout.Header
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <Typography.Title level={4} style={{ color: 'white', margin: 0 }}>
        {t('app.name')}
      </Typography.Title>
      <Space>
        {extra}
        <LanguageSwitcher />
      </Space>
    </Layout.Header>
  );
}
