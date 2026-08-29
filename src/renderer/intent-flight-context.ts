// SPDX-License-Identifier: Apache-2.0

"use client";

import React from "react";

/**
 * True while createNCRuntime is awaiting a handler. NCButton reads this
 * to disable itself (spec Open Question 2: silent drop is not acceptable).
 */
export const IntentFlightContext = React.createContext(false);

export const FocusFieldContext = React.createContext<{
  setFocusedId: (id: string | null) => void;
}>({ setFocusedId: () => {} });
