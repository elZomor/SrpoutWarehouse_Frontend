import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Modal, Select, Table, Typography } from 'antd';
import { Controller, type Control, type FieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCategories } from '../features/categories/useCategories';
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
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: productTypes, isLoading, isError: isListError } = useProductTypes(search);
  const createMutation = useCreateProductType();
  // Only used to populate the create-form's category dropdown - archived
  // categories are correctly excluded here (AC-6). The table's category
  // column reads `category_name` straight off each ProductType instead (see
  // columns below), so a Product Type whose category gets archived later
  // still displays a name instead of falling back to a raw numeric id.
  const { data: categories, isError: isCategoriesError } = useCategories('');

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
    defaultValues: { name: '', model_code: '', description: '', category: undefined },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
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
    {
      title: t('productTypes.categoryLabel'),
      dataIndex: 'category_name',
      key: 'category',
    },
  ];

  return (
    <>
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
          <Form.Item
            label={t('productTypes.categoryLabel')}
            htmlFor="product-type-category"
            validateStatus={errors.category ? 'error' : ''}
            help={errors.category ? t(errors.category.message ?? '') : undefined}
          >
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id="product-type-category"
                  placeholder={t('productTypes.categoryPlaceholder')}
                  options={(categories ?? []).map((category) => ({
                    value: category.id,
                    label: category.name,
                  }))}
                />
              )}
            />
          </Form.Item>
          {isCategoriesError && (
            <Form.Item>
              <Alert type="error" message={t('productTypes.loadCategoriesError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && (
            <Form.Item>
              <Alert type="error" message={t('productTypes.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
