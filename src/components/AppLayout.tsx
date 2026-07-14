import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';

export function AppLayout() {
  return (
    <Layout style={{ height: '100vh' }}>
      <AppSidebar />
      <Layout.Content style={{ padding: '28px 32px', overflowY: 'auto' }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
