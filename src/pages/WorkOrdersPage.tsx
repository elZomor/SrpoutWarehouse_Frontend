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
  scanItemSchema,
  workOrderSchema,
  type ScanItemFormValues,
  type WorkOrderFormValues,
} from '../features/work-orders/schema';
import type { WorkOrder } from '../features/work-orders/types';
import {
  useCompleteWorkOrder,
  useCreateWorkOrder,
  useScanWorkOrderItem,
  useStartWorkOrder,
  useWorkOrders,
} from '../features/work-orders/useWorkOrders';
import { getFieldErrorMessages } from '../lib/apiErrors';

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_LINE_ITEM = { product_type: undefined, quantity: undefined };

export function WorkOrdersPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fulfillingWorkOrderId, setFulfillingWorkOrderId] = useState<number | null>(null);
  const { data: workOrders, isLoading, isError: isListError } = useWorkOrders();
  const createMutation = useCreateWorkOrder();
  const startMutation = useStartWorkOrder();
  const scanMutation = useScanWorkOrderItem(fulfillingWorkOrderId ?? 0);
  const completeMutation = useCompleteWorkOrder();
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

  // Derived (not a local snapshot) so the modal reflects each scan's
  // updated scanned/remaining counts as soon as useScanWorkOrderItem patches
  // the work-orders query cache, rather than going stale after the first
  // scan - matches PurchaseOrdersPage's receivingPurchaseOrder pattern.
  const fulfillingWorkOrder =
    workOrders?.find((workOrder) => workOrder.id === fulfillingWorkOrderId) ?? null;

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<WorkOrderFormValues>({
    resolver: zodResolver(workOrderSchema),
    defaultValues: {
      job_name: '',
      client_name: '',
      expected_date_out: '',
      line_items: [EMPTY_LINE_ITEM],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' });

  const {
    control: scanControl,
    handleSubmit: handleScanSubmit,
    reset: resetScanForm,
    setError: setScanError,
    setFocus: setScanFocus,
    formState: { errors: scanErrors },
  } = useForm<ScanItemFormValues>({
    resolver: zodResolver(scanItemSchema),
    defaultValues: { line_item: undefined, serial_number: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: WorkOrderFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
  };

  const openFulfillmentModal = (workOrder: WorkOrder) => {
    setFulfillingWorkOrderId(workOrder.id);
    resetScanForm({ line_item: undefined, serial_number: '' });
    scanMutation.reset();
    completeMutation.reset();
  };

  const closeFulfillmentModal = () => {
    setFulfillingWorkOrderId(null);
    resetScanForm();
    scanMutation.reset();
    completeMutation.reset();
  };

  const onScanSubmit = (values: ScanItemFormValues) => {
    scanMutation.mutate(values, {
      onSuccess: (updatedWorkOrder) => {
        // Keep the same line item selected - a scan gun typically fires many
        // scans against the same line item in a row - and clear+refocus the
        // serial number field for the next one (AC-2). But if that scan just
        // completed the line item, it's no longer a valid option in
        // scannableLineItemOptions - keeping it selected would leave the
        // Select showing no matching option while still silently submitting
        // against the now-exhausted line item on the next scan. Read the
        // freshly returned WorkOrder (not the component's own
        // fulfillingWorkOrder, which hasn't re-rendered with this response
        // yet) to decide.
        const scannedLineItem = updatedWorkOrder.line_items.find(
          (item) => item.id === values.line_item,
        );
        resetScanForm({
          line_item:
            scannedLineItem && scannedLineItem.remaining_quantity > 0
              ? values.line_item
              : undefined,
          serial_number: '',
        });
        setScanFocus('serial_number');
      },
      onError: (error) => {
        const serialErrors = getFieldErrorMessages(error, 'serial_number');
        const lineItemErrors = getFieldErrorMessages(error, 'line_item');

        if (serialErrors.some((message) => message.includes('No item found'))) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.notFoundError',
          });
          return;
        }
        if (serialErrors.some((message) => message.includes('does not match'))) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.productTypeMismatchError',
          });
          return;
        }
        if (serialErrors.some((message) => message.includes('not available'))) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.notAvailableError',
          });
          return;
        }
        if (lineItemErrors.some((message) => message.includes('already reached'))) {
          setScanError('line_item', {
            type: 'server',
            message: 'workOrders.scan.overCapError',
          });
        }
      },
    });
  };

  const onCompleteFulfillment = () => {
    if (!fulfillingWorkOrderId) {
      return;
    }
    completeMutation.mutate(fulfillingWorkOrderId, { onSuccess: closeFulfillmentModal });
  };

  const productTypeOptions = (productTypes ?? []).map((productType) => ({
    value: productType.id,
    label: productType.name,
  }));
  // zodResolver puts a field array's own min()/max() error under .root, not
  // .message directly - useFieldArray reserves errors.line_items.message
  // for a (currently unused) error on the array field itself as a whole,
  // distinct from .root which is what z.array(...).min(1) actually
  // populates. See https://react-hook-form.com/docs/useform/formstate.
  const lineItemsError = errors.line_items?.root?.message ?? errors.line_items?.message;

  const scannableLineItemOptions = (fulfillingWorkOrder?.line_items ?? [])
    .filter((item) => item.remaining_quantity > 0)
    .map((item) => ({ value: item.id, label: item.product_type_name }));
  const isFullyScanned = (fulfillingWorkOrder?.line_items ?? []).every(
    (item) => item.remaining_quantity <= 0,
  );

  const columns = [
    {
      title: t('workOrders.jobNameLabel'),
      dataIndex: 'job_name',
      key: 'job_name',
    },
    {
      title: t('workOrders.clientNameLabel'),
      dataIndex: 'client_name',
      key: 'client_name',
    },
    {
      title: t('workOrders.expectedDateOutLabel'),
      dataIndex: 'expected_date_out',
      key: 'expected_date_out',
    },
    {
      title: t('workOrders.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{t(`workOrders.status.${status}`)}</Tag>,
    },
    {
      title: t('workOrders.createdByLabel'),
      dataIndex: 'created_by_username',
      key: 'created_by_username',
    },
    {
      title: t('workOrders.lineItemsLabel'),
      key: 'line_items',
      render: (_: unknown, record: WorkOrder) => (
        <span>
          {record.line_items
            .map((item) => `${item.product_type_name} × ${item.quantity}`)
            .join(', ')}
        </span>
      ),
    },
    {
      title: t('workOrders.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: WorkOrder) => {
        if (record.status === 'draft') {
          return (
            <Button
              size="small"
              loading={startMutation.isPending}
              onClick={() => startMutation.mutate(record.id)}
            >
              {t('workOrders.startButton')}
            </Button>
          );
        }
        if (record.status === 'in_progress') {
          return (
            <Button size="small" onClick={() => openFulfillmentModal(record)}>
              {t('workOrders.scanButton')}
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const fulfillmentLineItemColumns = [
    {
      title: t('workOrders.scan.lineItemHeader'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('workOrders.scan.quantityHeader'),
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: t('workOrders.scan.scannedHeader'),
      dataIndex: 'scanned_quantity',
      key: 'scanned_quantity',
    },
    {
      title: t('workOrders.scan.remainingHeader'),
      dataIndex: 'remaining_quantity',
      key: 'remaining_quantity',
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('workOrders.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('workOrders.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('workOrders.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<WorkOrder>
          rowKey="id"
          columns={columns}
          dataSource={workOrders}
          loading={isLoading}
          locale={{ emptyText: t('workOrders.emptyState') }}
        />
      )}
      <Modal
        title={t('workOrders.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
        width={640}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('workOrders.jobNameLabel')}
            htmlFor="work-order-job_name"
            validateStatus={errors.job_name ? 'error' : ''}
            help={errors.job_name ? t(errors.job_name.message ?? '') : undefined}
          >
            <Controller
              name="job_name"
              control={control}
              render={({ field }) => <Input {...field} id="work-order-job_name" />}
            />
          </Form.Item>
          <Form.Item label={t('workOrders.clientNameLabel')} htmlFor="work-order-client_name">
            <Controller
              name="client_name"
              control={control}
              render={({ field }) => <Input {...field} id="work-order-client_name" />}
            />
          </Form.Item>
          <Form.Item
            label={t('workOrders.expectedDateOutLabel')}
            htmlFor="work-order-expected_date_out"
            validateStatus={errors.expected_date_out ? 'error' : ''}
            help={errors.expected_date_out ? t(errors.expected_date_out.message ?? '') : undefined}
          >
            <Controller
              name="expected_date_out"
              control={control}
              render={({ field }) => (
                <DatePicker
                  id="work-order-expected_date_out"
                  style={{ width: '100%' }}
                  value={field.value ? dayjs(field.value, DATE_FORMAT) : null}
                  onChange={(date) => field.onChange(date ? date.format(DATE_FORMAT) : '')}
                />
              )}
            />
          </Form.Item>
          <Form.Item label={t('workOrders.lineItemsLabel')}>
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
                          placeholder={t('workOrders.form.productTypePlaceholder')}
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
                    name={`line_items.${index}.quantity`}
                    control={control}
                    render={({ field: quantityField, fieldState }) => (
                      <div>
                        <InputNumber
                          {...quantityField}
                          min={1}
                          placeholder={t('workOrders.form.quantityPlaceholder')}
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
                      aria-label={t('workOrders.form.removeLineItemButton')}
                      onClick={() => remove(index)}
                    />
                  )}
                </Space>
              </div>
            ))}
            {lineItemsError && (
              <Alert
                type="error"
                message={t(lineItemsError)}
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
              {t('workOrders.form.addLineItemButton')}
            </Button>
          </Form.Item>
          {isProductTypesError && (
            <Form.Item>
              <Alert type="error" message={t('workOrders.loadProductTypesError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && (
            <Form.Item>
              <Alert type="error" message={t('workOrders.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal
        title={t('workOrders.scan.title', { jobName: fulfillingWorkOrder?.job_name ?? '' })}
        open={fulfillingWorkOrder !== null}
        onCancel={closeFulfillmentModal}
        width={640}
        footer={[
          <Button key="done" onClick={closeFulfillmentModal}>
            {t('workOrders.scan.doneButton')}
          </Button>,
          <Button
            key="complete"
            type="primary"
            disabled={!isFullyScanned}
            loading={completeMutation.isPending}
            onClick={onCompleteFulfillment}
          >
            {t('workOrders.scan.completeButton')}
          </Button>,
        ]}
      >
        {fulfillingWorkOrder && (
          <>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={fulfillingWorkOrder.line_items}
              columns={fulfillmentLineItemColumns}
              style={{ marginBottom: 16 }}
            />
            <Form layout="vertical" noValidate onFinish={handleScanSubmit(onScanSubmit)}>
              <Form.Item
                label={t('workOrders.scan.lineItemLabel')}
                htmlFor="scan-line_item"
                validateStatus={scanErrors.line_item ? 'error' : ''}
                help={scanErrors.line_item ? t(scanErrors.line_item.message ?? '') : undefined}
              >
                <Controller
                  name="line_item"
                  control={scanControl}
                  render={({ field }) => (
                    <Select
                      {...field}
                      id="scan-line_item"
                      placeholder={t('workOrders.scan.lineItemPlaceholder')}
                      options={scannableLineItemOptions}
                    />
                  )}
                />
              </Form.Item>
              <Form.Item
                label={t('workOrders.scan.serialNumberLabel')}
                htmlFor="scan-serial_number"
                validateStatus={scanErrors.serial_number ? 'error' : ''}
                help={
                  scanErrors.serial_number ? t(scanErrors.serial_number.message ?? '') : undefined
                }
              >
                <Controller
                  name="serial_number"
                  control={scanControl}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="scan-serial_number"
                      placeholder={t('workOrders.scan.serialNumberPlaceholder')}
                    />
                  )}
                />
              </Form.Item>
              {scanMutation.isError && !scanErrors.serial_number && !scanErrors.line_item && (
                <Alert
                  type="error"
                  message={t('workOrders.scan.genericError')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              <Button type="primary" htmlType="submit" loading={scanMutation.isPending}>
                {t('workOrders.scan.scanButton')}
              </Button>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
