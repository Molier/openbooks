import { ActionIcon, Button, Group, Indicator, TextInput } from "@mantine/core";
import { MagnifyingGlass, Sidebar } from "@phosphor-icons/react";
import { ChangeEvent } from "react";

interface SearchHeaderProps {
  opened: boolean;
  hasDownloadActivity: boolean;
  activeDownloadsCount: number;
  searchQuery: string;
  isSearching: boolean;
  validInput: boolean;
  sidebarPulseClassName?: string;
  onToggleSidebar: () => void;
  onSearchQueryChange: (value: string) => void;
  onCancelSearch: () => void;
}

export default function SearchHeader({
  opened,
  hasDownloadActivity,
  activeDownloadsCount,
  searchQuery,
  isSearching,
  validInput,
  sidebarPulseClassName,
  onToggleSidebar,
  onSearchQueryChange,
  onCancelSearch
}: SearchHeaderProps) {
  return (
    <Group
      spacing="md"
      sx={{
        marginBottom: 16,
        alignItems: "stretch",
        flexWrap: "nowrap",
        "@media (max-width: 900px)": {
          flexWrap: "wrap"
        }
      }}>
      {!opened && (
        <Indicator
          disabled={!hasDownloadActivity}
          color="brand"
          label={activeDownloadsCount > 0 ? activeDownloadsCount : undefined}
          size={16}
          zIndex={1}
          withBorder={false}>
          <ActionIcon
            size="lg"
            className={hasDownloadActivity ? sidebarPulseClassName : undefined}
            onClick={onToggleSidebar}>
            <Sidebar weight="bold" size={20}></Sidebar>
          </ActionIcon>
        </Indicator>
      )}

      <TextInput
        variant="filled"
        value={searchQuery}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onSearchQueryChange(event.target.value)}
        placeholder={
          isSearching
            ? "Searching... (click Cancel to stop)"
            : "Search for a book..."
        }
        radius="md"
        type="search"
        icon={<MagnifyingGlass weight="bold" size={22} />}
        required
        sx={{ flex: 1, minWidth: 260 }}
      />

      {isSearching ? (
        <Button color="red" radius="md" onClick={onCancelSearch} variant="filled" sx={{ minWidth: 80 }}>
          Cancel
        </Button>
      ) : (
        <Button
          type="submit"
          color="brand"
          disabled={!validInput}
          radius="md"
          variant={validInput ? "gradient" : "default"}
          gradient={{ from: "brand.4", to: "brand.3" }}
          sx={{ minWidth: 80 }}>
          Search
        </Button>
      )}
    </Group>
  );
}
