import { defineConfig } from "vitest/config";
import { commonExclude, sharedConfig } from "./vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    exclude: [...commonExclude],
  },
});
