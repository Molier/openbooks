import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Chip,
  createStyles,
  Group,
  Image,
  Indicator,
  MediaQuery,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { Books, MagnifyingGlass, Sidebar } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
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
  DownloadStatus,
  openSidebarTab,
  retryDownload,
  sendMessage,
  sendSearch,
  toggleSidebar
} from "../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../state/store";
import { defaultAnimation } from "../utils/animation";
import { groupBooks, normalizeFormat, parseSizeToBytes } from "../utils/bookUtils";

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
  },
  filtersBar: {
    width: "100%",
    marginBottom: 12
  },
  flowCard: {
    width: "100%",
    marginBottom: 12
  },
  sidebarPulse: {
    animation: "sidebarPulse 2.8s ease-in-out infinite"
  },
  "@keyframes sidebarPulse": {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.04)" },
    "100%": { transform: "scale(1)" }
  }
}));

export default function SearchPage() {
  const dispatch = useAppDispatch();
  const activeItem = useAppSelector((store) => store.state.activeItem);
  const opened = useAppSelector((store) => store.state.isSidebarOpen);
  const retryQueue = useAppSelector((store) => store.state.retryQueue);
  const downloads = useAppSelector((store) => store.state.downloads);
  const { data: servers } = useGetServersQuery(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [sortMode, setSortMode] = useState("relevance");
  const [formatFilter, setFormatFilter] = useState("all");
  const [autoEpubFilterEnabled, setAutoEpubFilterEnabled] = useState(false);

  // Periodic retry processor - check every minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dueRetries = retryQueue
        .filter(
          (download: Download) =>
            !!download.nextRetry &&
            download.nextRetry <= now &&
            download.retryCount < 24
        )
        .slice(0, 3);

      dueRetries.forEach((download: Download, index: number) => {
        // Retry if nextRetry time has passed and retry count < 24 (1 day of hourly retries)
        window.setTimeout(() => {
          dispatch(
            retryDownload({
              book: download.book,
              serverName: download.serverName
            })
          );
        }, index * 1500);
      });
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [retryQueue, dispatch]);

  const hasErrors = (activeItem?.errors ?? []).length > 0;
  const errorCount = activeItem?.errors?.length ?? 0;
  const validInput = searchQuery !== "";
  const isSearching = activeItem?.results === null;
  const downloadList = useMemo(() => Object.values(downloads), [downloads]);
  const activeDownloadsCount = downloadList.filter(
    (download) =>
      download.status === DownloadStatus.PENDING ||
      download.status === DownloadStatus.DOWNLOADING
  ).length;
  const hasDownloadActivity =
    activeDownloadsCount > 0 ||
    retryQueue.length > 0 ||
    downloadList.some((download) => download.status === DownloadStatus.SUCCESS);

  const { classes, theme } = useStyles();
  const formatCounts = useMemo(() => {
    const counts = new Map<string, number>();
    (activeItem?.results ?? []).forEach((book) => {
      const format = normalizeFormat(book.format);
      counts.set(format, (counts.get(format) ?? 0) + 1);
    });
    return counts;
  }, [activeItem?.results]);
  const formatOptions = useMemo(() => {
    const formats = Array.from(formatCounts.entries());
    const withAll: Array<{ value: string; label: string }> = [
      {
        value: "all",
        label: `All (${formats.reduce((sum, [, count]) => sum + count, 0)})`
      }
    ];
    const sortedFormats = formats.sort((a, b) => {
      if (a[0] === "epub") return -1;
      if (b[0] === "epub") return 1;
      return a[0].localeCompare(b[0]);
    });
    return withAll.concat(
      sortedFormats.map(([format, count]) => ({
        value: format,
        label: `${format.toUpperCase()} (${count})`
      }))
    );
  }, [formatCounts]);

  useEffect(() => {
    if (!activeItem || !activeItem.results) {
      setFormatFilter("all");
      setAutoEpubFilterEnabled(false);
      return;
    }

    const hasEpub = (activeItem.results ?? []).some(
      (book) => normalizeFormat(book.format) === "epub"
    );
    if (hasEpub) {
      setFormatFilter("epub");
      setAutoEpubFilterEnabled(true);
      return;
    }

    setFormatFilter("all");
    setAutoEpubFilterEnabled(false);
  }, [activeItem?.timestamp, activeItem?.results]);

  const filteredResults = useMemo(() => {
    const results = activeItem?.results ?? [];
    if (formatFilter === "all") {
      return results;
    }
    return results.filter((book) => normalizeFormat(book.format) === formatFilter);
  }, [activeItem?.results, formatFilter]);

  // Group books for card display
  const groupedBooks = useMemo(() => {
    if (!filteredResults.length) return [];
    const grouped = groupBooks(filteredResults, servers);

    switch (sortMode) {
      case "title-asc":
        return [...grouped].sort((a, b) => a.title.localeCompare(b.title));
      case "author-asc":
        return [...grouped].sort((a, b) => a.author.localeCompare(b.author));
      case "size-desc":
        return [...grouped].sort(
          (a, b) =>
            parseSizeToBytes(b.bestSource.size) - parseSizeToBytes(a.bestSource.size)
        );
      default:
        return grouped;
    }
  }, [filteredResults, servers, sortMode]);

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
            <Indicator
              disabled={!hasDownloadActivity}
              color="brand"
              label={activeDownloadsCount > 0 ? activeDownloadsCount : undefined}
              size={16}
              zIndex={1}
              withBorder={false}>
              <ActionIcon
                size="lg"
                className={hasDownloadActivity ? classes.sidebarPulse : undefined}
                onClick={() => dispatch(toggleSidebar())}>
                <Sidebar weight="bold" size={20}></Sidebar>
              </ActionIcon>
            </Indicator>
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

      <AnimatePresence>
        {hasDownloadActivity && (
          <motion.div className={classes.flowCard} {...defaultAnimation}>
            <Card
              withBorder
              radius="md"
              p="sm"
              sx={(theme) => ({
                backgroundColor:
                  theme.colorScheme === "dark"
                    ? theme.colors.dark[6]
                    : theme.colors.blue[0]
              })}>
              <Group position="apart" noWrap>
                <Group spacing="xs" noWrap>
                  <Books size={18} weight="bold" />
                  <Text size="sm">
                    Downloads appear in{" "}
                    <strong>Sidebar {"->"} Previous Downloads</strong>.
                  </Text>
                </Group>
                <Button
                  size="xs"
                  radius="md"
                  onClick={() => dispatch(openSidebarTab("books"))}>
                  Open
                </Button>
              </Group>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <RetryQueue />

      {!showErrors && formatOptions.length > 2 && (
        <motion.div className={classes.filtersBar} {...defaultAnimation}>
          <ScrollArea type="never">
            <Chip.Group
              value={formatFilter}
              onChange={(value: string) => {
                setFormatFilter(value || "all");
                setAutoEpubFilterEnabled(false);
              }}
              multiple={false}>
              <Group noWrap spacing={8}>
                {formatOptions.map((option) => (
                  <Chip
                    key={option.value}
                    value={option.value}
                    radius="md"
                    size="sm"
                    variant="filled">
                    {option.label}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </ScrollArea>
          {autoEpubFilterEnabled && formatFilter === "epub" && (
            <Text size="xs" color="dimmed" mt={6}>
              EPUB filter auto-enabled because EPUB sources were found.
            </Text>
          )}
        </motion.div>
      )}

      {activeItem && (groupedBooks.length > 0 || hasErrors) && (
        <div className={classes.resultsBar}>
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
              <Text size="sm" color="dimmed">
                No results match the current file type filter.
              </Text>
            </Card>
          )}

          {showErrors &&
            (activeItem?.errors ?? []).map((error: ParseError, index: number) => (
              <ErrorCard key={`error-${index}`} error={error} />
            ))}
        </div>
      )}
    </Stack>
  );
}
