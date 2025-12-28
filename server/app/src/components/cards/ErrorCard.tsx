import { Badge, Button, Card, Code, Group, Stack, Text } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { showNotification } from "@mantine/notifications";
import { ClipboardText, Warning } from "phosphor-react";
import { ParseError } from "../../state/messages";

interface ErrorCardProps {
  error: ParseError;
}

export default function ErrorCard({ error }: ErrorCardProps) {
  const clipboard = useClipboard();

  const handleCopy = () => {
    // Extract the command part (everything before ::INFO:: or file size)
    const command = error.line.split("::INFO::")[0].trim();
    clipboard.copy(command);
    showNotification({
      title: "Copied to clipboard",
      message: "Paste into search box with ! prefix to download manually",
      color: "green"
    });
  };

  return (
    <Card
      shadow="sm"
      p="md"
      radius="md"
      withBorder
      sx={(theme) => ({
        marginBottom: theme.spacing.md,
        backgroundColor:
          theme.colorScheme === "dark"
            ? theme.colors.dark[6]
            : theme.colors.orange[0],
        borderColor: theme.colors.orange[4],
        borderWidth: 1
      })}>
      <Stack spacing="xs">
        <Group spacing="xs">
          <Badge
            size="sm"
            color="orange"
            variant="filled"
            leftSection={<Warning size={12} weight="fill" />}>
            Manual download required
          </Badge>
        </Group>

        <Text size="sm" color="dimmed" weight={500}>
          Parsing Error:
        </Text>
        <Text size="xs" color="orange">
          {error.error}
        </Text>

        <Code
          block
          sx={(theme) => ({
            fontSize: "11px",
            backgroundColor:
              theme.colorScheme === "dark"
                ? theme.colors.dark[7]
                : theme.colors.gray[1],
            padding: theme.spacing.sm,
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
          })}>
          {error.line}
        </Code>

        <Text size="xs" color="dimmed">
          To download: copy the command below, then paste it into the search box
          above with a ! prefix
        </Text>

        <Button
          size="md"
          color="orange"
          variant="filled"
          onClick={handleCopy}
          leftIcon={<ClipboardText size={16} weight="bold" />}
          sx={{ minHeight: 48, touchAction: "manipulation" }}>
          {clipboard.copied ? "✓ Copied!" : "Copy Command"}
        </Button>
      </Stack>
    </Card>
  );
}
