import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';

export function DashboardPage() {
  const { t } = useTranslation();

  return <Typography.Paragraph>{t('dashboard.welcome')}</Typography.Paragraph>;
}
