import {
  ActionIcon,
  Badge,
  Card,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip
} from "@mantine/core";
import { ArrowCounterClockwise, X } from "@phosphor-icons/react";
import {
  removeFromRetryQueue,
  retryDownload
} from "../state/stateSlice";
import { Download } from "../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../state/store";

export default function RetryQueue() {
  const dispatch = useAppDispatch();
  const retryQueue = useAppSelector((state) => state.state.retryQueue);

  if (retryQueue.length === 0) return null;

  const queue = [...retryQueue].sort(
    (a, b) => (a.nextRetry ?? Number.MAX_SAFE_INTEGER) - (b.nextRetry ?? Number.MAX_SAFE_INTEGER)
  );

  const formatNextRetry = (timestamp?: number) => {
    if (!timestamp) return "Unknown";
    const minutes = Math.floor((timestamp - Date.now()) / 60000);
    if (minutes < 1) return "Soon";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h`;
  };

  return (
    <Card
      shadow="sm"
      p="md"
      radius="md"
      withBorder
      sx={(theme) => ({
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.orange[0]
      })}>
      <Stack spacing="xs">
        <Group position="apart">
          <Group spacing="xs">
            <ArrowCounterClockwise size={18} weight="bold" />
            <Text size="sm" weight={600}>
              Retry Queue ({queue.length})
            </Text>
          </Group>
          <Badge size="xs" color="orange">
            Auto-retry every hour
          </Badge>
        </Group>

        <Text size="xs" color="dimmed">
          Failed downloads will retry automatically. You can retry now or remove items.
        </Text>

        <ScrollArea.Autosize maxHeight={240} type="auto">
          <Stack spacing="xs">
            {queue.map((download: Download) => (
              <Card key={download.book} p="xs" withBorder radius="md">
                <Group position="apart" align="flex-start" spacing={8}>
                  <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                    <Text size="xs" weight={600} lineClamp={1}>
                      {download.serverName}
                    </Text>
                    <Text size="xs" color="dimmed" lineClamp={1}>
                      {download.book}
                    </Text>
                    <Text size="xs" color="dimmed">
                      Retry #{download.retryCount + 1} in{" "}
                      {formatNextRetry(download.nextRetry)}
                    </Text>
                  </Stack>

                  <Group spacing={6}>
                    <Tooltip label="Retry now">
                      <ActionIcon
                        size="md"
                        color="orange"
                        variant="light"
                        onClick={() =>
                          dispatch(
                            retryDownload({
                              book: download.book,
                              serverName: download.serverName
                            })
                          )
                        }>
                        <ArrowCounterClockwise size={14} weight="bold" />
                      </ActionIcon>
                    </Tooltip>

                    <Tooltip label="Remove from queue">
                      <ActionIcon
                        size="md"
                        color="red"
                        variant="light"
                        onClick={() => dispatch(removeFromRetryQueue(download.book))}>
                        <X size={14} weight="bold" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </Card>
  );
}
