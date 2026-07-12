import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProductTypesPage } from './ProductTypesPage';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { Category } from '../features/categories/types';
import type { ProductType } from '../features/product-types/types';
import { apiClient } from '../lib/apiClient';
import '../i18n';

vi.mock('../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

function makeProductType(overrides: Partial<ProductType> = {}): ProductType {
  return {
    id: 1,
    name: 'Bar LED Model A',
    model_code: 'BAR-A',
    description: '',
    category: 1,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    name: 'Lighting',
    description: '',
    archived: false,
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// both the product-types list query and the categories dropdown query on
// mount and the two aren't guaranteed to resolve in declaration order.
function mockListEndpoints({
  productTypes = [],
  categories = [makeCategory()],
  productTypesError = false,
}: {
  productTypes?: ProductType[];
  categories?: Category[];
  productTypesError?: boolean;
}) {
  mockedApiClient.get.mockImplementation(
    (url: string, config?: { params?: { search?: string } }) => {
      if (url === '/api/categories/') {
        return Promise.resolve({ data: categories });
      }
      if (url === '/api/product-types/') {
        if (productTypesError) {
          return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
        }
        const search = config?.params?.search?.toLowerCase() ?? '';
        const results = productTypes.filter(
          (productType) =>
            productType.name.toLowerCase().includes(search) ||
            productType.model_code.toLowerCase().includes(search),
        );
        return Promise.resolve({ data: results });
      }
      return Promise.reject(new Error(`Unexpected GET ${url}`));
    },
  );
}

function renderProductTypesPage() {
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
      <MemoryRouter initialEntries={['/product-types']}>
        <Routes>
          <Route path="/product-types" element={<ProductTypesPage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectCategory(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox'));
  await user.click(screen.getByTitle(name));
}

describe('ProductTypesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders product types returned from the API', async () => {
    mockListEndpoints({ productTypes: [makeProductType()] });

    renderProductTypesPage();

    expect(await screen.findByText('Bar LED Model A')).toBeInTheDocument();
  });

  it("shows the logged-in user's name and a link back to the dashboard", async () => {
    mockListEndpoints({});

    renderProductTypesPage();

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /dashboard|لوحة التحكم/i })).toBeInTheDocument();
  });

  it('creates a product type with all fields and it appears in the list', async () => {
    // TC-01
    const productTypes: ProductType[] = [];
    mockListEndpoints({ productTypes });
    mockedApiClient.post.mockResolvedValueOnce({
      data: makeProductType({ description: 'Moving bar light' }),
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await user.type(screen.getByLabelText(/model code|رمز الموديل/i), 'BAR-A');
    await user.type(screen.getByLabelText(/description|الوصف/i), 'Moving bar light');
    await selectCategory(user, 'Lighting');
    productTypes.push(makeProductType({ description: 'Moving bar light' }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/product-types/', {
      name: 'Bar LED Model A',
      model_code: 'BAR-A',
      description: 'Moving bar light',
      category: 1,
    });
    expect(await screen.findByText('Moving bar light')).toBeInTheDocument();
  });

  it('creates a product type with only a name and a category', async () => {
    // TC-02 / AC-3
    const productTypes: ProductType[] = [];
    mockListEndpoints({ productTypes });
    mockedApiClient.post.mockResolvedValueOnce({
      data: makeProductType({ model_code: '' }),
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await selectCategory(user, 'Lighting');
    productTypes.push(makeProductType({ model_code: '' }));
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/product-types/', {
      name: 'Bar LED Model A',
      model_code: '',
      description: '',
      category: 1,
    });
    expect(await screen.findByText('Bar LED Model A')).toBeInTheDocument();
  });

  it('requires a name before submitting', async () => {
    mockListEndpoints({});

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/name is required|الاسم مطلوب/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('requires a category before submitting', async () => {
    // AC-4
    mockListEndpoints({});

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/category is required|الفئة مطلوبة/i)).toBeInTheDocument();
    expect(mockedApiClient.post).not.toHaveBeenCalled();
  });

  it('offers an existing category as a selectable option', async () => {
    // AC-4 / TC-05
    mockListEndpoints({ categories: [makeCategory({ id: 2, name: 'Lighting' })] });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.click(screen.getByRole('combobox'));

    expect(screen.getByTitle('Lighting')).toBeInTheDocument();
  });

  it('shows an error and keeps the modal open when create fails', async () => {
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['already exists'] } },
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await selectCategory(user, 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(
      await screen.findByText(/failed to create product type|فشل إنشاء نوع المنتج/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('clears the create error when the modal is reopened after a failed submit', async () => {
    mockListEndpoints({});
    mockedApiClient.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 400, data: { name: ['already exists'] } },
    });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );
    await user.type(screen.getByLabelText(/^name$|^الاسم$/i), 'Bar LED Model A');
    await selectCategory(user, 'Lighting');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByText(/failed to create product type|فشل إنشاء نوع المنتج/i);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      await screen.findByRole('button', { name: /new product type|نوع منتج جديد/i }),
    );

    expect(
      screen.queryByText(/failed to create product type|فشل إنشاء نوع المنتج/i),
    ).not.toBeInTheDocument();
  });

  it('logs out and redirects to the login-facing route', async () => {
    mockListEndpoints({});
    mockedApiClient.post.mockResolvedValueOnce({ data: {} });

    const user = userEvent.setup();
    renderProductTypesPage();

    await user.click(await screen.findByRole('button', { name: /logout|تسجيل الخروج/i }));

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/logout/');
    await waitFor(() => expect(screen.getByText('Login Page')).toBeInTheDocument());
  });

  it('shows an error banner when the list fails to load', async () => {
    mockListEndpoints({ productTypesError: true });

    renderProductTypesPage();

    expect(
      await screen.findByText(/failed to load product types|فشل تحميل أنواع المنتجات/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no product types found|لا توجد أنواع منتجات/i),
    ).not.toBeInTheDocument();
  });

  it('filters the list when searching by name or model code', async () => {
    // TC-03
    mockListEndpoints({
      productTypes: [
        makeProductType(),
        makeProductType({ id: 2, name: 'Fog Machine', model_code: 'FOG-01' }),
      ],
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
    mockListEndpoints({ productTypes: [makeProductType()] });

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
