import { useEffect, useState } from 'react';
import { Alert, DatePicker, Input, Select, Table, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import {
  buildTransactionListParams,
  getTransactionTypeColor,
} from '../features/transactions/logic';
import type { Transaction } from '../features/transactions/types';
import { useTransactions } from '../features/transactions/useTransactions';

const SEARCH_DEBOUNCE_MS = 300;
const TRANSACTION_TYPES = [
  'receive',
  'issue',
  'return',
  'damaged',
  'transfer',
  'missing',
  'written_off',
] as const;

const { RangePicker } = DatePicker;

export function TransactionLogPage() {
  const { t } = useTranslation();
  const [serialInput, setSerialInput] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [transactionType, setTransactionType] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setSerialNumber(serialInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [serialInput]);

  useEffect(() => {
    const timeout = setTimeout(() => setReferenceNumber(referenceInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [referenceInput]);

  const {
    data: transactions,
    isLoading,
    isError,
  } = useTransactions(
    buildTransactionListParams({ serialNumber, referenceNumber, transactionType, dateRange }),
  );

  const typeOptions = TRANSACTION_TYPES.map((type) => ({
    value: type,
    label: t(`transactionLog.type.${type}`),
  }));

  // WRH-50/AC-1,AC-2: no actions column - the log is append-only, so there
  // is deliberately no Edit/Delete action anywhere on a transaction row.
  const columns = [
    {
      title: t('transactionLog.typeLabel'),
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      render: (transactionType: string) => (
        <Tag color={getTransactionTypeColor(transactionType)}>
          {t(`transactionLog.type.${transactionType}`)}
        </Tag>
      ),
    },
    {
      title: t('transactionLog.referenceNumberLabel'),
      dataIndex: 'reference_number',
      key: 'reference_number',
      render: (value: string) => value || t('transactionLog.noReference'),
    },
    {
      title: t('transactionLog.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('transactionLog.productTypeLabel'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('transactionLog.dateLabel'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('transactionLog.userLabel'),
      dataIndex: 'user_username',
      key: 'user_username',
    },
    {
      title: t('transactionLog.noteLabel'),
      dataIndex: 'note',
      key: 'note',
      render: (value: string) => value || t('transactionLog.noNote'),
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('transactionLog.title')}</Typography.Title>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input.Search
          placeholder={t('transactionLog.serialNumberPlaceholder')}
          allowClear
          value={serialInput}
          onChange={(event) => setSerialInput(event.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Input.Search
          placeholder={t('transactionLog.referenceNumberPlaceholder')}
          allowClear
          value={referenceInput}
          onChange={(event) => setReferenceInput(event.target.value)}
          style={{ maxWidth: 260 }}
        />
        <Select
          allowClear
          placeholder={t('transactionLog.typePlaceholder')}
          style={{ minWidth: 200 }}
          options={typeOptions}
          value={transactionType}
          onChange={(value: string | undefined) => setTransactionType(value)}
        />
        <RangePicker
          value={dateRange}
          onChange={(value) => setDateRange(value)}
          allowEmpty={[true, true]}
        />
      </div>
      {isError ? (
        <Alert
          type="error"
          message={t('transactionLog.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<Transaction>
          rowKey="id"
          columns={columns}
          dataSource={transactions}
          loading={isLoading}
          locale={{ emptyText: t('transactionLog.emptyState') }}
        />
      )}
    </>
  );
}
