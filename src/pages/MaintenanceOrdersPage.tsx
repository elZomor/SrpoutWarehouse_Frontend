import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  App,
  Button,
  Form,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { classifyItemRejection, type ItemRejection } from '../features/maintenance-orders/logic';
import {
  maintenanceOrderSchema,
  type MaintenanceOrderFormValues,
} from '../features/maintenance-orders/schema';
import type {
  MaintenanceOrder,
  MaintenanceOrderItem,
  MaintenanceOrderResolution,
} from '../features/maintenance-orders/types';
import {
  useCreateMaintenanceOrder,
  useMaintenanceOrders,
  useResolveMaintenanceOrderItem,
} from '../features/maintenance-orders/useMaintenanceOrders';
import { useSerializedItems } from '../features/serialized-items/useSerializedItems';

// AC-1/AC-2: only an item still awaiting resolution ("in_maintenance",
// set by MaintenanceOrderSerializer.create() at MO-creation time) offers
// the resolve actions - an item already flipped to available/written_off
// renders as a plain status tag. Re-resolving an already-resolved item is
// WRH-47's separate guard; this is purely a UI affordance so the actions
// aren't offered for a state they can't meaningfully apply to twice.
const RESOLVABLE_ITEM_STATUS = 'in_maintenance';

export function MaintenanceOrdersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: maintenanceOrders, isLoading, isError: isListError } = useMaintenanceOrders();
  const createMutation = useCreateMaintenanceOrder();
  const resolveMutation = useResolveMaintenanceOrderItem();
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

  const handleResolve = (
    maintenanceOrderId: number,
    itemId: number,
    resolution: MaintenanceOrderResolution,
  ) => {
    resolveMutation.mutate(
      { maintenanceOrderId, itemId, resolution },
      {
        onSuccess: () => message.success(t('maintenanceOrders.items.resolveSuccess')),
        onError: () => message.error(t('maintenanceOrders.items.resolveError')),
      },
    );
  };

  // AntD column `render` only gets (value, record, index) - the target MO's
  // id isn't part of an item row, so it's captured via closure instead of
  // threaded through render's signature.
  const buildItemColumns = (maintenanceOrderId: number) => [
    {
      title: t('maintenanceOrders.items.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('maintenanceOrders.items.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => <Tag>{t(`serializedItems.status.${status}`)}</Tag>,
    },
    {
      title: t('maintenanceOrders.items.actionsLabel'),
      key: 'actions',
      render: (_: unknown, item: MaintenanceOrderItem) => {
        if (item.status !== RESOLVABLE_ITEM_STATUS) return null;
        // Tracked per-resolution (not just per-item) so clicking "fixed"
        // doesn't also spin up the "not fixable" button's loading state on
        // the same row - matches MissingItemsPage's two-separate-mutations
        // precedent, adapted for this page's one-shared-mutation shape.
        const isPendingFor = (resolution: MaintenanceOrderResolution) =>
          resolveMutation.isPending &&
          resolveMutation.variables?.itemId === item.id &&
          resolveMutation.variables?.resolution === resolution;
        return (
          <Space>
            <Popconfirm
              title={t('maintenanceOrders.items.markFixedConfirmTitle')}
              onConfirm={() => handleResolve(maintenanceOrderId, item.id, 'fixed')}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
              okButtonProps={{ loading: isPendingFor('fixed') }}
            >
              <Button size="small" type="primary">
                {t('maintenanceOrders.items.markFixedButton')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('maintenanceOrders.items.markNotFixableConfirmTitle')}
              onConfirm={() => handleResolve(maintenanceOrderId, item.id, 'not_fixable')}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
              okButtonProps={{ loading: isPendingFor('not_fixable') }}
            >
              <Button size="small" danger>
                {t('maintenanceOrders.items.markNotFixableButton')}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

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
          expandable={{
            // AC-1/AC-2: line items (and their resolve actions) live behind
            // the same click-to-expand row toggle as WorkOrdersPage's
            // identical nested-Table pattern for a parent/line-item
            // relationship (see its "expand row" test) - a controlled
            // `expandedRowKeys` recomputed every render was tried first but
            // caused an infinite Table-internal re-render loop (caught by a
            // hung test run, not lint/typecheck), so this sticks to the
            // proven, uncontrolled default instead.
            rowExpandable: (record) => record.items.length > 0,
            expandedRowRender: (record) => (
              <Table<MaintenanceOrderItem>
                rowKey="id"
                size="small"
                pagination={false}
                columns={buildItemColumns(record.id)}
                dataSource={record.items}
              />
            ),
          }}
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
