import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { DamageReportsPage } from './DamageReportsPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { DamageReport } from '../features/damage-reports/types';
import { apiClient } from '../lib/apiClient';
import { motionDisabledTheme } from '../test/motionDisabledTheme';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeDamageReport(overrides: Partial<DamageReport> = {}): DamageReport {
  return {
    id: 1,
    reference: 'DR-0001',
    serial_number: 'SN-042',
    product_type_name: 'Bar LED Model A',
    note: 'cracked housing',
    user_username: 'jane',
    created_at: '2026-02-15T10:00:00Z',
    ...overrides,
  };
}

function mockDamageReportsEndpoint(damageReports: DamageReport[]) {
  mockedApiClient.get.mockImplementation((url: string) => {
    if (url !== '/api/damage-reports/') {
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    }
    return Promise.resolve({ data: damageReports });
  });
}

function renderDamageReportsPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(currentUserQueryKey, {
    id: 1,
    username: 'jane',
    email: 'jane@example.com',
    first_name: 'Jane',
    last_name: 'Doe',
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <ConfigProvider theme={motionDisabledTheme}>
          <AntApp>
            <MemoryRouter initialEntries={['/damage-reports']}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route path="/damage-reports" element={<DamageReportsPage />} />
                </Route>
                <Route path="/login" element={<div>Login Page</div>} />
              </Routes>
            </MemoryRouter>
          </AntApp>
        </ConfigProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('DamageReportsPage', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('lists every damage report with its display fields (AC-2/TC-03)', async () => {
    mockDamageReportsEndpoint([
      makeDamageReport({ id: 1, reference: 'DR-0001' }),
      makeDamageReport({ id: 2, reference: 'DR-0002', serial_number: 'SN-099', note: '' }),
    ]);

    renderDamageReportsPage();

    expect(await screen.findByText('DR-0001')).toBeInTheDocument();
    expect(screen.getByText('DR-0002')).toBeInTheDocument();
    expect(screen.getByText('SN-042')).toBeInTheDocument();
    expect(screen.getByText('SN-099')).toBeInTheDocument();
    expect(screen.getAllByText('Bar LED Model A')).toHaveLength(2);
    expect(screen.getByText('cracked housing')).toBeInTheDocument();
    expect(screen.getAllByText('jane')).toHaveLength(2);
  });

  it('creates a damage report with a note and it appears in the list (AC-1/TC-01)', async () => {
    const damageReports: DamageReport[] = [];
    mockDamageReportsEndpoint(damageReports);
    const created = makeDamageReport();
    mockedApiClient.post.mockResolvedValueOnce({ data: created });

    const user = userEvent.setup();
    renderDamageReportsPage();

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await user.type(screen.getByLabelText(/note|ملاحظة/i), 'cracked housing');
    damageReports.push(created);
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/damage-reports/', {
      serial_number: 'SN-042',
      note: 'cracked housing',
    });
    expect(await screen.findByText('DR-0001')).toBeInTheDocument();
    expect(await screen.findByText(/DR-0001 created\.|تم إنشاء DR-0001\./i)).toBeInTheDocument();
  });

  it('creates a damage report without a note (AC-3/TC-02)', async () => {
    const damageReports: DamageReport[] = [];
    mockDamageReportsEndpoint(damageReports);
    const created = makeDamageReport({ note: '' });
    mockedApiClient.post.mockResolvedValueOnce({ data: created });

    const user = userEvent.setup();
    renderDamageReportsPage();

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    damageReports.push(created);
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/damage-reports/', {
      serial_number: 'SN-042',
      note: '',
    });
    expect(await screen.findByText('DR-0001')).toBeInTheDocument();
  });

  it('invalidates serialized-items and the product-types stock summary after creating a report', async () => {
    mockDamageReportsEndpoint([]);
    mockedApiClient.post.mockResolvedValueOnce({ data: makeDamageReport() });

    const user = userEvent.setup();
    const { queryClient } = renderDamageReportsPage();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['serialized-items'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['product-types', 'stock-summary'],
    });
  });

  it('shows an inline error when the serial number was not found', async () => {
    mockDamageReportsEndpoint([]);
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['Serial number SN-999 was not found.'] },
      },
    });

    const user = userEvent.setup();
    renderDamageReportsPage();

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-999');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(/serial number was not found|لم يتم العثور على الرقم التسلسلي/i),
    ).toBeInTheDocument();
  });

  it('shows an inline error when the item is not available to report as damaged', async () => {
    mockDamageReportsEndpoint([]);
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: { serial_number: ['SN-042 is not available to report as damaged.'] },
      },
    });

    const user = userEvent.setup();
    renderDamageReportsPage();

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(/not available to report as damaged|غير متاحة للإبلاغ عن تلفها/i),
    ).toBeInTheDocument();
  });

  it('shows a generic error banner when creation fails for an unclassified reason', async () => {
    mockDamageReportsEndpoint([]);
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup();
    renderDamageReportsPage();

    await user.click(
      await screen.findByRole('button', {
        name: /new damage report|تقرير تلف جديد/i,
        hidden: true,
      }),
    );
    await user.type(screen.getByLabelText(/serial number|الرقم التسلسلي/i), 'SN-042');
    await user.click(screen.getByRole('button', { name: 'OK', hidden: true }));

    expect(
      await screen.findByText(/failed to create damage report|فشل إنشاء تقرير التلف/i),
    ).toBeInTheDocument();
  });

  it('shows an error banner when the damage reports request fails', async () => {
    mockedApiClient.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    renderDamageReportsPage();

    expect(
      await screen.findByText(/failed to load damage reports|فشل تحميل تقارير التلف/i),
    ).toBeInTheDocument();
  });
});
