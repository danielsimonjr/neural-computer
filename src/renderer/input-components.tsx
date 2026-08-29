// SPDX-License-Identifier: Apache-2.0

"use client";

import React from "react";
import { useStagingField, useActions } from "@json-ui/react";
import type { UIElement } from "@json-ui/core";
import { NC_STRING_MAX_LENGTH } from "../catalog/limits";
import {
  FocusFieldContext,
  IntentFlightContext,
} from "./intent-flight-context";

/**
 * Props shape used by all NC-authored React components. Matches the
 * ComponentRegistry contract of @json-ui/react: the renderer passes
 * the current element plus resolved children.
 *
 * Three ID namespaces (do not conflate them):
 * - React `key` (owned by JSON-UI's Renderer when mapping children)
 * - `element.key` stamped as `data-key` for tests / debug
 * - staging field `id` (`data-field-id`) that keys the staging buffer
 */
export interface NCComponentProps {
  element: UIElement;
  children?: React.ReactNode;
}

export const NCContainer = React.memo(function NCContainer({
  element,
  children,
}: NCComponentProps) {
  const direction = (element.props as { direction?: "row" | "column" })
    .direction;
  const hidden = (element.props as { visible?: boolean }).visible === false;
  if (hidden) return null;
  return (
    <div
      data-key={element.key}
      style={{
        display: "flex",
        flexDirection: direction === "row" ? "row" : "column",
        gap: "0.5rem",
      }}
    >
      {children}
    </div>
  );
});

export const NCText = React.memo(function NCText({
  element,
}: NCComponentProps) {
  const props = element.props as { content?: string; visible?: boolean };
  if (props.visible === false) return null;
  return <p data-key={element.key}>{props.content ?? ""}</p>;
});

export const NCTextField = React.memo(function NCTextField({
  element,
}: NCComponentProps) {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
    multiline?: boolean;
    inputType?: "text" | "email" | "password" | "number";
    visible?: boolean;
  };
  const { setFocusedId } = React.useContext(FocusFieldContext);
  const [value, setValue] = useStagingField<string>(props.id);
  const inputId = `nc-field-${props.id}`;
  const errorId = `nc-field-error-${props.id}`;
  const invalid = props.error !== undefined;
  if (props.visible === false) return null;

  const shared = {
    id: inputId,
    "data-field-id": props.id,
    value: value ?? "",
    placeholder: props.placeholder,
    maxLength: NC_STRING_MAX_LENGTH,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errorId : undefined,
    onFocus: () => setFocusedId(props.id),
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setValue(e.target.value.slice(0, NC_STRING_MAX_LENGTH));
    },
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.key !== "Enter" || props.multiline) return;
      e.preventDefault();
      const form = e.currentTarget.form;
      const submit = form?.querySelector("[data-nc-action='submit_form']");
      if (submit instanceof HTMLButtonElement && !submit.disabled)
        submit.click();
    },
  };

  return (
    <div data-key={element.key}>
      <label htmlFor={inputId}>{props.label}</label>
      {props.multiline ? (
        <textarea {...shared} rows={4} />
      ) : (
        <input {...shared} type={props.inputType ?? "text"} />
      )}
      {invalid && (
        <span id={errorId} role="alert">
          {props.error}
        </span>
      )}
    </div>
  );
});

export const NCCheckbox = React.memo(function NCCheckbox({
  element,
}: NCComponentProps) {
  const props = element.props as {
    id: string;
    label: string;
    visible?: boolean;
  };
  const { setFocusedId } = React.useContext(FocusFieldContext);
  const [value, setValue] = useStagingField<boolean>(props.id);
  const inputId = `nc-field-${props.id}`;
  if (props.visible === false) return null;
  return (
    <div data-key={element.key}>
      <input
        id={inputId}
        data-field-id={props.id}
        type="checkbox"
        checked={value === true}
        onFocus={() => setFocusedId(props.id)}
        onChange={(e) => setValue(e.target.checked)}
      />
      <label htmlFor={inputId}>{props.label}</label>
    </div>
  );
});

export const NCSelect = React.memo(function NCSelect({
  element,
}: NCComponentProps) {
  const props = element.props as {
    id: string;
    label: string;
    options: string[];
    error?: string;
    visible?: boolean;
  };
  const { setFocusedId } = React.useContext(FocusFieldContext);
  const [value, setValue] = useStagingField<string>(props.id);
  const inputId = `nc-field-${props.id}`;
  const errorId = `nc-field-error-${props.id}`;
  const invalid = props.error !== undefined;
  if (props.visible === false) return null;
  const options = props.options ?? [];
  return (
    <div data-key={element.key}>
      <label htmlFor={inputId}>{props.label}</label>
      <select
        id={inputId}
        data-field-id={props.id}
        value={value ?? ""}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? errorId : undefined}
        onFocus={() => setFocusedId(props.id)}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="" disabled>
          {props.label}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {invalid && (
        <span id={errorId} role="alert">
          {props.error}
        </span>
      )}
    </div>
  );
});

export const NCButton = React.memo(function NCButton({
  element,
}: NCComponentProps) {
  const props = element.props as {
    label: string;
    visible?: boolean;
    action?: {
      name: string;
      params?: Record<string, unknown>;
    };
  };
  const { execute } = useActions();
  const inFlight = React.useContext(IntentFlightContext);
  const onClick = React.useCallback(() => {
    if (!props.action) return;
    execute({
      name: props.action.name,
      params: props.action.params,
    }).catch((err) => {
      console.error("[NC] NCButton execute threw:", err);
    });
  }, [execute, props.action]);
  if (props.visible === false) return null;
  return (
    <button
      type="button"
      data-key={element.key}
      data-nc-action={props.action?.name}
      onClick={onClick}
      disabled={inFlight}
      aria-busy={inFlight || undefined}
    >
      {props.label}
    </button>
  );
});
