import { Card, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { useGetServersQuery } from "../../state/api";
import { GroupedBook } from "../../utils/bookUtils";
import SourceRow from "./SourceRow";

interface BookCardProps {
  groupedBook: GroupedBook;
}

export default function BookCard({ groupedBook }: BookCardProps) {
  const { data: servers } = useGetServersQuery(null);
  const [expanded, setExpanded] = useState(false);

  const { title, author, sources, bestSource } = groupedBook;
  const hasMultipleSources = sources.length > 1;

  const displayedSources = expanded ? sources : [bestSource];

  return (
    <Card
      shadow="sm"
      p="md"
      radius="md"
      withBorder
      sx={(theme) => ({
        marginBottom: theme.spacing.md,
        backgroundColor:
          theme.colorScheme === "dark" ? theme.colors.dark[6] : theme.white
      })}>
      <Stack spacing="xs">
        <Text
          size="lg"
          weight={600}
          lineClamp={2}
          sx={{ lineHeight: 1.3 }}
          color="dark">
          {title}
        </Text>
        <Text size="sm" color="dimmed" sx={{ marginBottom: 4 }}>
          {author}
        </Text>

        <Stack spacing="xs">
          {displayedSources.map((source, index) => (
            <SourceRow
              key={`${source.server}-${index}`}
              source={source}
              servers={servers}
              isBest={index === 0 && hasMultipleSources && !expanded}
            />
          ))}
        </Stack>

        {hasMultipleSources && (
          <Text
            size="sm"
            color="brand"
            align="center"
            sx={{
              cursor: "pointer",
              padding: "8px",
              userSelect: "none",
              "&:hover": {
                textDecoration: "underline"
              }
            }}
            onClick={() => setExpanded(!expanded)}>
            {expanded
              ? "▲ Collapse"
              : `▼ Show ${sources.length - 1} more source${sources.length - 1 === 1 ? "" : "s"}`}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
