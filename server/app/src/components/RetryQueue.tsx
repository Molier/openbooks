import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Text,
  Tooltip
} from "@mantine/core";
import { ArrowCounterClockwise, X } from "phosphor-react";
import { useSelector } from "react-redux";
import {
  removeFromRetryQueue,
  retryDownload
} from "../state/stateSlice";
import { RootState, useAppDispatch } from "../state/store";

export default function RetryQueue() {
  const dispatch = useAppDispatch();
  const retryQueue = useSelector((state: RootState) => state.state.retryQueue);

  if (retryQueue.length === 0) return null;

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
              Retry Queue ({retryQueue.length})
            </Text>
          </Group>
          <Badge size="xs" color="orange">
            Auto-retry every hour
          </Badge>
        </Group>

        <Text size="xs" color="dimmed">
          These downloads failed or timed out. They'll be retried automatically.
        </Text>

        <Stack spacing="xs">
          {retryQueue.slice(0, 5).map((download) => (
            <Card key={download.book} p="xs" withBorder>
              <Group position="apart" noWrap>
                <Stack spacing={2} sx={{ flex: 1, minWidth: 0 }}>
                  <Text size="xs" weight={500} lineClamp={1}>
                    {download.serverName}
                  </Text>
                  <Text size="xs" color="dimmed" lineClamp={1}>
                    Retry #{download.retryCount + 1} in{" "}
                    {formatNextRetry(download.nextRetry)}
                  </Text>
                </Stack>
                <Group spacing="xs" noWrap>
                  <Tooltip label="Retry now">
                    <ActionIcon
                      size="sm"
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
                      size="sm"
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

        {retryQueue.length > 5 && (
          <Text size="xs" color="dimmed" align="center">
            +{retryQueue.length - 5} more in queue
          </Text>
        )}
      </Stack>
    </Card>
  );
}
