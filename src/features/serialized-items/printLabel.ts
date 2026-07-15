import { getSerializedItemQrCodeUrl } from './api';
import type { SerializedItem } from './types';

export interface PrintSerializedItemLabelText {
  qrAlt: string;
  loadError: string;
}

// Built via DOM APIs (not document.write with interpolated markup) so a
// serial number containing HTML-special characters can never inject markup
// into the print window - serial_number/product_type_name always land via
// textContent, never innerHTML. Caller-supplied, already-translated strings
// (text) rather than useTranslation() here, since this function builds a
// document outside the React tree and has no hook access.
export function printSerializedItemLabel(
  item: SerializedItem,
  text: PrintSerializedItemLabelText,
): void {
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  if (!printWindow) {
    return;
  }
  // Severs the popup's back-reference to this tab (reverse-tabnabbing
  // defense-in-depth) - the equivalent of the replaced <a rel="noreferrer">
  // link's implicit noopener. Passing 'noopener' in window.open's own
  // features string would do this too, but then browsers return null
  // instead of a usable window reference, which this function needs.
  printWindow.opener = null;

  printWindow.document.title = item.serial_number;

  const style = printWindow.document.createElement('style');
  style.textContent = `
    @page { size: 7cm 4cm; margin: 0; }
    body { margin: 0; font-family: sans-serif; }
    .label {
      width: 7cm;
      height: 4cm;
      box-sizing: border-box;
      padding: 0.25cm;
      display: flex;
      align-items: center;
      gap: 0.3cm;
    }
    .label img { width: 3cm; height: 3cm; flex-shrink: 0; }
    .label .serial-number { font-weight: bold; font-size: 10pt; }
    .label .product-type-name { font-size: 10pt; }
    .label .load-error { font-size: 10pt; color: #cc0000; }
  `;
  printWindow.document.head.appendChild(style);

  const label = printWindow.document.createElement('div');
  label.className = 'label';

  const img = printWindow.document.createElement('img');
  img.src = getSerializedItemQrCodeUrl(item.id);
  img.alt = text.qrAlt;
  label.appendChild(img);

  const serialNumberEl = printWindow.document.createElement('div');
  serialNumberEl.className = 'serial-number';
  serialNumberEl.textContent = item.serial_number;
  label.appendChild(serialNumberEl);

  const productTypeNameEl = printWindow.document.createElement('div');
  productTypeNameEl.className = 'product-type-name';
  productTypeNameEl.textContent = item.product_type_name;
  label.appendChild(productTypeNameEl);

  printWindow.document.body.appendChild(label);

  img.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
  img.onerror = () => {
    const errorEl = printWindow.document.createElement('div');
    errorEl.className = 'load-error';
    errorEl.textContent = text.loadError;
    img.replaceWith(errorEl);
  };
}
