import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { AppLayout } from './AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import { motionDisabledTheme } from '../test/motionDisabledTheme';
import '../i18n';

// AppLayout pulls in ../features/auth/useAuth -> apiClient -> env.ts, which
// throws at import time without VITE_API_BASE_URL - matches BoxesPage.test.tsx's
// identical env mock, since CI has no VITE_API_BASE_URL.
vi.mock('../config/env', () => ({
  env: {
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
}));

function renderAtPath(path: string) {
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

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={motionDisabledTheme}>
        <AntApp>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/work-orders" element={<div>Page content</div>} />
                <Route path="/work-orders/:id" element={<div>Page content</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('AppSidebar', () => {
  it('highlights Work Orders when on its deep-linked detail URL (WRH-70)', async () => {
    // /work-orders/:id has no menu item of its own - an exact
    // location.pathname match would leave nothing selected.
    renderAtPath('/work-orders/17');

    const workOrdersItem = (await screen.findByText(/work orders|أوامر العمل/i)).closest(
      '.ant-menu-item',
    );
    expect(workOrdersItem).toHaveClass('ant-menu-item-selected');
  });

  it('highlights Work Orders on its plain list URL', async () => {
    renderAtPath('/work-orders');

    const workOrdersItem = (await screen.findByText(/work orders|أوامر العمل/i)).closest(
      '.ant-menu-item',
    );
    expect(workOrdersItem).toHaveClass('ant-menu-item-selected');
  });
});
