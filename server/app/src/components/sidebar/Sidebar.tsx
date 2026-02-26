import {
  ActionIcon,
  Burger,
  Button,
  createStyles,
  Drawer,
  Group,
  MediaQuery,
  Menu,
  Navbar,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  BellSimple,
  Bug,
  IdentificationBadge,
  MoonStars,
  Plugs,
  Sidebar as SidebarIcon,
  Sun
} from "@phosphor-icons/react";
import { useGetServersQuery } from "../../state/api";
import { toggleDrawer } from "../../state/notificationSlice";
import { setSidebarTab, toggleSidebar } from "../../state/stateSlice";
import { useAppDispatch, useAppSelector } from "../../state/store";
import { downloadTextFile } from "../../state/util";
import History from "./History";
import Library from "./Library";

const useStyles = createStyles((theme) => {
  return {
    navbar: {
      backgroundColor:
        theme.colorScheme === "dark" ? theme.colors.dark[7] : theme.white
    },
    footer: {
      borderTop: `1px solid ${
        theme.colorScheme === "dark"
          ? theme.colors.dark[4]
          : theme.colors.gray[3]
      }`,
      paddingTop: theme.spacing.sm
    }
  };
});

export default function Sidebar() {
  const { classes } = useStyles();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  const dispatch = useAppDispatch();
  const connected = useAppSelector((store) => store.state.isConnected);
  const username = useAppSelector((store) => store.state.username);
  const opened = useAppSelector((store) => store.state.isSidebarOpen);
  const sidebarTab = useAppSelector((store) => store.state.sidebarTab);
  const activeItem = useAppSelector((store) => store.state.activeItem);
  const historyItems = useAppSelector((store) => store.history.items);
  const notifications = useAppSelector((store) => store.notifications.notifications);
  const retryQueue = useAppSelector((store) => store.state.retryQueue);
  const downloads = useAppSelector((store) => store.state.downloads);
  const { data: servers } = useGetServersQuery(null);

  const isMobile = useMediaQuery("(max-width: 768px)");

  const exportSessionLog = (mode: "normal" | "debug") => {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const lines = [
      "OpenBooks Session Log",
      `Generated: ${now.toISOString()}`,
      `Mode: ${mode}`,
      "",
      `Connected: ${connected}`,
      `Username: ${username ?? "unknown"}`,
      `Sidebar tab: ${sidebarTab}`,
      `Current URL: ${window.location.href}`,
      `User agent: ${navigator.userAgent}`,
      "",
      `Active search: ${activeItem?.query ?? "none"}`,
      `Active results: ${activeItem?.results?.length ?? 0}`,
      `Active parse errors: ${activeItem?.errors?.length ?? 0}`,
      "",
      `Known online users: ${servers?.length ?? 0}`,
      `Retry queue size: ${retryQueue.length}`,
      `Tracked downloads: ${Object.keys(downloads).length}`,
      `Stored history items: ${historyItems.length}`,
      `Stored notifications: ${notifications.length}`,
      "",
      "Recent notifications:",
      ...notifications.slice(0, 12).map((item) => {
        const time = new Date(item.timestamp).toISOString();
        return `- [${time}] ${item.title}${item.detail ? ` | ${item.detail}` : ""}`;
      }),
      "",
      "Recent history:",
      ...historyItems.slice(0, 12).map((item) => {
        const time = new Date(item.timestamp).toISOString();
        return `- [${time}] ${item.query} | results=${item.results?.length ?? 0} errors=${item.errors?.length ?? 0}`;
      })
    ];

    if (mode === "debug") {
      lines.push(
        "",
        "Debug JSON:",
        JSON.stringify(
          {
            activeItem,
            retryQueue,
            downloads,
            historyItems,
            notifications,
            servers
          },
          null,
          2
        )
      );
    }

    downloadTextFile(`openbooks-session-${mode}-${stamp}.txt`, lines.join("\n"));
  };

  const sidebarContent = (
    <>
      <Group p="sm">
        <Group position="apart" style={{ width: "100%" }}>
          <Text weight="bold" size="lg">
            OpenBooks
          </Text>
          <Group>
            <Tooltip
              label={`OpenBooks server ${
                connected ? "connected" : "disconnected"
              }.`}>
              <ActionIcon
                disabled={!connected}
                onClick={() => dispatch(toggleDrawer())}>
                <BellSimple weight="bold" size={18} />
              </ActionIcon>
            </Tooltip>
            <MediaQuery largerThan="sm" styles={{ display: "none" }}>
              <Burger
                opened={opened}
                onClick={() => dispatch(toggleSidebar())}
                size="sm"
              />
            </MediaQuery>
          </Group>
        </Group>

        <Text size="sm" color="dimmed" style={{ width: "100%" }}>
          Download eBooks from IRC Highway
        </Text>

        <SegmentedControl
          size="sm"
          styles={(theme) => ({
            root: {
              marginTop: theme.spacing.md,
              width: "100%"
            },
            label: {
              fontSize: theme.fontSizes.xs
            }
          })}
          value={sidebarTab}
          onChange={(value: "books" | "history") => dispatch(setSidebarTab(value))}
          data={[
            { label: "Search History", value: "history" },
            { label: "Previous Downloads", value: "books" }
          ]}
          fullWidth
        />
      </Group>

      <div style={{ flex: 1, padding: "0.5rem", overflow: "auto" }}>
        {sidebarTab === "history" ? <History /> : <Library />}
      </div>

      <div className={classes.footer} style={{ padding: "0.75rem" }}>
        <Stack spacing="xs">
          <Group position="apart" noWrap>
            <Group>
              {username ? (
                <>
                  <IdentificationBadge size={24} />
                  <Text
                    size="sm"
                    lineClamp={1}
                    style={{
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}>
                    {username}
                  </Text>
                </>
              ) : (
                <>
                  <Plugs size={24} />
                  <Text size="sm">Not connected.</Text>
                </>
              )}
            </Group>

            <Group align="end" spacing="xs">
              <ActionIcon onClick={() => toggleColorScheme()}>
                {colorScheme === "dark" ? (
                  <Sun size={18} weight="bold" />
                ) : (
                  <MoonStars size={18} weight="bold" />
                )}
              </ActionIcon>
              <ActionIcon onClick={() => dispatch(toggleSidebar())}>
                <SidebarIcon weight="bold" size={18} />
              </ActionIcon>
            </Group>
          </Group>

          <Menu shadow="md" position="top-start" withinPortal>
            <Menu.Target>
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftIcon={<Bug size={14} weight="bold" />}
                fullWidth>
                Issue Log
              </Button>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item onClick={() => exportSessionLog("normal")}>Download issue log</Menu.Item>
              <Menu.Item onClick={() => exportSessionLog("debug")}>Download debug log</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Stack>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer
        opened={opened}
        onClose={() => dispatch(toggleSidebar())}
        padding={0}
        size={300}
        withCloseButton={false}
        styles={{
          drawer: {
            display: "flex",
            flexDirection: "column",
            height: "100%"
          }
        }}
        className={classes.navbar}>
        {sidebarContent}
      </Drawer>
    );
  }

  if (!opened) {
    return <></>;
  }

  return (
    <Navbar
      width={{ sm: 300 }}
      hiddenBreakpoint="sm"
      hidden={!opened}
      className={classes.navbar}
      style={{ display: "flex", flexDirection: "column" }}>
      {sidebarContent}
    </Navbar>
  );
}
