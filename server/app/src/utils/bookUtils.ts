import { BookDetail } from "../state/messages";

export interface GroupedBook {
  title: string;
  author: string;
  sources: BookDetail[];
  bestSource: BookDetail;
}

export type ServerPresence = "online" | "offline" | "unknown";

const formatPriority: Record<string, number> = {
  epub: 0,
  azw3: 1,
  mobi: 2,
  pdf: 3,
  txt: 4,
  zip: 5,
  rar: 6
};

export function normalizeServerName(server: string): string {
  return server
    .trim()
    .replace(/^[:~&@%+!]+/, "")
    .toLowerCase();
}

export function normalizeFormat(format: string): string {
  return format.trim().toLowerCase();
}

export function getServerPresence(
  server: string,
  onlineServerLookup?: Set<string>
): ServerPresence {
  if (!onlineServerLookup || onlineServerLookup.size === 0) {
    return "unknown";
  }

  return onlineServerLookup.has(normalizeServerName(server))
    ? "online"
    : "offline";
}

function serverPresenceRank(status: ServerPresence): number {
  switch (status) {
    case "online":
      return 0;
    case "unknown":
      return 1;
    default:
      return 2;
  }
}

function formatRank(format: string): number {
  const normalized = normalizeFormat(format);
  if (normalized in formatPriority) {
    return formatPriority[normalized];
  }
  return 99;
}

export function buildOnlineServerLookup(servers?: string[]): Set<string> {
  if (!servers || servers.length === 0) {
    return new Set<string>();
  }
  return new Set(servers.map((server) => normalizeServerName(server)));
}

function compareSources(
  a: BookDetail,
  b: BookDetail,
  onlineServerLookup?: Set<string>
): number {
  const aPresence = serverPresenceRank(
    getServerPresence(a.server, onlineServerLookup)
  );
  const bPresence = serverPresenceRank(
    getServerPresence(b.server, onlineServerLookup)
  );

  if (aPresence !== bPresence) {
    return aPresence - bPresence;
  }

  const aFormat = formatRank(a.format);
  const bFormat = formatRank(b.format);
  if (aFormat !== bFormat) {
    return aFormat - bFormat;
  }

  const aSize = parseSizeToBytes(a.size);
  const bSize = parseSizeToBytes(b.size);
  if (aSize !== bSize) {
    return bSize - aSize;
  }

  return a.server.localeCompare(b.server);
}

/**
 * Groups books by title and author (case-insensitive)
 * Returns an array of grouped books with sources sorted by online status and size
 */
export function groupBooks(
  books: BookDetail[],
  onlineServers?: string[]
): GroupedBook[] {
  const onlineServerLookup = buildOnlineServerLookup(onlineServers);
  const groups = new Map<string, BookDetail[]>();

  // Group books by normalized title + author
  books.forEach((book) => {
    const key = `${book.title.toLowerCase().trim()}|||${book.author.toLowerCase().trim()}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(book);
  });

  // Convert groups to array and sort sources within each group
  return Array.from(groups.entries())
    .map(([_, sources]) => {
      const sortedSources = [...sources].sort((a, b) =>
        compareSources(a, b, onlineServerLookup)
      );

      const bestSource = sortedSources[0];

      return {
        title: bestSource.title,
        author: bestSource.author,
        sources: sortedSources,
        bestSource
      };
    })
    .sort((a, b) => {
      const sourceDiff = compareSources(
        a.bestSource,
        b.bestSource,
        onlineServerLookup
      );
      if (sourceDiff !== 0) {
        return sourceDiff;
      }
      return a.title.localeCompare(b.title);
    });
}

/**
 * Formats file size to standardized format: "1.5 MB", "351 KB", etc.
 * Handles various input formats: "1.5MB", "1536", "N/A", etc.
 */
export function formatSize(size: string): string {
  if (!size || size === "N/A" || size.trim() === "") {
    return "Size unknown";
  }

  // Remove any whitespace
  const trimmed = size.trim();

  // Check if already has unit (MB, KB, GB)
  const withUnitMatch = trimmed.match(/^([\d.]+)\s*(MB|KB|GB|mb|kb|gb)$/i);
  if (withUnitMatch) {
    const num = parseFloat(withUnitMatch[1]);
    const unit = withUnitMatch[2].toUpperCase();
    return `${num.toFixed(num >= 10 ? 0 : 1)} ${unit}`;
  }

  // Parse as number (assume MB if no unit)
  const num = parseFloat(trimmed);
  if (isNaN(num)) {
    return "Size unknown";
  }

  // Convert to appropriate unit
  if (num < 1) {
    return `${Math.round(num * 1024)} KB`;
  } else if (num >= 1024) {
    return `${(num / 1024).toFixed(1)} GB`;
  } else {
    return `${num.toFixed(1)} MB`;
  }
}

/**
 * Parses size string to bytes for comparison
 * Used internally for sorting
 */
export function parseSizeToBytes(size: string): number {
  if (!size || size === "N/A" || size.trim() === "") {
    return 0;
  }

  const trimmed = size.trim();

  // Check if has unit
  const withUnitMatch = trimmed.match(/^([\d.]+)\s*(MB|KB|GB|mb|kb|gb)$/i);
  if (withUnitMatch) {
    const num = parseFloat(withUnitMatch[1]);
    const unit = withUnitMatch[2].toUpperCase();

    switch (unit) {
      case "GB":
        return num * 1024 * 1024 * 1024;
      case "MB":
        return num * 1024 * 1024;
      case "KB":
        return num * 1024;
      default:
        return 0;
    }
  }

  // Assume MB if no unit
  const num = parseFloat(trimmed);
  if (isNaN(num)) {
    return 0;
  }

  return num * 1024 * 1024;
}
