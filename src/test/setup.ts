import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia; antd's Form/Grid internals (Row/Col
// responsive breakpoints) call it on mount and throw without this polyfill.
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// jsdom doesn't implement ResizeObserver; antd's Modal (via rc-resize-observer)
// observes its content on mount and throws without this polyfill.
if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
