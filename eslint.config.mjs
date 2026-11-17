import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// `_` names and rest siblings (`const { op, ...patch } = command`) may go unused.
const unusedOptions = {
  argsIgnorePattern: "^_",
  caughtErrors: "none",
  ignoreRestSiblings: true,
};

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "build/",
      "artifacts/",
      "release/",
      "video/",
      ".tools/",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  {
    // Renderer: React + TypeScript in the browser sandbox.
    files: ["ui/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    // Electron main/preload, build scripts and the screenshot bridge.
    files: ["desktop/**/*.cjs", "scripts/**/*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    // Strings passed to executeJavaScript run in the page, but these files
    // also touch DOM types in preload and visual scripts.
    files: [
      "desktop/preload.cjs",
      "scripts/*preload.cjs",
      "scripts/*visual*.cjs",
      "scripts/screenshot.cjs",
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Unused values are already errors in tsc (noUnusedLocals/Parameters);
    // keep the lint rule consistent with that and allow `_` placeholders.
    rules: { "no-unused-vars": ["error", unusedOptions] },
  },
  {
    files: ["ui/**/*.{ts,tsx}", "vite.config.ts"],
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", unusedOptions],
    },
  },
);
