import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat config for the SPA. The previous version declared .ts/.tsx files but
 * left the default JS parser in place, so every TypeScript file failed to
 * parse and the lint gate reported nothing real.
 */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "supabase/**",
      "packages/**",
      "apps/**",
      "scripts/**",
      "**/*.config.js",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Underscore prefix marks an argument kept only for signature parity
      // between the mock and Supabase data planes.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-undef": "off",
    },
  },
];
