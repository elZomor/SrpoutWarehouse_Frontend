import { MinusCircleOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Divider,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState, type Key } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  classifyReturnRejection,
  classifyScanRejection,
  classifyTransferRejection,
  flattenWorkOrderDetailRows,
  isFullyScanned as computeIsFullyScanned,
  isPackingListEligible,
  isReturnEligible,
  isTerminalWorkOrder,
  scannableLineItemOptions as computeScannableLineItemOptions,
  stillOutCount,
} from '../features/work-orders/logic';
import {
  returnBoxSchema,
  returnItemSchema,
  scanBoxSchema,
  scanItemSchema,
  transferItemSchema,
  workOrderSchema,
  type ReturnBoxFormValues,
  type ReturnItemFormValues,
  type ScanBoxFormValues,
  type ScanItemFormValues,
  type TransferItemFormValues,
  type WorkOrderFormValues,
} from '../features/work-orders/schema';
import type {
  ActiveWorkOrderLineItem,
  BoxScanSummary,
  WorkOrder,
  WorkOrderReturnResult,
  WorkOrderStatus,
  WorkOrderTransferResult,
} from '../features/work-orders/types';
import {
  useActiveWorkOrders,
  useCloseWorkOrder,
  useCompleteWorkOrder,
  useCreateWorkOrder,
  useDownloadWorkOrderPackingList,
  useInvalidateActiveWorkOrders,
  useInvalidateWorkOrders,
  useReturnWorkOrderBox,
  useReturnWorkOrderItem,
  useScanWorkOrderBox,
  useScanWorkOrderItem,
  useStartWorkOrder,
  useTransferWorkOrderItem,
  useWorkOrderDetail,
  useWorkOrders,
} from '../features/work-orders/useWorkOrders';
import { getFieldErrorMessages } from '../lib/apiErrors';
import { colors } from '../theme/tokens';

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
// WRH-75/AC-6: the merged screen's status-column filter options - every
// status this model can carry, matching WorkOrderStatus's own union.
const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'draft',
  'in_progress',
  'fulfilled',
  'partially_returned',
  'returned',
  'closed',
];
// WRH-26/AC-2: scan-box/return-box's box_code rejections are fixed
// constants (no interpolated free text like the per-serial patterns
// classifyScanRejection/classifyReturnRejection handle), so exact equality
// is enough - no anchoring needed.
const BOX_NOT_FOUND_MESSAGE = 'Box not found';
const BOX_NO_LINE_ITEM_MESSAGE = "This work order has no line item for the box's product type.";
const BOX_AMBIGUOUS_LINE_ITEM_MESSAGE =
  "This work order has more than one line item for the box's product type - scan its items individually instead.";

export function WorkOrdersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  // WRH-75: the Active/Managing tabs are gone - every WO lives in one
  // table, so only one row's kebab menu can be open at a time.
  const [openMenuRowId, setOpenMenuRowId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // WRH-53/AC-1/AC-2: set when the create modal was opened via a Primary
  // row's "Add Supplementary" action rather than the Manage tab's plain
  // "New WO" button - holds just enough of that Primary to merge
  // parent_work_order into the submitted payload and to name it in the
  // modal title, without needing a separate parent-picker field (the row
  // the user clicked already *is* the parent selection - see TC-01).
  const [supplementaryParent, setSupplementaryParent] = useState<{
    id: number;
    reference: string;
  } | null>(null);
  const [fulfillingWorkOrderId, setFulfillingWorkOrderId] = useState<number | null>(null);
  const { data: workOrders, isLoading, isError: isListError } = useWorkOrders();
  const createMutation = useCreateWorkOrder();
  const startMutation = useStartWorkOrder();
  const scanMutation = useScanWorkOrderItem(fulfillingWorkOrderId ?? 0);
  const scanBoxMutation = useScanWorkOrderBox(fulfillingWorkOrderId ?? 0);
  const completeMutation = useCompleteWorkOrder();
  const closeMutation = useCloseWorkOrder();
  const downloadPackingListMutation = useDownloadWorkOrderPackingList();
  const invalidateActiveWorkOrders = useInvalidateActiveWorkOrders();
  const invalidateWorkOrders = useInvalidateWorkOrders();
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

  // WRH-75: the merged screen's single table is driven by useWorkOrders()
  // (every WO, every status, flat - the old Manage tab's source), since
  // useActiveWorkOrders() only ever returns non-terminal Primaries (nested
  // supplementaries, excluded once terminal - see its own comment) and
  // can't stand in as "all WOs". Its richer per-line-item returned/damaged/
  // still-out counts are still the only source for the Return/Transfer/
  // Close actions though, so they're indexed here by id (flattening
  // Primary + supplementaries into one map) and looked up by the row's id
  // when one of those actions opens. Every status that gates those actions
  // (isReturnEligible) is by construction non-terminal, so it's always
  // present in this map - a miss only happens for terminal rows, which
  // never read from it.
  const activeLineItemsById = new Map<number, ActiveWorkOrderLineItem[]>();
  const primaryWorkOrderIds = new Set<number>();
  for (const primary of activeWorkOrders ?? []) {
    activeLineItemsById.set(primary.id, primary.line_items);
    primaryWorkOrderIds.add(primary.id);
    for (const supplementary of primary.supplementaries) {
      activeLineItemsById.set(supplementary.id, supplementary.line_items);
    }
  }

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

  // WRH-26/AC-2/AC-3: scanning a Box's code expands to every item inside in
  // one call - boxScanSummary holds the last call's per-item results so the
  // "Box BX-001 expanded: N items added" summary (and any rejected items)
  // stays visible until the next box scan or the modal closes, mirroring
  // fulfillingWorkOrder's "derived from the latest response" approach
  // rather than a one-off toast.
  const [boxScanSummary, setBoxScanSummary] = useState<BoxScanSummary | null>(null);
  const {
    control: scanBoxControl,
    handleSubmit: handleScanBoxSubmit,
    reset: resetScanBoxForm,
    setError: setScanBoxError,
    setFocus: setScanBoxFocus,
    formState: { errors: scanBoxErrors },
  } = useForm<ScanBoxFormValues>({
    resolver: zodResolver(scanBoxSchema),
    defaultValues: { box_code: '' },
  });

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
  const returnBoxMutation = useReturnWorkOrderBox(returnSession?.id ?? 0);
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

  // WRH-26/AC-2/AC-3: return-context counterpart to boxScanSummary above.
  const [boxReturnSummary, setBoxReturnSummary] = useState<BoxScanSummary | null>(null);
  const {
    control: returnBoxControl,
    handleSubmit: handleReturnBoxSubmit,
    reset: resetReturnBoxForm,
    setError: setReturnBoxError,
    setFocus: setReturnBoxFocus,
    formState: { errors: returnBoxErrors },
  } = useForm<ReturnBoxFormValues>({
    resolver: zodResolver(returnBoxSchema),
    defaultValues: { box_code: '' },
  });
  // Mirrors pendingReturnSubmission's identical stale-response-guarding
  // reasoning (returnSession is local state, not derived from a query
  // cache) - a box-return response can land after the session's moved on
  // just as easily as a single-item return's can. Wrapped in an object
  // (not a bare string) for the same reason pendingReturnSubmission is a
  // form-values object rather than just a serial number: a retry with the
  // *same* box code (a barcode scanner re-feeding it, or a user retrying
  // after a transient error without changing the input) must still get a
  // fresh reference, or React bails out of the state update as a no-op and
  // the effect below never re-runs.
  const [pendingReturnBoxSubmission, setPendingReturnBoxSubmission] = useState<{
    box_code: string;
  } | null>(null);

  // WRH-36/AC-1: transferSourceWorkOrder just needs enough of the clicked
  // row to drive the modal's title/destination-exclusion - unlike
  // returnSession, nothing about the source WO ever changes as a result of
  // a transfer (see the backend's transfer() comment), so this is set once
  // on open and never overwritten by a response.
  const [transferSourceWorkOrder, setTransferSourceWorkOrder] = useState<{
    id: number;
    reference: string;
  } | null>(null);
  // Same "ignore a response that no longer belongs to the open session"
  // hazard class as returnSessionGenerationRef - a transfer response can
  // still land after the modal's been closed or reopened against a
  // different source WO.
  const transferSessionGenerationRef = useRef(0);
  const transferMutation = useTransferWorkOrderItem(transferSourceWorkOrder?.id ?? 0);
  const {
    control: transferControl,
    handleSubmit: handleTransferSubmit,
    reset: resetTransferForm,
    resetField: resetTransferField,
    setError: setTransferError,
    setFocus: setTransferFocus,
    formState: { errors: transferErrors },
  } = useForm<TransferItemFormValues>({
    resolver: zodResolver(transferItemSchema),
    defaultValues: {
      serial_number: '',
      destination_work_order: undefined,
      destination_line_item: undefined,
    },
  });
  // WRH-68: drives transferDestinationLineItemOptions below - the picked
  // destination WO determines which of its line items can be selected.
  const watchedTransferDestinationWorkOrder = useWatch({
    control: transferControl,
    name: 'destination_work_order',
  });
  const [transferErrorParams, setTransferErrorParams] = useState<{ workOrderId?: string }>({});
  const [pendingTransferSubmission, setPendingTransferSubmission] =
    useState<TransferItemFormValues | null>(null);
  const [lastTransferResult, setLastTransferResult] = useState<WorkOrderTransferResult | null>(
    null,
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setSupplementaryParent(null);
    reset();
    createMutation.reset();
  };

  const openCreateModal = () => {
    setSupplementaryParent(null);
    setIsModalOpen(true);
  };

  // WRH-53/AC-1/AC-2: entry point for creating a supplementary - clicking
  // this on a Primary row both opens the (otherwise identical) create modal
  // and records which Primary it's linked to.
  const openSupplementaryModal = (primary: WorkOrder) => {
    setSupplementaryParent({ id: primary.id, reference: primary.reference });
    setIsModalOpen(true);
  };

  // WRH-35/AC-2: called from either a Primary or a supplementary row - the
  // backend resolves a supplementary's request to its Primary's
  // consolidated document, so this fires the same mutation either way.
  // Mirrors SerializedItemsPage's handleDownloadQrPdf blob-download pattern.
  const handleDownloadPackingList = (record: WorkOrder) => {
    downloadPackingListMutation.mutate(record.id, {
      onSuccess: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `packing-list-${record.reference}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      onError: () => message.error(t('workOrders.active.downloadPackingListError')),
    });
  };

  const onSubmit = (values: WorkOrderFormValues) => {
    const payload = supplementaryParent
      ? { ...values, parent_work_order: supplementaryParent.id }
      : values;
    createMutation.mutate(payload, { onSuccess: closeModal });
  };

  const openFulfillmentModal = (workOrder: WorkOrder) => {
    setFulfillingWorkOrderId(workOrder.id);
    resetScanForm({ line_item: undefined, serial_number: '' });
    setScanErrorParams({});
    scanMutation.reset();
    completeMutation.reset();
    resetScanBoxForm({ box_code: '' });
    setBoxScanSummary(null);
    scanBoxMutation.reset();
  };

  const closeFulfillmentModal = () => {
    // Any scans made during this session only patched workOrdersBaseKey
    // (see useScanWorkOrderItem's comment) - catch the active-work-orders
    // lookup up now that the session's over, rather than on every single
    // scan.
    if (fulfillingWorkOrderId !== null) {
      invalidateActiveWorkOrders(fulfillingWorkOrderId);
    }
    setFulfillingWorkOrderId(null);
    resetScanForm();
    setScanErrorParams({});
    scanMutation.reset();
    completeMutation.reset();
    resetScanBoxForm();
    setBoxScanSummary(null);
    scanBoxMutation.reset();
  };

  const onScanBoxSubmit = (values: ScanBoxFormValues) => {
    scanBoxMutation.mutate(values.box_code, {
      onSuccess: (response) => {
        setBoxScanSummary(response.box_summary);
        resetScanBoxForm({ box_code: '' });
        setScanBoxFocus('box_code');
      },
      onError: (error) => {
        setBoxScanSummary(null);
        const boxCodeErrors = getFieldErrorMessages(error, 'box_code');
        if (boxCodeErrors.some((message) => message === BOX_NOT_FOUND_MESSAGE)) {
          setScanBoxError('box_code', {
            type: 'server',
            message: 'workOrders.scan.boxCodeNotFoundError',
          });
          return;
        }
        if (boxCodeErrors.some((message) => message === BOX_NO_LINE_ITEM_MESSAGE)) {
          setScanBoxError('box_code', {
            type: 'server',
            message: 'workOrders.scan.boxCodeNoLineItemError',
          });
          return;
        }
        if (boxCodeErrors.some((message) => message === BOX_AMBIGUOUS_LINE_ITEM_MESSAGE)) {
          setScanBoxError('box_code', {
            type: 'server',
            message: 'workOrders.scan.boxCodeAmbiguousError',
          });
          return;
        }
        if (boxCodeErrors.length > 0) {
          setScanBoxError('box_code', {
            type: 'server',
            message: 'workOrders.scan.boxScanGenericError',
          });
        }
      },
    });
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

        const rejection = classifyScanRejection(serialErrors, lineItemErrors);
        if (rejection) {
          setScanErrorParams(rejection.params ?? {});
          setScanError(rejection.field, { type: 'server', message: rejection.messageKey });
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

  const openReturnModal = (workOrder: WorkOrder) => {
    // Starting a new session (even re-opening the same WO) invalidates
    // any earlier in-flight submission - see returnSessionGenerationRef's
    // comment.
    returnSessionGenerationRef.current += 1;
    setReturnSession({
      id: workOrder.id,
      job_name: workOrder.job_name,
      status: workOrder.status,
      // WRH-75: WorkOrder's own line_items track scanned/remaining, not
      // returned/damaged/still-out - the richer shape only lives in the
      // active-work-orders lookup (see activeLineItemsById's comment).
      // isReturnEligible only opens this from a non-terminal row, which is
      // always present there.
      line_items: activeLineItemsById.get(workOrder.id) ?? [],
    });
    resetReturnForm({ serial_number: '' });
    setReturnErrorParams({});
    returnMutation.reset();
    resetReturnBoxForm({ box_code: '' });
    setBoxReturnSummary(null);
    returnBoxMutation.reset();
  };

  const closeReturnModal = () => {
    // Mirrors closeFulfillmentModal's end-of-session invalidation - every
    // return_item call during this session only updated local state (see
    // returnSession's comment), so the Active tab's cache needs to catch up
    // now rather than on every single scan.
    returnSessionGenerationRef.current += 1;
    if (returnSession !== null) {
      invalidateWorkOrders(returnSession.id);
    }
    setReturnSession(null);
    resetReturnForm();
    setReturnErrorParams({});
    returnMutation.reset();
    resetReturnBoxForm();
    setBoxReturnSummary(null);
    returnBoxMutation.reset();
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

        const rejection = classifyReturnRejection(serialErrors, statusErrors);
        if (rejection) {
          setReturnErrorParams(rejection.params ?? {});
          setReturnError('serial_number', { type: 'server', message: rejection.messageKey });
        }
      },
    );

    return () => {
      ignore = true;
    };
  }, [pendingReturnSubmission]);

  const onReturnBoxSubmit = (values: ReturnBoxFormValues) => {
    setPendingReturnBoxSubmission({ box_code: values.box_code });
  };

  // Box-return counterpart to the pendingReturnSubmission effect above -
  // same stale-response guarding (returnSession is local state a late
  // response could otherwise overwrite or reopen), same reason
  // returnMutation/resetReturnBoxForm/setReturnBoxError/setReturnBoxFocus
  // are excluded from the dependency array.
  useEffect(() => {
    if (pendingReturnBoxSubmission === null) {
      return;
    }
    const boxCode = pendingReturnBoxSubmission.box_code;
    const generation = returnSessionGenerationRef.current;
    let ignore = false;

    returnBoxMutation.mutateAsync(boxCode).then(
      (response) => {
        if (ignore || returnSessionGenerationRef.current !== generation) {
          return;
        }
        setReturnSession(response.work_order);
        setBoxReturnSummary(response.box_summary);
        resetReturnBoxForm({ box_code: '' });
        setReturnBoxFocus('box_code');
      },
      (error) => {
        if (ignore || returnSessionGenerationRef.current !== generation) {
          return;
        }
        setBoxReturnSummary(null);
        const boxCodeErrors = getFieldErrorMessages(error, 'box_code');
        if (boxCodeErrors.some((message) => message === BOX_NOT_FOUND_MESSAGE)) {
          setReturnBoxError('box_code', {
            type: 'server',
            message: 'workOrders.return.boxCodeNotFoundError',
          });
          return;
        }
        if (boxCodeErrors.length > 0) {
          setReturnBoxError('box_code', {
            type: 'server',
            message: 'workOrders.return.boxReturnGenericError',
          });
        }
      },
    );

    return () => {
      ignore = true;
    };
  }, [pendingReturnBoxSubmission]);

  // WRH-36/AC-1/AC-2: entry point for transferring an item off this
  // (source) WO - mirrors openReturnModal's session-start bookkeeping.
  const openTransferModal = (workOrder: WorkOrder) => {
    transferSessionGenerationRef.current += 1;
    setTransferSourceWorkOrder({ id: workOrder.id, reference: workOrder.reference });
    resetTransferForm({
      serial_number: '',
      destination_work_order: undefined,
      destination_line_item: undefined,
    });
    setTransferErrorParams({});
    setLastTransferResult(null);
    transferMutation.reset();
  };

  const closeTransferModal = () => {
    transferSessionGenerationRef.current += 1;
    setTransferSourceWorkOrder(null);
    resetTransferForm();
    setTransferErrorParams({});
    setLastTransferResult(null);
    transferMutation.reset();
  };

  const onTransferSubmit = (values: TransferItemFormValues) => {
    setPendingTransferSubmission(values);
  };

  // Mirrors the pendingReturnSubmission effect's stale-response guarding -
  // see transferSourceWorkOrder's comment for why a plain mutate() call
  // inside onTransferSubmit isn't enough on its own.
  useEffect(() => {
    if (!pendingTransferSubmission) {
      return;
    }
    const values = pendingTransferSubmission;
    const generation = transferSessionGenerationRef.current;
    let ignore = false;

    transferMutation.mutateAsync(values).then(
      (result) => {
        if (ignore || transferSessionGenerationRef.current !== generation) {
          return;
        }
        setLastTransferResult(result);
        resetTransferForm({
          serial_number: '',
          destination_work_order: undefined,
          destination_line_item: undefined,
        });
        setTransferErrorParams({});
        setTransferFocus('serial_number');
      },
      (error) => {
        if (ignore || transferSessionGenerationRef.current !== generation) {
          return;
        }
        const serialErrors = getFieldErrorMessages(error, 'serial_number');
        const statusErrors = getFieldErrorMessages(error, 'status');
        const destinationErrors = getFieldErrorMessages(error, 'destination_work_order');
        const destinationLineItemErrors = getFieldErrorMessages(error, 'destination_line_item');
        setTransferErrorParams({});

        const rejection = classifyTransferRejection(
          serialErrors,
          statusErrors,
          destinationErrors,
          destinationLineItemErrors,
        );
        if (rejection) {
          setTransferErrorParams(rejection.params ?? {});
          setTransferError(rejection.field, { type: 'server', message: rejection.messageKey });
        }
      },
    );

    return () => {
      ignore = true;
    };
  }, [pendingTransferSubmission]);

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

  const scannableLineItemOptions = computeScannableLineItemOptions(
    fulfillingWorkOrder?.line_items ?? [],
  );
  const isFullyScanned = computeIsFullyScanned(fulfillingWorkOrder?.line_items ?? []);

  // WRH-36/AC-2: any WO (Primary or Supplementary) is a valid destination
  // except the source itself - `workOrders` (the Manage tab's flat list,
  // already fetched regardless of which tab is active) is the only query
  // that returns every WO by id/reference in one flat shape.
  const transferDestinationOptions = (workOrders ?? [])
    .filter((workOrder) => workOrder.id !== transferSourceWorkOrder?.id)
    .map((workOrder) => ({
      value: workOrder.id,
      label: `${workOrder.reference} — ${workOrder.job_name}`,
    }));

  // WRH-68: the backend now needs a destination line item chosen (product
  // type + quantity cap checked server-side, matching scan()'s cap guard),
  // so options are the selected destination WO's own line items with
  // remaining capacity - same computeScannableLineItemOptions helper the
  // scan modal uses for the identical "remaining_quantity > 0" filter.
  const transferDestinationWorkOrder = (workOrders ?? []).find(
    (workOrder) => workOrder.id === watchedTransferDestinationWorkOrder,
  );
  const transferDestinationLineItemOptions = computeScannableLineItemOptions(
    transferDestinationWorkOrder?.line_items ?? [],
  );

  // WRH-75: single table for every WO (all statuses) - all five column
  // definitions below read straight off WorkOrder's own flat fields.
  const columns = [
    {
      // WRH-53/AC-1/AC-2: "WO-0042"/"WO-0042-S1" - server-computed, see
      // WorkOrder.reference's own comment.
      title: t('workOrders.referenceLabel'),
      dataIndex: 'reference',
      key: 'reference',
    },
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
      // WRH-75/AC-3/AC-6: status stays its own column (badge) so a row's
      // active/terminal state reads at a glance even with every status now
      // sharing one list, plus a built-in column filter narrowing to one
      // status at a time (replaces the old Active-tab-as-a-filter).
      title: t('workOrders.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      filters: WORK_ORDER_STATUSES.map((status) => ({
        text: t(`workOrders.status.${status}`),
        value: status,
      })),
      onFilter: (value: boolean | Key, record: WorkOrder) => record.status === value,
      render: (status: string) => <Tag>{t(`workOrders.status.${status}`)}</Tag>,
    },
    {
      // WRH-75/AC-7/AC-8/AC-9: every row action from the old Active +
      // Manage tabs, consolidated into one kebab menu per row - only the
      // actions valid for that row's own status are ever rendered (nothing
      // disabled/dead), and the Dropdown's `open` is controlled here so
      // exactly one row's menu is open at a time and it closes on
      // selection or an outside click.
      title: t('workOrders.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: WorkOrder) => {
        const closeMenu = () => setOpenMenuRowId(null);
        const stillOut = stillOutCount(activeLineItemsById.get(record.id) ?? []);

        return (
          <Dropdown
            trigger={['click']}
            open={openMenuRowId === record.id}
            onOpenChange={(nextOpen) => setOpenMenuRowId(nextOpen ? record.id : null)}
            popupRender={() => (
              <Menu>
                {record.status === 'draft' && (
                  <Menu.Item
                    key="start"
                    disabled={startMutation.isPending && startMutation.variables === record.id}
                    onClick={() => {
                      closeMenu();
                      startMutation.mutate(record.id, {
                        onError: () => message.error(t('workOrders.startError')),
                      });
                    }}
                  >
                    {t('workOrders.startButton')}
                  </Menu.Item>
                )}
                {record.status === 'in_progress' && (
                  <Menu.Item
                    key="scan"
                    onClick={() => {
                      closeMenu();
                      openFulfillmentModal(record);
                    }}
                  >
                    {t('workOrders.scanButton')}
                  </Menu.Item>
                )}
                <Menu.Item
                  key="view-details"
                  onClick={() => {
                    closeMenu();
                    setDetailWorkOrderId(record.id);
                  }}
                >
                  {t('workOrders.active.viewDetailsButton')}
                </Menu.Item>
                {/* WRH-53/AC-1/AC-2: only a Primary can be a supplementary's
                    parent (see the backend's parent_work_order queryset
                    restriction) - primaryWorkOrderIds is the active-work-
                    orders top-level id set (see its own comment). WRH-69: a
                    terminal Primary is excluded here since it's read-only,
                    same reasoning as isReturnEligible already gating
                    Return/Transfer/Close below. */}
                {primaryWorkOrderIds.has(record.id) && !isTerminalWorkOrder(record.status) && (
                  <Menu.Item
                    key="add-supplementary"
                    onClick={() => {
                      closeMenu();
                      openSupplementaryModal(record);
                    }}
                  >
                    {t('workOrders.active.addSupplementaryButton')}
                  </Menu.Item>
                )}
                {isPackingListEligible(record) && (
                  <Menu.Item
                    key="download-packing-list"
                    disabled={
                      downloadPackingListMutation.isPending &&
                      downloadPackingListMutation.variables === record.id
                    }
                    onClick={() => {
                      closeMenu();
                      handleDownloadPackingList(record);
                    }}
                  >
                    {t('workOrders.active.downloadPackingListButton')}
                  </Menu.Item>
                )}
                {isReturnEligible(record.status) && (
                  <Menu.Item
                    key="return"
                    onClick={() => {
                      closeMenu();
                      openReturnModal(record);
                    }}
                  >
                    {t('workOrders.return.button')}
                  </Menu.Item>
                )}
                {isReturnEligible(record.status) && (
                  <Menu.Item
                    key="transfer"
                    onClick={() => {
                      closeMenu();
                      openTransferModal(record);
                    }}
                  >
                    {t('workOrders.transfer.button')}
                  </Menu.Item>
                )}
                {/* WRH-40/AC-1/AC-4: Popconfirm owns this item's click - it
                    deliberately has no onClick of its own, so the Dropdown
                    (fully controlled above) stays open until the Popconfirm
                    itself confirms/cancels, rather than closing on the
                    first click the way every other item above does. */}
                {isReturnEligible(record.status) && (
                  <Menu.Item key="close" danger>
                    <Popconfirm
                      title={
                        stillOut > 0
                          ? t('workOrders.close.warning', { count: stillOut })
                          : t('workOrders.close.confirmTitle')
                      }
                      onConfirm={() => {
                        closeMenu();
                        closeMutation.mutate(record.id, {
                          onError: () => message.error(t('workOrders.close.error')),
                        });
                      }}
                      onCancel={closeMenu}
                      okText={t('common.ok')}
                      cancelText={t('common.cancel')}
                      okButtonProps={{
                        loading: closeMutation.isPending && closeMutation.variables === record.id,
                      }}
                    >
                      <span>{t('workOrders.close.button')}</span>
                    </Popconfirm>
                  </Menu.Item>
                )}
              </Menu>
            )}
          >
            <Button
              size="small"
              icon={<MoreOutlined />}
              aria-label={t('workOrders.actionsLabel')}
            />
          </Dropdown>
        );
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

  const detailRows = flattenWorkOrderDetailRows(workOrderDetail?.line_items ?? []);

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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={openCreateModal}>
          {t('workOrders.newButton')}
        </Button>
      </div>
      {isListError || isActiveError ? (
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
          loading={isLoading || isActiveLoading}
          locale={{ emptyText: t('workOrders.emptyState') }}
          // WRH-69: a terminal WO (returned/closed) reads as done/read-only
          // rather than another actionable row - grayed out via tokens.ts,
          // not a hardcoded hex.
          onRow={(record) =>
            isTerminalWorkOrder(record.status)
              ? {
                  style: {
                    backgroundColor: colors.surfaceMuted,
                    color: colors.textMuted,
                  },
                }
              : {}
          }
        />
      )}
      <Modal
        title={t('workOrders.detail.title', {
          reference: workOrderDetail?.reference ?? '',
          jobName: workOrderDetail?.job_name ?? '',
        })}
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
        title={
          supplementaryParent
            ? t('workOrders.form.supplementaryTitle', { reference: supplementaryParent.reference })
            : t('workOrders.newButton')
        }
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
            <Divider />
            <Form layout="vertical" noValidate onFinish={handleScanBoxSubmit(onScanBoxSubmit)}>
              <Form.Item
                label={t('workOrders.scan.boxCodeLabel')}
                htmlFor="scan-box_code"
                validateStatus={scanBoxErrors.box_code ? 'error' : ''}
                help={scanBoxErrors.box_code ? t(scanBoxErrors.box_code.message ?? '') : undefined}
              >
                <Controller
                  name="box_code"
                  control={scanBoxControl}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="scan-box_code"
                      placeholder={t('workOrders.scan.boxCodePlaceholder')}
                    />
                  )}
                />
              </Form.Item>
              {scanBoxMutation.isError && !scanBoxErrors.box_code && (
                <Alert
                  type="error"
                  message={t('workOrders.scan.boxScanGenericError')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              <Button htmlType="submit" loading={scanBoxMutation.isPending}>
                {t('workOrders.scan.scanBoxButton')}
              </Button>
              {boxScanSummary && (
                <Alert
                  style={{ marginTop: 16 }}
                  type={
                    boxScanSummary.added === boxScanSummary.results.length ? 'success' : 'warning'
                  }
                  showIcon
                  message={t(
                    boxScanSummary.added < boxScanSummary.results.length
                      ? 'workOrders.scan.boxSummaryMessageFlagged'
                      : 'workOrders.scan.boxSummaryMessage',
                    {
                      code: boxScanSummary.code,
                      count: boxScanSummary.added,
                      flaggedCount: boxScanSummary.results.length - boxScanSummary.added,
                    },
                  )}
                  description={
                    boxScanSummary.results.some((result) => !result.added) ? (
                      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                        {boxScanSummary.results
                          .filter((result) => !result.added)
                          .map((result) => (
                            <li key={result.serial_number}>
                              {result.serial_number}: {result.reason}
                            </li>
                          ))}
                      </ul>
                    ) : undefined
                  }
                />
              )}
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
            <Divider />
            <Form layout="vertical" noValidate onFinish={handleReturnBoxSubmit(onReturnBoxSubmit)}>
              <Form.Item
                label={t('workOrders.return.boxCodeLabel')}
                htmlFor="return-box_code"
                validateStatus={returnBoxErrors.box_code ? 'error' : ''}
                help={
                  returnBoxErrors.box_code ? t(returnBoxErrors.box_code.message ?? '') : undefined
                }
              >
                <Controller
                  name="box_code"
                  control={returnBoxControl}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="return-box_code"
                      placeholder={t('workOrders.return.boxCodePlaceholder')}
                    />
                  )}
                />
              </Form.Item>
              {returnBoxMutation.isError && !returnBoxErrors.box_code && (
                <Alert
                  type="error"
                  message={t('workOrders.return.boxReturnGenericError')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
              <Button htmlType="submit" loading={returnBoxMutation.isPending}>
                {t('workOrders.return.returnBoxButton')}
              </Button>
              {boxReturnSummary && (
                <Alert
                  style={{ marginTop: 16 }}
                  type={
                    boxReturnSummary.added === boxReturnSummary.results.length
                      ? 'success'
                      : 'warning'
                  }
                  showIcon
                  message={t(
                    boxReturnSummary.added < boxReturnSummary.results.length
                      ? 'workOrders.return.boxSummaryMessageFlagged'
                      : 'workOrders.return.boxSummaryMessage',
                    {
                      code: boxReturnSummary.code,
                      count: boxReturnSummary.added,
                      flaggedCount: boxReturnSummary.results.length - boxReturnSummary.added,
                    },
                  )}
                  description={
                    boxReturnSummary.results.some((result) => !result.added) ? (
                      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                        {boxReturnSummary.results
                          .filter((result) => !result.added)
                          .map((result) => (
                            <li key={result.serial_number}>
                              {result.serial_number}: {result.reason}
                            </li>
                          ))}
                      </ul>
                    ) : undefined
                  }
                />
              )}
            </Form>
          </>
        )}
      </Modal>
      <Modal
        title={t('workOrders.transfer.title', {
          reference: transferSourceWorkOrder?.reference ?? '',
        })}
        open={transferSourceWorkOrder !== null}
        onCancel={closeTransferModal}
        footer={[
          <Button key="done" onClick={closeTransferModal}>
            {t('workOrders.transfer.doneButton')}
          </Button>,
        ]}
      >
        {transferSourceWorkOrder && (
          <Form layout="vertical" noValidate onFinish={handleTransferSubmit(onTransferSubmit)}>
            <Form.Item
              label={t('workOrders.transfer.serialNumberLabel')}
              htmlFor="transfer-serial_number"
              validateStatus={transferErrors.serial_number ? 'error' : ''}
              help={
                transferErrors.serial_number
                  ? t(transferErrors.serial_number.message ?? '', transferErrorParams)
                  : undefined
              }
            >
              <Controller
                name="serial_number"
                control={transferControl}
                render={({ field }) => (
                  <Input
                    {...field}
                    id="transfer-serial_number"
                    placeholder={t('workOrders.transfer.serialNumberPlaceholder')}
                  />
                )}
              />
            </Form.Item>
            <Form.Item
              label={t('workOrders.transfer.destinationLabel')}
              htmlFor="transfer-destination_work_order"
              validateStatus={transferErrors.destination_work_order ? 'error' : ''}
              help={
                transferErrors.destination_work_order
                  ? t(transferErrors.destination_work_order.message ?? '')
                  : undefined
              }
            >
              <Controller
                name="destination_work_order"
                control={transferControl}
                render={({ field }) => (
                  <Select
                    {...field}
                    id="transfer-destination_work_order"
                    placeholder={t('workOrders.transfer.destinationPlaceholder')}
                    options={transferDestinationOptions}
                    onChange={(value: number) => {
                      field.onChange(value);
                      // WRH-68: the previously-selected line item may not
                      // even exist on the newly-picked destination WO -
                      // clear it rather than leave a stale/invalid value.
                      resetTransferField('destination_line_item');
                    }}
                  />
                )}
              />
            </Form.Item>
            <Form.Item
              label={t('workOrders.transfer.destinationLineItemLabel')}
              htmlFor="transfer-destination_line_item"
              validateStatus={transferErrors.destination_line_item ? 'error' : ''}
              help={
                transferErrors.destination_line_item
                  ? t(transferErrors.destination_line_item.message ?? '')
                  : undefined
              }
            >
              <Controller
                name="destination_line_item"
                control={transferControl}
                render={({ field }) => (
                  <Select
                    {...field}
                    id="transfer-destination_line_item"
                    placeholder={t('workOrders.transfer.destinationLineItemPlaceholder')}
                    options={transferDestinationLineItemOptions}
                    disabled={!watchedTransferDestinationWorkOrder}
                  />
                )}
              />
            </Form.Item>
            {transferMutation.isError &&
              !transferErrors.serial_number &&
              !transferErrors.destination_work_order &&
              !transferErrors.destination_line_item && (
                <Alert
                  type="error"
                  message={t('workOrders.transfer.genericError')}
                  showIcon
                  style={{ marginBottom: 16 }}
                />
              )}
            {lastTransferResult && (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
                message={t('workOrders.transfer.successMessage', {
                  serialNumber: lastTransferResult.serial_number,
                  destination: lastTransferResult.destination_work_order,
                })}
              />
            )}
            <Button type="primary" htmlType="submit" loading={transferMutation.isPending}>
              {t('workOrders.transfer.submitButton')}
            </Button>
          </Form>
        )}
      </Modal>
    </>
  );
}
