import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AppProviders } from './app/AppProviders';
import { queryClient } from './app/queryClient';
import { apiClient } from './lib/apiClient';
import './i18n';

vi.mock('./lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

describe('App', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('redirects an unauthenticated visitor at "/" to the login page', async () => {
    mockedApiClient.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    });

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByRole('heading', { name: /login|تسجيل الدخول/i })).toBeInTheDocument();
  });

  it("shows the dashboard with the logged-in user's name in the nav bar for an authenticated visitor", async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: {
        id: 1,
        username: 'jane',
        email: 'jane@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
      },
    });

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Welcome to Sprout Warehouse|مرحبًا بك في سبروت للمخازن/),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });
});
