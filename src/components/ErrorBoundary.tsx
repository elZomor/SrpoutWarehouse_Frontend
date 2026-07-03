import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

interface Props extends PropsWithChildren {
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <p role="alert">Something went wrong.</p>;
    }

    return this.props.children;
  }
}
