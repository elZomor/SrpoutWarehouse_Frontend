import { describe, expect, it, vi } from 'vitest';
import { printSerializedItemLabel } from './printLabel';
import type { SerializedItem } from './types';

// printSerializedItemLabel was already extracted out of SerializedItemsPage
// but had no direct test - 2 of the 3 mount tests that exercised it
// indirectly (full page render + click) are replaced here with a direct
// call against a stubbed window, matching those tests' own fake-window
// shape (window.document.implementation.createHTMLDocument()). The third
// ("prints the QR label immediately after registering a new item") stays a
// mount test in SerializedItemsPage.test.tsx since it's proving the page
// wires a freshly-created item's id into the print call, not this
// function's own internals.

vi.mock('../../config/env', () => ({
  env: { VITE_API_BASE_URL: 'http://localhost:8000' },
}));

function makeSerializedItem(overrides: Partial<SerializedItem> = {}): SerializedItem {
  return {
    id: 1,
    serial: 'SN-042',
    serial_number: 'SN-042',
    product_type: 1,
    product_type_name: 'Bar LED Model A',
    status: 'available',
    last_work_order_reference: '',
    notes: '',
    ...overrides,
  };
}

function makeFakePrintWindow() {
  return {
    document: window.document.implementation.createHTMLDocument(),
    focus: vi.fn(),
    print: vi.fn(),
    opener: {},
  };
}

describe('printSerializedItemLabel', () => {
  it('builds the label with the QR image, serial number, and product type, and prints once the image loads', () => {
    const fakeWindow = makeFakePrintWindow();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as never);

    printSerializedItemLabel(makeSerializedItem(), { qrAlt: 'QR code', loadError: 'Failed' });

    expect(openSpy).toHaveBeenCalled();
    expect(fakeWindow.opener).toBeNull();
    const img = fakeWindow.document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('http://localhost:8000/api/serialized-items/1/qr-code/');
    expect(img?.getAttribute('alt')).toBe('QR code');
    expect(fakeWindow.document.body.textContent).toContain('SN-042');
    expect(fakeWindow.document.body.textContent).toContain('Bar LED Model A');

    img?.dispatchEvent(new Event('load'));
    expect(fakeWindow.focus).toHaveBeenCalled();
    expect(fakeWindow.print).toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('replaces the image with a fallback message when the QR image fails to load', () => {
    const fakeWindow = makeFakePrintWindow();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeWindow as never);

    printSerializedItemLabel(makeSerializedItem(), {
      qrAlt: 'QR code',
      loadError: 'Failed to load QR code',
    });

    const img = fakeWindow.document.querySelector('img');
    img?.dispatchEvent(new Event('error'));

    expect(fakeWindow.document.querySelector('img')).toBeNull();
    expect(fakeWindow.document.body.textContent).toContain('Failed to load QR code');
    expect(fakeWindow.print).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it('does nothing when the popup is blocked (window.open returns null)', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    expect(() =>
      printSerializedItemLabel(makeSerializedItem(), { qrAlt: 'QR code', loadError: 'Failed' }),
    ).not.toThrow();

    openSpy.mockRestore();
  });
});
