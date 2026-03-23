import { defineConfig } from "vitest/config";
import { commonExclude, sharedConfig, slowInclude } from "./vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: slowInclude,
    exclude: [...commonExclude],
  },
});
