import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Layout, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { useCurrentUser, useLogin } from '../features/auth/useAuth';
import { loginSchema, type LoginFormValues } from '../features/auth/schema';

export function LoginPage() {
  const { t } = useTranslation();
  const { data: user, isLoading: isLoadingUser } = useCurrentUser();
  const loginMutation = useLogin();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (isLoadingUser) {
    return null;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = (values: LoginFormValues) => {
    loginMutation.mutate(values);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <Layout.Content style={{ padding: 24, maxWidth: 400, margin: '0 auto', width: '100%' }}>
        <Typography.Title level={3}>{t('auth.login.title')}</Typography.Title>
        <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
          <Form.Item
            label={t('auth.login.emailLabel')}
            htmlFor="login-email"
            validateStatus={errors.email ? 'error' : ''}
            help={errors.email ? t(errors.email.message ?? '') : undefined}
          >
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <Input {...field} id="login-email" type="email" autoComplete="email" />
              )}
            />
          </Form.Item>
          <Form.Item
            label={t('auth.login.passwordLabel')}
            htmlFor="login-password"
            validateStatus={errors.password ? 'error' : ''}
            help={errors.password ? t(errors.password.message ?? '') : undefined}
          >
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input.Password {...field} id="login-password" autoComplete="current-password" />
              )}
            />
          </Form.Item>
          {loginMutation.isError && (
            <Form.Item>
              <Alert type="error" message={t('auth.login.error')} showIcon />
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loginMutation.isPending} block>
              {t('auth.login.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Layout.Content>
    </Layout>
  );
}
