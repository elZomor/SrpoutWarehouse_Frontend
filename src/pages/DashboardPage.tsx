import { Button, Layout, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { getUserDisplayName } from '../features/auth/types';
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
              <Typography.Text style={{ color: 'white' }}>
                {getUserDisplayName(user)}
              </Typography.Text>
              <Button onClick={handleLogout} loading={logoutMutation.isPending}>
                {t('auth.logout')}
              </Button>
            </Space>
          )
        }
      />
      <Layout.Content style={{ padding: 24 }}>
        <Typography.Paragraph>{t('dashboard.welcome')}</Typography.Paragraph>
        <Link to="/product-types">{t('nav.productTypes')}</Link>
      </Layout.Content>
    </Layout>
  );
}
