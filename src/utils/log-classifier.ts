export type EvidenceStatus =
  | "passed"
  | "app_bug"
  | "automation_error"
  | "environment_missing"
  | "remote_rules_not_deployed"
  | "test_data_missing"
  | "external_dependency"
  | "unknown_failure";

export interface LogFinding {
  category: string;
  status: EvidenceStatus;
  severity: "info" | "warning" | "error";
  lineNumber: number;
  line: string;
  summary: string;
}

export interface LogClassification {
  status: EvidenceStatus;
  likelyRootCause: string;
  nextSuggestedAction: string;
  appCrashFindings: LogFinding[];
  automationFindings: LogFinding[];
  externalDependencyFindings: LogFinding[];
  findings: LogFinding[];
}

const RULES: Array<{
  category: string;
  status: EvidenceStatus;
  severity: "info" | "warning" | "error";
  summary: string;
  pattern: RegExp;
}> = [
  {
    category: "firestore_permission",
    status: "remote_rules_not_deployed",
    severity: "error",
    summary: "Firestore permission denied or rules rejected the request.",
    pattern: /Firestore.*PERMISSION_DENIED|PERMISSION_DENIED.*Firestore|Missing or insufficient permissions/i
  },
  {
    category: "firebase_auth",
    status: "test_data_missing",
    severity: "error",
    summary: "Firebase Auth rejected credentials or test user state.",
    pattern: /FirebaseAuth|INVALID_LOGIN_CREDENTIALS|ERROR_INVALID|ERROR_USER|wrong-password|user-not-found/i
  },
  {
    category: "automation_instrumentation",
    status: "automation_error",
    severity: "error",
    summary: "Appium/UiAutomator2 instrumentation failed independently of the app.",
    pattern: /UiAutomator2|io\.appium|INSTRUMENTATION_|Instrumentation.*(died|failed)|uiautomator/i
  },
  {
    category: "anr",
    status: "app_bug",
    severity: "error",
    summary: "Application Not Responding detected.",
    pattern: /ANR in /i
  },
  {
    category: "app_crash",
    status: "app_bug",
    severity: "error",
    summary: "Application crash signature detected.",
    pattern: /FATAL EXCEPTION|AndroidRuntime|Process: .*?, PID:|java\.lang\.[A-Za-z]+Exception|Unhandled Exception|Fatal signal \d+/i
  },
  {
    category: "play_services",
    status: "environment_missing",
    severity: "warning",
    summary: "Google Play Services or provider dependency appears missing or unhealthy.",
    pattern: /Google Play services|GoogleApiAvailability|ProviderInstaller|DynamiteModule|GmsClient/i
  },
  {
    category: "network",
    status: "external_dependency",
    severity: "warning",
    summary: "Network or remote service connectivity problem detected.",
    pattern: /UnknownHostException|SocketTimeoutException|SSLHandshakeException|ECONNREFUSED|timeout|Unable to resolve host/i
  },
  {
    category: "renderer",
    status: "app_bug",
    severity: "warning",
    summary: "Renderer or graphics warning detected.",
    pattern: /FlutterRenderer|EGL|OpenGLRenderer|Skia|SurfaceFlinger/i
  }
];

export function classifyLogcat(logText: string): LogClassification {
  const findings: LogFinding[] = [];
  const lines = logText.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    for (const rule of RULES) {
      if (!rule.pattern.test(line)) continue;
      findings.push({
        category: rule.category,
        status: rule.status,
        severity: rule.severity,
        lineNumber: index + 1,
        line: line.slice(0, 500),
        summary: rule.summary
      });
      break;
    }
  }

  const trimmed = findings.slice(0, 100);
  const appCrashFindings = trimmed.filter((finding) => ["app_crash", "anr"].includes(finding.category));
  const automationFindings = trimmed.filter((finding) => finding.status === "automation_error");
  const externalDependencyFindings = trimmed.filter((finding) =>
    ["environment_missing", "external_dependency", "remote_rules_not_deployed", "test_data_missing"].includes(finding.status)
  );
  const status = highestStatus(trimmed);
  return {
    status,
    likelyRootCause: likelyRootCause(status, trimmed),
    nextSuggestedAction: nextSuggestedAction(status),
    appCrashFindings,
    automationFindings,
    externalDependencyFindings,
    findings: trimmed
  };
}

function highestStatus(findings: LogFinding[]): EvidenceStatus {
  const priority: EvidenceStatus[] = [
    "app_bug",
    "automation_error",
    "remote_rules_not_deployed",
    "test_data_missing",
    "environment_missing",
    "external_dependency"
  ];
  for (const status of priority) {
    if (findings.some((finding) => finding.status === status)) return status;
  }
  return findings.length === 0 ? "passed" : "unknown_failure";
}

function likelyRootCause(status: EvidenceStatus, findings: LogFinding[]): string {
  const first = findings.find((finding) => finding.status === status) ?? findings[0];
  if (!first) return "No known crash or dependency signature found in collected logs.";
  return `${first.summary} First matching line ${first.lineNumber}: ${first.line}`;
}

function nextSuggestedAction(status: EvidenceStatus): string {
  switch (status) {
    case "app_bug":
      return "Inspect the app stack trace and fix the app code path before rerunning the flow.";
    case "automation_error":
      return "Recreate the Appium session, verify the platform driver, and rerun before changing app code.";
    case "remote_rules_not_deployed":
      return "Check staging Firebase/Firestore rules, test account permissions, and backend environment setup.";
    case "test_data_missing":
      return "Seed or reset deterministic test users/data before rerunning the scenario.";
    case "environment_missing":
      return "Fix emulator/device services such as Google Play Services before treating this as an app bug.";
    case "external_dependency":
      return "Verify network, API host, certificates, and staging service health.";
    default:
      return "Collect screenshot, page source, and focused logs around the failing step.";
  }
}
