import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { AppProviders } from './app/AppProviders';
import './i18n';

describe('App', () => {
  it('renders the dashboard welcome message', () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(
      screen.getByText(/Welcome to Sprout Warehouse|مرحبًا بك في سبروت للمخازن/),
    ).toBeInTheDocument();
  });
});
