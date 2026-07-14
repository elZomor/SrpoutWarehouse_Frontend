import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp } from 'antd';
import { CategoriesPage } from './CategoriesPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { Category } from '../features/categories/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Lighting',
    description: '',
    archived: false,
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
      <AntApp>
        <MemoryRouter initialEntries={['/categories']}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/categories" element={<CategoriesPage />} />
            </Route>
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </AntApp>
    </QueryClientProvider>,
  );
}

describe('CategoriesPage', () => {
  afterEach(() => {
    // resetAllMocks (not clearAllMocks) - this file chains
    // mockResolvedValueOnce/mockRejectedValueOnce per test, and clearAllMocks
    // only clears call history, not queued once-implementations. Any test
    // that doesn't consume its queue exactly leaked stale values into later
    // tests, causing order-dependent flake.
    vi.resetAllMocks();
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

  it('shows a duplicate-name error inline and keeps the modal open', async () => {
    // AC-2/TC-02: the specific duplicate-name message, not the generic banner
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['A category with this name already exists.'] } },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/already exists|توجد فئة بهذا الاسم بالفعل/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/failed to create category|فشل إنشاء الفئة/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('shows the generic create-failed banner for non-name errors', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
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

  it('shows the generic banner (not the duplicate-name message) for a non-duplicate name error', async () => {
    // Regression: a blank/whitespace-only name gets `{name: ["Name is required."]}`
    // from the backend, which is a `name` error but not a duplicate - it must not
    // be mislabeled as "a category with this name already exists".
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['Name is required.'] } },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to create category|فشل إنشاء الفئة/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/already exists|توجد فئة بهذا الاسم بالفعل/i),
    ).not.toBeInTheDocument();
  });

  it('clears the duplicate-name error when the modal is reopened after a failed submit', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['A category with this name already exists.'] } },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByText(/already exists|توجد فئة بهذا الاسم بالفعل/i);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));

    // AntD's Form.Item help text animates out (rc-motion), so the node can
    // still be present mid-transition - wait for it to actually leave.
    await waitFor(() =>
      expect(
        screen.queryByText(/already exists|توجد فئة بهذا الاسم بالفعل/i),
      ).not.toBeInTheDocument(),
    );
  });

  it('clears the generic create-failed banner when the modal is reopened after a failed submit', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
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

  it('clears the generic create-failed banner as soon as the name is edited, without closing the modal', async () => {
    // Regression: React Hook Form re-validates on change, which can clear
    // `errors.name` before the mutation's own error state is reset - if the
    // mutation error isn't cleared too, the generic banner flashes back on
    // the very next keystroke even though nothing has been resubmitted yet.
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const user = userEvent.setup();
    renderCategoriesPage();

    await user.click(await screen.findByRole('button', { name: /new category|فئة جديدة/i }));
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByText(/failed to create category|فشل إنشاء الفئة/i);

    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), ' Fixtures');

    await waitFor(() =>
      expect(
        screen.queryByText(/failed to create category|فشل إنشاء الفئة/i),
      ).not.toBeInTheDocument(),
    );
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

  it('deletes a category with zero product types', async () => {
    // AC-5/TC-05
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });
    mockedApiClient.delete.mockResolvedValueOnce({ data: undefined });
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    // Popconfirm's rc-motion enter animation leaves the confirm button's
    // pointer-events: none for a moment after it mounts - jsdom never
    // finishes the CSS transition, so userEvent's real-click guard sees a
    // stale "not clickable" state and times out. Not a real bug (browsers
    // finish the transition); disable the check for this Popconfirm click.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderCategoriesPage();

    await screen.findByText('Lighting');
    await user.click(screen.getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    await waitFor(() => expect(mockedApiClient.delete).toHaveBeenCalledWith('/api/categories/1/'));
    await waitFor(() => expect(screen.queryByText('Lighting')).not.toBeInTheDocument());
  });

  it('shows a translated, pluralized message when delete is blocked by assigned product types', async () => {
    // AC-3/TC-03: built from assigned_product_type_count, not the backend's
    // raw (English-only) detail text.
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });
    mockedApiClient.delete.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          detail: 'Cannot delete — 3 product types are assigned to this category.',
          assigned_product_type_count: 3,
        },
      },
    });

    // See the pointerEventsCheck note above on the delete test.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderCategoriesPage();

    await screen.findByText('Lighting');
    await user.click(screen.getByRole('button', { name: /^delete$|^حذف$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    expect(
      await screen.findByText(/cannot delete.*3 product types|لا يمكن الحذف.*3/i),
    ).toBeInTheDocument();
  });

  it('archives a category and it disappears from the list on refetch', async () => {
    // AC-4/TC-04
    mockedApiClient.get.mockResolvedValueOnce({ data: [makeCategory()] });
    mockedApiClient.post.mockResolvedValueOnce({ data: makeCategory({ archived: true }) });
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    // See the pointerEventsCheck note above on the delete test.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderCategoriesPage();

    await screen.findByText('Lighting');
    await user.click(screen.getByRole('button', { name: /^archive$|^أرشفة$/i }));
    await user.click(await screen.findByRole('button', { name: /^ok$|^موافق$/i }));

    await waitFor(() =>
      expect(mockedApiClient.post).toHaveBeenCalledWith('/api/categories/1/archive/'),
    );
    await waitFor(() => expect(screen.queryByText('Lighting')).not.toBeInTheDocument());
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
