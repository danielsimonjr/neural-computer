// SPDX-License-Identifier: Apache-2.0

"use client";

import React from "react";

interface NCErrorBoundaryProps {
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

interface NCErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render throws from NC components so a single bad cast cannot
 * unmount the host application.
 */
export class NCErrorBoundary extends React.Component<
  NCErrorBoundaryProps,
  NCErrorBoundaryState
> {
  state: NCErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): NCErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("[NC] Renderer crashed:", error);
    this.props.onError?.(error);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" data-nc-error="true">
          [NC] renderer crashed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
