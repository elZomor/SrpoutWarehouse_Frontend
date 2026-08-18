import { useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Modal, Select, Spin, Table, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ItemHistoryModal } from '../components/ItemHistoryModal';
import { useItemHistoryModal } from '../components/useItemHistoryModal';
import { clickableRowProps } from '../lib/clickableRow';
import { classifyItemRejection, type ItemRejection } from '../features/boxes/logic';
import { boxSchema, type BoxFormValues } from '../features/boxes/schema';
import { printBoxLabel } from '../features/boxes/printLabel';
import type { Box, BoxItem } from '../features/boxes/types';
import { useBox, useBoxes, useCreateBox } from '../features/boxes/useBoxes';
import { useProductTypes } from '../features/product-types/useProductTypes';
import { useSerializedItems } from '../features/serialized-items/useSerializedItems';

export function BoxesPage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // WRH-71/AC-1: the clicked row is kept only for its code (the detail
  // modal's title) - the items list itself comes from useBox's own fresh
  // fetch below, not this stale list row.
  const [detailBox, setDetailBox] = useState<Box | null>(null);
  // Tracks open/closed separately from detailBox itself - closing sets
  // this false immediately (driving the Modal's close animation) but
  // detailBox is only cleared once that animation finishes (afterOpenChange
  // below), so the title/table don't flash blank underneath the still-
  // visible, animating-out modal.
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  // afterOpenChange(false) fires asynchronously once the close animation
  // ends - if the user re-opens a different box before that fires (close
  // row 1, then immediately click row 2), a stale callback from the
  // *earlier* close would otherwise wipe out the newly-set detailBox. A
  // ref (always current, unlike the closure's captured isDetailOpen) lets
  // the callback check whether a reopen has happened in the meantime.
  const isDetailOpenRef = useRef(isDetailOpen);
  isDetailOpenRef.current = isDetailOpen;
  const { data: boxes, isLoading, isError: isListError } = useBoxes();
  const createMutation = useCreateBox();
  const {
    data: boxDetail,
    // isFetching (not isLoading) - useBox's staleTime: 0 means reopening an
    // already-cached box triggers a background refetch that isLoading
    // wouldn't reflect, which would otherwise render the previous,
    // possibly-stale item list for a moment before the fresh one swaps in
    // (AC-5).
    isFetching: isDetailLoading,
    isError: isDetailError,
  } = useBox(detailBox?.id, isDetailOpen);
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');
  // WRH-27/AC-1/AC-2/AC-5: item_ids rejections name a specific item (and,
  // for AC-2, the specific other box) - classifyItemRejection anchors on
  // each rejection's fixed wrapping phrase and interpolates the free-text
  // identifiers into a translated template, the same way WorkOrdersPage
  // interpolates a WO id into classifyScanRejection's messages - never
  // shown as a raw, untranslated server string.
  const [itemRejection, setItemRejection] = useState<ItemRejection | null>(null);
  // WRH-79/AC-1/AC-6: shared history modal target - box items don't carry
  // their own product_type_name (a box is scoped to one product type), so
  // it's filled in from the open box detail's own field.
  const { openHistoryItem, historyModalProps } = useItemHistoryModal();

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
    setItemRejection(null);
    createMutation.reset();
  };

  const onSubmit = (values: BoxFormValues) => {
    setItemRejection(null);
    createMutation.mutate(values, {
      onSuccess: closeModal,
      onError: (error) => {
        setItemRejection(classifyItemRejection(error));
      },
    });
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
          onClick={(event) => {
            // WRH-71: the row itself now opens the detail view on click -
            // without this, the click would bubble up to the row and pop
            // the detail modal open behind the QR print window too.
            event.stopPropagation();
            printBoxLabel(record, {
              qrAlt: t('boxes.qrCodeLabel'),
              loadError: t('boxes.printQrLoadError'),
            });
          }}
        >
          {t('boxes.printQrButton')}
        </Button>
      ),
    },
  ];

  const detailColumns = [
    {
      title: t('boxes.detail.serialNumberHeader'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('boxes.detail.statusHeader'),
      key: 'status',
      render: (_: unknown, record: BoxItem) => t(`serializedItems.status.${record.status}`),
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
          onRow={(record) =>
            clickableRowProps(
              record,
              (box) => box,
              (box) => {
                setDetailBox(box);
                setIsDetailOpen(true);
              },
            )
          }
        />
      )}
      <Modal
        title={t('boxes.detail.title', { code: detailBox?.code ?? '' })}
        open={isDetailOpen}
        onCancel={() => setIsDetailOpen(false)}
        // Clears the underlying record only once the close animation has
        // actually finished, not on click - otherwise the title/table
        // flash blank underneath the still-visible, animating-out modal.
        afterOpenChange={(open) => {
          if (!open && !isDetailOpenRef.current) {
            setDetailBox(null);
          }
        }}
        footer={[
          <Button key="close" onClick={() => setIsDetailOpen(false)}>
            {t('boxes.detail.closeButton')}
          </Button>,
        ]}
        width={640}
      >
        {isDetailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : isDetailError ? (
          <Alert type="error" message={t('boxes.detail.loadError')} showIcon />
        ) : (
          <Table<BoxItem>
            rowKey="id"
            size="small"
            pagination={false}
            scroll={{ y: 320 }}
            columns={detailColumns}
            dataSource={boxDetail?.items}
            locale={{ emptyText: t('boxes.detail.emptyState') }}
            onRow={(record) =>
              clickableRowProps(
                record,
                (item) => ({
                  serial_number: item.serial_number,
                  product_type_name: boxDetail?.product_type_name ?? '',
                  status: item.status,
                }),
                openHistoryItem,
              )
            }
          />
        )}
      </Modal>
      <ItemHistoryModal {...historyModalProps} />
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
              <Alert
                type="error"
                message={
                  itemRejection
                    ? t(itemRejection.messageKey, itemRejection.params)
                    : t('boxes.createError')
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
