import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import axios from 'axios';
import { Controller, type Control, type FieldError, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { categorySchema, type CategoryFormValues } from '../features/categories/schema';
import type { Category } from '../features/categories/types';
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
} from '../features/categories/useCategories';

const SEARCH_DEBOUNCE_MS = 300;

interface CategoryFieldProps {
  name: keyof CategoryFormValues;
  label: string;
  control: Control<CategoryFormValues>;
  error?: FieldError;
  multiline?: boolean;
}

function CategoryField({ name, label, control, error, multiline }: CategoryFieldProps) {
  const { t } = useTranslation();

  return (
    <Form.Item
      label={label}
      htmlFor={`category-${name}`}
      validateStatus={error ? 'error' : ''}
      help={error ? t(error.message ?? '') : undefined}
    >
      <Controller
        name={name}
        control={control}
        render={({ field }) =>
          multiline ? (
            <Input.TextArea {...field} id={`category-${name}`} />
          ) : (
            <Input {...field} id={`category-${name}`} />
          )
        }
      />
    </Form.Item>
  );
}

export function CategoriesPage() {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: categories, isLoading, isError: isListError } = useCategories(search);
  const createMutation = useCreateCategory();
  const deleteMutation = useDeleteCategory();
  const archiveMutation = useArchiveCategory();

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
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    createMutation.reset();
  };

  const onSubmit = (values: CategoryFormValues) => {
    createMutation.mutate(values, {
      onSuccess: closeModal,
      onError: (error) => {
        // AC-2: duplicate name gets its own inline message, not the
        // generic create-failed banner.
        const nameError = axios.isAxiosError<{ name?: string[] }>(error)
          ? error.response?.data.name
          : undefined;
        if (nameError?.length) {
          setError('name', { type: 'server', message: 'categories.form.nameDuplicate' });
        }
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => message.success(t('categories.deleteSuccess')),
      onError: (error) => {
        // AC-3: build the blocked-delete message from the backend's count
        // rather than showing its (English-only) `detail` text as-is, so
        // it's properly translated/pluralized in both AR and EN.
        const assignedCount = axios.isAxiosError<{ assigned_product_type_count?: number }>(error)
          ? error.response?.data.assigned_product_type_count
          : undefined;
        message.error(
          assignedCount != null
            ? t('categories.deleteBlockedError', { count: assignedCount })
            : t('categories.deleteError'),
        );
      },
    });
  };

  const handleArchive = (id: number) => {
    archiveMutation.mutate(id, {
      onSuccess: () => message.success(t('categories.archiveSuccess')),
      onError: () => message.error(t('categories.archiveError')),
    });
  };

  const columns = [
    { title: t('categories.nameLabel'), dataIndex: 'name', key: 'name' },
    {
      title: t('categories.descriptionLabel'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('categories.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: Category) => (
        <Space>
          <Popconfirm
            title={t('categories.archiveConfirmTitle')}
            onConfirm={() => handleArchive(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
            okButtonProps={{
              loading: archiveMutation.isPending && archiveMutation.variables === record.id,
            }}
          >
            <Button size="small">{t('categories.archiveButton')}</Button>
          </Popconfirm>
          <Popconfirm
            title={t('categories.deleteConfirmTitle')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
            okButtonProps={{
              loading: deleteMutation.isPending && deleteMutation.variables === record.id,
            }}
          >
            <Button size="small" danger>
              {t('categories.deleteButton')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('categories.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Input.Search
          placeholder={t('categories.searchPlaceholder')}
          allowClear
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('categories.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('categories.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<Category>
          rowKey="id"
          columns={columns}
          dataSource={categories}
          loading={isLoading}
          locale={{ emptyText: t('categories.emptyState') }}
        />
      )}
      <Modal
        title={t('categories.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" noValidate>
          <CategoryField
            name="name"
            label={t('categories.nameLabel')}
            control={control}
            error={errors.name}
          />
          <CategoryField
            name="description"
            label={t('categories.descriptionLabel')}
            control={control}
            multiline
          />
          {createMutation.isError && !errors.name && (
            <Form.Item>
              <Alert type="error" message={t('categories.createError')} showIcon />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
