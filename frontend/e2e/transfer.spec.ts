import { test, expect } from "@playwright/test";

test("sender creates a room, receiver joins, sender uploads a file, receiver gets it", async ({
  browser,
}) => {
  const sender = await browser.newPage();
  const receiver = await browser.newPage();

  await test.step("sender creates a room", async () => {
    await sender.goto("/");
    await sender.getByRole("button", { name: "Create room" }).click();
    await sender.waitForURL(/\/room\//);
  });

  const roomId = sender.url().split("/").pop()!;

  await test.step("receiver joins the room", async () => {
    await receiver.goto(`/room/${roomId}`);
  });

  await test.step("both clients connect", async () => {
    await expect(sender.getByText("Connected", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(receiver.getByText("Connected", { exact: true })).toBeVisible({ timeout: 15000 });
  });

  await test.step("sender uploads a file", async () => {
    const fileInput = sender.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "holo-e2e-test.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Hello from Holo e2e test!"),
    });
  });

  await test.step("file appears on receiver", async () => {
    await expect(receiver.getByText("holo-e2e-test.txt")).toBeVisible({ timeout: 15000 });
    await expect(receiver.getByText("Received")).toBeVisible({ timeout: 15000 });
  });

  await sender.close();
  await receiver.close();
});
