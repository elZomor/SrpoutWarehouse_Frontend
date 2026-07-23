import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  returnItemSchema,
  scanItemSchema,
  workOrderSchema,
  type ReturnItemFormValues,
  type ScanItemFormValues,
  type WorkOrderFormValues,
} from '../features/work-orders/schema';
import type {
  ActiveWorkOrder,
  ActiveWorkOrderLineItem,
  ActiveWorkOrderSupplementary,
  WorkOrder,
  WorkOrderReturnResult,
} from '../features/work-orders/types';
import {
  useActiveWorkOrders,
  useCompleteWorkOrder,
  useCreateWorkOrder,
  useInvalidateActiveWorkOrders,
  useReturnWorkOrderItem,
  useScanWorkOrderItem,
  useStartWorkOrder,
  useWorkOrderDetail,
  useWorkOrders,
} from '../features/work-orders/useWorkOrders';
import { getFieldErrorMessages } from '../lib/apiErrors';

const DATE_FORMAT = 'YYYY-MM-DD';
const EMPTY_LINE_ITEM = { product_type: undefined, quantity: undefined };
// A Map (not a plain object) avoids eslint-plugin-security's
// detect-object-injection warning on the dynamic-key lookup below, matching
// SerializedItemsPage's identical STATUS_COLORS convention.
const SERIALIZED_ITEM_STATUS_COLORS = new Map<string, string>([
  ['available', 'green'],
  ['reserved', 'gold'],
  ['out', 'red'],
]);
const DEFAULT_STATUS_COLOR = 'default';
// WRH-33: scan()'s serial_number rejection messages are always
// `${serial_number} ${reason}` - and serial_number is unconstrained free
// text (backend SerializedItem.serial_number has no format restriction),
// so every one of these has to be matched against the message's actual
// *end*, not just checked with .includes() anywhere in the string. A serial
// number that happens to contain another reason's phrase (e.g.
// "SN is currently out on WO-5" scanned while genuinely damaged) would
// otherwise misclassify: the backend always appends its real reason last,
// so anchoring to $ is what makes the true reason unambiguous regardless of
// what's in the serial itself.
const OUT_PATTERN = /is currently out on WO-(\d+)$/;
const RESERVED_PATTERN = /is already reserved on WO-(\d+)$/;
const DAMAGED_PATTERN = /is damaged and cannot be issued$/;
const MISSING_PATTERN = /is missing and cannot be issued$/;
// WRH-38: return_item()'s serial_number rejections follow the same
// `${serial_number} ${reason}` shape as scan()'s - anchored to the
// message's end for the same reason as the OUT/RESERVED/DAMAGED/MISSING
// patterns above.
const NOT_ISSUED_PATTERN = /was not issued on WO-(\d+)$/;
const NOT_OUT_PATTERN = /is not currently out on this work order$/;
const RETURN_ELIGIBLE_STATUSES = new Set(['fulfilled', 'partially_returned']);

export function WorkOrdersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fulfillingWorkOrderId, setFulfillingWorkOrderId] = useState<number | null>(null);
  const { data: workOrders, isLoading, isError: isListError } = useWorkOrders();
  const createMutation = useCreateWorkOrder();
  const startMutation = useStartWorkOrder();
  const scanMutation = useScanWorkOrderItem(fulfillingWorkOrderId ?? 0);
  const completeMutation = useCompleteWorkOrder();
  const invalidateActiveWorkOrders = useInvalidateActiveWorkOrders();
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');
  const {
    data: activeWorkOrders,
    isLoading: isActiveLoading,
    isError: isActiveError,
  } = useActiveWorkOrders();
  const [detailWorkOrderId, setDetailWorkOrderId] = useState<number | null>(null);
  const {
    data: workOrderDetail,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useWorkOrderDetail(detailWorkOrderId);

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
  // scanErrors.serial_number.message only ever holds an i18n key (both the
  // zod-resolver's built-in required-field keys and the server-driven keys
  // set in onScanSubmit's onError below) - the WO-id a rejected out/reserved
  // scan needs to interpolate lives here instead, alongside it rather than
  // baked into the key itself.
  const [scanErrorParams, setScanErrorParams] = useState<{ workOrderId?: string }>({});

  // AC-1/AC-2/AC-4: returnSession holds the running return summary (status
  // + per-line-item returned/still-out counts) - seeded from the clicked
  // Active-tab row on open, then replaced by each return_item response.
  // Its shape (WorkOrderReturnResult) doesn't match either cached list
  // (WorkOrder's flat shape, ActiveWorkOrder's nested supplementaries), so
  // it's tracked as local state rather than patched into a query cache -
  // see useReturnWorkOrderItem's comment.
  const [returnSession, setReturnSession] = useState<WorkOrderReturnResult | null>(null);
  // Bumped on every open/close of the Return modal - a "generation" a
  // submission effect below can compare itself against later, since a
  // fresh open (even re-opening the *same* work order) starts a logically
  // new session that any earlier in-flight submission's response no
  // longer belongs to, and a workOrderId-only comparison can't tell that
  // apart from the original session (WRH-38 review: closing a modal with
  // a submission in flight, then reopening the same WO before that
  // response lands, would otherwise still pass an id-only check).
  // Written directly here since openReturnModal/closeReturnModal are
  // plain event handlers (not reachable from handleReturnSubmit(...),
  // evaluated during render, which is what react-hooks/refs actually
  // objects to per useRef's own docs).
  const returnSessionGenerationRef = useRef(0);
  const returnMutation = useReturnWorkOrderItem(returnSession?.id ?? 0);
  const {
    control: returnControl,
    handleSubmit: handleReturnSubmit,
    reset: resetReturnForm,
    setError: setReturnError,
    setFocus: setReturnFocus,
    formState: { errors: returnErrors },
  } = useForm<ReturnItemFormValues>({
    resolver: zodResolver(returnItemSchema),
    defaultValues: { serial_number: '' },
  });
  const [returnErrorParams, setReturnErrorParams] = useState<{ workOrderId?: string }>({});
  const [pendingReturnSubmission, setPendingReturnSubmission] =
    useState<ReturnItemFormValues | null>(null);

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
    setScanErrorParams({});
    scanMutation.reset();
    completeMutation.reset();
  };

  const closeFulfillmentModal = () => {
    // Any scans made during this session only patched workOrdersBaseKey
    // (see useScanWorkOrderItem's comment) - catch the Active tab's cache
    // up now that the session's over, rather than on every single scan.
    if (fulfillingWorkOrderId !== null) {
      invalidateActiveWorkOrders(fulfillingWorkOrderId);
    }
    setFulfillingWorkOrderId(null);
    resetScanForm();
    setScanErrorParams({});
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
        setScanErrorParams({});
        setScanFocus('serial_number');
      },
      onError: (error) => {
        const serialErrors = getFieldErrorMessages(error, 'serial_number');
        const lineItemErrors = getFieldErrorMessages(error, 'line_item');
        setScanErrorParams({});

        // AC-4/AC-2: both are fixed constants with no serial_number in
        // them, unlike the four dynamic messages below - checked by exact
        // equality (not .includes()) so a *different* rejection whose
        // free-text serial_number happens to contain one of these phrases
        // can't be swallowed by an earlier, looser check.
        if (serialErrors.some((message) => message === 'Serial not found')) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.notFoundError',
          });
          return;
        }
        if (
          serialErrors.some(
            (message) => message === "Item does not match this line item's product type.",
          )
        ) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.productTypeMismatchError',
          });
          return;
        }
        // AC-1: item already out on another WO - name that WO.
        const outMatch = serialErrors.map((message) => message.match(OUT_PATTERN)).find(Boolean);
        if (outMatch) {
          setScanErrorParams({ workOrderId: outMatch[1] });
          setScanError('serial_number', { type: 'server', message: 'workOrders.scan.outError' });
          return;
        }
        // Same WO reference as above, but for a scan-in-progress double-tap
        // (item already claimed, not yet confirmed out) rather than a fully
        // fulfilled WO.
        const reservedMatch = serialErrors
          .map((message) => message.match(RESERVED_PATTERN))
          .find(Boolean);
        if (reservedMatch) {
          setScanErrorParams({ workOrderId: reservedMatch[1] });
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.reservedError',
          });
          return;
        }
        // AC-3: damaged/missing items.
        if (serialErrors.some((message) => DAMAGED_PATTERN.test(message))) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.damagedError',
          });
          return;
        }
        if (serialErrors.some((message) => MISSING_PATTERN.test(message))) {
          setScanError('serial_number', {
            type: 'server',
            message: 'workOrders.scan.missingError',
          });
          return;
        }
        if (serialErrors.length > 0) {
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
    completeMutation.mutate(fulfillingWorkOrderId, {
      onSuccess: closeFulfillmentModal,
      onError: () => message.error(t('workOrders.scan.completeError')),
    });
  };

  const openReturnModal = (workOrder: ActiveWorkOrder | ActiveWorkOrderSupplementary) => {
    // Starting a new session (even re-opening the same WO) invalidates
    // any earlier in-flight submission - see returnSessionGenerationRef's
    // comment.
    returnSessionGenerationRef.current += 1;
    setReturnSession({
      id: workOrder.id,
      job_name: workOrder.job_name,
      status: workOrder.status,
      line_items: workOrder.line_items,
    });
    resetReturnForm({ serial_number: '' });
    setReturnErrorParams({});
    returnMutation.reset();
  };

  const closeReturnModal = () => {
    // Mirrors closeFulfillmentModal's end-of-session invalidation - every
    // return_item call during this session only updated local state (see
    // returnSession's comment), so the Active tab's cache needs to catch up
    // now rather than on every single scan.
    returnSessionGenerationRef.current += 1;
    if (returnSession !== null) {
      invalidateActiveWorkOrders(returnSession.id);
    }
    setReturnSession(null);
    resetReturnForm();
    setReturnErrorParams({});
    returnMutation.reset();
  };

  const onReturnSubmit = (values: ReturnItemFormValues) => {
    setPendingReturnSubmission(values);
  };

  // WRH-57/AC-1: a second submit path off the same form/validation - marks
  // the scanned unit damaged instead of returning it to available stock.
  // Both paths funnel into the same pendingReturnSubmission effect below.
  const onMarkDamagedSubmit = (values: ReturnItemFormValues) => {
    setPendingReturnSubmission({ ...values, damaged: true });
  };

  // A response can land after the user has since closed the modal, opened
  // a *different* WO's session, or closed and re-opened the *same* WO's
  // session while this submission was still in flight - unlike scan/
  // complete (whose modal visibility is derived from the query cache, so
  // a late response can't reopen it), returnSession is local state that a
  // stale response could otherwise overwrite or reopen directly (see
  // returnSession's comment). onReturnSubmit itself must stay ref-free
  // (react-hooks/refs fires on anything reachable from a function passed
  // to handleReturnSubmit(...), evaluated during render) - this separate
  // effect owns the actual mutateAsync() call and captures the current
  // returnSessionGenerationRef value up front, then re-checks it only
  // inside the settled Promise's .then()/.catch() callbacks, mirroring
  // React's documented "ignore flag" stale-response pattern (setState
  // inside the callback, not the effect body itself - see
  // react.dev/learn/you-might-not-need-an-effect's "Fetching data"
  // section). returnMutation/resetReturnForm/setReturnError/setReturnFocus
  // are deliberately excluded from the dependency array: including
  // returnMutation (a new object identity every render) would refire
  // mutateAsync on every unrelated re-render while a submission is still
  // pending.
  useEffect(() => {
    if (!pendingReturnSubmission) {
      return;
    }
    const values = pendingReturnSubmission;
    const generation = returnSessionGenerationRef.current;
    let ignore = false;

    returnMutation.mutateAsync(values).then(
      (updated) => {
        if (ignore || returnSessionGenerationRef.current !== generation) {
          return;
        }
        setReturnSession(updated);
        resetReturnForm({ serial_number: '' });
        setReturnErrorParams({});
        setReturnFocus('serial_number');
      },
      (error) => {
        if (ignore || returnSessionGenerationRef.current !== generation) {
          return;
        }
        const serialErrors = getFieldErrorMessages(error, 'serial_number');
        const statusErrors = getFieldErrorMessages(error, 'status');
        setReturnErrorParams({});

        if (serialErrors.some((message) => message === 'Serial not found')) {
          setReturnError('serial_number', {
            type: 'server',
            message: 'workOrders.return.notFoundError',
          });
          return;
        }
        const notIssuedMatch = serialErrors
          .map((message) => message.match(NOT_ISSUED_PATTERN))
          .find(Boolean);
        if (notIssuedMatch) {
          setReturnErrorParams({ workOrderId: notIssuedMatch[1] });
          setReturnError('serial_number', {
            type: 'server',
            message: 'workOrders.return.notIssuedError',
          });
          return;
        }
        if (serialErrors.some((message) => NOT_OUT_PATTERN.test(message))) {
          setReturnError('serial_number', {
            type: 'server',
            message: 'workOrders.return.notOutError',
          });
          return;
        }
        if (statusErrors.length > 0) {
          setReturnError('serial_number', {
            type: 'server',
            message: 'workOrders.return.statusError',
          });
        }
      },
    );

    return () => {
      ignore = true;
    };
  }, [pendingReturnSubmission]);

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

  // Shared by the Manage tab's table and the Active tab's (both primary and
  // nested supplementary) tables - every WorkOrder/ActiveWorkOrder shape
  // carries the same job_name/client_name/expected_date_out/status fields,
  // and none of these four columns read anything beyond the cell value.
  const baseWorkOrderColumns = [
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
  ];

  const columns = [
    ...baseWorkOrderColumns,
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
              // Scoped to this row's own id via the mutation's `variables`
              // (the last id passed to mutate()) rather than the shared
              // `startMutation.isPending` alone - otherwise starting one
              // draft WO would show every other draft row's Start button
              // as loading/disabled too, since they'd all read the same
              // page-level mutation instance's pending flag.
              loading={startMutation.isPending && startMutation.variables === record.id}
              onClick={() =>
                startMutation.mutate(record.id, {
                  onError: () => message.error(t('workOrders.startError')),
                })
              }
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

  const returnLineItemColumns = [
    {
      title: t('workOrders.return.productHeader'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('workOrders.return.quantityHeader'),
      dataIndex: 'quantity',
      key: 'quantity',
    },
    {
      title: t('workOrders.return.returnedHeader'),
      dataIndex: 'returned_quantity',
      key: 'returned_quantity',
    },
    {
      title: t('workOrders.return.damagedHeader'),
      dataIndex: 'damaged_quantity',
      key: 'damaged_quantity',
    },
    {
      title: t('workOrders.return.stillOutHeader'),
      dataIndex: 'still_out_quantity',
      key: 'still_out_quantity',
    },
  ];

  // Shared by the Primary row table and the nested supplementary table -
  // both carry the same per-WO summary shape (see
  // WorkOrderActiveSupplementarySerializer's backend comment: one level of
  // nesting only, a supplementary never has its own supplementaries).
  const activeColumns = [
    ...baseWorkOrderColumns,
    {
      title: t('workOrders.active.productTypesHeader'),
      key: 'line_items',
      render: (_: unknown, record: ActiveWorkOrder | ActiveWorkOrderSupplementary) => (
        <Space direction="vertical" size={0}>
          {record.line_items.map((item: ActiveWorkOrderLineItem) => (
            <span key={item.id}>
              {t('workOrders.active.productTypeSummary', {
                productType: item.product_type_name,
                returned: item.returned_quantity,
                damaged: item.damaged_quantity,
                stillOut: item.still_out_quantity,
              })}
            </span>
          ))}
        </Space>
      ),
    },
    {
      title: t('workOrders.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: ActiveWorkOrder | ActiveWorkOrderSupplementary) => (
        <Space size="small">
          <Button size="small" onClick={() => setDetailWorkOrderId(record.id)}>
            {t('workOrders.active.viewDetailsButton')}
          </Button>
          {RETURN_ELIGIBLE_STATUSES.has(record.status) && (
            <Button size="small" onClick={() => openReturnModal(record)}>
              {t('workOrders.return.button')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const detailRows = (workOrderDetail?.line_items ?? []).flatMap((lineItem) =>
    lineItem.serialized_items.map((item) => ({
      key: item.id,
      product_type_name: lineItem.product_type_name,
      serial_number: item.serial_number,
      status: item.status,
    })),
  );

  const detailColumns = [
    {
      title: t('workOrders.detail.productTypeHeader'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('workOrders.detail.serialNumberHeader'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('workOrders.detail.statusHeader'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={SERIALIZED_ITEM_STATUS_COLORS.get(status) ?? DEFAULT_STATUS_COLOR}>
          {t(`serializedItems.status.${status}`)}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('workOrders.title')}</Typography.Title>
      <Tabs
        defaultActiveKey="active"
        items={[
          {
            key: 'active',
            label: t('workOrders.tabs.active'),
            children: isActiveError ? (
              <Alert type="error" message={t('workOrders.active.loadError')} showIcon />
            ) : (
              <Table<ActiveWorkOrder>
                rowKey="id"
                columns={activeColumns}
                dataSource={activeWorkOrders}
                loading={isActiveLoading}
                locale={{ emptyText: t('workOrders.active.emptyState') }}
                expandable={{
                  rowExpandable: (record) => record.supplementaries.length > 0,
                  expandedRowRender: (record) => (
                    <Table<ActiveWorkOrderSupplementary>
                      rowKey="id"
                      size="small"
                      pagination={false}
                      showHeader={false}
                      columns={activeColumns}
                      dataSource={record.supplementaries}
                    />
                  ),
                }}
              />
            ),
          },
          {
            key: 'manage',
            label: t('workOrders.tabs.manage'),
            children: (
              <>
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
              </>
            ),
          },
        ]}
      />
      <Modal
        title={t('workOrders.detail.title', { jobName: workOrderDetail?.job_name ?? '' })}
        open={detailWorkOrderId !== null}
        onCancel={() => setDetailWorkOrderId(null)}
        footer={[
          <Button key="close" onClick={() => setDetailWorkOrderId(null)}>
            {t('workOrders.detail.closeButton')}
          </Button>,
        ]}
        width={640}
      >
        {isDetailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : isDetailError ? (
          <Alert type="error" message={t('workOrders.detail.loadError')} showIcon />
        ) : (
          <Table
            rowKey="key"
            size="small"
            pagination={false}
            columns={detailColumns}
            dataSource={detailRows}
            locale={{ emptyText: t('workOrders.detail.emptyState') }}
          />
        )}
      </Modal>
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
                  scanErrors.serial_number
                    ? t(scanErrors.serial_number.message ?? '', scanErrorParams)
                    : undefined
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
      <Modal
        title={t('workOrders.return.title', { jobName: returnSession?.job_name ?? '' })}
        open={returnSession !== null}
        onCancel={closeReturnModal}
        width={640}
        footer={[
          <Button key="done" onClick={closeReturnModal}>
            {t('workOrders.return.doneButton')}
          </Button>,
        ]}
      >
        {returnSession && (
          <>
            <Tag style={{ marginBottom: 16 }}>{t(`workOrders.status.${returnSession.status}`)}</Tag>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={returnSession.line_items}
              columns={returnLineItemColumns}
              style={{ marginBottom: 16 }}
            />
            <Form layout="vertical" noValidate onFinish={handleReturnSubmit(onReturnSubmit)}>
              <Form.Item
                label={t('workOrders.return.serialNumberLabel')}
                htmlFor="return-serial_number"
                validateStatus={returnErrors.serial_number ? 'error' : ''}
                help={
                  returnErrors.serial_number
                    ? t(returnErrors.serial_number.message ?? '', returnErrorParams)
                    : undefined
                }
              >
                <Controller
                  name="serial_number"
                  control={returnControl}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="return-serial_number"
                      placeholder={t('workOrders.return.serialNumberPlaceholder')}
                    />
                  )}
                />
              </Form.Item>
              {returnMutation.isError && !returnErrors.serial_number && (
                <Alert
                  type="error"
                  message={t('workOrders.return.genericError')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              <Space>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={returnMutation.isPending && !pendingReturnSubmission?.damaged}
                >
                  {t('workOrders.return.scanButton')}
                </Button>
                <Button
                  danger
                  onClick={handleReturnSubmit(onMarkDamagedSubmit)}
                  loading={returnMutation.isPending && pendingReturnSubmission?.damaged === true}
                >
                  {t('workOrders.return.markDamagedButton')}
                </Button>
              </Space>
            </Form>
          </>
        )}
      </Modal>
    </>
  );
}
