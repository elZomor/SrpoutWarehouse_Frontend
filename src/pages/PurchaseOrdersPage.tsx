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
import axios from 'axios';
import dayjs from 'dayjs';
import { useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  purchaseOrderSchema,
  receiveItemSchema,
  type PurchaseOrderFormValues,
  type ReceiveItemFormValues,
} from '../features/purchase-orders/schema';
import type { PurchaseOrder } from '../features/purchase-orders/types';
import {
  useCreatePurchaseOrder,
  usePurchaseOrders,
  useReceivePurchaseOrderItem,
} from '../features/purchase-orders/usePurchaseOrders';

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_LINE_ITEM = { product_type: undefined, expected_quantity: undefined };

function toMessageArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [receivingPurchaseOrderId, setReceivingPurchaseOrderId] = useState<number | null>(null);
  const { data: purchaseOrders, isLoading, isError: isListError } = usePurchaseOrders();
  const createMutation = useCreatePurchaseOrder();
  const receiveMutation = useReceivePurchaseOrderItem(receivingPurchaseOrderId ?? 0);
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

  // Derived (not a local snapshot) so the modal reflects each scan's
  // updated received/remaining counts as soon as useReceivePurchaseOrderItem
  // patches the purchase-orders query cache, rather than going stale after
  // the first scan.
  const receivingPurchaseOrder =
    purchaseOrders?.find((purchaseOrder) => purchaseOrder.id === receivingPurchaseOrderId) ?? null;

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

  const {
    control: receiveControl,
    handleSubmit: handleReceiveSubmit,
    reset: resetReceiveForm,
    setError: setReceiveError,
    setFocus: setReceiveFocus,
    formState: { errors: receiveErrors },
  } = useForm<ReceiveItemFormValues>({
    resolver: zodResolver(receiveItemSchema),
    defaultValues: { line_item: undefined, serial_number: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: PurchaseOrderFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const openReceiveModal = (purchaseOrder: PurchaseOrder) => {
    setReceivingPurchaseOrderId(purchaseOrder.id);
    resetReceiveForm({ line_item: undefined, serial_number: '' });
    receiveMutation.reset();
  };

  const closeReceiveModal = () => {
    setReceivingPurchaseOrderId(null);
    resetReceiveForm();
    receiveMutation.reset();
  };

  const onReceiveSubmit = (values: ReceiveItemFormValues) => {
    receiveMutation.mutate(values, {
      onSuccess: () => {
        // Keep the same line item selected - a scan gun typically fires many
        // scans against the same line item in a row - and clear+refocus the
        // serial number field for the next one (AC-1/AC-3/AC-4).
        resetReceiveForm({ line_item: values.line_item, serial_number: '' });
        setReceiveFocus('serial_number');
      },
      onError: (error) => {
        const responseData = axios.isAxiosError<{
          serial_number?: string | string[];
          line_item?: string | string[];
        }>(error)
          ? error.response?.data
          : undefined;
        const serialErrors = toMessageArray(responseData?.serial_number);
        const lineItemErrors = toMessageArray(responseData?.line_item);

        if (serialErrors.some((message) => message.includes('already registered'))) {
          setReceiveError('serial_number', {
            type: 'server',
            message: 'purchaseOrders.receive.duplicateSerialError',
          });
          return;
        }
        if (
          lineItemErrors.some((message) =>
            message.includes('already received its expected quantity'),
          )
        ) {
          setReceiveError('line_item', {
            type: 'server',
            message: 'purchaseOrders.receive.overCapError',
          });
          return;
        }
        if (lineItemErrors.some((message) => message.includes('archived'))) {
          setReceiveError('line_item', {
            type: 'server',
            message: 'purchaseOrders.receive.archivedError',
          });
        }
      },
    });
  };

  const productTypeOptions = (productTypes ?? []).map((productType) => ({
    value: productType.id,
    label: productType.name,
  }));

  const receivableLineItemOptions = (receivingPurchaseOrder?.line_items ?? [])
    .filter((item) => item.remaining_quantity > 0)
    .map((item) => ({ value: item.id, label: item.product_type_name }));

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
    {
      title: t('purchaseOrders.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: PurchaseOrder) =>
        record.status === 'received' ? null : (
          <Button size="small" onClick={() => openReceiveModal(record)}>
            {t('purchaseOrders.receiveButton')}
          </Button>
        ),
    },
  ];

  const receiveLineItemColumns = [
    {
      title: t('purchaseOrders.receive.lineItemHeader'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('purchaseOrders.receive.expectedHeader'),
      dataIndex: 'expected_quantity',
      key: 'expected_quantity',
    },
    {
      title: t('purchaseOrders.receive.receivedHeader'),
      dataIndex: 'received_quantity',
      key: 'received_quantity',
    },
    {
      title: t('purchaseOrders.receive.remainingHeader'),
      dataIndex: 'remaining_quantity',
      key: 'remaining_quantity',
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
      <Modal
        title={t('purchaseOrders.receive.title', {
          supplierName: receivingPurchaseOrder?.supplier_name ?? '',
        })}
        open={receivingPurchaseOrder !== null}
        onCancel={closeReceiveModal}
        width={640}
        footer={
          <Button onClick={closeReceiveModal}>{t('purchaseOrders.receive.doneButton')}</Button>
        }
      >
        {receivingPurchaseOrder && (
          <>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={receivingPurchaseOrder.line_items}
              columns={receiveLineItemColumns}
              style={{ marginBottom: 16 }}
            />
            <Form layout="vertical" noValidate onFinish={handleReceiveSubmit(onReceiveSubmit)}>
              <Form.Item
                label={t('purchaseOrders.receive.lineItemLabel')}
                htmlFor="receive-line_item"
                validateStatus={receiveErrors.line_item ? 'error' : ''}
                help={
                  receiveErrors.line_item ? t(receiveErrors.line_item.message ?? '') : undefined
                }
              >
                <Controller
                  name="line_item"
                  control={receiveControl}
                  render={({ field }) => (
                    <Select
                      {...field}
                      id="receive-line_item"
                      placeholder={t('purchaseOrders.receive.lineItemPlaceholder')}
                      options={receivableLineItemOptions}
                    />
                  )}
                />
              </Form.Item>
              <Form.Item
                label={t('purchaseOrders.receive.serialNumberLabel')}
                htmlFor="receive-serial_number"
                validateStatus={receiveErrors.serial_number ? 'error' : ''}
                help={
                  receiveErrors.serial_number
                    ? t(receiveErrors.serial_number.message ?? '')
                    : undefined
                }
              >
                <Controller
                  name="serial_number"
                  control={receiveControl}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="receive-serial_number"
                      placeholder={t('purchaseOrders.receive.serialNumberPlaceholder')}
                    />
                  )}
                />
              </Form.Item>
              {receiveMutation.isError &&
                !receiveErrors.serial_number &&
                !receiveErrors.line_item && (
                  <Alert
                    type="error"
                    message={t('purchaseOrders.receive.genericError')}
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                )}
              <Button type="primary" htmlType="submit" loading={receiveMutation.isPending}>
                {t('purchaseOrders.receive.scanButton')}
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
