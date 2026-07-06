import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginPage } from './LoginPage';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Dashboard Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockedApiClient.get.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('logs in with valid credentials and redirects to the dashboard', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(await screen.findByLabelText(/email|البريد الإلكتروني/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password|كلمة المرور/i), 'correct-password');
    await user.click(screen.getByRole('button', { name: /login|تسجيل الدخول/i }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/login/', {
      email: 'jane@example.com',
      password: 'correct-password',
    });
    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
  });
});
