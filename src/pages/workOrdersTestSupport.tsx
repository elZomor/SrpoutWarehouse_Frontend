import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { WorkOrdersPage } from './WorkOrdersPage';
import { AppLayout } from '../components/AppLayout';
import { currentUserQueryKey } from '../features/auth/useAuth';
import type { ProductType } from '../features/product-types/types';
import type { ActiveWorkOrder, WorkOrder } from '../features/work-orders/types';
import { motionDisabledTheme } from '../test/motionDisabledTheme';

// Shared across WorkOrdersPage.*.test.tsx - split out of a single 1620-line/
// 48-test WorkOrdersPage.test.tsx (WRH-34) so each tab/feature's tests live
// in their own file and can run in parallel again instead of all serially
// in one worker. vi.mock('../lib/apiClient', ...) itself can't live here -
// Vitest's mock hoisting is per-file, so each *.test.tsx still declares its
// own vi.mock + mockedApiClient and passes mockedApiClient.get into
// mockListEndpoints below.

export function makeProductType(overrides: Partial<ProductType> = {}): ProductType {
  return {
    id: 1,
    name: 'Bar LED Model A',
    model_code: 'BAR-A',
    description: '',
    category: 1,
    category_name: 'Lighting',
    ...overrides,
  };
}

export function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 1,
    reference: 'WO-1',
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'draft',
    created_by: 1,
    created_by_username: 'jane',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 5,
        scanned_quantity: 0,
        remaining_quantity: 5,
      },
    ],
    ...overrides,
  };
}

export function makeActiveWorkOrder(overrides: Partial<ActiveWorkOrder> = {}): ActiveWorkOrder {
  return {
    id: 1,
    reference: 'WO-1',
    job_name: 'Summer Gala',
    client_name: 'Acme Events',
    expected_date_out: '2026-08-01',
    status: 'fulfilled',
    line_items: [
      {
        id: 1,
        product_type: 1,
        product_type_name: 'Bar LED Model A',
        quantity: 5,
        returned_quantity: 1,
        damaged_quantity: 0,
        still_out_quantity: 4,
      },
    ],
    supplementaries: [],
    ...overrides,
  };
}

// GET calls are routed by URL rather than call order, since the page fires
// the work-orders list query, the active-work-orders query, and the
// product-types dropdown query on mount and none are guaranteed to resolve
// in declaration order.
export function mockListEndpoints(
  getMock: Mock,
  {
    workOrders = [],
    activeWorkOrders = [],
    productTypes = [makeProductType()],
    workOrdersError = false,
  }: {
    workOrders?: WorkOrder[];
    activeWorkOrders?: ActiveWorkOrder[];
    productTypes?: ProductType[];
    workOrdersError?: boolean;
  },
) {
  getMock.mockImplementation((url: string) => {
    if (url === '/api/product-types/') {
      return Promise.resolve({ data: productTypes });
    }
    if (url === '/api/work-orders/active/') {
      return Promise.resolve({ data: activeWorkOrders });
    }
    if (url === '/api/work-orders/') {
      if (workOrdersError) {
        return Promise.reject({ isAxiosError: true, response: { status: 500, data: {} } });
      }
      return Promise.resolve({ data: workOrders });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

// WRH-75: the Active/Manage tabs are gone - a single table now lists every
// WO, so there's no tab to switch to before a test can find its row.
export async function renderWorkOrdersPage({
  initialEntries = ['/work-orders'],
}: {
  initialEntries?: Parameters<typeof MemoryRouter>[0]['initialEntries'];
} = {}) {
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

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ConfigProvider theme={motionDisabledTheme}>
        <AntApp>
          <MemoryRouter initialEntries={initialEntries}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/work-orders" element={<WorkOrdersPage />} />
                <Route path="/work-orders/:id" element={<WorkOrdersPage />} />
              </Route>
              <Route path="/login" element={<div>Login Page</div>} />
            </Routes>
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  );

  return result;
}

// WRH-75: every row action now lives behind a per-row kebab (3-dots) menu
// instead of an inline button - opens the menu for the row matching
// `reference` (unique per WO, unlike job_name) and clicks the item with
// `actionName`. AntD's Dropdown menu items render with role="menuitem".
export async function openRowActionMenu(
  user: ReturnType<typeof userEvent.setup>,
  reference: string,
) {
  // A function matcher (not `new RegExp(...)`, which
  // eslint-plugin-security's detect-non-literal-regexp flags even for a
  // test-only, never-untrusted input like this) anchored so e.g. "WO-1"
  // doesn't also match a "WO-1-S1" supplementary row's accessible name,
  // which starts with the same prefix.
  const row = await screen.findByRole('row', {
    name: (accessibleName) =>
      accessibleName === reference || accessibleName.startsWith(`${reference} `),
    hidden: true,
  });
  await user.click(within(row).getByRole('button', { hidden: true }));
  // AntD's Dropdown menu (role="menu") is a portal sibling of the sidebar
  // nav's own always-mounted Menu (also role="menu") - the most recently
  // opened one is the last match, same "last match wins" trick
  // selectProductTypeForLineItem below uses for stale AntD portal nodes.
  const menus = await screen.findAllByRole('menu', { hidden: true });
  const menu = menus.at(-1);
  if (!menu) {
    throw new Error('No open row action menu found');
  }
  return menu;
}

export async function clickRowAction(
  user: ReturnType<typeof userEvent.setup>,
  reference: string,
  actionName: string | RegExp,
) {
  const menu = await openRowActionMenu(user, reference);
  // Clicks the item's own visible text, not the surrounding `role="menuitem"`
  // `<li>` - the Close action's item has no onClick of its own (a nested
  // Popconfirm owns the click - see WorkOrdersPage's own comment), and a
  // click event only bubbles up to ancestors, never down into a
  // descendant, so clicking the `<li>` itself would silently miss it.
  // Scoped to this menu - a still-mounted (but closed, per AntD/rc-motion
  // in jsdom - see WorkOrdersPage.return.test.tsx's own comment on this)
  // modal elsewhere on the page can carry the exact same label text (e.g.
  // "Return" is both a kebab action and that modal's own submit button).
  await user.click(await within(menu).findByText(actionName));
}

export async function fillExpectedDateOut(user: ReturnType<typeof userEvent.setup>, value: string) {
  // {Enter} confirms the typed date and closes only the DatePicker's own
  // popup panel - {Escape} would bubble up and close the whole Modal too,
  // since AntD's Modal also listens for Escape to cancel.
  const dateInput = screen.getByLabelText(/expected date out|تاريخ الخروج المتوقع/i);
  await user.type(dateInput, `${value}{Enter}`);
}

export async function selectProductTypeForLineItem(
  user: ReturnType<typeof userEvent.setup>,
  lineItemIndex: number,
  name: string,
) {
  const dialog = screen.getByRole('dialog', { hidden: true });
  const combobox = within(dialog).getAllByRole('combobox', { hidden: true }).at(lineItemIndex);
  if (!combobox) {
    throw new Error(`No combobox at index ${lineItemIndex}`);
  }
  await user.click(combobox);
  // AntD keeps earlier dropdowns' option nodes in the DOM (hidden) after
  // close, so a plain getByTitle can match a stale one too once a second
  // line item's dropdown has opened - the freshly opened dropdown's portal
  // is the most recently appended one, so its option is the last match.
  const option = screen.getAllByTitle(name).at(-1);
  if (!option) {
    throw new Error(`No option found for ${name}`);
  }
  await user.click(option);
}
