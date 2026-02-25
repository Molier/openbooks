import { AnyAction, Dispatch, Middleware } from "@reduxjs/toolkit";
import { openbooksApi } from "./api";
import { deleteHistoryItem } from "./historySlice";
import {
  ConnectionResponse,
  DownloadProgressResponse,
  DownloadResponse,
  MessageType,
  Notification,
  NotificationType,
  Response,
  SearchResponse
} from "./messages";
import { addNotification } from "./notificationSlice";
import {
  cancelSearchWithCleanup,
  clearDownloadTimeoutWithCleanup,
  DownloadStatus,
  removeDownload,
  removeInFlightDownload,
  sendMessage,
  setConnectionState,
  setSearchResults,
  setUsername,
  updateDownloadProgress,
  updateDownloadStatus
} from "./stateSlice";
import { displayNotification, downloadFile } from "./util";

// Web socket redux middleware.
// Listens to socket and dispatches handlers.
// Handles send_message actions by sending to socket.
export const websocketConn = (wsUrl: string): Middleware => {
  const middleware: Middleware = ({ dispatch }) => {
    const typedDispatch = dispatch as Dispatch<AnyAction>;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => onOpen(typedDispatch);
    socket.onclose = () => onClose(typedDispatch);
    socket.onmessage = (message) => route(typedDispatch, message);
    socket.onerror = () =>
      displayNotification({
        appearance: NotificationType.DANGER,
        title: "Unable to connect to server.",
        timestamp: new Date().getTime()
      });

    return (next) => (action) => {
      const typedAction = action as AnyAction;

      // Send Message action? Send data to the socket.
      if (sendMessage.match(typedAction)) {
        if (socket.readyState === socket.OPEN) {
          socket.send(typedAction.payload.message);
        } else {
          displayNotification({
            appearance: NotificationType.WARNING,
            title: "Server connection closed. Reload page.",
            timestamp: new Date().getTime()
          });
        }
      }

      return next(typedAction);
    };
  };

  return middleware;
};

const onOpen = (dispatch: Dispatch<AnyAction>): void => {
  console.log("WebSocket connected.");
  dispatch(setConnectionState(true));
  dispatch(sendMessage({ type: MessageType.CONNECT, payload: {} }));
};

const onClose = (dispatch: Dispatch<AnyAction>): void => {
  console.log("WebSocket closed.");
  dispatch(setConnectionState(false));

  // Clear any pending searches to prevent stuck state
  // This handles the case where user closes browser mid-search
  dispatch(cancelSearchWithCleanup() as unknown as AnyAction);

  displayNotification({
    appearance: NotificationType.WARNING,
    title: "Connection lost. Refresh page to reconnect.",
    timestamp: new Date().getTime()
  });
};

const route = (dispatch: Dispatch<AnyAction>, msg: MessageEvent<any>): void => {
  const getNotif = (): Notification | null => {
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
        dispatch(setSearchResults(response as SearchResponse) as unknown as AnyAction);
        return notification;
      case MessageType.DOWNLOAD:
        const downloadResponse = response as DownloadResponse;
        downloadFile(downloadResponse?.downloadPath);
        dispatch(openbooksApi.util.invalidateTags(["books"]));

        const book = downloadResponse.book;

        // Clear timeout and update status
        if (book) {
          dispatch(clearDownloadTimeoutWithCleanup(book) as unknown as AnyAction);
          dispatch(updateDownloadStatus({ book, status: DownloadStatus.SUCCESS }));
          // Clean up after 5 seconds
          setTimeout(() => {
            dispatch(removeDownload(book));
          }, 5000);
        }

        dispatch(removeInFlightDownload(book));
        return notification;
      case MessageType.DOWNLOAD_PROGRESS:
        const progress = response as DownloadProgressResponse;
        dispatch(
          updateDownloadProgress({
            book: progress.book,
            progress: progress.percent
          })
        );
        return null;
      case MessageType.RATELIMIT:
        dispatch(deleteHistoryItem() as unknown as AnyAction);
        return notification;
      case MessageType.SERVER_LIST:
        // Server list has been updated, invalidate cache to refetch
        dispatch(openbooksApi.util.invalidateTags(["servers"]));
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
  if (notif) {
    dispatch(addNotification(notif));
    displayNotification(notif);
  }
};
