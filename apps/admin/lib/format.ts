export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency"
  }).format(value);
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export function toTone(
  status: string | null | undefined
): "amber" | "green" | "red" {
  if (!status) {
    return "amber";
  }

  const normalized = status.toLowerCase();
  if (normalized.includes("suspend") || normalized.includes("red") || normalized.includes("quarantine")) {
    return "red";
  }

  if (normalized.includes("available") || normalized.includes("active") || normalized.includes("assigned") || normalized.includes("confirmed")) {
    return "green";
  }

  return "amber";
}
