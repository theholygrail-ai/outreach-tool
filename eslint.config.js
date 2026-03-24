import js from "@eslint/js";
import globals from "globals";

const ignores = [
  "**/node_modules/**",
  "**/dist/**",
  "**/cdk.out/**",
  "**/.tmp-bundle/**",
  "**/coverage/**",
];

export default [
  { ignores },
  js.configs.recommended,
  {
    files: ["packages/web/src/**/*.js", "packages/api/src/**/*.js", "packages/shared/src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
];
