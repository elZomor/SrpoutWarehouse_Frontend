import { getBoxQrCodeUrl } from './api';
import type { Box } from './types';

export interface PrintBoxLabelText {
  qrAlt: string;
  loadError: string;
}

// Mirrors printSerializedItemLabel's identical DOM-built (not
// document.write with interpolated markup) approach - code/product_type_name
// always land via textContent, never innerHTML, so a box code containing
// HTML-special characters can't inject markup into the print window.
export function printBoxLabel(box: Box, text: PrintBoxLabelText): void {
  const printWindow = window.open('', '_blank', 'width=400,height=300');
  if (!printWindow) {
    return;
  }
  printWindow.opener = null;

  printWindow.document.title = box.code;

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
    .label .code { font-weight: bold; font-size: 10pt; }
    .label .product-type-name { font-size: 10pt; }
    .label .load-error { font-size: 10pt; color: #cc0000; }
  `;
  printWindow.document.head.appendChild(style);

  const label = printWindow.document.createElement('div');
  label.className = 'label';

  const img = printWindow.document.createElement('img');
  img.src = getBoxQrCodeUrl(box.id);
  img.alt = text.qrAlt;
  label.appendChild(img);

  const codeEl = printWindow.document.createElement('div');
  codeEl.className = 'code';
  codeEl.textContent = box.code;
  label.appendChild(codeEl);

  const productTypeNameEl = printWindow.document.createElement('div');
  productTypeNameEl.className = 'product-type-name';
  productTypeNameEl.textContent = box.product_type_name;
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
