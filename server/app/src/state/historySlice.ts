import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { BookDetail, ParseError } from "./messages";
import { setActiveItem } from "./stateSlice";
import { AppDispatch, RootState } from "./store";

// HistoryItem represents a single search history item
type HistoryItem = {
  query: string;
  timestamp: number;
  results?: BookDetail[] | null;
  errors?: ParseError[];
};

interface HistoryState {
  items: HistoryItem[];
}

const loadState = (): HistoryItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem("history")!) ?? [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.timestamp === "number")
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    return [];
  }
};

const initialState: HistoryState = {
  items: loadState()
};

export const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    addHistoryItem: (state, action: PayloadAction<HistoryItem>) => {
      state.items = [action.payload, ...state.items].slice(0, 16);
    },
    deleteByTimetamp: (state, action: PayloadAction<number>) => {
      state.items = state.items.filter((x) => x.timestamp !== action.payload);
    },
    updateHistoryItem: (state, action: PayloadAction<HistoryItem>) => {
      const pendingItemIndex = state.items.findIndex(
        (x) => x.timestamp === action.payload.timestamp
      );
      if (pendingItemIndex === -1) {
        state.items = [action.payload, ...state.items].slice(0, 16);
        return;
      }
      state.items[pendingItemIndex] = action.payload;
    }
  }
});

// Delete an item from history. Clear current item and loading state if deleting active search
const deleteHistoryItem = createAsyncThunk<
  Promise<void>,
  number | undefined,
  { dispatch: AppDispatch; state: RootState }
>("history/delete_item", async (timeStamp, { dispatch, getState }) => {
  if (timeStamp === undefined) {
    dispatch(setActiveItem(null));
    const toRemove = getState().history.items.at(0)?.timestamp;
    if (toRemove) {
      dispatch(historySlice.actions.deleteByTimetamp(toRemove));
    }
    return;
  }

  const activeItem = getState().state.activeItem;
  if (activeItem?.timestamp === timeStamp) {
    dispatch(setActiveItem(null));
  }

  dispatch(historySlice.actions.deleteByTimetamp(timeStamp));
});

const { addHistoryItem, updateHistoryItem } = historySlice.actions;

const selectHistory = (state: RootState) =>
  [...state.history.items].sort((a, b) => b.timestamp - a.timestamp);

export type { HistoryItem };
export { deleteHistoryItem, addHistoryItem, updateHistoryItem, selectHistory };

export default historySlice.reducer;
