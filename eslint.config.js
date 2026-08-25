/** Minimal ESLint flat config so `pnpm lint` is not hollow. */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "supabase/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "off",
      "no-undef": "off",
    },
  },
];
