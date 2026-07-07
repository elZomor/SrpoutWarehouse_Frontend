import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductTypesPage } from './ProductTypesPage';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function renderProductTypesPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/product-types']}>
        <Routes>
          <Route path="/product-types" element={<ProductTypesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProductTypesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders product types returned from the API', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: [{ id: 1, name: 'Bar LED Model A', model_code: 'BAR-A', description: '' }],
    });

    renderProductTypesPage();

    expect(await screen.findByText('Bar LED Model A')).toBeInTheDocument();
  });

  it('creates a product type with all fields and it appears in the list', async () => {
    // TC-01
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockResolvedValueOnce({
      data: {
        id: 1,
        name: 'Bar LED Model A',
        model_code: 'BAR-A',
        description: 'Moving bar light',
      },
    });
    mockedApiClient.get.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Bar LED Model A', model_code: 'BAR-A', description: 'Moving bar light' },
      ],
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await user.type(screen.getByLabelText(/model code|رمز الموديل/i), 'BAR-A');
    await user.type(screen.getByLabelText(/description|الوصف/i), 'Moving bar light');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/product-types/', {
      name: 'Bar LED Model A',
      model_code: 'BAR-A',
      description: 'Moving bar light',
    });
    expect(await screen.findByText('Moving bar light')).toBeInTheDocument();
  });

  it('creates a product type with only a name', async () => {
    // TC-02 / AC-3
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });
    mockedApiClient.post.mockResolvedValueOnce({
      data: { id: 1, name: 'Bar LED Model A', model_code: '', description: '' },
    });
    mockedApiClient.get.mockResolvedValueOnce({
      data: [{ id: 1, name: 'Bar LED Model A', model_code: '', description: '' }],
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/product-types/', {
      name: 'Bar LED Model A',
      model_code: '',
      description: '',
    });
    expect(await screen.findByText('Bar LED Model A')).toBeInTheDocument();
  });

  it('requires a name before submitting', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/name is required|الاسم مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('filters the list when searching by name or model code', async () => {
    // TC-03
    mockedApiClient.get.mockResolvedValueOnce({
      data: [
        { id: 1, name: 'Bar LED Model A', model_code: 'BAR-A', description: '' },
        { id: 2, name: 'Fog Machine', model_code: 'FOG-01', description: '' },
      ],
    });
    mockedApiClient.get.mockResolvedValueOnce({
      data: [{ id: 1, name: 'Bar LED Model A', model_code: 'BAR-A', description: '' }],
    });

    renderProductTypesPage();
    await screen.findByText('Fog Machine');

    const searchInput = screen.getByPlaceholderText(
      /search by name or model code|البحث بالاسم أو رمز الموديل/i,
    );
    fireEvent.change(searchInput, { target: { value: 'Bar LED' } });

    await waitFor(() =>
      expect(mockedApiClient.get).toHaveBeenLastCalledWith('/api/product-types/', {
        params: { search: 'Bar LED' },
      }),
    );
    await waitFor(() => expect(screen.queryByText('Fog Machine')).not.toBeInTheDocument());
    expect(screen.getByText('Bar LED Model A')).toBeInTheDocument();
  });

  it('shows an empty state when the search has no matches', async () => {
    // TC-04
    mockedApiClient.get.mockResolvedValueOnce({
      data: [{ id: 1, name: 'Bar LED Model A', model_code: 'BAR-A', description: '' }],
    });
    mockedApiClient.get.mockResolvedValueOnce({ data: [] });

    renderProductTypesPage();
    await screen.findByText('Bar LED Model A');

    const searchInput = screen.getByPlaceholderText(
      /search by name or model code|البحث بالاسم أو رمز الموديل/i,
    );
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(
      await screen.findByText(/no product types found|لا توجد أنواع منتجات/i),
    ).toBeInTheDocument();
  });
});
