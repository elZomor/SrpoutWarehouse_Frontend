import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Form,
  Input,
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
import { useApiFeedback } from '../hooks/useApiFeedback';
import { classifyItemRejection, type ItemRejection } from '../features/maintenance-orders/logic';
import {
  maintenanceOrderSchema,
  type MaintenanceOrderFormValues,
} from '../features/maintenance-orders/schema';
import type {
  MaintenanceOrder,
  MaintenanceOrderItem,
  MaintenanceOrderNote,
  MaintenanceOrderResolution,
} from '../features/maintenance-orders/types';
import {
  useCreateMaintenanceOrder,
  useMaintenanceOrders,
  useResolveMaintenanceOrderItem,
} from '../features/maintenance-orders/useMaintenanceOrders';
import { getSerializedItemStatusColor } from '../features/serialized-items/logic';
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
  const { notifySuccess, notifyError } = useApiFeedback();
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
  // Which items currently have a resolve request in flight. Deliberately
  // local state, not `resolveMutation.isPending`/`.variables` - a single
  // shared `useMutation` instance only remembers the *most recent* call's
  // variables, so it can't represent "item A is still pending" once a
  // second, different item's resolve starts (it would incorrectly read as
  // not-pending for A again). A Set correctly tracks however many items are
  // genuinely in flight at once. Cleared only once the item's own request's
  // promise settles - which, per useResolveMaintenanceOrderItem's onSuccess
  // now awaiting its invalidateQueries() calls, is after the refetched data
  // has actually landed, not just after the response arrived.
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<number>>(new Set());
  // AC-2/AC-3: each resolve action (fixed/not_fixable) can carry its own
  // optional note, entered per line item before either confirm button is
  // clicked - keyed by item id since a row can have several resolvable
  // items in flight independently, matching pendingItemIds' identical
  // per-item shape above. A Map (not a plain object) avoids
  // eslint-plugin-security's detect-object-injection warning on the
  // dynamic-key lookup, matching TRANSACTION_TYPE_COLORS' identical
  // reasoning in features/transactions/logic.ts.
  const [noteDrafts, setNoteDrafts] = useState<ReadonlyMap<number, string>>(new Map());

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MaintenanceOrderFormValues>({
    resolver: zodResolver(maintenanceOrderSchema),
    defaultValues: { item_ids: [], note: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    setItemRejection(null);
  };

  const onSubmit = (values: MaintenanceOrderFormValues) => {
    setItemRejection(null);
    // Normalizes a blank/whitespace-only note to undefined (rather than
    // sending "") so an untouched field and a typed-then-cleared one are
    // indistinguishable on the wire - matches handleResolve's identical
    // normalization for its own per-item note draft below.
    const note = values.note?.trim() ? values.note : undefined;
    createMutation.mutate(
      { ...values, note },
      {
        onSuccess: (maintenanceOrder) => {
          notifySuccess(
            t('maintenanceOrders.createSuccess', { reference: maintenanceOrder.reference }),
          );
          closeModal();
        },
        onError: (error) => {
          const rejection = classifyItemRejection(error);
          setItemRejection(rejection);
          if (!rejection) {
            notifyError(t('maintenanceOrders.createError'));
          }
        },
      },
    );
  };

  // Returns (rather than fires-and-forgets) the mutation's promise so
  // Popconfirm's onConfirm can await it - antd's ActionButton then handles
  // the *clicked* OK button's own loading/disabled state for the duration
  // of the request. That alone isn't enough to block every duplicate (it's
  // scoped to one ActionButton instance, and `resolveMutation.isPending`
  // can't distinguish "this item" from "some other item" once a second
  // resolve starts) - `pendingItemIds` above is the actual guard the
  // buttons below gate on; this just adds/removes this one item's id
  // around the request, including the invalidated queries' refetch since
  // the hook's onSuccess now awaits those too. Both outcomes are swallowed
  // (not rethrown) so the popup always closes rather than reopening on
  // failure with no visible pending state of its own.
  const handleResolve = (
    maintenanceOrderId: number,
    itemId: number,
    resolution: MaintenanceOrderResolution,
  ) => {
    setPendingItemIds((current) => new Set(current).add(itemId));
    // Normalizes a blank/whitespace-only draft to undefined, matching
    // maintenanceOrderSchema's identical "note omitted when blank"
    // transform for the create form.
    const draft = noteDrafts.get(itemId);
    const note = draft?.trim() ? draft : undefined;
    return resolveMutation
      .mutateAsync({ maintenanceOrderId, itemId, resolution, note })
      .then(
        () => notifySuccess(t('maintenanceOrders.items.resolveSuccess')),
        () => notifyError(t('maintenanceOrders.items.resolveError')),
      )
      .finally(() => {
        setPendingItemIds((current) => {
          const next = new Set(current);
          next.delete(itemId);
          return next;
        });
        setNoteDrafts((current) => {
          const next = new Map(current);
          next.delete(itemId);
          return next;
        });
      });
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
      render: (status: string) => (
        <Tag color={getSerializedItemStatusColor(status)}>
          {t(`serializedItems.status.${status}`)}
        </Tag>
      ),
    },
    {
      title: t('maintenanceOrders.items.actionsLabel'),
      key: 'actions',
      render: (_: unknown, item: MaintenanceOrderItem) => {
        if (item.status !== RESOLVABLE_ITEM_STATUS) return null;
        // onConfirm returning handleResolve's promise lets antd's
        // Popconfirm natively disable/spin the OK button that was actually
        // clicked - but that state is local to just that one ActionButton
        // instance, so it does nothing for this row's *other* action while
        // the first is in flight (same item, still showing as resolvable
        // until the post-request refetch lands - the backend has no "not
        // already in_maintenance" guard either, that's WRH-47's separate
        // scope, so two concurrent requests would both succeed and
        // silently race). `disabled` on both trigger buttons, keyed off
        // `pendingItemIds` (not the shared mutation's own state - see its
        // declaration above), closes that window regardless of which
        // action started the request or how many other items are also
        // mid-resolve at the same time.
        const isItemPending = pendingItemIds.has(item.id);
        return (
          <Space>
            <Input
              size="small"
              style={{ width: 160 }}
              placeholder={t('maintenanceOrders.items.notePlaceholder')}
              aria-label={t('maintenanceOrders.items.noteAriaLabel', {
                serial: item.serial_number,
              })}
              value={noteDrafts.get(item.id) ?? ''}
              disabled={isItemPending}
              onChange={(event) =>
                setNoteDrafts((current) => new Map(current).set(item.id, event.target.value))
              }
            />
            <Popconfirm
              title={t('maintenanceOrders.items.markFixedConfirmTitle')}
              onConfirm={() => handleResolve(maintenanceOrderId, item.id, 'fixed')}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
            >
              <Button size="small" type="primary" disabled={isItemPending}>
                {t('maintenanceOrders.items.markFixedButton')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('maintenanceOrders.items.markNotFixableConfirmTitle')}
              onConfirm={() => handleResolve(maintenanceOrderId, item.id, 'not_fixable')}
              okText={t('common.ok')}
              cancelText={t('common.cancel')}
            >
              <Button size="small" danger disabled={isItemPending}>
                {t('maintenanceOrders.items.markNotFixableButton')}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  // AC-4/AC-5: history shown as its own read-only table, distinct per
  // action (create/fix/write-off) with timestamp and actor - never merged
  // or overwritten, since each note is its own backend record.
  const noteColumns = [
    {
      title: t('maintenanceOrders.notes.actionLabel'),
      dataIndex: 'action',
      key: 'action',
      render: (action: MaintenanceOrderNote['action']) => (
        <Tag>{t(`maintenanceOrders.notes.action.${action}`)}</Tag>
      ),
    },
    {
      title: t('maintenanceOrders.items.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
      render: (serialNumber: string | null) => serialNumber ?? '—',
    },
    {
      title: t('maintenanceOrders.notes.textLabel'),
      dataIndex: 'text',
      key: 'text',
    },
    {
      title: t('maintenanceOrders.notes.userLabel'),
      dataIndex: 'user_username',
      key: 'user_username',
    },
    {
      title: t('maintenanceOrders.notes.createdAtLabel'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (createdAt: string) => new Date(createdAt).toLocaleString(),
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
            rowExpandable: (record) => record.items.length > 0 || record.notes.length > 0,
            expandedRowRender: (record) => (
              <>
                <Table<MaintenanceOrderItem>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  columns={buildItemColumns(record.id)}
                  dataSource={record.items}
                />
                {record.notes.length > 0 && (
                  <>
                    <Typography.Text strong style={{ display: 'block', marginTop: 16 }}>
                      {t('maintenanceOrders.notes.historyTitle')}
                    </Typography.Text>
                    <Table<MaintenanceOrderNote>
                      rowKey="id"
                      size="small"
                      pagination={false}
                      columns={noteColumns}
                      dataSource={record.notes}
                    />
                  </>
                )}
              </>
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
          <Form.Item
            label={t('maintenanceOrders.form.notesLabel')}
            htmlFor="maintenance-order-note"
          >
            <Controller
              name="note"
              control={control}
              render={({ field }) => (
                <Input.TextArea
                  {...field}
                  id="maintenance-order-note"
                  placeholder={t('maintenanceOrders.form.notesPlaceholder')}
                  rows={3}
                />
              )}
            />
          </Form.Item>
          {itemRejection && (
            <Form.Item>
              <Alert
                type="error"
                message={t(itemRejection.messageKey, itemRejection.params)}
                showIcon
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
