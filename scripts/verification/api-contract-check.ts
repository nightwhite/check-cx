interface ContractTarget {
  name: string;
  path: string;
  requiredFields: string[];
}

interface FetchResult {
  status: number;
  json: unknown;
}

const DASHBOARD_FIELDS = [
  "providerTimelines",
  "groupInfos",
  "lastUpdated",
  "total",
  "pollIntervalLabel",
  "pollIntervalMs",
  "availabilityStats",
  "trendPeriod",
];

const STATUS_FIELDS = ["providers", "summary", "metadata"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function joinUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function assertObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

async function fetchJson(baseUrl: string, path: string): Promise<FetchResult> {
  const response = await fetch(joinUrl(baseUrl, path), {
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? (JSON.parse(text) as unknown) : null,
  };
}

function assertRequiredFields(
  value: unknown,
  fields: string[],
  label: string
): void {
  if (fields.length === 0) {
    return;
  }
  const object = assertObject(value, label);
  const missing = fields.filter((field) => !(field in object));
  if (missing.length > 0) {
    throw new Error(`${label} missing fields: ${missing.join(", ")}`);
  }
}

async function compareTarget(
  oldBaseUrl: string,
  newBaseUrl: string,
  target: ContractTarget
): Promise<void> {
  const [oldResult, newResult] = await Promise.all([
    fetchJson(oldBaseUrl, target.path),
    fetchJson(newBaseUrl, target.path),
  ]);

  if (oldResult.status !== newResult.status) {
    throw new Error(
      `${target.name} status mismatch: old=${oldResult.status} new=${newResult.status}`
    );
  }

  if (newResult.status >= 200 && newResult.status < 300) {
    assertRequiredFields(newResult.json, target.requiredFields, target.name);
  }

  console.log(
    `[ok] ${target.name} ${target.path} status=${newResult.status}`
  );
}

function buildTargets(): ContractTarget[] {
  const targets: ContractTarget[] = [
    { name: "dashboard-7d", path: "/api/dashboard?trendPeriod=7d", requiredFields: DASHBOARD_FIELDS },
    { name: "dashboard-15d", path: "/api/dashboard?trendPeriod=15d", requiredFields: DASHBOARD_FIELDS },
    { name: "dashboard-30d", path: "/api/dashboard?trendPeriod=30d", requiredFields: DASHBOARD_FIELDS },
    { name: "status", path: "/api/v1/status?group=&model=", requiredFields: STATUS_FIELDS },
    { name: "notifications", path: "/api/notifications", requiredFields: [] },
  ];

  const groupName = process.env.CHECK_CX_CONTRACT_GROUP;
  if (groupName) {
    targets.push({
      name: "group-7d",
      path: `/api/group/${encodeURIComponent(groupName)}?trendPeriod=7d`,
      requiredFields: DASHBOARD_FIELDS,
    });
  }

  return targets;
}

export async function runApiContractCheck(): Promise<void> {
  const oldBaseUrl = requireEnv("OLD_CHECK_CX_BASE_URL");
  const newBaseUrl = requireEnv("NEW_CHECK_CX_BASE_URL");

  for (const target of buildTargets()) {
    await compareTarget(oldBaseUrl, newBaseUrl, target);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runApiContractCheck().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
