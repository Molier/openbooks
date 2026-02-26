import { Button, Card, Group, Stack, Text } from "@mantine/core";
import { Books } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { defaultAnimation } from "../../../utils/animation";

interface SearchActivityCardsProps {
  hasDownloadActivity: boolean;
  isSearching: boolean;
  searchingIconClassName: string;
  onOpenDownloads: () => void;
}

export default function SearchActivityCards({
  hasDownloadActivity,
  isSearching,
  searchingIconClassName,
  onOpenDownloads
}: SearchActivityCardsProps) {
  return (
    <>
      <AnimatePresence>
        {hasDownloadActivity && (
          <motion.div style={{ width: "100%", marginBottom: 12 }} {...defaultAnimation}>
            <Card
              withBorder
              radius="md"
              p="sm"
              sx={(theme) => ({
                backgroundColor:
                  theme.colorScheme === "dark"
                    ? theme.colors.dark[6]
                    : theme.colors.blue[0]
              })}>
              <Group position="apart" spacing="sm">
                <Group spacing="xs" sx={{ minWidth: 0 }}>
                  <Books size={18} weight="bold" />
                  <Text size="sm" sx={{ lineHeight: 1.35 }}>
                    Downloads appear in{" "}
                    <strong>Sidebar {"->"} Previous Downloads</strong>.
                  </Text>
                </Group>
                <Button size="xs" radius="md" onClick={onOpenDownloads}>
                  Open
                </Button>
              </Group>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSearching && (
          <motion.div style={{ width: "100%", marginBottom: 12 }} {...defaultAnimation}>
            <Card withBorder radius="md" p="sm">
              <Group noWrap spacing="sm">
                <motion.div
                  className={searchingIconClassName}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}>
                  <Books size={16} weight="bold" />
                </motion.div>
                <Stack spacing={0}>
                  <Text size="sm" weight={600}>
                    Searching IRC lists...
                  </Text>
                  <Text size="xs" color="dimmed">
                    Results will appear only in this session.
                  </Text>
                </Stack>
              </Group>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
