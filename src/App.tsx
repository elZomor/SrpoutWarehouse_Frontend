import { Layout, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './components/LanguageSwitcher';

const { Header, Content } = Layout;

function App() {
  const { t } = useTranslation();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography.Title level={4} style={{ color: 'white', margin: 0 }}>
          {t('app.name')}
        </Typography.Title>
        <LanguageSwitcher />
      </Header>
      <Content style={{ padding: 24 }}>
        <Typography.Paragraph>{t('dashboard.welcome')}</Typography.Paragraph>
      </Content>
    </Layout>
  );
}

export default App;
