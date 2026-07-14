import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Modal, Select, Table, Tag, Typography } from 'antd';
import axios from 'axios';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useProductTypes } from '../features/product-types/useProductTypes';
import {
  serializedItemSchema,
  type SerializedItemFormValues,
} from '../features/serialized-items/schema';
import type { SerializedItem } from '../features/serialized-items/types';
import { getSerializedItemQrCodeUrl } from '../features/serialized-items/api';
import {
  useCreateSerializedItem,
  useSerializedItems,
} from '../features/serialized-items/useSerializedItems';

const SEARCH_DEBOUNCE_MS = 300;
// Only "available" exists today, but the backend's STATUS_CHOICES is an
// extensible list - keyed by status so a future value (e.g. "issued",
// "missing") doesn't silently inherit this color instead of getting its own.
// A Map (not a plain object) avoids eslint-plugin-security's
// detect-object-injection warning on the dynamic-key lookup below.
const STATUS_COLORS = new Map<string, string>([['available', 'green']]);
const DEFAULT_STATUS_COLOR = 'default';

export function SerializedItemsPage() {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [productTypeFilter, setProductTypeFilter] = useState<number | undefined>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    data: serializedItems,
    isLoading,
    isError: isListError,
  } = useSerializedItems(search, productTypeFilter);
  const createMutation = useCreateSerializedItem();
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
        // AC-1/AC-2: a raced/duplicate serial number gets its own inline
        // message rather than the generic create-failed banner. The
        // backend embeds the submitted serial number in its duplicate
        // message ("Serial number SN-042 is already registered."), so an
        // exact-text match can't work - match on the stable
        // "already registered" phrase instead. This deliberately does NOT
        // match on the serial_number field's mere presence: a
        // whitespace-only or over-length serial number also returns a
        // serial_number error (required/max-length), and that must still
        // fall through to the generic banner rather than being mislabeled
        // as a duplicate.
        const rawErrors = axios.isAxiosError<{ serial_number?: string | string[] }>(error)
          ? error.response?.data?.serial_number
          : undefined;
        const serialErrors = Array.isArray(rawErrors) ? rawErrors : rawErrors ? [rawErrors] : [];
        const isDuplicate = serialErrors.some((message) => message.includes('already registered'));
        if (isDuplicate) {
          setError('serial_number', {
            type: 'server',
            message: 'serializedItems.form.serialNumberDuplicate',
          });
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
        <Tag color={STATUS_COLORS.get(status) ?? DEFAULT_STATUS_COLOR}>
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
        <a href={getSerializedItemQrCodeUrl(record.id)} target="_blank" rel="noreferrer">
          {t('serializedItems.printQrButton')}
        </a>
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
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('serializedItems.newButton')}
        </Button>
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
        />
      )}
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
