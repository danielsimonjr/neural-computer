"use client";

import React from "react";
import { useStagingField, useActions } from "@json-ui/react";
import type { UIElement } from "@json-ui/core";

/**
 * Props shape used by all NC-authored React components. Matches the
 * ComponentRegistry contract of @json-ui/react: the renderer passes
 * the current element plus resolved children.
 */
export interface NCComponentProps {
  element: UIElement;
  children?: React.ReactNode;
}

export function NCContainer({ element, children }: NCComponentProps) {
  return <div data-key={element.key}>{children}</div>;
}

export function NCText({ element }: NCComponentProps) {
  const content = (element.props as { content: string }).content;
  return <p data-key={element.key}>{content}</p>;
}

export function NCTextField({ element }: NCComponentProps) {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
  };
  const [value, setValue] = useStagingField<string>(props.id);
  return (
    <label data-key={element.key}>
      {props.label}
      <input
        type="text"
        value={value ?? ""}
        placeholder={props.placeholder}
        onChange={(e) => setValue(e.target.value)}
      />
      {props.error !== undefined && <span role="alert">{props.error}</span>}
    </label>
  );
}

export function NCCheckbox({ element }: NCComponentProps) {
  const props = element.props as { id: string; label: string };
  const [value, setValue] = useStagingField<boolean>(props.id);
  return (
    <label data-key={element.key}>
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => setValue(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

export function NCButton({ element }: NCComponentProps) {
  const props = element.props as {
    label: string;
    action?: {
      name: string;
      // Params MUST be forwarded to execute — the catalog schema
      // declares them in `nc-catalog.ts`, and NC spec Invariants 6
      // and 11 both require them to reach the orchestrator intact.
      // A prior version of this file narrowed `action` to just
      // `{name}` and silently dropped the params, which the
      // April-15 Opus review caught before v1 ship.
      params?: Record<string, unknown>;
    };
  };
  const { execute } = useActions();
  const onClick = React.useCallback(() => {
    if (props.action) {
      // Forward both name AND params. The ActionProvider downstream
      // runs resolveActionWithStaging over the params, so DynamicValue
      // literals like `{path: "email"}` resolve against the shared
      // staging buffer before reaching the IntentEvent (Invariant 11).
      //
      // execute() returns Promise<void> and can reject when the
      // ActionProvider's onIntent throws (or when resolveActionWithStaging
      // itself throws on an unresolved DynamicValue). A bare `void`
      // silently swallows the rejection and surfaces as a click that
      // appears to do nothing — same failure mode the April-15 review
      // caught in NCRenderer.onIntent. Attach a .catch here too.
      execute({
        name: props.action.name,
        params: props.action.params,
      }).catch((err) => {
        console.error("[NC] NCButton execute threw:", err);
      });
    }
  }, [execute, props.action]);
  return (
    <button type="button" data-key={element.key} onClick={onClick}>
      {props.label}
    </button>
  );
}
