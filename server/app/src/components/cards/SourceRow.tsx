import {
  Badge,
  Button,
  Group,
  Indicator,
  Loader,
  Text,
  Tooltip
} from "@mantine/core";
import { Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { BookDetail } from "../../state/messages";
import {
  DownloadStatus,
  retryDownload,
  sendDownload
} from "../../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../../state/store";
import { formatSize } from "../../utils/bookUtils";

interface SourceRowProps {
  source: BookDetail;
  servers?: string[];
  isBest?: boolean;
}

export default function SourceRow({
  source,
  servers,
  isBest = false
}: SourceRowProps) {
  const dispatch = useAppDispatch();
  const online = servers?.includes(source.server) ?? false;

  const download = useAppSelector(
    (state) => state.state.downloads[source.full]
  );
  const isInFlight = useAppSelector((state) =>
    state.state.inFlightDownloads.includes(source.full)
  );

  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    if (!download || download.status !== DownloadStatus.PENDING) {
      setTimeElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - download.timestamp) / 1000);
      setTimeElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [download]);

  const getStatusMessage = () => {
    if (!download) return "Download";

    switch (download.status) {
      case DownloadStatus.PENDING:
        if (timeElapsed < 5) return `Requesting...`;
        if (timeElapsed < 30) return `Waiting...`;
        return `Still waiting...`;
      case DownloadStatus.DOWNLOADING:
        return "Downloading...";
      case DownloadStatus.SUCCESS:
        return "✓ Done";
      case DownloadStatus.TIMEOUT:
        return "Retry";
      case DownloadStatus.FAILED:
        return "Retry";
      default:
        return "Download";
    }
  };

  const onClick = () => {
    if (download?.status === DownloadStatus.PENDING || isInFlight) return;

    if (
      download?.status === DownloadStatus.TIMEOUT ||
      download?.status === DownloadStatus.FAILED
    ) {
      dispatch(retryDownload({ book: source.full, serverName: source.server }));
    } else {
      dispatch(sendDownload({ book: source.full, serverName: source.server }));
    }
  };

  const isDisabled =
    download?.status === DownloadStatus.PENDING ||
    download?.status === DownloadStatus.DOWNLOADING ||
    isInFlight;

  const getButtonColor = () => {
    if (download?.status === DownloadStatus.SUCCESS) return "green";
    if (
      download?.status === DownloadStatus.TIMEOUT ||
      download?.status === DownloadStatus.FAILED
    )
      return "orange";
    if (!online) return "gray";
    return "blue";
  };

  return (
    <Group
      position="apart"
      noWrap
      p="sm"
      sx={(theme) => ({
        backgroundColor:
          theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.colors.gray[0],
        borderRadius: theme.radius.md
      })}>
      <Group spacing="xs" sx={{ flex: 1, minWidth: 0 }}>
        <Tooltip
          position="top-start"
          label={online ? "Online" : "Offline"}
          withArrow>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: online ? "#4ade80" : "#aaa",
              flexShrink: 0
            }}
          />
        </Tooltip>

        <Text size="sm" weight={500} color="dark" sx={{ flexShrink: 0 }}>
          {source.server}
        </Text>

        {isBest && (
          <Badge
            size="xs"
            color="green"
            variant="light"
            sx={{ flexShrink: 0 }}>
            Best
          </Badge>
        )}

        <Text size="sm" color="dimmed" sx={{ flexShrink: 1, minWidth: 0 }}>
          • {source.format} • {formatSize(source.size)}
        </Text>
      </Group>

      <Tooltip
        label={
          !online
            ? "Server may be offline - download might not work"
            : download?.status === DownloadStatus.TIMEOUT
            ? "Server did not respond - click to retry"
            : ""
        }
        disabled={online && !download}
        position="left">
        <Button
          compact
          size="md"
          radius="md"
          onClick={onClick}
          disabled={isDisabled}
          color={getButtonColor()}
          variant={!online ? "subtle" : "filled"}
          sx={{
            fontWeight: 500,
            minWidth: 100,
            minHeight: 48,
            touchAction: "manipulation"
          }}
          aria-label={
            !online
              ? `Download from ${source.server} (may be offline)`
              : download?.status === DownloadStatus.TIMEOUT
              ? `Retry download from ${source.server}`
              : `Download from ${source.server}`
          }
          aria-busy={isDisabled}
          leftIcon={
            !online ? (
              <Warning size={14} weight="fill" aria-hidden="true" />
            ) : isDisabled ? (
              <Loader size="xs" variant="dots" aria-hidden="true" />
            ) : null
          }>
          {getStatusMessage()}
        </Button>
      </Tooltip>
    </Group>
  );
}
