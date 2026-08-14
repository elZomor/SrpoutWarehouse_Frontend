import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, App, Button, Form, Modal, Select, Table, Tag, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { classifyItemRejection, type ItemRejection } from '../features/maintenance-orders/logic';
import {
  maintenanceOrderSchema,
  type MaintenanceOrderFormValues,
} from '../features/maintenance-orders/schema';
import type { MaintenanceOrder } from '../features/maintenance-orders/types';
import {
  useCreateMaintenanceOrder,
  useMaintenanceOrders,
} from '../features/maintenance-orders/useMaintenanceOrders';
import { useSerializedItems } from '../features/serialized-items/useSerializedItems';

export function MaintenanceOrdersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: maintenanceOrders, isLoading, isError: isListError } = useMaintenanceOrders();
  const createMutation = useCreateMaintenanceOrder();
  // AC-1: "one or more items have status damaged" - the item picker fetches
  // every serialized item (no product_type scoping like BoxesPage, since an
  // MO isn't scoped to one product type) and filters to damaged ones
  // client-side, matching BoxesPage's identical client-side status filter
  // (the backend has no status filter param).
  const {
    data: serializedItems,
    isLoading: isItemsLoading,
    isError: isItemsError,
  } = useSerializedItems('', undefined, isModalOpen);
  const damagedItemOptions = (serializedItems ?? [])
    .filter((item) => item.status === 'damaged')
    .map((item) => ({ value: item.id, label: item.serial_number }));
  // WRH-46: item_ids rejections name a specific item (and, for the
  // already-on-another-MO case, that MO's reference) - classifyItemRejection
  // anchors on each rejection's fixed wrapping phrase and interpolates the
  // free-text identifiers into a translated template, matching
  // BoxesPage/classifyItemRejection's identical reasoning.
  const [itemRejection, setItemRejection] = useState<ItemRejection | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceOrderFormValues>({
    resolver: zodResolver(maintenanceOrderSchema),
    defaultValues: { item_ids: [] },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    setItemRejection(null);
    createMutation.reset();
  };

  const onSubmit = (values: MaintenanceOrderFormValues) => {
    setItemRejection(null);
    createMutation.mutate(values, {
      onSuccess: (maintenanceOrder) => {
        message.success(
          t('maintenanceOrders.createSuccess', { reference: maintenanceOrder.reference }),
        );
        closeModal();
      },
      onError: (error) => {
        setItemRejection(classifyItemRejection(error));
      },
    });
  };

  const columns = [
    {
      title: t('maintenanceOrders.referenceLabel'),
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: t('maintenanceOrders.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{t(`maintenanceOrders.status.${status}`)}</Tag>,
    },
    {
      title: t('maintenanceOrders.itemCountLabel'),
      key: 'item_count',
      render: (_: unknown, record: MaintenanceOrder) => record.items.length,
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('maintenanceOrders.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('maintenanceOrders.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('maintenanceOrders.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<MaintenanceOrder>
          rowKey="id"
          columns={columns}
          dataSource={maintenanceOrders}
          loading={isLoading}
          locale={{ emptyText: t('maintenanceOrders.emptyState') }}
        />
      )}
      <Modal
        title={t('maintenanceOrders.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('maintenanceOrders.itemsLabel')}
            htmlFor="maintenance-order-item_ids"
            validateStatus={errors.item_ids ? 'error' : ''}
            help={errors.item_ids ? t(errors.item_ids.message ?? '') : undefined}
          >
            <Controller
              name="item_ids"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id="maintenance-order-item_ids"
                  mode="multiple"
                  loading={isItemsLoading}
                  placeholder={t('maintenanceOrders.itemsPlaceholder')}
                  options={damagedItemOptions}
                />
              )}
            />
          </Form.Item>
          {isItemsError && (
            <Form.Item>
              <Alert type="error" message={t('maintenanceOrders.loadItemsError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && (
            <Form.Item>
              <Alert
                type="error"
                message={
                  itemRejection
                    ? t(itemRejection.messageKey, itemRejection.params)
                    : t('maintenanceOrders.createError')
                }
                showIcon
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
