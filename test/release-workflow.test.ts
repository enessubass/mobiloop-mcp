import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("release scans a loaded candidate before pushing the same image without a rebuild", async () => {
  const workflow = await fs.readFile(".github/workflows/publish-ghcr.yml", "utf8");
  const build = workflow.indexOf("- name: Build candidate");
  const scan = workflow.indexOf("- name: Scan candidate before publication");
  const publish = workflow.indexOf("- name: Push scanned image");
  assert.ok(build >= 0 && scan > build && publish > scan);
  assert.equal((workflow.match(/docker\/build-push-action@/g) ?? []).length, 1);
  assert.match(
    workflow.slice(build, scan),
    /load: true\s+push: false\s+tags: mobiloop-mcp:release-candidate/
  );
  assert.match(workflow.slice(scan, publish), /image-ref: mobiloop-mcp:release-candidate/);
  assert.match(workflow.slice(scan, publish), /exit-code: "1"/);
  assert.doesNotMatch(workflow.slice(scan, publish), /continue-on-error:\s*true/);
  assert.match(workflow.slice(publish), /docker tag mobiloop-mcp:release-candidate "\$tag"/);
  assert.match(workflow.slice(publish), /steps\.publish\.outputs\.digest/);
  assert.match(workflow.slice(publish), /--arg repository "\$IMAGE_NAME"/);
  assert.doesNotMatch(workflow, /index \.RepoDigests 0/);
  assert.doesNotMatch(workflow, /push: true/);
});
