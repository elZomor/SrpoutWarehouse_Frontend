import { Button, Modal, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
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
  // WRH-79/code-review: `item` goes null the same tick the caller flips
  // `open` false (see e.g. SerializedItemsPage's onClose), which would
  // otherwise blank the title/status while the Modal is still animating
  // closed. Mirrors BoxesPage's own detailBox/isDetailOpenRef pattern for
  // its box detail modal - keep showing the last real item until the close
  // animation actually finishes, not on click.
  const [displayedItem, setDisplayedItem] = useState<ItemHistoryTarget | null>(item);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  // React's documented "adjust state during render" pattern for state
  // derived from a prop - safe on its own (unlike the ref write above,
  // which the react-compiler lint rule correctly flags if done inline
  // here too), since it only calls setState conditionally rather than
  // reading/writing a ref.
  if (item && item !== displayedItem) {
    setDisplayedItem(item);
  }
  // Keyed off displayedItem (not item) so the query - and its cached data -
  // stay associated with the item still on screen while the Modal animates
  // closed; keying off item would flip the query key to `undefined` the
  // same tick item does, blanking the table under the still-visible modal.
  const {
    data: transactions,
    isLoading,
    isError,
  } = useTransactions(
    { serial_number: displayedItem?.serial_number },
    open && displayedItem !== null,
  );

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
        displayedItem
          ? t('itemHistory.title', {
              productType: displayedItem.product_type_name,
              serialNumber: displayedItem.serial_number,
            })
          : ''
      }
      open={open}
      onCancel={onClose}
      // See displayedItem's own comment above - only clears the last-shown
      // item once the close animation has actually finished, and only if a
      // reopen (a fresh item) hasn't happened in the meantime.
      afterOpenChange={(isOpen) => {
        if (!isOpen && !openRef.current) {
          setDisplayedItem(null);
        }
      }}
      footer={[
        <Button key="close" onClick={onClose}>
          {t('itemHistory.closeButton')}
        </Button>,
      ]}
      width={640}
    >
      {displayedItem && (
        <Typography.Paragraph>
          {t('itemHistory.statusLabel')}:{' '}
          <Tag color={getSerializedItemStatusColor(displayedItem.status)}>
            {t(`serializedItems.status.${displayedItem.status}`)}
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
