import assert from "node:assert/strict";
import test from "node:test";
import { AppiumClient } from "../../src/utils/appium-client.js";
import { startMockAppium } from "../helpers.js";

test("AppiumClient uses exact-first tap matching before contains fallback", async () => {
  const mock = await startMockAppium();
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    const target = await client.findTextTapTarget("s1", "Giriş Yap", "auto");
    assert.equal(target.elementId, "login");
    assert.equal(target.matchType, "exact:content-desc:clickable");
    assert.match(String(mock.requests[0]?.body.value), /@content-desc='Giriş Yap'/);
  } finally {
    await mock.close();
  }
});
