import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { ProtectedRoute } from './ProtectedRoute';
import { apiClient } from '../lib/apiClient';
import { motionDisabledTheme } from '../test/motionDisabledTheme';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function renderProtectedRoute() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={motionDisabledTheme}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<div>Protected Content</div>} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </ConfigProvider>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    // resetAllMocks (not clearAllMocks) - both tests chain
    // mockResolvedValueOnce/mockRejectedValueOnce, and clearAllMocks only
    // clears call history, not queued once-implementations.
    vi.resetAllMocks();
  });

  it('redirects to /login when there is no active session', async () => {
    mockedApiClient.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });

    renderProtectedRoute();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('renders the protected content when a session is active', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
        id: 1,
        username: 'jane',
        email: 'jane@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });
});
