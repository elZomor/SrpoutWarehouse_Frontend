import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  purchaseOrderSchema,
  type PurchaseOrderFormValues,
} from '../features/purchase-orders/schema';
import type { PurchaseOrder } from '../features/purchase-orders/types';
import {
  useCreatePurchaseOrder,
  usePurchaseOrders,
} from '../features/purchase-orders/usePurchaseOrders';

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_LINE_ITEM = { product_type: undefined, expected_quantity: undefined };

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: purchaseOrders, isLoading, isError: isListError } = usePurchaseOrders();
  const createMutation = useCreatePurchaseOrder();
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderSchema),
    defaultValues: {
      supplier_name: '',
      order_date: '',
      line_items: [EMPTY_LINE_ITEM],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: PurchaseOrderFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const productTypeOptions = (productTypes ?? []).map((productType) => ({
    value: productType.id,
    label: productType.name,
  }));

  const columns = [
    {
      title: t('purchaseOrders.supplierLabel'),
      dataIndex: 'supplier_name',
      key: 'supplier_name',
    },
    {
      title: t('purchaseOrders.orderDateLabel'),
      dataIndex: 'order_date',
      key: 'order_date',
    },
    {
      title: t('purchaseOrders.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{t(`purchaseOrders.status.${status}`)}</Tag>,
    },
    {
      title: t('purchaseOrders.lineItemsLabel'),
      key: 'line_items',
      render: (_: unknown, record: PurchaseOrder) => (
        <span>
          {record.line_items
            .map((item) => `${item.product_type_name} × ${item.expected_quantity}`)
            .join(', ')}
        </span>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('purchaseOrders.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('purchaseOrders.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('purchaseOrders.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<PurchaseOrder>
          rowKey="id"
          columns={columns}
          dataSource={purchaseOrders}
          loading={isLoading}
          locale={{ emptyText: t('purchaseOrders.emptyState') }}
        />
      )}
      <Modal
        title={t('purchaseOrders.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
        width={640}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('purchaseOrders.supplierLabel')}
            htmlFor="purchase-order-supplier_name"
            validateStatus={errors.supplier_name ? 'error' : ''}
            help={errors.supplier_name ? t(errors.supplier_name.message ?? '') : undefined}
          >
            <Controller
              name="supplier_name"
              control={control}
              render={({ field }) => <Input {...field} id="purchase-order-supplier_name" />}
            />
          </Form.Item>
          <Form.Item
            label={t('purchaseOrders.orderDateLabel')}
            htmlFor="purchase-order-order_date"
            validateStatus={errors.order_date ? 'error' : ''}
            help={errors.order_date ? t(errors.order_date.message ?? '') : undefined}
          >
            <Controller
              name="order_date"
              control={control}
              render={({ field }) => (
                <DatePicker
                  id="purchase-order-order_date"
                  style={{ width: '100%' }}
                  value={field.value ? dayjs(field.value, DATE_FORMAT) : null}
                  onChange={(date) => field.onChange(date ? date.format(DATE_FORMAT) : '')}
                />
              )}
            />
          </Form.Item>
          <Form.Item label={t('purchaseOrders.lineItemsLabel')}>
            {fields.map((field, index) => (
              <div key={field.id} style={{ marginBottom: 8 }}>
                <Space align="baseline" style={{ display: 'flex' }}>
                  <Controller
                    name={`line_items.${index}.product_type`}
                    control={control}
                    render={({ field: productTypeField, fieldState }) => (
                      <div>
                        <Select
                          {...productTypeField}
                          placeholder={t('purchaseOrders.form.productTypePlaceholder')}
                          style={{ width: 260 }}
                          options={productTypeOptions}
                          status={fieldState.error ? 'error' : undefined}
                        />
                        {fieldState.error && (
                          <Typography.Text type="danger" style={{ display: 'block' }}>
                            {t(fieldState.error.message ?? '')}
                          </Typography.Text>
                        )}
                      </div>
                    )}
                  />
                  <Controller
                    name={`line_items.${index}.expected_quantity`}
                    control={control}
                    render={({ field: quantityField, fieldState }) => (
                      <div>
                        <InputNumber
                          {...quantityField}
                          min={1}
                          placeholder={t('purchaseOrders.form.expectedQuantityPlaceholder')}
                          status={fieldState.error ? 'error' : undefined}
                          onChange={(value) => quantityField.onChange(value ?? undefined)}
                        />
                        {fieldState.error && (
                          <Typography.Text type="danger" style={{ display: 'block' }}>
                            {t(fieldState.error.message ?? '')}
                          </Typography.Text>
                        )}
                      </div>
                    )}
                  />
                  {fields.length > 1 && (
                    <MinusCircleOutlined
                      role="button"
                      aria-label={t('purchaseOrders.form.removeLineItemButton')}
                      onClick={() => remove(index)}
                    />
                  )}
                </Space>
              </div>
            ))}
            {errors.line_items?.message && (
              <Alert
                type="error"
                message={t(errors.line_items.message)}
                showIcon
                style={{ marginBottom: 8 }}
              />
            )}
            <Button
              type="dashed"
              onClick={() => append(EMPTY_LINE_ITEM)}
              icon={<PlusOutlined />}
              block
            >
              {t('purchaseOrders.form.addLineItemButton')}
            </Button>
          </Form.Item>
          {isProductTypesError && (
            <Form.Item>
              <Alert type="error" message={t('purchaseOrders.loadProductTypesError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && (
            <Form.Item>
              <Alert type="error" message={t('purchaseOrders.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
