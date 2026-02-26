import {
  createAction,
  createAsyncThunk,
  createSlice,
  PayloadAction
} from "@reduxjs/toolkit";
import { openbooksApi } from "./api";
import { addHistoryItem, HistoryItem, updateHistoryItem } from "./historySlice";
import { MessageType, SearchResponse } from "./messages";
import { AppDispatch, RootState } from "./store";

export enum DownloadStatus {
  PENDING = "pending",
  DOWNLOADING = "downloading",
  SUCCESS = "success",
  TIMEOUT = "timeout",
  FAILED = "failed"
}

export interface Download {
  book: string;
  serverName: string;
  status: DownloadStatus;
  timestamp: number;
  timeoutId?: number;
  progress: number;
  retryCount: number;
  nextRetry?: number;
}

const normalizeWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, " ");

const normalizeLooseBookName = (value: string): string =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[_\-.]+/g, " ");

export const getDownloadKey = (book: string): string =>
  normalizeWhitespace(book).toLowerCase();

const resolveDownloadKey = (
  downloads: Record<string, Download>,
  book: string
): string => {
  const directKey = getDownloadKey(book);
  if (downloads[directKey]) {
    return directKey;
  }

  const looseBook = normalizeLooseBookName(book);
  if (looseBook !== "") {
    for (const [key, download] of Object.entries(downloads)) {
      const looseExisting = normalizeLooseBookName(download.book);
      if (
        looseExisting === looseBook ||
        looseExisting.includes(looseBook) ||
        looseBook.includes(looseExisting)
      ) {
        return key;
      }
    }
  }

  return directKey;
};

interface AppState {
  isConnected: boolean;
  isSidebarOpen: boolean;
  sidebarTab: "books" | "history";
  activeItem: HistoryItem | null;
  username?: string;
  inFlightDownloads: string[]; // Legacy - keeping for backward compat
  downloads: Record<string, Download>; // Enhanced download tracking
  retryQueue: Download[]; // Queue for periodic retry
  searchTimeoutId?: number; // Timeout for stuck searches
}

const loadActive = (): HistoryItem | null => {
  try {
    return JSON.parse(localStorage.getItem("active")!) ?? null;
  } catch (err) {
    return null;
  }
};

const loadSidebarTab = (): "books" | "history" => {
  try {
    const raw = localStorage.getItem("sidebar-tab");
    const tab = raw ? JSON.parse(raw) : null;
    return tab === "books" ? "books" : "history";
  } catch (err) {
    return "history";
  }
};

const initialState: AppState = {
  isConnected: false,
  isSidebarOpen: false,
  sidebarTab: loadSidebarTab(),
  activeItem: loadActive(),
  username: undefined,
  inFlightDownloads: [],
  downloads: {},
  retryQueue: []
};

const downloadTimeouts = new Map<string, number>();
let searchTimeoutHandle: number | undefined;

const clearDownloadTimer = (book: string) => {
  const directKey = getDownloadKey(book);
  let timeoutId = downloadTimeouts.get(directKey);
  let resolvedKey = directKey;
  if (!timeoutId) {
    const looseBook = normalizeLooseBookName(book);
    if (looseBook !== "") {
      for (const [key, id] of downloadTimeouts.entries()) {
        if (
          normalizeLooseBookName(key) === looseBook ||
          normalizeLooseBookName(key).includes(looseBook) ||
          looseBook.includes(normalizeLooseBookName(key))
        ) {
          timeoutId = id;
          resolvedKey = key;
          break;
        }
      }
    }
  }

  if (timeoutId) {
    clearTimeout(timeoutId);
    downloadTimeouts.delete(resolvedKey);
  }
};

const clearSearchTimer = () => {
  if (searchTimeoutHandle) {
    clearTimeout(searchTimeoutHandle);
    searchTimeoutHandle = undefined;
  }
};

const stateSlice = createSlice({
  name: "state",
  initialState,
  reducers: {
    setActiveItem(state, action: PayloadAction<HistoryItem | null>) {
      state.activeItem = action.payload;
    },
    setConnectionState(state, action: PayloadAction<boolean>) {
      state.isConnected = action.payload;
    },
    setUsername(state, action: PayloadAction<string>) {
      state.username = action.payload;
    },
    addInFlightDownload(state, action: PayloadAction<string>) {
      const key = getDownloadKey(action.payload);
      if (!state.inFlightDownloads.includes(key)) {
        state.inFlightDownloads.push(key);
      }
    },
    removeInFlightDownload(state, action: PayloadAction<string | undefined>) {
      if (action.payload) {
        const key = resolveDownloadKey(state.downloads, action.payload);
        state.inFlightDownloads = state.inFlightDownloads.filter(
          (item) => item !== key
        );
      } else {
        state.inFlightDownloads.shift();
      }
    },
    // Enhanced download management
    startDownload(
      state,
      action: PayloadAction<{ book: string; serverName: string; retryCount?: number }>
    ) {
      const { book, serverName, retryCount = 0 } = action.payload;
      const key = getDownloadKey(book);
      state.downloads[key] = {
        book,
        serverName,
        status: DownloadStatus.PENDING,
        timestamp: Date.now(),
        progress: 0,
        retryCount
      };
    },
    updateDownloadStatus(
      state,
      action: PayloadAction<{ book: string; status: DownloadStatus }>
    ) {
      const { book, status } = action.payload;
      const key = resolveDownloadKey(state.downloads, book);
      if (state.downloads[key]) {
        state.downloads[key].status = status;
        if (status === DownloadStatus.SUCCESS) {
          state.downloads[key].progress = 100;
          state.retryQueue = state.retryQueue.filter(
            (d) => getDownloadKey(d.book) !== key
          );
        }
      }
    },
    updateDownloadProgress(
      state,
      action: PayloadAction<{ book: string; progress: number }>
    ) {
      const { book, progress } = action.payload;
      const key = resolveDownloadKey(state.downloads, book);
      if (state.downloads[key]) {
        state.downloads[key].progress = Math.max(0, Math.min(100, progress));
        state.downloads[key].status = DownloadStatus.DOWNLOADING;
      }
    },
    setDownloadTimeout(
      state,
      action: PayloadAction<{ book: string; timeoutId: number }>
    ) {
      const { book, timeoutId } = action.payload;
      const key = resolveDownloadKey(state.downloads, book);
      if (state.downloads[key]) {
        state.downloads[key].timeoutId = timeoutId;
      }
    },
    clearDownloadTimeout(state, action: PayloadAction<string>) {
      const key = resolveDownloadKey(state.downloads, action.payload);
      if (state.downloads[key]?.timeoutId) {
        delete state.downloads[key].timeoutId;
      }
    },
    removeDownload(state, action: PayloadAction<string>) {
      const key = resolveDownloadKey(state.downloads, action.payload);
      delete state.downloads[key];
      state.inFlightDownloads = state.inFlightDownloads.filter(
        (inFlight) => inFlight !== key
      );
    },
    addToRetryQueue(state, action: PayloadAction<Download>) {
      const download = action.payload;
      const key = getDownloadKey(download.book);
      const existingIndex = state.retryQueue.findIndex(
        (d) => getDownloadKey(d.book) === key
      );
      const nextRetry = Date.now() + 3600000;
      if (existingIndex !== -1) {
        state.retryQueue[existingIndex] = {
          ...state.retryQueue[existingIndex],
          ...download,
          nextRetry
        };
      } else {
        state.retryQueue.push({
          ...download,
          nextRetry
        });
      }
    },
    removeFromRetryQueue(state, action: PayloadAction<string>) {
      const key = getDownloadKey(action.payload);
      state.retryQueue = state.retryQueue.filter(
        (d) => getDownloadKey(d.book) !== key
      );
    },
    incrementRetryCount(state, action: PayloadAction<string>) {
      const key = getDownloadKey(action.payload);
      const queueItem = state.retryQueue.find(
        (d) => getDownloadKey(d.book) === key
      );
      if (queueItem) {
        queueItem.retryCount++;
        queueItem.nextRetry = Date.now() + 3600000; // Next retry in 1 hour
      }
    },
    toggleSidebar(state) {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    openSidebarTab(state, action: PayloadAction<"books" | "history">) {
      state.sidebarTab = action.payload;
      state.isSidebarOpen = true;
    },
    setSidebarTab(state, action: PayloadAction<"books" | "history">) {
      state.sidebarTab = action.payload;
    },
    setSearchTimeout(state, action: PayloadAction<number>) {
      state.searchTimeoutId = action.payload;
    },
    clearSearchTimeout(state) {
      delete state.searchTimeoutId;
    },
    cancelSearch(state) {
      delete state.searchTimeoutId;
      // Clear active item to unblock search
      state.activeItem = null;
    }
  }
});

// Action that sends a websocket message to the server
const sendMessage = createAction("socket/send_message", (message: any) => ({
  payload: { message: JSON.stringify(message) }
}));

const sendDownload = createAsyncThunk(
  "state/send_download",
  (
    {
      book,
      serverName,
      retryCount = 0
    }: { book: string; serverName: string; retryCount?: number },
    { dispatch }
  ) => {
    const key = getDownloadKey(book);
    clearDownloadTimer(key);

    // Legacy support
    dispatch(addInFlightDownload(key));

    // Enhanced tracking
    dispatch(startDownload({ book, serverName, retryCount }));

    // Set 60-second timeout
    const timeoutId = window.setTimeout(() => {
      dispatch(updateDownloadStatus({ book, status: DownloadStatus.TIMEOUT }));
      dispatch(removeInFlightDownload(key));
      dispatch(
        addToRetryQueue({
          book,
          serverName,
          status: DownloadStatus.TIMEOUT,
          timestamp: Date.now(),
          progress: 0,
          retryCount
        })
      );
    }, 60000);
    downloadTimeouts.set(key, timeoutId);

    dispatch(setDownloadTimeout({ book, timeoutId }));

    // Send download request
    dispatch(
      sendMessage({
        type: MessageType.DOWNLOAD,
        payload: { book }
      })
    );
  }
);

const retryDownload = createAsyncThunk(
  "state/retry_download",
  (
    { book, serverName }: { book: string; serverName: string },
    { dispatch, getState }
  ) => {
    const state = (getState as () => RootState)();
    const existingRetryCount =
      state.state.retryQueue.find((d) => getDownloadKey(d.book) === getDownloadKey(book))
        ?.retryCount ?? 0;

    dispatch(removeFromRetryQueue(book));
    dispatch(sendDownload({ book, serverName, retryCount: existingRetryCount + 1 }));
  }
);

const cancelDownload = createAsyncThunk(
  "state/cancel_download",
  (book: string, { dispatch, getState }) => {
    const state = (getState as () => RootState)();
    const key = resolveDownloadKey(state.state.downloads, book);
    clearDownloadTimer(key);
    dispatch(clearDownloadTimeout(book));
    dispatch(removeDownload(book));
    dispatch(removeInFlightDownload(key));
  }
);

const clearDownloadTimeoutWithCleanup = createAsyncThunk(
  "state/clear_download_timeout_with_cleanup",
  (book: string, { dispatch, getState }) => {
    const state = (getState as () => RootState)();
    const key = resolveDownloadKey(state.state.downloads, book);
    clearDownloadTimer(key);
    dispatch(clearDownloadTimeout(book));
  }
);

const cancelSearchWithCleanup = createAsyncThunk(
  "state/cancel_search_with_cleanup",
  (_: void, { dispatch }) => {
    clearSearchTimer();
    dispatch(cancelSearch());
  }
);

// Send a search to the server. Add to query history and set loading.
const sendSearch = createAsyncThunk(
  "state/send_sendSearch",
  (queryString: string, { dispatch, getState }) => {
    // Clear any existing search timeout
    clearSearchTimer();
    dispatch(clearSearchTimeout());

    // Send the books search query to the server
    dispatch(
      sendMessage({
        type: MessageType.SEARCH,
        payload: {
          query: queryString
        }
      })
    );

    const timestamp = new Date().getTime();

    // Add query to item history.
    dispatch(addHistoryItem({ query: queryString, timestamp }));
    dispatch(
      setActiveItem({
        query: queryString,
        timestamp: timestamp,
        results: null
      })
    );

    // Set 60-second timeout for stuck searches
    const timeoutId = window.setTimeout(() => {
      const state = (getState as () => RootState)();
      const currentItem = state.state.activeItem;

      // If search is still pending (no results), mark it as failed
      if (currentItem && currentItem.query === queryString && !currentItem.results) {
        dispatch(
          setActiveItem({
            query: queryString,
            timestamp: timestamp,
            results: [],
            errors: [
              {
                error: "Search timed out after 60 seconds. IRC connection may have been lost.",
                line: "No results received from server"
              }
            ]
          })
        );
      }
    }, 60000);
    searchTimeoutHandle = timeoutId;

    dispatch(setSearchTimeout(timeoutId));
  }
);

const setSearchResults = createAsyncThunk<
  Promise<void>,
  SearchResponse,
  { dispatch: AppDispatch; state: RootState }
>(
  "state/set_search_results",
  async ({ books, errors }: SearchResponse, { dispatch, getState }) => {
    // Clear search timeout since results arrived
    clearSearchTimer();
    dispatch(clearSearchTimeout());

    const activeItem = getState().state.activeItem;
    if (activeItem === null) {
      return;
    }
    const updatedItem: HistoryItem = {
      query: activeItem.query,
      timestamp: activeItem.timestamp,
      results: books,
      errors: errors
    };

    dispatch(setActiveItem(updatedItem));
    dispatch(updateHistoryItem(updatedItem));
    dispatch(openbooksApi.util.invalidateTags(["servers"]));
  }
);

export const {
  setActiveItem,
  setConnectionState,
  setUsername,
  addInFlightDownload,
  removeInFlightDownload,
  startDownload,
  updateDownloadStatus,
  updateDownloadProgress,
  setDownloadTimeout,
  clearDownloadTimeout,
  removeDownload,
  addToRetryQueue,
  removeFromRetryQueue,
  incrementRetryCount,
  toggleSidebar,
  openSidebarTab,
  setSidebarTab,
  setSearchTimeout,
  clearSearchTimeout,
  cancelSearch
} = stateSlice.actions;

export {
  stateSlice,
  sendMessage,
  sendDownload,
  retryDownload,
  cancelDownload,
  clearDownloadTimeoutWithCleanup,
  cancelSearchWithCleanup,
  sendSearch,
  setSearchResults
};

export default stateSlice.reducer;
