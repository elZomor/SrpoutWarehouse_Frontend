import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Modal, Select, Table, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { boxSchema, type BoxFormValues } from '../features/boxes/schema';
import { printBoxLabel } from '../features/boxes/printLabel';
import type { Box } from '../features/boxes/types';
import { useBoxes, useCreateBox } from '../features/boxes/useBoxes';
import { useProductTypes } from '../features/product-types/useProductTypes';
import { useSerializedItems } from '../features/serialized-items/useSerializedItems';

export function BoxesPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: boxes, isLoading, isError: isListError } = useBoxes();
  const createMutation = useCreateBox();
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<BoxFormValues>({
    resolver: zodResolver(boxSchema),
    defaultValues: { code: '', product_type: undefined, item_ids: [] },
  });
  const selectedProductType = watch('product_type');

  // AC-1: only available items of the selected product type are offered -
  // re-fetched whenever the product type changes, matching
  // SerializedItemsPage's identical product-type-scoped query.
  const {
    data: itemsForProductType,
    isLoading: isItemsLoading,
    isError: isItemsError,
  } = useSerializedItems('', selectedProductType, selectedProductType !== undefined);
  const availableItemOptions = (itemsForProductType ?? [])
    .filter((item) => item.status === 'available')
    .map((item) => ({ value: item.id, label: item.serial_number }));

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: BoxFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const productTypeOptions = (productTypes ?? []).map((productType) => ({
    value: productType.id,
    label: productType.name,
  }));

  const columns = [
    {
      title: t('boxes.codeLabel'),
      dataIndex: 'code',
      key: 'code',
    },
    {
      title: t('boxes.productTypeLabel'),
      dataIndex: 'product_type_name',
      key: 'product_type',
    },
    {
      title: t('boxes.itemCountLabel'),
      key: 'item_count',
      render: (_: unknown, record: Box) => record.items.length,
    },
    {
      title: t('boxes.qrCodeLabel'),
      key: 'qr_code',
      render: (_: unknown, record: Box) => (
        <Button
          type="link"
          size="small"
          onClick={() =>
            printBoxLabel(record, {
              qrAlt: t('boxes.qrCodeLabel'),
              loadError: t('boxes.printQrLoadError'),
            })
          }
        >
          {t('boxes.printQrButton')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('boxes.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('boxes.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert type="error" message={t('boxes.loadError')} showIcon style={{ marginBottom: 16 }} />
      ) : (
        <Table<Box>
          rowKey="id"
          columns={columns}
          dataSource={boxes}
          loading={isLoading}
          locale={{ emptyText: t('boxes.emptyState') }}
        />
      )}
      <Modal
        title={t('boxes.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('boxes.codeLabel')}
            htmlFor="box-code"
            validateStatus={errors.code ? 'error' : ''}
            help={errors.code ? t(errors.code.message ?? '') : undefined}
          >
            <Controller
              name="code"
              control={control}
              render={({ field }) => <Input {...field} id="box-code" />}
            />
          </Form.Item>
          <Form.Item
            label={t('boxes.productTypeLabel')}
            htmlFor="box-product_type"
            validateStatus={errors.product_type ? 'error' : ''}
            help={errors.product_type ? t(errors.product_type.message ?? '') : undefined}
          >
            <Controller
              name="product_type"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id="box-product_type"
                  placeholder={t('boxes.productTypePlaceholder')}
                  options={productTypeOptions}
                  onChange={(value: number | undefined) => {
                    field.onChange(value);
                    // Options for item_ids are scoped to the selected
                    // product type - a previous selection under a
                    // different product type is no longer a valid choice.
                    setValue('item_ids', []);
                  }}
                />
              )}
            />
          </Form.Item>
          <Form.Item
            label={t('boxes.itemsLabel')}
            htmlFor="box-item_ids"
            validateStatus={errors.item_ids ? 'error' : ''}
            help={errors.item_ids ? t(errors.item_ids.message ?? '') : undefined}
          >
            <Controller
              name="item_ids"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id="box-item_ids"
                  mode="multiple"
                  disabled={selectedProductType === undefined}
                  loading={isItemsLoading}
                  placeholder={t('boxes.itemsPlaceholder')}
                  options={availableItemOptions}
                />
              )}
            />
          </Form.Item>
          {isProductTypesError && (
            <Form.Item>
              <Alert type="error" message={t('boxes.loadProductTypesError')} showIcon />
            </Form.Item>
          )}
          {isItemsError && (
            <Form.Item>
              <Alert type="error" message={t('boxes.loadItemsError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && (
            <Form.Item>
              <Alert type="error" message={t('boxes.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
