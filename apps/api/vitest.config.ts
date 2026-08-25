import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    env: {
      JWT_ACCESS_SECRET: "test-jwt-access-secret-32chars!!",
      CORS_ORIGINS: "http://localhost:5173",
      NODE_ENV: "test",
      LOOP_MEMORY_STORE: "1",
    },
  },
});
