import { Button, Card, Group, Select, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import BookCard from "../../../components/cards/BookCard";
import ErrorCard from "../../../components/cards/ErrorCard";
import { HistoryItem } from "../../../state/historySlice";
import { ParseError } from "../../../state/messages";
import { defaultAnimation } from "../../../utils/animation";
import { GroupedBook } from "../../../utils/bookUtils";

interface SearchResultsProps {
  activeItem: HistoryItem | null;
  groupedBooks: GroupedBook[];
  showErrors: boolean;
  setShowErrors: (value: boolean) => void;
  hasErrors: boolean;
  errorCount: number;
  sortMode: string;
  setSortMode: (value: string) => void;
  formatFilter: string;
  isSearching: boolean;
  hasLoadedResults: boolean;
}

export default function SearchResults({
  activeItem,
  groupedBooks,
  showErrors,
  setShowErrors,
  hasErrors,
  errorCount,
  sortMode,
  setSortMode,
  formatFilter,
  isSearching,
  hasLoadedResults
}: SearchResultsProps) {
  if (!activeItem) {
    return null;
  }

  return (
    <div style={{ width: "100%", maxWidth: "100%" }}>
      {(groupedBooks.length > 0 || hasErrors) && (
        <Card withBorder radius="md" p="sm" mb="md">
          <Group position="apart" align="center" spacing={8}>
          <Group spacing="xs">
            {!showErrors && (
              <Text size="sm" color="dimmed">
                {groupedBooks.length} {groupedBooks.length === 1 ? "result" : "results"}
                {formatFilter !== "all" && ` (${formatFilter.toUpperCase()})`}
              </Text>
            )}
            {hasErrors && (
              <Button
                size="sm"
                color="orange"
                variant="filled"
                onClick={() => setShowErrors(!showErrors)}>
                {showErrors ? "Show all" : `⚠️ ${errorCount} manual`}
              </Button>
            )}
          </Group>
          {!showErrors && groupedBooks.length > 1 && (
            <Select
              size="xs"
              value={sortMode}
              onChange={(value) => setSortMode(value || "relevance")}
              data={[
                { value: "relevance", label: "Best source" },
                { value: "title-asc", label: "Title A-Z" },
                { value: "author-asc", label: "Author A-Z" },
                { value: "size-desc", label: "Largest first" }
              ]}
              aria-label="Sort results"
              sx={{ minWidth: 150 }}
            />
          )}
          </Group>
        </Card>
      )}

      {!showErrors && (
        <AnimatePresence mode="popLayout">
          {groupedBooks.map((groupedBook) => (
            <motion.div
              key={`${groupedBook.title}-${groupedBook.author}`}
              {...defaultAnimation}>
              <BookCard groupedBook={groupedBook} />
            </motion.div>
          ))}
        </AnimatePresence>
      )}

      {!showErrors && groupedBooks.length === 0 && (
        <Card withBorder radius="md" p="md">
          {isSearching ? (
            <Text size="sm" color="dimmed">
              Searching IRC lists...
            </Text>
          ) : hasLoadedResults && (activeItem?.results?.length ?? 0) === 0 ? (
            <Text size="sm" color="dimmed">
              No results found for this query.
            </Text>
          ) : hasLoadedResults && (activeItem?.results?.length ?? 0) > 0 ? (
            <Text size="sm" color="dimmed">
              No results match the current file type filter.
            </Text>
          ) : null}
        </Card>
      )}

      {showErrors &&
        (activeItem?.errors ?? []).map((error: ParseError, index: number) => (
          <ErrorCard key={`error-${index}`} error={error} />
        ))}
    </div>
  );
}
