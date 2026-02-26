import { Chip, Group, ScrollArea, Text } from "@mantine/core";
import { motion } from "framer-motion";
import { defaultAnimation } from "../../../utils/animation";

interface FilterOption {
  value: string;
  label: string;
}

interface SearchFiltersProps {
  showErrors: boolean;
  formatOptions: FilterOption[];
  formatFilter: string;
  autoEpubFilterEnabled: boolean;
  onFormatChange: (value: string) => void;
}

export default function SearchFilters({
  showErrors,
  formatOptions,
  formatFilter,
  autoEpubFilterEnabled,
  onFormatChange
}: SearchFiltersProps) {
  if (showErrors || formatOptions.length <= 2) {
    return null;
  }

  return (
    <motion.div style={{ width: "100%", marginBottom: 12 }} {...defaultAnimation}>
      <ScrollArea type="never">
        <Chip.Group
          value={formatFilter}
          onChange={(value: string) => onFormatChange(value || "all")}
          multiple={false}>
          <Group noWrap spacing={8}>
            {formatOptions.map((option) => (
              <Chip
                key={option.value}
                value={option.value}
                radius="md"
                size="sm"
                variant="filled">
                {option.label}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </ScrollArea>
      {autoEpubFilterEnabled && formatFilter === "epub" && (
        <Text size="xs" color="dimmed" mt={6}>
          EPUB filter auto-enabled because EPUB sources were found.
        </Text>
      )}
    </motion.div>
  );
}
