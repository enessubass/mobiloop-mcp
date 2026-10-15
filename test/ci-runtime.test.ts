import assert from "node:assert/strict";
import test from "node:test";

const { selectAndroidRuntime, hasReadyAndroidServices } = await import(
  new URL("../../scripts/android-ci-runtime.mjs", import.meta.url).href
);

test("guest readiness requires core packages and the unlocked system user", () => {
  const packages = "package:android versionCode:30\r\n";
  const unlocked = "UserInfo{0:Owner:13}\r\n    State: RUNNING_UNLOCKED\r\n";
  assert.equal(hasReadyAndroidServices(packages, unlocked), true);
  assert.equal(hasReadyAndroidServices("", unlocked), false);
  assert.equal(
    hasReadyAndroidServices(packages, unlocked.replace("RUNNING_UNLOCKED", "RUNNING_LOCKED")),
    false
  );
  assert.equal(hasReadyAndroidServices(packages, unlocked.replace("0:Owner", "10:Guest")), false);
});

test("Windows uses accelerated AOSP without unrelated Google background services", () => {
  assert.deepEqual(selectAndroidRuntime("win32", 0), {
    systemImage: "system-images;android-30;default;x86_64",
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
