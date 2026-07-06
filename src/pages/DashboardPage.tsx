import { Button, Layout, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { useCurrentUser, useLogout } from '../features/auth/useAuth';

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader
        extra={
          user && (
            <Space>
              <Typography.Text style={{ color: 'white' }}>{user.name}</Typography.Text>
              <Button onClick={handleLogout} loading={logoutMutation.isPending}>
                {t('auth.logout')}
              </Button>
            </Space>
          )
        }
      />
      <Layout.Content style={{ padding: 24 }}>
        <Typography.Paragraph>{t('dashboard.welcome')}</Typography.Paragraph>
      </Layout.Content>
    </Layout>
  );
}
