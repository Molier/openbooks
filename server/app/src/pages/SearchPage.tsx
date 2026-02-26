import { Center, createStyles, Image, MediaQuery, Stack, Title } from "@mantine/core";
import { FormEvent, useEffect, useMemo, useState } from "react";
import image from "../assets/reading.svg";
import RetryQueue from "../components/RetryQueue";
import { useGetServersQuery } from "../state/api";
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
import { MessageType } from "../state/messages";
import { groupBooks, normalizeFormat, parseSizeToBytes } from "../utils/bookUtils";
import SearchActivityCards from "./search/components/SearchActivityCards";
import SearchFilters from "./search/components/SearchFilters";
import SearchHeader from "./search/components/SearchHeader";
import SearchResults from "./search/components/SearchResults";

const useStyles = createStyles((theme) => ({
  wFull: {
    width: "100%"
  },
  sidebarPulse: {
    animation: "sidebarPulse 2.8s ease-in-out infinite"
  },
  searchingIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: 999,
    backgroundColor:
      theme.colorScheme === "dark" ? theme.colors.dark[5] : theme.colors.blue[1]
  },
  animatedHero: {
    animation: "heroFloat 4s ease-in-out infinite"
  },
  "@keyframes sidebarPulse": {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(1.04)" },
    "100%": { transform: "scale(1)" }
  },
  "@keyframes heroFloat": {
    "0%": { transform: "translateY(0px)" },
    "50%": { transform: "translateY(-8px)" },
    "100%": { transform: "translateY(0px)" }
  }
}));

export default function SearchPage() {
  const dispatch = useAppDispatch();
  const { classes } = useStyles();

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

  const trimmedQuery = searchQuery.trim();
  const validInput = trimmedQuery !== "";
  const isSearching = activeItem?.results === null;
  const hasLoadedResults = Array.isArray(activeItem?.results);
  const hasErrors = (activeItem?.errors ?? []).length > 0;
  const errorCount = activeItem?.errors?.length ?? 0;

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
        window.setTimeout(() => {
          dispatch(
            retryDownload({
              book: download.book,
              serverName: download.serverName
            })
          );
        }, index * 1500);
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [retryQueue, dispatch]);

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
    const allCount = formats.reduce((sum, [, count]) => sum + count, 0);
    const sortedFormats = formats.sort((a, b) => {
      if (a[0] === "epub") return -1;
      if (b[0] === "epub") return 1;
      return a[0].localeCompare(b[0]);
    });

    return [
      { value: "all", label: `All (${allCount})` },
      ...sortedFormats.map(([format, count]) => ({
        value: format,
        label: `${format.toUpperCase()} (${count})`
      }))
    ];
  }, [formatCounts]);

  useEffect(() => {
    if (!activeItem || !activeItem.results) {
      setFormatFilter("all");
      setAutoEpubFilterEnabled(false);
      return;
    }

    const hasEpub = activeItem.results.some(
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

  const onSubmitSearch = (event: FormEvent) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query === "") return;

    if (query.startsWith("!")) {
      dispatch(
        sendMessage({
          type: MessageType.DOWNLOAD,
          payload: { book: query }
        })
      );
    } else {
      dispatch(sendSearch(query));
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
        overflowY: "auto",
        overflowX: "hidden",
        minWidth: 0,
        boxSizing: "border-box"
      })}>
      <form className={classes.wFull} onSubmit={onSubmitSearch}>
        <SearchHeader
          opened={opened}
          hasDownloadActivity={hasDownloadActivity}
          activeDownloadsCount={activeDownloadsCount}
          searchQuery={searchQuery}
          isSearching={isSearching}
          validInput={validInput}
          sidebarPulseClassName={classes.sidebarPulse}
          onToggleSidebar={() => dispatch(toggleSidebar())}
          onSearchQueryChange={setSearchQuery}
          onCancelSearch={() => dispatch(cancelSearchWithCleanup())}
        />
      </form>

      <SearchActivityCards
        hasDownloadActivity={hasDownloadActivity}
        isSearching={isSearching}
        searchingIconClassName={classes.searchingIcon}
        onOpenDownloads={() => dispatch(openSidebarTab("books"))}
      />

      <RetryQueue />

      <SearchFilters
        showErrors={showErrors}
        formatOptions={formatOptions}
        formatFilter={formatFilter}
        autoEpubFilterEnabled={autoEpubFilterEnabled}
        onFormatChange={(value) => {
          setFormatFilter(value);
          setAutoEpubFilterEnabled(false);
        }}
      />

      {!activeItem ? (
        <Center style={{ height: "100%", width: "100%" }}>
          <Stack align="center">
            <Title weight="normal" align="center">
              Search a book to get started.
            </Title>
            <MediaQuery smallerThan="md" styles={{ display: "none" }}>
              <div className={classes.animatedHero}>
                <Image width={600} fit="contain" src={image} alt="person reading" />
              </div>
            </MediaQuery>
            <MediaQuery largerThan="md" styles={{ display: "none" }}>
              <div className={classes.animatedHero}>
                <Image width={300} fit="contain" src={image} alt="person reading" />
              </div>
            </MediaQuery>
          </Stack>
        </Center>
      ) : (
        <SearchResults
          activeItem={activeItem}
          groupedBooks={groupedBooks}
          showErrors={showErrors}
          setShowErrors={setShowErrors}
          hasErrors={hasErrors}
          errorCount={errorCount}
          sortMode={sortMode}
          setSortMode={setSortMode}
          formatFilter={formatFilter}
          isSearching={isSearching}
          hasLoadedResults={hasLoadedResults}
        />
      )}
    </Stack>
  );
}
