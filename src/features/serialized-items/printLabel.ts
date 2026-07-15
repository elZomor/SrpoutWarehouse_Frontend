import { getSerializedItemQrCodeUrl } from './api';
import type { SerializedItem } from './types';

// Built via DOM APIs (not document.write with interpolated markup) so a
// serial number containing HTML-special characters can never inject markup
// into the print window - serial_number/product_type_name always land via
// textContent, never innerHTML.
export function printSerializedItemLabel(item: SerializedItem): void {
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  if (!printWindow) {
    return;
  }

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
  `;
  printWindow.document.head.appendChild(style);

  const label = printWindow.document.createElement('div');
  label.className = 'label';

  const img = printWindow.document.createElement('img');
  img.src = getSerializedItemQrCodeUrl(item.id);
  img.alt = 'QR code';
  label.appendChild(img);

  const text = printWindow.document.createElement('div');
  const serialNumberEl = printWindow.document.createElement('div');
  serialNumberEl.className = 'serial-number';
  serialNumberEl.textContent = item.serial_number;
  const productTypeNameEl = printWindow.document.createElement('div');
  productTypeNameEl.className = 'product-type-name';
  productTypeNameEl.textContent = item.product_type_name;
  text.appendChild(serialNumberEl);
  text.appendChild(productTypeNameEl);
  label.appendChild(text);

  printWindow.document.body.appendChild(label);

  img.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
