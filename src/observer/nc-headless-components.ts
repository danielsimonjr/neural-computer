import type {
  HeadlessComponent,
  HeadlessRegistry,
} from "@json-ui/headless";
import type { JSONValue } from "@json-ui/core";

/**
 * Five headless components mirroring NC's React input-components surface.
 * JSON-UI's HeadlessComponent is typed as a POSITIONAL function
 * (element, ctx, children) — not destructured. See
 * @json-ui/headless/registry.ts:10-14.
 *
 * Input components read their value from ctx.staging (a ReadonlyStagingView)
 * and bake it into the NormalizedNode as `currentValue` so the LLM observer
 * can see what the user has typed. Omitted entirely when staging has no
 * value for the id — makes the NormalizedNode strictly smaller for untouched
 * fields, which the LLM benefits from when trees are large.
 */

const NCContainerHeadless: HeadlessComponent = (element, _ctx, children) => ({
  type: "Container",
  key: element.key,
  props: {},
  children,
  meta: { visible: true },
});

const NCTextHeadless: HeadlessComponent = (element) => ({
  type: "Text",
  key: element.key,
  props: { content: (element.props as { content: string }).content },
  children: [],
  meta: { visible: true },
});

const NCTextFieldHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as {
    id: string;
    label: string;
    placeholder?: string;
    error?: string;
  };
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "TextField",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCCheckboxHeadless: HeadlessComponent = (element, ctx) => {
  const props = element.props as { id: string; label: string };
  const value = ctx.staging.has(props.id) ? ctx.staging.get(props.id) : undefined;
  return {
    type: "Checkbox",
    key: element.key,
    props: value === undefined ? props : { ...props, currentValue: value },
    children: [],
    meta: { visible: true },
  };
};

const NCButtonHeadless: HeadlessComponent = (element) => {
  // action.params arrive pre-resolved by headless context's
  // resolveActionWithStaging pass — literal values, not DynamicValue refs.
  // Cast to Record<string, JSONValue> satisfies NormalizedNode.props constraint.
  const props = element.props as Record<string, JSONValue>;
  return {
    type: "Button",
    key: element.key,
    props,
    children: [],
    meta: { visible: true },
  };
};

export const ncHeadlessRegistry: HeadlessRegistry = {
  Container: NCContainerHeadless,
  Text: NCTextHeadless,
  TextField: NCTextFieldHeadless,
  Checkbox: NCCheckboxHeadless,
  Button: NCButtonHeadless,
};
