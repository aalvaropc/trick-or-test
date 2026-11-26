import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/trick-or-test/",
  plugins: [react()],
});
