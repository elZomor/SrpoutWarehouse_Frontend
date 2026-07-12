import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Layout, Modal, Space, Table, Typography } from 'antd';
import { Controller, type Control, type FieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { categorySchema, type CategoryFormValues } from '../features/categories/schema';
import type { Category } from '../features/categories/types';
import { useCategories, useCreateCategory } from '../features/categories/useCategories';
import { getUserDisplayName } from '../features/auth/types';
import { useCurrentUser, useLogout } from '../features/auth/useAuth';

const SEARCH_DEBOUNCE_MS = 300;

interface CategoryFieldProps {
  name: keyof CategoryFormValues;
  label: string;
  control: Control<CategoryFormValues>;
  error?: FieldError;
  multiline?: boolean;
}

function CategoryField({ name, label, control, error, multiline }: CategoryFieldProps) {
  const { t } = useTranslation();

  return (
    <Form.Item
      label={label}
      htmlFor={`category-${name}`}
      validateStatus={error ? 'error' : ''}
      help={error ? t(error.message ?? '') : undefined}
    >
      <Controller
        name={name}
        control={control}
        render={({ field }) =>
          multiline ? (
            <Input.TextArea {...field} id={`category-${name}`} />
          ) : (
            <Input {...field} id={`category-${name}`} />
          )
        }
      />
    </Form.Item>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: categories, isLoading, isError: isListError } = useCategories(search);
  const createMutation = useCreateCategory();

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: CategoryFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  const columns = [
    { title: t('categories.nameLabel'), dataIndex: 'name', key: 'name' },
    {
      title: t('categories.descriptionLabel'),
      dataIndex: 'description',
      key: 'description',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader
        extra={
          user && (
            <Space>
              <Link to="/" style={{ color: 'white' }}>
                {t('nav.dashboard')}
              </Link>
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
        <Typography.Title level={3}>{t('categories.title')}</Typography.Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input.Search
            placeholder={t('categories.searchPlaceholder')}
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            {t('categories.newButton')}
          </Button>
        </div>
        {isListError ? (
          <Alert
            type="error"
            message={t('categories.loadError')}
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : (
          <Table<Category>
            rowKey="id"
            columns={columns}
            dataSource={categories}
            loading={isLoading}
            locale={{ emptyText: t('categories.emptyState') }}
          />
        )}
        <Modal
          title={t('categories.newButton')}
          open={isModalOpen}
          onCancel={closeModal}
          onOk={handleSubmit(onSubmit)}
          confirmLoading={createMutation.isPending}
        >
          <Form layout="vertical" noValidate>
            <CategoryField
              name="name"
              label={t('categories.nameLabel')}
              control={control}
              error={errors.name}
            />
            <CategoryField
              name="description"
              label={t('categories.descriptionLabel')}
              control={control}
              multiline
            />
            {createMutation.isError && (
              <Form.Item>
                <Alert type="error" message={t('categories.createError')} showIcon />
              </Form.Item>
            )}
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
