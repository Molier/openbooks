import {
  AnyAction,
  Dispatch,
  Middleware,
  MiddlewareAPI,
  PayloadAction
} from "@reduxjs/toolkit";
import { openbooksApi } from "./api";
import { deleteHistoryItem } from "./historySlice";
import {
  ConnectionResponse,
  DownloadResponse,
  MessageType,
  Notification,
  NotificationType,
  Response,
  SearchResponse
} from "./messages";
import { addNotification } from "./notificationSlice";
import {
  cancelSearch,
  clearDownloadTimeout,
  DownloadStatus,
  removeDownload,
  removeInFlightDownload,
  sendMessage,
  setConnectionState,
  setSearchResults,
  setUsername,
  updateDownloadStatus
} from "./stateSlice";
import { AppDispatch, RootState } from "./store";
import { displayNotification, downloadFile } from "./util";

// Web socket redux middleware.
// Listens to socket and dispatches handlers.
// Handles send_message actions by sending to socket.
export const websocketConn =
  (wsUrl: string): Middleware =>
  ({ dispatch, getState }: MiddlewareAPI<AppDispatch, RootState>) => {
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => onOpen(dispatch);
    socket.onclose = () => onClose(dispatch);
    socket.onmessage = (message) => route(dispatch, message);
    socket.onerror = (event) =>
      displayNotification({
        appearance: NotificationType.DANGER,
        title: "Unable to connect to server.",
        timestamp: new Date().getTime()
      });

    return (next: Dispatch<AnyAction>) => (action: PayloadAction<any>) => {
      // Send Message action? Send data to the socket.
      if (sendMessage.match(action)) {
        if (socket.readyState === socket.OPEN) {
          socket.send(action.payload.message);
        } else {
          displayNotification({
            appearance: NotificationType.WARNING,
            title: "Server connection closed. Reload page.",
            timestamp: new Date().getTime()
          });
        }
      }

      return next(action);
    };
  };

const onOpen = (dispatch: AppDispatch): void => {
  console.log("WebSocket connected.");
  dispatch(setConnectionState(true));
  dispatch(sendMessage({ type: MessageType.CONNECT, payload: {} }));
};

const onClose = (dispatch: AppDispatch): void => {
  console.log("WebSocket closed.");
  dispatch(setConnectionState(false));

  // Clear any pending searches to prevent stuck state
  // This handles the case where user closes browser mid-search
  dispatch(cancelSearch());

  displayNotification({
    appearance: NotificationType.WARNING,
    title: "Connection lost. Refresh page to reconnect.",
    timestamp: new Date().getTime()
  });
};

const route = (dispatch: AppDispatch, msg: MessageEvent<any>): void => {
  const getNotif = (): Notification => {
    let response = JSON.parse(msg.data) as Response;
    const timestamp = new Date().getTime();
    const notification: Notification = {
      ...response,
      timestamp
    };

    switch (response.type) {
      case MessageType.STATUS:
        return notification;
      case MessageType.CONNECT:
        dispatch(setUsername((response as ConnectionResponse).name));
        return notification;
      case MessageType.SEARCH:
        dispatch(setSearchResults(response as SearchResponse));
        return notification;
      case MessageType.DOWNLOAD:
        const downloadResponse = response as DownloadResponse;
        downloadFile(downloadResponse?.downloadPath);
        dispatch(openbooksApi.util.invalidateTags(["books"]));

        const book = downloadResponse.book;

        // Clear timeout and update status
        if (book) {
          dispatch(clearDownloadTimeout(book));
          dispatch(updateDownloadStatus({ book, status: DownloadStatus.SUCCESS }));
          // Clean up after 5 seconds
          setTimeout(() => {
            dispatch(removeDownload(book));
          }, 5000);
        }

        dispatch(removeInFlightDownload(book));
        return notification;
      case MessageType.RATELIMIT:
        dispatch(deleteHistoryItem());
        return notification;
      default:
        console.error(response);
        return {
          appearance: NotificationType.DANGER,
          title: "Unknown message type. See console.",
          timestamp
        };
    }
  };

  const notif = getNotif();
  dispatch(addNotification(notif));
  displayNotification(notif);
};
