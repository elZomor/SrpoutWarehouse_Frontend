import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Form, Input, Modal, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useApiFeedback } from '../hooks/useApiFeedback';
import { resolveDamageReportSerialErrorKey } from '../features/damage-reports/logic';
import { damageReportSchema, type DamageReportFormValues } from '../features/damage-reports/schema';
import type { DamageReport } from '../features/damage-reports/types';
import {
  useCreateDamageReport,
  useDamageReports,
} from '../features/damage-reports/useDamageReports';
import { getFieldErrorMessages } from '../lib/apiErrors';

export function DamageReportsPage() {
  const { t } = useTranslation();
  const { notifySuccess, notifyError } = useApiFeedback();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: damageReports, isLoading, isError: isListError } = useDamageReports();
  const createMutation = useCreateDamageReport();

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<DamageReportFormValues>({
    resolver: zodResolver(damageReportSchema),
    defaultValues: { serial_number: '', note: '' },
  });

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
  };

  const onSubmit = (values: DamageReportFormValues) => {
    createMutation.mutate(values, {
      onSuccess: (report) => {
        notifySuccess(t('damageReports.createSuccess', { reference: report.reference }));
        closeModal();
      },
      onError: (error) => {
        // AC-1/AC-2: the backend embeds the submitted (unconstrained
        // free-text) serial number in its rejection message, so it's
        // classified/anchored rather than shown verbatim - matches
        // classifyScanRejection's identical reasoning in
        // features/work-orders/logic.ts.
        const messageKey = resolveDamageReportSerialErrorKey(
          getFieldErrorMessages(error, 'serial_number'),
        );
        if (messageKey) {
          setError('serial_number', { type: 'server', message: messageKey });
        } else {
          notifyError(t('damageReports.createError'));
        }
      },
    });
  };

  // AC-2/TC-03: DR number, date, serial, product type, note, user.
  const columns = [
    {
      title: t('damageReports.referenceLabel'),
      dataIndex: 'reference',
      key: 'reference',
    },
    {
      title: t('damageReports.dateLabel'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: t('damageReports.serialNumberLabel'),
      dataIndex: 'serial_number',
      key: 'serial_number',
    },
    {
      title: t('damageReports.productTypeLabel'),
      dataIndex: 'product_type_name',
      key: 'product_type_name',
    },
    {
      title: t('damageReports.noteLabel'),
      dataIndex: 'note',
      key: 'note',
      render: (value: string) => value || t('damageReports.noNote'),
    },
    {
      title: t('damageReports.userLabel'),
      dataIndex: 'user_username',
      key: 'user_username',
    },
  ];

  return (
    <>
      <Typography.Title level={3}>{t('damageReports.title')}</Typography.Title>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" onClick={() => setIsModalOpen(true)}>
          {t('damageReports.newButton')}
        </Button>
      </div>
      {isListError ? (
        <Alert
          type="error"
          message={t('damageReports.loadError')}
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Table<DamageReport>
          rowKey="id"
          columns={columns}
          dataSource={damageReports}
          loading={isLoading}
          locale={{ emptyText: t('damageReports.emptyState') }}
        />
      )}
      <Modal
        title={t('damageReports.newButton')}
        open={isModalOpen}
        onCancel={closeModal}
        onOk={handleSubmit(onSubmit)}
        confirmLoading={createMutation.isPending}
      >
        <Form layout="vertical" noValidate>
          <Form.Item
            label={t('damageReports.serialNumberLabel')}
            htmlFor="damage-report-serial_number"
            validateStatus={errors.serial_number ? 'error' : ''}
            help={errors.serial_number ? t(errors.serial_number.message ?? '') : undefined}
          >
            <Controller
              name="serial_number"
              control={control}
              render={({ field }) => <Input {...field} id="damage-report-serial_number" />}
            />
          </Form.Item>
          <Form.Item
            label={t('damageReports.noteLabel')}
            htmlFor="damage-report-note"
            validateStatus={errors.note ? 'error' : ''}
            help={errors.note ? t(errors.note.message ?? '') : undefined}
          >
            <Controller
              name="note"
              control={control}
              render={({ field }) => <Input.TextArea {...field} id="damage-report-note" rows={3} />}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
