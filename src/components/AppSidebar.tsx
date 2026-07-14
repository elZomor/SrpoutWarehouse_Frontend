import type { ReactNode } from 'react';
import { Button, Layout, Menu, type MenuProps, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getUserDisplayName } from '../features/auth/types';
import { useCurrentUser, useLogout } from '../features/auth/useAuth';
import { ROUTES } from '../routes';
import { colors, sidebarWidth } from '../theme/tokens';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SproutMark } from './SproutMark';

function navLink(to: string, label: string): ReactNode {
  return <Link to={to}>{label}</Link>;
}

export function AppSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  const items: MenuProps['items'] = [
    { key: ROUTES.dashboard, label: navLink(ROUTES.dashboard, t('nav.dashboard')) },
    {
      key: 'group-catalogue',
      type: 'group',
      label: t('nav.groups.catalogue'),
      children: [
        { key: ROUTES.categories, label: navLink(ROUTES.categories, t('nav.categories')) },
        { key: ROUTES.productTypes, label: navLink(ROUTES.productTypes, t('nav.productTypes')) },
        {
          key: ROUTES.serializedItems,
          label: navLink(ROUTES.serializedItems, t('nav.serializedItems')),
        },
        { key: ROUTES.boxes, label: navLink(ROUTES.boxes, t('nav.boxes')) },
      ],
    },
    {
      key: 'group-transactions',
      type: 'group',
      label: t('nav.groups.transactions'),
      children: [
        {
          key: ROUTES.purchaseOrders,
          label: navLink(ROUTES.purchaseOrders, t('nav.purchaseOrders')),
        },
        { key: ROUTES.workOrders, label: navLink(ROUTES.workOrders, t('nav.workOrders')) },
      ],
    },
    {
      key: 'group-reports',
      type: 'group',
      label: t('nav.groups.reports'),
      children: [
        { key: ROUTES.missingItems, label: navLink(ROUTES.missingItems, t('nav.missingItems')) },
        {
          key: ROUTES.damageReports,
          label: navLink(ROUTES.damageReports, t('nav.damageReports')),
        },
        {
          key: ROUTES.maintenanceOrders,
          label: navLink(ROUTES.maintenanceOrders, t('nav.maintenanceOrders')),
        },
        {
          key: ROUTES.transactionLog,
          label: navLink(ROUTES.transactionLog, t('nav.transactionLog')),
        },
      ],
    },
    {
      key: 'group-settings',
      type: 'group',
      label: t('nav.groups.settings'),
      children: [{ key: ROUTES.settings, label: navLink(ROUTES.settings, t('nav.settings')) }],
    },
  ];

  return (
    <Layout.Sider width={sidebarWidth} style={{ height: '100vh' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div
          style={{
            padding: '22px 18px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <SproutMark size={40} />
          <Typography.Text style={{ color: '#fff', fontSize: 15, fontWeight: 800, marginTop: 4 }}>
            {t('app.name')}
          </Typography.Text>
        </div>

        <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div
            style={{
              border: '1px dashed rgba(255, 255, 255, 0.3)',
              borderRadius: 8,
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                background: 'rgba(255, 255, 255, 0.1)',
                flexShrink: 0,
              }}
            />
            <Typography.Text
              style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 11, fontWeight: 600 }}
            >
              {t('nav.companyLogoPlaceholder')}
            </Typography.Text>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 10px' }}>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[location.pathname]}
            items={items}
            style={{ borderInlineEnd: 'none', background: 'transparent' }}
          />
        </div>

        <div
          style={{
            padding: '14px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <LanguageSwitcher />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography.Text style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>
              {user ? getUserDisplayName(user) : ''}
            </Typography.Text>
            <Button
              type="link"
              onClick={handleLogout}
              loading={logoutMutation.isPending}
              style={{ color: colors.accent, fontWeight: 700, padding: 0, height: 'auto' }}
            >
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </div>
    </Layout.Sider>
  );
}
