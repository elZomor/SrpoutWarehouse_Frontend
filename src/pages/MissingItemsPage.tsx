import { Alert, App, Button, Popconfirm, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  useMarkMissingItemFound,
  useMissingItems,
  useWriteOffMissingItem,
} from '../features/missing-items/useMissingItems';
import type { MissingItem } from '../features/missing-items/types';
import { ROUTES } from '../routes';

export function MissingItemsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { data: missingItems, isLoading, isError } = useMissingItems();
  const markFoundMutation = useMarkMissingItemFound();
  const writeOffMutation = useWriteOffMissingItem();

  const handleMarkFound = (id: number) => {
    markFoundMutation.mutate(id, {
      onSuccess: () => message.success(t('missingItems.markFoundSuccess')),
      onError: () => message.error(t('missingItems.markFoundError')),
    });
  };

  const handleWriteOff = (id: number) => {
    writeOffMutation.mutate(id, {
      onSuccess: () => message.success(t('missingItems.writeOffSuccess')),
      onError: () => message.error(t('missingItems.writeOffError')),
    });
  };

  // AC-1/TC-01: serial number, product type, linked WO, date missing, status.
  const columns = [
    {
      title: t('missingItems.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('missingItems.productTypeLabel'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('missingItems.workOrderLabel'),
      dataIndex: 'work_order_reference',
      key: 'work_order_reference',
      // TC-04: "clicking navigates to that WO" - work order rows are shown
      // (and only reachable) from the Manage tab of the Work Orders page,
      // which has no per-id deep link today, so this routes there rather
      // than to a WO detail page that doesn't exist yet.
      render: (value: string) =>
        value ? <Link to={ROUTES.workOrders}>{value}</Link> : t('missingItems.noWorkOrder'),
    },
    {
      title: t('missingItems.dateMissingLabel'),
      dataIndex: 'date_missing',
      key: 'date_missing',
      render: (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: t('missingItems.statusLabel'),
      dataIndex: 'status',
      key: 'status',
      // Every row is "missing" today (the backend's list queryset only ever
      // returns SerializedItem.STATUS_MISSING rows), but rendering off
      // record.status rather than hardcoding avoids silently mislabeling a
      // row if that filter ever loosens or this columns array gets reused.
      render: (value: string) => (
        <Tag color="orange">{t(`missingItems.status.${value}`, { defaultValue: value })}</Tag>
      ),
    },
    {
      title: t('missingItems.actionsLabel'),
      key: 'actions',
      render: (_: unknown, record: MissingItem) => (
        <Space>
          <Popconfirm
            title={t('missingItems.markFoundConfirmTitle')}
            onConfirm={() => handleMarkFound(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
            okButtonProps={{
              loading: markFoundMutation.isPending && markFoundMutation.variables === record.id,
            }}
          >
            <Button size="small" type="primary">
              {t('missingItems.markFoundButton')}
            </Button>
          </Popconfirm>
          <Popconfirm
            title={t('missingItems.writeOffConfirmTitle')}
            onConfirm={() => handleWriteOff(record.id)}
            okText={t('common.ok')}
            cancelText={t('common.cancel')}
            okButtonProps={{
              loading: writeOffMutation.isPending && writeOffMutation.variables === record.id,
            }}
          >
            <Button size="small" danger>
              {t('missingItems.writeOffButton')}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('missingItems.title')}</Typography.Title>
      {isError ? (
        <Alert type="error" message={t('missingItems.loadError')} showIcon />
      ) : (
        <Table<MissingItem>
          rowKey="id"
          columns={columns}
          dataSource={missingItems}
          loading={isLoading}
          locale={{ emptyText: t('missingItems.emptyState') }}
        />
      )}
    </>
  );
}
