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
