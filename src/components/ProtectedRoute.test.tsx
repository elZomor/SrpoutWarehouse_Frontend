import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProtectedRoute } from './ProtectedRoute';
import { apiClient } from '../lib/apiClient';

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
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected Content</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /login when there is no active session', async () => {
    mockedApiClient.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });

    renderProtectedRoute();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('renders the protected content when a session is active', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    });

    renderProtectedRoute();

    await waitFor(() => expect(screen.getByText('Protected Content')).toBeInTheDocument());
  });
});
