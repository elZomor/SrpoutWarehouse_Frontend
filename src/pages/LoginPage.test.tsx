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
      data: {
        id: 1,
        username: 'jane',
        email: 'jane@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
      },
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

  // WRH-19 TC-01/TC-02/TC-03/TC-04 (required-field/malformed-email
  // validation) moved to src/features/auth/schema.test.ts - pure
  // loginSchema.safeParse() cases, no DOM needed. This file keeps the
  // happy path and the one representative error-path (401 below).

  it('shows a generic invalid-credentials error and stays on the login page on a 401', async () => {
    // WRH-19 TC-05/TC-06: unregistered email and wrong password are
    // indistinguishable to the backend response, so both are covered by the
    // same 401 path here.
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { detail: 'Invalid email or password.' } },
    });

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(await screen.findByLabelText(/email|البريد الإلكتروني/i), 'jane@example.com');
    await user.type(screen.getByLabelText(/password|كلمة المرور/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /login|تسجيل الدخول/i }));

    expect(
      await screen.findByText(
        /invalid email or password|البريد الإلكتروني أو كلمة المرور غير صحيحة/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
  });
});
