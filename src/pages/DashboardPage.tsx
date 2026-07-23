import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Modal, Spin, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProductTypeStockSummary } from '../features/product-types/useProductTypes';
import type { ProductTypeStockSummary } from '../features/product-types/types';
import { useSerializedItems } from '../features/serialized-items/useSerializedItems';

// Matches SerializedItemsPage's STATUS_COLORS precedent (a Map avoids
// eslint-plugin-security's detect-object-injection warning on the dynamic-
// key lookup below).
const STATUS_COLORS = new Map<string, string>([['available', 'green']]);
const DEFAULT_STATUS_COLOR = 'default';

export function DashboardPage() {
  const { t } = useTranslation();
  const [detailProductType, setDetailProductType] = useState<ProductTypeStockSummary | null>(null);
  const {
    data: stockSummary,
    isLoading,
    isFetching,
    isError,
    refetch,
  } = useProductTypeStockSummary();
  const {
    data: detailItems,
    isLoading: isDetailLoading,
    isError: isDetailError,
  } = useSerializedItems('', detailProductType?.id, detailProductType !== null);

  // WRH-48/AC-1/AC-2: every count is read straight off the backend's own
  // direct DB-level Count annotations (see ProductTypeStockSummarySerializer's
  // comment) - nothing here re-derives Available by subtraction.
  const columns = [
    {
      title: t('dashboard.stockSummary.productTypeHeader'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('dashboard.stockSummary.totalRegisteredHeader'),
      dataIndex: 'total_registered',
      key: 'total_registered',
    },
    {
      title: t('dashboard.stockSummary.outHeader'),
      dataIndex: 'out',
      key: 'out',
    },
    {
      title: t('dashboard.stockSummary.damagedHeader'),
      dataIndex: 'damaged',
      key: 'damaged',
    },
    {
      title: t('dashboard.stockSummary.missingHeader'),
      dataIndex: 'missing',
      key: 'missing',
    },
    {
      title: t('dashboard.stockSummary.availableHeader'),
      dataIndex: 'available',
      key: 'available',
    },
  ];

  const detailColumns = [
    {
      title: t('dashboard.stockSummary.detail.serialNumberHeader'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('dashboard.stockSummary.detail.statusHeader'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={STATUS_COLORS.get(status) ?? DEFAULT_STATUS_COLOR}>
          {t(`serializedItems.status.${status}`)}
        </Tag>
      ),
    },
  ];

  return (
    <>
      <Typography.Paragraph>{t('dashboard.welcome')}</Typography.Paragraph>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t('dashboard.stockSummary.title')}
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isFetching}>
          {t('dashboard.stockSummary.refreshButton')}
        </Button>
      </div>
      {isError ? (
        <Alert type="error" message={t('dashboard.stockSummary.loadError')} showIcon />
      ) : (
        <Table<ProductTypeStockSummary>
          rowKey="id"
          columns={columns}
          dataSource={stockSummary}
          loading={isLoading}
          locale={{ emptyText: t('dashboard.stockSummary.emptyState') }}
          onRow={(record) => ({
            onClick: () => setDetailProductType(record),
            style: { cursor: 'pointer' },
          })}
        />
      )}
      <Modal
        title={t('dashboard.stockSummary.detail.title', {
          productType: detailProductType?.name ?? '',
        })}
        open={detailProductType !== null}
        onCancel={() => setDetailProductType(null)}
        footer={[
          <Button key="close" onClick={() => setDetailProductType(null)}>
            {t('dashboard.stockSummary.detail.closeButton')}
          </Button>,
        ]}
        width={640}
      >
        {isDetailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : isDetailError ? (
          <Alert type="error" message={t('dashboard.stockSummary.detail.loadError')} showIcon />
        ) : (
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            columns={detailColumns}
            dataSource={detailItems}
            locale={{ emptyText: t('dashboard.stockSummary.detail.emptyState') }}
          />
        )}
      </Modal>
    </>
  );
}
