import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans when Vitest globals are enabled, and they
// aren't here. Without this, every render in a file stacks up in the same
// document and any role-based query finds several matches instead of one.
afterEach(cleanup);
