import { Button, Modal, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  getTransactionTypeColor,
  sortTransactionsNewestFirst,
} from '../features/transactions/logic';
import type { Transaction } from '../features/transactions/types';
import { useTransactions } from '../features/transactions/useTransactions';
import { getSerializedItemStatusColor } from '../features/serialized-items/logic';

export interface ItemHistoryTarget {
  serial_number: string;
  product_type_name: string;
  status: string;
}

export interface ItemHistoryModalProps {
  item: ItemHistoryTarget | null;
  open: boolean;
  onClose: () => void;
}

// WRH-79/AC-6: one shared component, reused on every screen where an item
// row is clickable (SerializedItemsPage, BoxesPage's box detail, WorkOrdersPage's
// WO detail) rather than a per-screen reimplementation. Takes only the
// identity fields already present on each screen's own row data - no new
// backend endpoint needed, since Transaction (WRH-49/68/69) already logs
// every event type (receive/issue/return/damaged/transfer/missing/
// written_off) against serialized_item and is filterable by exact
// serial_number.
export function ItemHistoryModal({ item, open, onClose }: ItemHistoryModalProps) {
  const { t } = useTranslation();
  const {
    data: transactions,
    isLoading,
    isError,
  } = useTransactions({ serial_number: item?.serial_number }, open && item !== null);

  const history = sortTransactionsNewestFirst(transactions ?? []);

  const columns = [
    {
      title: t('itemHistory.typeLabel'),
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      render: (transactionType: string) => (
        <Tag color={getTransactionTypeColor(transactionType)}>
          {t(`transactionLog.type.${transactionType}`)}
        </Tag>
      ),
    },
    {
      title: t('itemHistory.dateLabel'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('itemHistory.referenceNumberLabel'),
      dataIndex: 'reference_number',
      key: 'reference_number',
      render: (value: string) => value || t('transactionLog.noReference'),
    },
    {
      title: t('itemHistory.userLabel'),
      dataIndex: 'user_username',
      key: 'user_username',
    },
    {
      title: t('itemHistory.noteLabel'),
      dataIndex: 'note',
      key: 'note',
      render: (value: string) => value || t('transactionLog.noNote'),
    },
  ];

  return (
    <Modal
      title={
        item
          ? t('itemHistory.title', {
              productType: item.product_type_name,
              serialNumber: item.serial_number,
            })
          : ''
      }
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          {t('itemHistory.closeButton')}
        </Button>,
      ]}
      width={640}
    >
      {item && (
        <Typography.Paragraph>
          {t('itemHistory.statusLabel')}:{' '}
          <Tag color={getSerializedItemStatusColor(item.status)}>
            {t(`serializedItems.status.${item.status}`)}
          </Tag>
        </Typography.Paragraph>
      )}
      {isError ? (
        <Typography.Text type="danger">{t('itemHistory.loadError')}</Typography.Text>
      ) : (
        <Table<Transaction>
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ y: 320 }}
          loading={isLoading}
          columns={columns}
          dataSource={history}
          locale={{ emptyText: t('itemHistory.emptyState') }}
        />
      )}
    </Modal>
  );
}
