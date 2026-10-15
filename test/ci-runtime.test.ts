import assert from "node:assert/strict";
import test from "node:test";

const { selectAndroidRuntime } = await import(
  new URL("../../scripts/android-ci-runtime.mjs", import.meta.url).href
);

test("Windows uses hardware acceleration when its probe succeeds", () => {
  assert.deepEqual(selectAndroidRuntime("win32", 0), {
    systemImage: "system-images;android-30;google_apis;x86_64",
    acceleration: "on"
  });
});
for (const status of [1, null]) {
  test(`Windows selects a lightweight software image for failed probe ${status}`, () => {
    assert.deepEqual(selectAndroidRuntime("win32", status), {
      systemImage: "system-images;android-28;default;x86",
      acceleration: "off"
    });
  });
}
test("Linux keeps the API 35 image and KVM requirement", () => {
  assert.equal(selectAndroidRuntime("linux", undefined).acceleration, "on");
  assert.match(selectAndroidRuntime("linux", undefined).systemImage, /android-35/);
});
test("unsupported hosted operating systems fail before emulator work", () => {
  assert.throws(() => selectAndroidRuntime("darwin", 0), /Unsupported hosted/);
});
