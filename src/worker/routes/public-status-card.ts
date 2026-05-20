import type { PublicStatusPayload } from "./public-status";

const STATUS_LABELS = {
  operational: "Operational",
  degraded: "Degraded",
  failed: "Failed",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

const STATUS_COLORS = {
  operational: "#16a34a",
  degraded: "#d97706",
  failed: "#dc2626",
  maintenance: "#0284c7",
  unknown: "#64748b",
};

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProviderRow(
  provider: PublicStatusPayload["providers"][number],
  index: number
) {
  const y = 142 + index * 34;
  const providerColor = STATUS_COLORS[provider.status];
  const latency =
    provider.latencyMs === null ? "" : `${Math.round(provider.latencyMs)} ms`;

  return `<g transform="translate(32 ${y})"><circle cx="6" cy="6" r="6" fill="${providerColor}"/><text x="22" y="11" font-size="15" font-weight="600" fill="#0f172a">${escapeSvg(provider.name)}</text><text x="468" y="11" text-anchor="end" font-size="14" fill="#475569">${escapeSvg(STATUS_LABELS[provider.status])}</text><text x="620" y="11" text-anchor="end" font-size="14" fill="#64748b">${escapeSvg(latency)}</text></g>`;
}

export function renderPublicStatusCardSvg(payload: PublicStatusPayload): string {
  const providers = payload.providers.slice(0, 4);
  const height = 176 + providers.length * 34;
  const color = STATUS_COLORS[payload.overallStatus];
  const label = STATUS_LABELS[payload.overallStatus];
  const updated = payload.generatedAt ?? "No data";
  const providerRows = providers.map(renderProviderRow).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}" role="img" aria-label="SU8 Status ${label}"><rect width="720" height="${height}" rx="8" fill="#f8fafc"/><rect x="1" y="1" width="718" height="${height - 2}" rx="8" fill="none" stroke="#e2e8f0"/><circle cx="40" cy="42" r="10" fill="${color}"/><text x="58" y="49" font-size="22" font-weight="700" fill="#0f172a">SU8 Status</text><text x="688" y="49" text-anchor="end" font-size="20" font-weight="700" fill="${color}">${label}</text><text x="32" y="86" font-size="15" fill="#475569">${payload.summary.operational} operational | ${payload.summary.degraded} degraded | ${payload.summary.failed} failed | ${payload.summary.maintenance} maintenance</text><text x="32" y="112" font-size="13" fill="#64748b">Updated ${escapeSvg(updated)} | period ${payload.period}</text>${providerRows}</svg>`;
}
