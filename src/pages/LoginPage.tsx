import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { SproutMark } from '../components/SproutMark';
import { useCurrentUser, useLogin } from '../features/auth/useAuth';
import { loginSchema, type LoginFormValues } from '../features/auth/schema';
import { colors } from '../theme/tokens';

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.primaryDark} 100%)`,
        padding: 24,
        position: 'relative',
      }}
    >
      <div style={{ position: 'absolute', insetInlineEnd: 24, insetBlockStart: 24 }}>
        <LanguageSwitcher />
      </div>
      <div
        style={{
          width: 'min(380px, 100%)',
          background: '#FFFFFF',
          borderRadius: 12,
          padding: '40px 36px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            marginBottom: 28,
          }}
        >
          <SproutMark size={56} />
          <Typography.Text
            style={{ display: 'block', fontSize: 22, fontWeight: 800, marginTop: 8 }}
          >
            {t('app.name')}
          </Typography.Text>
          <Typography.Text
            style={{ display: 'block', fontSize: 14, color: colors.textMuted, fontWeight: 600 }}
          >
            {t('auth.login.tagline')}
          </Typography.Text>
        </div>
        <Typography.Title level={4} style={{ textAlign: 'center', marginBottom: 18 }}>
          {t('auth.login.title')}
        </Typography.Title>
        <Form layout="vertical" noValidate onFinish={handleSubmit(onSubmit)}>
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
                <Input
                  {...field}
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.login.emailPlaceholder')}
                />
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
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isPending}
              block
              size="large"
            >
              {t('auth.login.submit')}
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
