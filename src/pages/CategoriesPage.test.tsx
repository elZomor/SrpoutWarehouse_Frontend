import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CategoriesPage } from './CategoriesPage';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { Category } from '../features/categories/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Lighting',
    description: '',
    ...overrides,
  };
}

function renderCategoriesPage() {
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
      <MemoryRouter initialEntries={['/categories']}>
        <Routes>
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CategoriesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders categories returned from the API', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });

    renderCategoriesPage();

    expect(await screen.findByText('Lighting')).toBeInTheDocument();
  });

  it("shows the logged-in user's name and a link back to the dashboard", async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    renderCategoriesPage();

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard|لوحة التحكم/i })).toBeInTheDocument();
  });

  it('creates a category with all fields and it appears in the list', async () => {
    // TC-01 / AC-1
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockResolvedValueOnce({
      data: makeCategory({ description: 'Moving lights and fixtures' }),
    });
    mockedApiClient.get.mockResolvedValueOnce({
      data: [makeCategory({ description: 'Moving lights and fixtures' })],
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.type(screen.getByLabelText(/description|الوصف/i), 'Moving lights and fixtures');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/categories/', {
      name: 'Lighting',
      description: 'Moving lights and fixtures',
    });
    expect(await screen.findByText('Moving lights and fixtures')).toBeInTheDocument();
  });

  it('creates a category with only a name', async () => {
    // TC-02 / AC-3
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeCategory() });
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/categories/', {
      name: 'Lighting',
      description: '',
    });
    expect(await screen.findByText('Lighting')).toBeInTheDocument();
  });

  it('requires a name before submitting', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/name is required|الاسم مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('shows an error and keeps the modal open when create fails', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['already exists'] } },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to create category|فشل إنشاء الفئة/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('clears the create error when the modal is reopened after a failed submit', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['already exists'] } },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByText(/failed to create category|فشل إنشاء الفئة/i);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));

    expect(
      screen.queryByText(/failed to create category|فشل إنشاء الفئة/i),
    ).not.toBeInTheDocument();
  });

  it('logs out and redirects to the login-facing route', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockResolvedValueOnce({ data: {} });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /logout|تسجيل الخروج/i }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/logout/');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('shows an error banner when the list fails to load', async () => {
    mockedApiClient.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    renderCategoriesPage();

    expect(
      await screen.findByText(/failed to load categories|فشل تحميل الفئات/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no categories found|لا توجد فئات/i)).not.toBeInTheDocument();
  });

  it('filters the list when searching by name', async () => {
    // TC-03 / AC-2
    mockedApiClient.get.mockResolvedValueOnce({
      data: [makeCategory(), makeCategory({ id: 2, name: 'Staging' })],
    });
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });

    renderCategoriesPage();
    await screen.findByText('Staging');

    const searchInput = screen.getByPlaceholderText(/search by name|البحث بالاسم/i);
    fireEvent.change(searchInput, { target: { value: 'Light' } });

    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/categories/', {
        params: { search: 'Light' },
      }),
    );
    await waitFor(() => expect(screen.queryByText('Staging')).not.toBeInTheDocument());
    expect(screen.getByText('Lighting')).toBeInTheDocument();
  });

  it('shows an empty state when the search has no matches', async () => {
    // TC-04
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    renderCategoriesPage();
    await screen.findByText('Lighting');

    const searchInput = screen.getByPlaceholderText(/search by name|البحث بالاسم/i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(await screen.findByText(/no categories found|لا توجد فئات/i)).toBeInTheDocument();
  });
});
