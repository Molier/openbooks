import {
  ActionIcon,
  Badge,
  Button,
  Center,
  createStyles,
  Group,
  Image,
  MediaQuery,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { MagnifyingGlass, Sidebar } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import image from "../assets/reading.svg";
import BookCard from "../components/cards/BookCard";
import ErrorCard from "../components/cards/ErrorCard";
import RetryQueue from "../components/RetryQueue";
import { useGetServersQuery } from "../state/api";
import { MessageType, ParseError } from "../state/messages";
import {
  cancelSearchWithCleanup,
  Download,
  retryDownload,
  sendMessage,
  sendSearch,
  toggleSidebar
} from "../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../state/store";
import { groupBooks } from "../utils/bookUtils";

const useStyles = createStyles((theme) => ({
  wFull: {
    width: "100%"
  },
  resultsBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
    marginBottom: theme.spacing.md,
    backgroundColor:
      theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.colors.gray[0],
    borderRadius: theme.radius.md
  },
  cardsContainer: {
    width: "100%",
    maxWidth: "100%"
  }
}));

export default function SearchPage() {
  const dispatch = useAppDispatch();
  const activeItem = useAppSelector((store) => store.state.activeItem);
  const opened = useAppSelector((store) => store.state.isSidebarOpen);
  const retryQueue = useAppSelector((store) => store.state.retryQueue);
  const { data: servers } = useGetServersQuery(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sortMode, setSortMode] = useState("relevance");

  // Periodic retry processor - check every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      retryQueue.forEach((download: Download) => {
        // Retry if nextRetry time has passed and retry count < 24 (1 day of hourly retries)
        if (
          download.nextRetry &&
          download.nextRetry <= now &&
          download.retryCount < 24
        ) {
          dispatch(
            retryDownload({
              book: download.book,
              serverName: download.serverName
            })
          );
        }
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [retryQueue, dispatch]);

  const hasErrors = (activeItem?.errors ?? []).length > 0;
  const errorCount = activeItem?.errors?.length ?? 0;
  const validInput = searchQuery !== "";
  const isSearching = activeItem?.results === null;

  const { classes, theme } = useStyles();

  // Group books for card display
  const groupedBooks = useMemo(() => {
    if (!activeItem?.results) return [];
    const grouped = groupBooks(activeItem.results, servers);

    const parseSize = (size: string): number => {
      const match = size.trim().match(/^([\d.]+)\s*(KB|MB|GB)$/i);
      if (!match) return 0;
      const value = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      if (unit === "GB") return value * 1024 * 1024 * 1024;
      if (unit === "MB") return value * 1024 * 1024;
      return value * 1024;
    };

    switch (sortMode) {
      case "title-asc":
        return [...grouped].sort((a, b) => a.title.localeCompare(b.title));
      case "author-asc":
        return [...grouped].sort((a, b) => a.author.localeCompare(b.author));
      case "size-desc":
        return [...grouped].sort(
          (a, b) => parseSize(b.bestSource.size) - parseSize(a.bestSource.size)
        );
      default:
        return grouped;
    }
  }, [activeItem?.results, servers, sortMode]);

  const searchHandler = (event: FormEvent) => {
    event.preventDefault();

    // Support manual download with ! prefix
    if (searchQuery.startsWith("!")) {
      dispatch(
        sendMessage({
          type: MessageType.DOWNLOAD,
          payload: { book: searchQuery }
        })
      );
    } else {
      dispatch(sendSearch(searchQuery));
    }

    setSearchQuery("");
  };

  return (
    <Stack
      spacing={0}
      align="center"
      sx={(theme) => ({
        width: "100%",
        height: "100%",
        padding: theme.spacing.md,
        paddingTop: "max(env(safe-area-inset-top), 1rem)",
        paddingBottom: "max(env(safe-area-inset-bottom), 1rem)",
        paddingLeft: "max(env(safe-area-inset-left), 1rem)",
        paddingRight: "max(env(safe-area-inset-right), 1rem)",
        overflow: "auto",
        boxSizing: "border-box"
      })}>
      <form className={classes.wFull} onSubmit={(e) => searchHandler(e)}>
        <Group
          noWrap
          spacing="md"
          sx={(theme) => ({ marginBottom: theme.spacing.md })}>
          {!opened && (
            <ActionIcon size="lg" onClick={() => dispatch(toggleSidebar())}>
              <Sidebar weight="bold" size={20}></Sidebar>
            </ActionIcon>
          )}
          <TextInput
            className={classes.wFull}
            variant="filled"
            value={searchQuery}
            onChange={(e: any) => setSearchQuery(e.target.value)}
            placeholder={
              isSearching
                ? "Searching... (click Cancel to stop)"
                : "Search for a book..."
            }
            radius="md"
            type="search"
            icon={<MagnifyingGlass weight="bold" size={22} />}
            required
          />

          {isSearching ? (
            <Button
              color="red"
              radius="md"
              onClick={() => dispatch(cancelSearchWithCleanup())}
              variant="filled"
              sx={{ minWidth: 80 }}>
              Cancel
            </Button>
          ) : (
            <Button
              type="submit"
              color={theme.colorScheme === "dark" ? "brand.2" : "brand"}
              disabled={!validInput}
              radius="md"
              variant={validInput ? "gradient" : "default"}
              gradient={{ from: "brand.4", to: "brand.3" }}
              sx={{ minWidth: 80 }}>
              Search
            </Button>
          )}
        </Group>
      </form>

      <RetryQueue />

      {activeItem && (groupedBooks.length > 0 || hasErrors) && (
        <div className={classes.resultsBar}>
          <Group spacing="xs">
            {!showErrors && (
              <Text size="sm" color="dimmed">
                {groupedBooks.length}{" "}
                {groupedBooks.length === 1 ? "result" : "results"}
              </Text>
            )}
            {hasErrors && (
              <Button
                size="sm"
                color="orange"
                variant="filled"
                onClick={() => setShowErrors((s) => !s)}
              >
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
        </div>
      )}

      {!activeItem ? (
        <Center style={{ height: "100%", width: "100%" }}>
          <Stack align="center">
            <Title weight="normal" align="center">
              Search a book to get started.
            </Title>
            <MediaQuery smallerThan="md" styles={{ display: "none" }}>
              <Image
                width={600}
                fit="contain"
                src={image}
                alt="person reading"
              />
            </MediaQuery>
            <MediaQuery largerThan="md" styles={{ display: "none" }}>
              <Image
                width={300}
                fit="contain"
                src={image}
                alt="person reading"
              />
            </MediaQuery>
          </Stack>
        </Center>
      ) : (
        <div className={classes.cardsContainer}>
          {!showErrors &&
            groupedBooks.map((groupedBook, index) => (
              <BookCard key={`book-${index}`} groupedBook={groupedBook} />
            ))}

          {showErrors &&
            (activeItem?.errors ?? []).map((error: ParseError, index: number) => (
              <ErrorCard key={`error-${index}`} error={error} />
            ))}
        </div>
      )}
    </Stack>
  );
}
