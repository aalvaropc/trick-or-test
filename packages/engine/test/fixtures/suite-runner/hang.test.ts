import { it } from "vitest";

it("never finishes", async () => {
  await new Promise(() => {
    setInterval(() => {}, 1000);
  });
});
