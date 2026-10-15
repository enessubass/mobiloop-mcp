export function selectAndroidRuntime(platform, acceleratorStatus) {
  if (!["linux", "win32"].includes(platform)) throw new Error("Unsupported hosted Android OS");
  const accelerated = platform === "linux" || acceleratorStatus === 0;
  return {
    systemImage:
      platform === "linux"
        ? "system-images;android-35;google_apis;x86_64"
        : accelerated
          ? "system-images;android-30;google_apis;x86_64"
          : "system-images;android-28;default;x86",
    acceleration: accelerated ? "on" : "off"
  };
}

export function hasReadyAndroidServices(packages, users) {
  const systemUser = users.split("UserInfo{").find((section) => section.startsWith("0:"));
  return (
    /^package:android\s/m.test(packages) &&
    !!systemUser &&
    /^\s*State:[ \t]*RUNNING_UNLOCKED[ \t]*\r?$/m.test(systemUser)
  );
}
