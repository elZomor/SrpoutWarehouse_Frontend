import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  App,
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
import axios from 'axios';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { ItemHistoryModal } from '../components/ItemHistoryModal';
import { itemHistoryRowProps, type ItemHistoryTarget } from '../components/itemHistoryRow';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  getSerializedItemStatusColor,
  isDuplicateSerialError,
  resolveQrDownloadErrorMessageKey,
} from '../features/serialized-items/logic';
import { printSerializedItemLabel } from '../features/serialized-items/printLabel';
import {
  serializedItemSchema,
  type SerializedItemFormValues,
} from '../features/serialized-items/schema';
import type { SerializedItem } from '../features/serialized-items/types';
import {
  useCreateSerializedItem,
  useDeleteSerializedItem,
  useDownloadSerializedItemsQrPdf,
  useSerializedItems,
} from '../features/serialized-items/useSerializedItems';

const SEARCH_DEBOUNCE_MS = 300;

export function SerializedItemsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<number | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // WRH-79/AC-1/AC-5: kept only for the shared history modal's identity
  // header - the modal fetches its own history, and clearing this on close
  // doesn't touch the underlying list/filters state at all.
  const [historyItem, setHistoryItem] = useState<ItemHistoryTarget | null>(null);
  const {
    data: serializedItems,
    isLoading,
    isError: isListError,
  } = useSerializedItems(search, productTypeFilter);
  const createMutation = useCreateSerializedItem();
  const deleteMutation = useDeleteSerializedItem();
  const downloadQrPdfMutation = useDownloadSerializedItemsQrPdf();
  // Populates both the page-level product type filter and the registration
  // form's product type dropdown.
  const { data: productTypes, isError: isProductTypesError } = useProductTypes('');

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SerializedItemFormValues>({
    resolver: zodResolver(serializedItemSchema),
    defaultValues: { serial_number: '', product_type: undefined },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: SerializedItemFormValues) => {
    createMutation.mutate(values, {
      onSuccess: closeModal,
      onError: (error) => {
        if (isDuplicateSerialError(error)) {
          setError('serial_number', {
            type: 'server',
            message: 'serializedItems.form.serialNumberDuplicate',
          });
        }
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => message.success(t('serializedItems.deleteSuccess')),
      onError: () => message.error(t('serializedItems.deleteError')),
    });
  };

  const handleDownloadQrPdf = () => {
    downloadQrPdfMutation.mutate(productTypeFilter, {
      onSuccess: (blob) => {
        // AC-4/AC-5: the same product type filter already on screen scopes
        // the PDF - cleared (undefined) means "All".
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'qr-labels.pdf';
        link.click();
        // Deferred rather than revoked immediately after click(): the
        // browser's actual blob read for the download isn't guaranteed to
        // finish synchronously, and revoking too early can truncate it.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      },
      onError: (error) => {
        const messageKey = resolveQrDownloadErrorMessageKey(error, productTypeFilter !== undefined);
        const isEmptyExport = axios.isAxiosError(error) && error.response?.status === 400;
        if (isEmptyExport) {
          message.warning(t(messageKey));
        } else {
          message.error(t(messageKey));
        }
      },
    });
  };

  const productTypeOptions = (productTypes ?? []).map((productType) => ({
    value: productType.id,
    label: productType.name,
  }));

  const columns = [
    {
      title: t('serializedItems.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('serializedItems.productTypeLabel'),
      dataIndex: 'product_type_name',
      key: 'product_type',
    },
    {
      title: t('serializedItems.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getSerializedItemStatusColor(status)}>
          {t(`serializedItems.status.${status}`)}
        </Tag>
      ),
    },
    {
      title: t('serializedItems.lastWorkOrderLabel'),
      dataIndex: 'last_work_order_reference',
      key: 'last_work_order_reference',
      render: (value: string) => value || t('serializedItems.noWorkOrder'),
    },
    {
      title: t('serializedItems.qrCodeLabel'),
      key: 'qr_code',
      render: (_: unknown, record: SerializedItem) => (
        <Button
          type="link"
          size="small"
          onClick={(event) => {
            // WRH-79: the row itself now opens the history modal on click -
            // without this, the click would bubble up to the row and pop
            // the history modal open behind the print popup too.
            event.stopPropagation();
            printSerializedItemLabel(record, {
              qrAlt: t('serializedItems.qrCodeLabel'),
              loadError: t('serializedItems.printQrLoadError'),
            });
          }}
        >
          {t('serializedItems.printQrButton')}
        </Button>
      ),
    },
    {
      title: t('serializedItems.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: SerializedItem) => (
        <Space onClick={(event) => event.stopPropagation()}>
          <Popconfirm
            title={t('serializedItems.deleteConfirmTitle')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
            okButtonProps={{
              loading: deleteMutation.isPending && deleteMutation.variables === record.id,
            }}
          >
            <Button size="small" danger>
              {t('serializedItems.deleteButton')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('serializedItems.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input.Search
            placeholder={t('serializedItems.searchPlaceholder')}
            allowClear
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            style={{ maxWidth: 320 }}
          />
          <Select
            allowClear
            placeholder={t('serializedItems.filterByProductTypePlaceholder')}
            style={{ minWidth: 220 }}
            options={productTypeOptions}
            value={productTypeFilter}
            onChange={(value: number | undefined) => setProductTypeFilter(value)}
          />
        </div>
        <Space>
          <Button loading={downloadQrPdfMutation.isPending} onClick={handleDownloadQrPdf}>
            {t('serializedItems.downloadQrPdfButton')}
          </Button>
          <Button type="primary" onClick={() => setIsModalOpen(true)}>
            {t('serializedItems.newButton')}
          </Button>
        </Space>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('serializedItems.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<SerializedItem>
          rowKey="id"
          columns={columns}
          dataSource={serializedItems}
          loading={isLoading}
          locale={{ emptyText: t('serializedItems.emptyState') }}
          onRow={(record) =>
            itemHistoryRowProps(
              record,
              (item) => ({
                serial_number: item.serial_number,
                product_type_name: item.product_type_name,
                status: item.status,
              }),
              setHistoryItem,
            )
          }
        />
      )}
      <ItemHistoryModal
        item={historyItem}
        open={historyItem !== null}
        onClose={() => setHistoryItem(null)}
      />
      <Modal
        title={t('serializedItems.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('serializedItems.serialNumberLabel')}
            htmlFor="serialized-item-serial_number"
            validateStatus={errors.serial_number ? 'error' : ''}
            help={errors.serial_number ? t(errors.serial_number.message ?? '') : undefined}
          >
            <Controller
              name="serial_number"
              control={control}
              render={({ field }) => <Input {...field} id="serialized-item-serial_number" />}
            />
          </Form.Item>
          <Form.Item
            label={t('serializedItems.productTypeLabel')}
            htmlFor="serialized-item-product_type"
            validateStatus={errors.product_type ? 'error' : ''}
            help={errors.product_type ? t(errors.product_type.message ?? '') : undefined}
          >
            <Controller
              name="product_type"
              control={control}
              render={({ field }) => (
                <Select
                  {...field}
                  id="serialized-item-product_type"
                  placeholder={t('serializedItems.productTypePlaceholder')}
                  options={productTypeOptions}
                />
              )}
            />
          </Form.Item>
          {isProductTypesError && (
            <Form.Item>
              <Alert type="error" message={t('serializedItems.loadProductTypesError')} showIcon />
            </Form.Item>
          )}
          {createMutation.isError && !errors.serial_number && (
            <Form.Item>
              <Alert type="error" message={t('serializedItems.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
