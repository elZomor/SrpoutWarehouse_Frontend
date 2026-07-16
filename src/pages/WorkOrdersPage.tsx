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
import { workOrderSchema, type WorkOrderFormValues } from '../features/work-orders/schema';
import type { WorkOrder } from '../features/work-orders/types';
import { useCreateWorkOrder, useWorkOrders } from '../features/work-orders/useWorkOrders';

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_LINE_ITEM = { product_type: undefined, quantity: undefined };

export function WorkOrdersPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: workOrders, isLoading, isError: isListError } = useWorkOrders();
  const createMutation = useCreateWorkOrder();
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

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

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: WorkOrderFormValues) => {
    createMutation.mutate(values, { onSuccess: closeModal });
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
    </>
  );
}
