import assert from "node:assert/strict";
import test from "node:test";
import { AppiumClient } from "../../src/utils/appium-client.js";
import { startMockAppium } from "../helpers.js";

for (const state of ["hidden", "visible", "unsupported", "invalid", "stuck"]) {
  test(`keyboard dismissal handles ${state} without blind taps or back actions`, async () => {
    let hides = 0;
    const mock = await startMockAppium({
      respond: (request) => {
        if (request.path.endsWith("/is_keyboard_shown")) {
          if (state === "unsupported") {
            return new Response(
              JSON.stringify({ value: { error: "unknown command", message: "Unsupported" } }),
              { status: 404 }
            );
          }
          const value =
            state === "invalid" ? null : state === "stuck" || (state === "visible" && hides === 0);
          return new Response(JSON.stringify({ value }));
        }
        if (request.path.endsWith("/hide_keyboard")) {
          hides += 1;
          return new Response(JSON.stringify({ value: null }));
        }
        return undefined;
      }
    });
    try {
      const result = new AppiumClient({ serverUrl: mock.serverUrl }).hideKeyboard("s1");
      if (state === "hidden" || state === "visible") {
        assert.deepEqual(await result, { hidden: true, changed: state === "visible" });
      } else {
        await assert.rejects(
          result,
          state === "stuck"
            ? /remains visible/
            : state === "invalid"
              ? /Invalid keyboard/
              : /unknown command/
        );
      }
      assert.equal(hides, state === "visible" || state === "stuck" ? 1 : 0);
      assert.ok(
        mock.requests.every(
          (request) => !request.path.endsWith("/back") && !request.path.endsWith("/click")
        )
      );
    } finally {
      await mock.close();
    }
  });
}

test("session health uses the active source endpoint instead of deprecated session metadata", async () => {
  const mock = await startMockAppium();
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    assert.equal((await client.sessionHealth("s1")).healthy, true);
    assert.equal((await client.sessionHealth("missing")).healthy, false);
    assert.ok(
      !mock.requests.some((request) => request.method === "GET" && request.path === "/session/s1")
    );
  } finally {
    mock.close();
  }
});

test("AppiumClient focuses and reacquires a Flutter field before clearing and typing", async () => {
  let focused = false;
  let typed = false;
  const mock = await startMockAppium({
    respond: (request) => {
      if (request.path === "/session/s1/element") {
        return new Response(
          JSON.stringify({
            value: {
              "element-6066-11e4-a52e-4f735466cecf": focused ? "focused-field" : "unfocused-field"
            }
          })
        );
      }
      if (request.path === "/session/s1/element/unfocused-field/click") {
        focused = true;
        return new Response(JSON.stringify({ value: null }));
      }
      if (request.path === "/session/s1/element/focused-field/value") {
        typed = focused;
        return new Response(JSON.stringify({ value: null }));
      }
      return undefined;
    }
  });
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    await client.fillText("s1", { strategy: "text", value: "Password" }, "fixture");
    assert.equal(typed, true);
    assert.ok(
      mock.requests.some((request) => request.path === "/session/s1/element/focused-field/clear")
    );
    assert.equal(
      mock.requests.some((request) => request.path === "/session/s1/element/unfocused-field/value"),
      false
    );
  } finally {
    mock.close();
  }
});

for (const failure of ["transient-stale", "permanent-stale", "other-error"]) {
  test(`AppiumClient text entry handles ${failure} with bounded recovery`, async () => {
    let attempts = 0;
    const mock = await startMockAppium({
      respond: (request) => {
        if (request.path === "/session/s1/element") {
          return new Response(
            JSON.stringify({
              value: {
                "element-6066-11e4-a52e-4f735466cecf": attempts ? "focused-field" : "initial-field"
              }
            })
          );
        }
        if (request.path.endsWith("/value")) {
          attempts += 1;
          const failed = failure !== "transient-stale" || attempts === 1;
          return new Response(
            JSON.stringify({
              value: failed
                ? {
                    error:
                      failure === "other-error" ? "invalid argument" : "stale element reference",
                    message: "Fixture typing error"
                  }
                : null
            }),
            { status: failed ? 400 : 200 }
          );
        }
        return undefined;
      }
    });
    try {
      const client = new AppiumClient({ serverUrl: mock.serverUrl });
      const fill = client.fillText("s1", { strategy: "text", value: "Password" }, "fixture", {
        clearFirst: false
      });
      if (failure === "transient-stale") {
        await fill;
        assert.ok(
          mock.requests.some(
            (request) => request.path === "/session/s1/element/focused-field/value"
          )
        );
      } else {
        await assert.rejects(
          fill,
          failure === "other-error" ? /invalid argument/ : /stale element reference/
        );
      }
      assert.equal(attempts, failure === "other-error" ? 1 : 2);
    } finally {
      mock.close();
    }
  });
}

test("AppiumClient locates and taps Flutter Android inputs exposed only by their hint", async () => {
  const mock = await startMockAppium({
    respond: (request) => {
      if (!request.path.endsWith("/element")) return undefined;
      const found = String(request.body.value).includes("@hint='E-posta'");
      return new Response(
        JSON.stringify({
          value: found
            ? { "element-6066-11e4-a52e-4f735466cecf": "email-hint" }
            : { error: "no such element", message: "Input has only a hint" }
        }),
        { status: found ? 200 : 404 }
      );
    }
  });
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    const input = await client.findElement("s1", { strategy: "text", value: "E-posta" });
    assert.equal(input, "email-hint");
    const target = await client.findTextTapTarget("s1", "E-posta", "exact");
    assert.equal(target.elementId, "email-hint");
    assert.equal(target.matchedAttribute, "hint");
    assert.equal(target.matchType, "exact:hint:clickable");
    await client.typeText("s1", input, "invalid");
    assert.ok(
      mock.requests.some((request) => request.path === "/session/s1/element/email-hint/value")
    );
  } finally {
    mock.close();
  }
});

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

test("AppiumClient maps native mobile locator strategy names to WebDriver strategy names", async () => {
  const mock = await startMockAppium();
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    await client.findElement("s1", {
      strategy: "android uiautomator",
      value: 'new UiSelector().className("android.widget.EditText").instance(0)'
    });
    const request = mock.requests.at(-1);
    assert.equal(request?.body.using, "-android uiautomator");
  } finally {
    await mock.close();
  }
});

test("AppiumClient wraps direct W3C capabilities in the capabilities envelope", async () => {
  const mock = await startMockAppium();
  try {
    const client = new AppiumClient({ serverUrl: mock.serverUrl });
    await client.createSession({
      alwaysMatch: { platformName: "Android", "appium:automationName": "UiAutomator2" },
      firstMatch: [{}]
    });
    assert.deepEqual(mock.requests.at(-1)?.body, {
      capabilities: {
        alwaysMatch: { platformName: "Android", "appium:automationName": "UiAutomator2" },
        firstMatch: [{}]
      }
    });
  } finally {
    await mock.close();
  }
});
