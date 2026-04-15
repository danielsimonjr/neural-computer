import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  DataProvider,
  StagingProvider,
  ActionProvider,
} from "@json-ui/react";
import { createStagingBuffer } from "@json-ui/core";
import {
  NCTextField,
  NCCheckbox,
  NCButton,
  NCContainer,
  NCText,
} from "./input-components";

function Wrapper({
  children,
  buffer = createStagingBuffer(),
}: {
  children: React.ReactNode;
  buffer?: ReturnType<typeof createStagingBuffer>;
}) {
  return (
    <DataProvider initialData={{}}>
      <StagingProvider store={buffer}>
        <ActionProvider>{children}</ActionProvider>
      </StagingProvider>
    </DataProvider>
  );
}

describe("NCTextField", () => {
  it("renders a text input bound to the staging buffer by id", () => {
    const buffer = createStagingBuffer();
    render(
      <Wrapper buffer={buffer}>
        <NCTextField
          element={{
            key: "r",
            type: "TextField",
            props: { id: "email", label: "Email" },
          }}
        />
      </Wrapper>,
    );
    const input = screen.getByLabelText("Email") as HTMLInputElement;
    expect(input.value).toBe("");
    fireEvent.change(input, { target: { value: "alice@example.com" } });
    expect(buffer.get("email")).toBe("alice@example.com");
  });

  it("reflects a pre-existing staging value on initial render", () => {
    const buffer = createStagingBuffer();
    buffer.set("name", "Alice");
    render(
      <Wrapper buffer={buffer}>
        <NCTextField
          element={{
            key: "r",
            type: "TextField",
            props: { id: "name", label: "Name" },
          }}
        />
      </Wrapper>,
    );
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("Alice");
  });
});

describe("NCCheckbox", () => {
  it("toggles a boolean staging field", () => {
    const buffer = createStagingBuffer();
    render(
      <Wrapper buffer={buffer}>
        <NCCheckbox
          element={{
            key: "r",
            type: "Checkbox",
            props: { id: "agree", label: "I agree" },
          }}
        />
      </Wrapper>,
    );
    const checkbox = screen.getByLabelText("I agree") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(buffer.get("agree")).toBe(true);
  });
});

describe("NCContainer", () => {
  it("renders its children", () => {
    render(
      <Wrapper>
        <NCContainer
          element={{
            key: "r",
            type: "Container",
            props: {},
            children: ["a"],
          }}
        >
          <span data-testid="child">hello</span>
        </NCContainer>
      </Wrapper>,
    );
    expect(screen.getByTestId("child")).toBeDefined();
  });
});

describe("NCText", () => {
  it("renders the content prop", () => {
    render(
      <Wrapper>
        <NCText
          element={{
            key: "r",
            type: "Text",
            props: { content: "hello world" },
          }}
        />
      </Wrapper>,
    );
    expect(screen.getByText("hello world")).toBeDefined();
  });
});

describe("NCButton", () => {
  it("renders the label prop", () => {
    render(
      <Wrapper>
        <NCButton
          element={{
            key: "r",
            type: "Button",
            props: { label: "Submit" },
          }}
        />
      </Wrapper>,
    );
    expect(screen.getByRole("button", { name: "Submit" })).toBeDefined();
  });
});
