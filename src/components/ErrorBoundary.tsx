import * as React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
};

type ErrorBoundaryState = {
  hasError: boolean;
};

/**
 * Prevents a single render-time crash from blanking the entire app.
 * This is especially useful when a dependency throws during render.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    this.props.onError?.(error, info);
    // Keep logging for debugging in preview.
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }

    return this.props.children;
  }
}
