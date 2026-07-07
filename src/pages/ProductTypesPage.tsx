import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Layout, Modal, Space, Table, Typography } from 'antd';
import { Controller, type Control, type FieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { getUserDisplayName } from '../features/auth/types';
import { useCurrentUser, useLogout } from '../features/auth/useAuth';
import { productTypeSchema, type ProductTypeFormValues } from '../features/product-types/schema';
import type { ProductType } from '../features/product-types/types';
import { useCreateProductType, useProductTypes } from '../features/product-types/useProductTypes';

const SEARCH_DEBOUNCE_MS = 300;

interface ProductTypeFieldProps {
  name: keyof ProductTypeFormValues;
  label: string;
  control: Control<ProductTypeFormValues>;
  error?: FieldError;
  multiline?: boolean;
}

function ProductTypeField({ name, label, control, error, multiline }: ProductTypeFieldProps) {
  const { t } = useTranslation();

  return (
    <Form.Item
      label={label}
      htmlFor={`product-type-${name}`}
      validateStatus={error ? 'error' : ''}
      help={error ? t(error.message ?? '') : undefined}
    >
      <Controller
        name={name}
        control={control}
        render={({ field }) =>
          multiline ? (
            <Input.TextArea {...field} id={`product-type-${name}`} />
          ) : (
            <Input {...field} id={`product-type-${name}`} />
          )
        }
      />
    </Form.Item>
  );
}

export function ProductTypesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: productTypes, isLoading, isError: isListError } = useProductTypes(search);
  const createMutation = useCreateProductType();

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProductTypeFormValues>({
    resolver: zodResolver(productTypeSchema),
    defaultValues: { name: '', model_code: '', description: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: ProductTypeFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => navigate('/login', { replace: true }),
    });
  };

  const columns = [
    { title: t('productTypes.nameLabel'), dataIndex: 'name', key: 'name' },
    {
      title: t('productTypes.modelCodeLabel'),
      dataIndex: 'model_code',
      key: 'model_code',
    },
    {
      title: t('productTypes.descriptionLabel'),
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
        <Typography.Title level={3}>{t('productTypes.title')}</Typography.Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input.Search
            placeholder={t('productTypes.searchPlaceholder')}
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            {t('productTypes.newButton')}
          </Button>
        </div>
        {isListError ? (
          <Alert
            type="error"
            message={t('productTypes.loadError')}
            showIcon
            style={{ marginBottom: 16 }}
          />
        ) : (
          <Table<ProductType>
            rowKey="id"
            columns={columns}
            dataSource={productTypes}
            loading={isLoading}
            locale={{ emptyText: t('productTypes.emptyState') }}
          />
        )}
        <Modal
          title={t('productTypes.newButton')}
          open={isModalOpen}
          onCancel={closeModal}
          onOk={handleSubmit(onSubmit)}
          confirmLoading={createMutation.isPending}
        >
          <Form layout="vertical" noValidate>
            <ProductTypeField
              name="name"
              label={t('productTypes.nameLabel')}
              control={control}
              error={errors.name}
            />
            <ProductTypeField
              name="model_code"
              label={t('productTypes.modelCodeLabel')}
              control={control}
            />
            <ProductTypeField
              name="description"
              label={t('productTypes.descriptionLabel')}
              control={control}
              multiline
            />
            {createMutation.isError && (
              <Form.Item>
                <Alert type="error" message={t('productTypes.createError')} showIcon />
              </Form.Item>
            )}
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
