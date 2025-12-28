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
  retryCount: number;
  nextRetry?: number;
}

interface AppState {
  isConnected: boolean;
  isSidebarOpen: boolean;
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

const initialState: AppState = {
  isConnected: false,
  isSidebarOpen: false,
  activeItem: loadActive(),
  username: undefined,
  inFlightDownloads: [],
  downloads: {},
  retryQueue: []
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
      state.inFlightDownloads.push(action.payload);
    },
    removeInFlightDownload(state, action: PayloadAction<string | undefined>) {
      if (action.payload) {
        state.inFlightDownloads = state.inFlightDownloads.filter(
          (item) => item !== action.payload
        );
      } else {
        state.inFlightDownloads.shift();
      }
    },
    // Enhanced download management
    startDownload(
      state,
      action: PayloadAction<{ book: string; serverName: string }>
    ) {
      const { book, serverName } = action.payload;
      state.downloads[book] = {
        book,
        serverName,
        status: DownloadStatus.PENDING,
        timestamp: Date.now(),
        retryCount: 0
      };
    },
    updateDownloadStatus(
      state,
      action: PayloadAction<{ book: string; status: DownloadStatus }>
    ) {
      const { book, status } = action.payload;
      if (state.downloads[book]) {
        state.downloads[book].status = status;
      }
    },
    setDownloadTimeout(
      state,
      action: PayloadAction<{ book: string; timeoutId: number }>
    ) {
      const { book, timeoutId } = action.payload;
      if (state.downloads[book]) {
        state.downloads[book].timeoutId = timeoutId;
      }
    },
    clearDownloadTimeout(state, action: PayloadAction<string>) {
      const book = action.payload;
      if (state.downloads[book]?.timeoutId) {
        clearTimeout(state.downloads[book].timeoutId);
        delete state.downloads[book].timeoutId;
      }
    },
    removeDownload(state, action: PayloadAction<string>) {
      const book = action.payload;
      if (state.downloads[book]?.timeoutId) {
        clearTimeout(state.downloads[book].timeoutId);
      }
      delete state.downloads[book];
    },
    addToRetryQueue(state, action: PayloadAction<Download>) {
      const download = action.payload;
      // Don't add if already in queue
      if (!state.retryQueue.find((d) => d.book === download.book)) {
        state.retryQueue.push({
          ...download,
          nextRetry: Date.now() + 3600000 // Retry in 1 hour
        });
      }
    },
    removeFromRetryQueue(state, action: PayloadAction<string>) {
      state.retryQueue = state.retryQueue.filter((d) => d.book !== action.payload);
    },
    incrementRetryCount(state, action: PayloadAction<string>) {
      const book = action.payload;
      const queueItem = state.retryQueue.find((d) => d.book === book);
      if (queueItem) {
        queueItem.retryCount++;
        queueItem.nextRetry = Date.now() + 3600000; // Next retry in 1 hour
      }
    },
    toggleSidebar(state) {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSearchTimeout(state, action: PayloadAction<number>) {
      // Clear any existing timeout
      if (state.searchTimeoutId) {
        clearTimeout(state.searchTimeoutId);
      }
      state.searchTimeoutId = action.payload;
    },
    clearSearchTimeout(state) {
      if (state.searchTimeoutId) {
        clearTimeout(state.searchTimeoutId);
        delete state.searchTimeoutId;
      }
    },
    cancelSearch(state) {
      // Clear timeout
      if (state.searchTimeoutId) {
        clearTimeout(state.searchTimeoutId);
        delete state.searchTimeoutId;
      }
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
    { book, serverName }: { book: string; serverName: string },
    { dispatch }
  ) => {
    // Legacy support
    dispatch(addInFlightDownload(book));

    // Enhanced tracking
    dispatch(startDownload({ book, serverName }));

    // Set 60-second timeout
    const timeoutId = window.setTimeout(() => {
      dispatch(updateDownloadStatus({ book, status: DownloadStatus.TIMEOUT }));
      dispatch(removeInFlightDownload(book));
    }, 60000);

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
  ({ book, serverName }: { book: string; serverName: string }, { dispatch }) => {
    dispatch(removeFromRetryQueue(book));
    dispatch(sendDownload({ book, serverName }));
  }
);

const cancelDownload = createAsyncThunk(
  "state/cancel_download",
  (book: string, { dispatch }) => {
    dispatch(clearDownloadTimeout(book));
    dispatch(removeDownload(book));
    dispatch(removeInFlightDownload(book));
  }
);

// Send a search to the server. Add to query history and set loading.
const sendSearch = createAsyncThunk(
  "state/send_sendSearch",
  (queryString: string, { dispatch, getState }) => {
    // Clear any existing search timeout
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
  setDownloadTimeout,
  clearDownloadTimeout,
  removeDownload,
  addToRetryQueue,
  removeFromRetryQueue,
  incrementRetryCount,
  toggleSidebar,
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
  sendSearch,
  setSearchResults
};

export default stateSlice.reducer;
