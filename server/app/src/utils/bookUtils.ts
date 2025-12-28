import { BookDetail } from "../state/messages";

export interface GroupedBook {
  title: string;
  author: string;
  sources: BookDetail[];
  bestSource: BookDetail;
}

/**
 * Groups books by title and author (case-insensitive)
 * Returns an array of grouped books with sources sorted by online status and size
 */
export function groupBooks(
  books: BookDetail[],
  onlineServers?: string[]
): GroupedBook[] {
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
  return Array.from(groups.entries()).map(([_, sources]) => {
    // Sort sources: online first, then by size (largest first)
    const sortedSources = [...sources].sort((a, b) => {
      if (onlineServers) {
        const aOnline = onlineServers.includes(a.server);
        const bOnline = onlineServers.includes(b.server);

        // Online servers come first
        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;
      }

      // Within same category, sort by size (largest first)
      const aSize = parseSizeToBytes(a.size);
      const bSize = parseSizeToBytes(b.size);
      return bSize - aSize;
    });

    const bestSource = sortedSources[0];

    return {
      title: bestSource.title,
      author: bestSource.author,
      sources: sortedSources,
      bestSource
    };
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
function parseSizeToBytes(size: string): number {
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
