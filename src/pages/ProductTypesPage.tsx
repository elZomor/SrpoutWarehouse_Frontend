import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Form, Input, Layout, Modal, Table, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { AppHeader } from '../components/AppHeader';
import { productTypeSchema, type ProductTypeFormValues } from '../features/product-types/schema';
import type { ProductType } from '../features/product-types/types';
import { useCreateProductType, useProductTypes } from '../features/product-types/useProductTypes';

export function ProductTypesPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: productTypes, isLoading } = useProductTypes(search);
  const createMutation = useCreateProductType();

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
  };

  const onSubmit = (values: ProductTypeFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
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
      <AppHeader />
      <Layout.Content style={{ padding: 24 }}>
        <Typography.Title level={3}>{t('productTypes.title')}</Typography.Title>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Input.Search
            placeholder={t('productTypes.searchPlaceholder')}
            allowClear
            onChange={(event) => setSearch(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            {t('productTypes.newButton')}
          </Button>
        </div>
        <Table<ProductType>
          rowKey="id"
          columns={columns}
          dataSource={productTypes}
          loading={isLoading}
          locale={{ emptyText: t('productTypes.emptyState') }}
        />
        <Modal
          title={t('productTypes.newButton')}
          open={isModalOpen}
          onCancel={closeModal}
          onOk={handleSubmit(onSubmit)}
          confirmLoading={createMutation.isPending}
        >
          <Form layout="vertical" noValidate>
            <Form.Item
              label={t('productTypes.nameLabel')}
              htmlFor="product-type-name"
              validateStatus={errors.name ? 'error' : ''}
              help={errors.name ? t(errors.name.message ?? '') : undefined}
            >
              <Controller
                name="name"
                control={control}
                render={({ field }) => <Input {...field} id="product-type-name" />}
              />
            </Form.Item>
            <Form.Item label={t('productTypes.modelCodeLabel')} htmlFor="product-type-model-code">
              <Controller
                name="model_code"
                control={control}
                render={({ field }) => <Input {...field} id="product-type-model-code" />}
              />
            </Form.Item>
            <Form.Item
              label={t('productTypes.descriptionLabel')}
              htmlFor="product-type-description"
            >
              <Controller
                name="description"
                control={control}
                render={({ field }) => <Input.TextArea {...field} id="product-type-description" />}
              />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
