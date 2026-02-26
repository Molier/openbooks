import { showNotification } from "@mantine/notifications";
import { Notification, NotificationType } from "./messages";

export const getWebsocketURL = (): URL => {
  const websocketURL = new URL(window.location.href + "ws");
  if (websocketURL.protocol.startsWith("https")) {
    websocketURL.protocol = websocketURL.protocol.replace("https", "wss");
  } else {
    websocketURL.protocol = websocketURL.protocol.replace("http", "ws");
  }

  if (import.meta.env.DEV) {
    websocketURL.port = "5228";
  }

  return websocketURL;
};

export const getApiURL = (): URL => {
  const apiURL = new URL(window.location.href);
  if (import.meta.env.DEV) {
    apiURL.port = "5228";
  }

  return apiURL;
};

export const displayNotification = ({
  appearance = NotificationType.NOTIFY,
  title,
  detail
}: Notification) => {
  // Keep mobile UI unobstructed: notifications are available in the drawer.
  if (window.matchMedia("(max-width: 768px)").matches) {
    return;
  }

  const common = {
    title,
    message: detail,
    autoClose: 3000,
    disallowClose: true
  };

  switch (appearance) {
    case NotificationType.NOTIFY:
      showNotification({
        ...common,
        color: "brand",
      });
      break;
    case NotificationType.SUCCESS:
      showNotification({
        ...common,
        color: "green",
      });

      break;
    case NotificationType.WARNING:
      showNotification({
        ...common,
        color: "yellow",
      });
      break;
    case NotificationType.DANGER:
      showNotification({
        ...common,
        color: "red",
      });
      break;
  }
};

export function downloadFile(relativeURL?: string) {
  if (relativeURL === "" || relativeURL === undefined) return;

  let url = getApiURL();
  url.pathname += relativeURL;

  let link = document.createElement("a");
  link.download = "";
  link.target = "_blank";
  link.href = url.href;
  link.click();
  link.remove();
}

export function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
