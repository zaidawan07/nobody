export function formatPkr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 10_000_000) {
    const crore = value / 10_000_000;
    return `PKR ${trim(crore)} crore`;
  }
  if (value >= 100_000) {
    const lakh = value / 100_000;
    return `PKR ${trim(lakh)} lakh`;
  }
  return `PKR ${value.toLocaleString("en-PK")}`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export const AREA_UNIT_LABEL: Record<string, string> = {
  marla: "Marla",
  kanal: "Kanal",
  sqft: "Sq Ft",
  sqyd: "Sq Yard",
  acre: "Acre",
};

export function formatArea(
  value: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  return `${trim(Number(value))} ${AREA_UNIT_LABEL[unit ?? ""] ?? unit ?? ""}`.trim();
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const leadStatusLabel: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  visit_scheduled: "Visit Scheduled",
  negotiating: "Negotiating",
  won: "Converted",
  lost: "Lost",
} as const;

export function getLeadStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return leadStatusLabel[status] ?? titleCase(status);
}

export const PAKISTAN_CITIES = [
  "Lahore",
  "Karachi",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Gujranwala",
  "Sialkot",
  "Hyderabad",
  "Bahawalpur",
  "Sargodha",
  "Abbottabad",
];
