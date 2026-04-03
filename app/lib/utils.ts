import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a price in cents to a display string.
 * 0 or null/undefined → "Free", otherwise "$X.XX".
 */
export function formatPrice(cents: number | null | undefined): string {
  if (!cents) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDuration(
  minutes: number,
  showHours: boolean,
  showSeconds: boolean,
  padZeros: boolean
): string {
  if (minutes <= 0) return padZeros ? "00m" : "0m";

  if (showHours && minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hStr = padZeros ? String(h).padStart(2, "0") : String(h);
    const mStr = padZeros ? String(m).padStart(2, "0") : String(m);
    if (showSeconds) {
      return `${hStr}h ${mStr}m 00s`;
    }
    return m > 0 ? `${hStr}h ${mStr}m` : `${hStr}h`;
  }

  const mStr = padZeros ? String(minutes).padStart(2, "0") : String(minutes);
  if (showSeconds) {
    return `${mStr}m 00s`;
  }
  return `${mStr}m`;
}

/**
 * Format an ISO date string as a relative time for recent dates,
 * or an absolute date for older ones.
 */
export function formatRelativeTime(isoString: string): string {
  // Ensure the string is interpreted as UTC if no timezone designator is present
  const normalized = /Z$|[+-]\d{2}:\d{2}$/.test(isoString) ? isoString : isoString + "Z";
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return "unknown";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "just now";
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
