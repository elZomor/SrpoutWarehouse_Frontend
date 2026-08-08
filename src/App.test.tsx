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

// App's route tree pulls in SerializedItemsPage, whose api.ts reads env
// directly (not through apiClient) - CI has no VITE_API_BASE_URL, and
// env.ts throws at import time without it.
vi.mock('./config/env', () => ({
  env: {
    VITE_API_BASE_URL: 'http://localhost:8000',
  },
}));

// AppProviders wires its own ConfigProvider straight from this theme (no
// prop to override it at the render call site), so disabling the `motion`
// token for the suite - see motionDisabledTheme.ts for why - has to happen
// by overriding the module itself.
vi.mock('./theme/antdTheme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./theme/antdTheme')>();
  return {
    antdTheme: { ...actual.antdTheme, token: { ...actual.antdTheme.token, motion: false } },
  };
});

const mockedApiClient = vi.mocked(apiClient, true);

describe('App', () => {
  beforeEach(() => {
    queryClient.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    // resetAllMocks (not clearAllMocks) - both tests chain
    // mockResolvedValueOnce/mockRejectedValueOnce, and clearAllMocks only
    // clears call history, not queued once-implementations.
    vi.resetAllMocks();
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

    expect(
      await screen.findByRole('heading', { name: /login|تسجيل الدخول/i, hidden: true }),
    ).toBeInTheDocument();
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
