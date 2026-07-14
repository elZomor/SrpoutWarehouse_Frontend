import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { colors } from '../theme/tokens';

interface ComingSoonPageProps {
  titleKey: string;
}

export function ComingSoonPage({ titleKey }: ComingSoonPageProps) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 12,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: colors.surfaceMuted,
          border: `1px solid ${colors.border}`,
        }}
      />
      <Typography.Title level={4} style={{ margin: 0 }}>
        {t(titleKey)}
      </Typography.Title>
      <Typography.Text type="secondary">{t('comingSoon.message')}</Typography.Text>
    </div>
  );
}
