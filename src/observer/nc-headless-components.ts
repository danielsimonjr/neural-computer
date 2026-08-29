// SPDX-License-Identifier: Apache-2.0

import type { HeadlessComponent, HeadlessRegistry } from "@json-ui/headless";
import type { JSONValue, UIElement } from "@json-ui/core";

/**
 * Six headless components mirroring NC's React input-components surface.
 * JSON-UI's HeadlessComponent is typed as a POSITIONAL function
 * (element, ctx, children) — not destructured.
 *
 * Input components read their value from ctx.staging (a ReadonlyStagingView)
 * and bake it into the NormalizedNode as `currentValue` so the LLM observer
 * can see what the user has typed. Omitted entirely when staging has no
 * value for the id — makes the NormalizedNode strictly smaller for untouched
 * fields, which the LLM benefits from when trees are large.
 *
 * Action params on Button are copied from element.props. Whether JSON-UI's
 * headless walker pre-resolves DynamicValue entries before invoking this
 * function is an upstream concern; this component does not resolve them.
 */

function isVisible(element: UIElement): boolean {
  return (element.props as { visible?: boolean }).visible !== false;
}

function withCurrentValue(
  props: Record<string, JSONValue>,
  id: string,
  ctx: {
    staging: { has: (k: string) => boolean; get: (k: string) => unknown };
  },
): Record<string, JSONValue> {
  if (!ctx.staging.has(id)) return props;
  const value = ctx.staging.get(id);
  if (value === undefined) return props;
  return { ...props, currentValue: value as JSONValue };
}

const NCContainerHeadless: HeadlessComponent = (element, _ctx, children) => {
  const direction = (element.props as { direction?: string }).direction;
  const props: Record<string, JSONValue> = {};
  if (direction) props.direction = direction;
  return {
    type: "Container",
    key: element.key,
    props,
    children,
    meta: { visible: isVisible(element) },
  };
};

const NCTextHeadless: HeadlessComponent = (element) => ({
  type: "Text",
  key: element.key,
  props: { content: (element.props as { content: string }).content },
  children: [],
  meta: { visible: isVisible(element) },
});

const NCTextFieldHeadless: HeadlessComponent = (element, ctx) => {
  const raw = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
    multiline?: boolean;
    inputType?: string;
  };
  const props: Record<string, JSONValue> = {
    id: raw.id,
    label: raw.label,
  };
  if (raw.placeholder !== undefined) props.placeholder = raw.placeholder;
  if (raw.error !== undefined) props.error = raw.error;
  if (raw.multiline !== undefined) props.multiline = raw.multiline;
  if (raw.inputType !== undefined) props.inputType = raw.inputType;
  return {
    type: "TextField",
    key: element.key,
    props: withCurrentValue(props, raw.id, ctx),
    children: [],
    meta: { visible: isVisible(element) },
  };
};

const NCCheckboxHeadless: HeadlessComponent = (element, ctx) => {
  const raw = element.props as { id: string; label: string };
  const props: Record<string, JSONValue> = { id: raw.id, label: raw.label };
  return {
    type: "Checkbox",
    key: element.key,
    props: withCurrentValue(props, raw.id, ctx),
    children: [],
    meta: { visible: isVisible(element) },
  };
};

const NCSelectHeadless: HeadlessComponent = (element, ctx) => {
  const raw = element.props as {
    id: string;
    label: string;
    options: string[];
    error?: string;
  };
  const props: Record<string, JSONValue> = {
    id: raw.id,
    label: raw.label,
    options: raw.options,
  };
  if (raw.error !== undefined) props.error = raw.error;
  return {
    type: "Select",
    key: element.key,
    props: withCurrentValue(props, raw.id, ctx),
    children: [],
    meta: { visible: isVisible(element) },
  };
};

const NCButtonHeadless: HeadlessComponent = (element) => {
  const props = element.props as Record<string, JSONValue>;
  return {
    type: "Button",
    key: element.key,
    props,
    children: [],
    meta: { visible: isVisible(element) },
  };
};

export const ncHeadlessRegistry: HeadlessRegistry = {
  Container: NCContainerHeadless,
  Text: NCTextHeadless,
  TextField: NCTextFieldHeadless,
  Checkbox: NCCheckboxHeadless,
  Select: NCSelectHeadless,
  Button: NCButtonHeadless,
};
