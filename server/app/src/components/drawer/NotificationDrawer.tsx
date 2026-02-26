import {
  ActionIcon,
  Center,
  Drawer,
  Group,
  Notification,
  Stack,
  Text,
  Tooltip,
  useMantineColorScheme
} from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import { BellSimpleSlash } from "@phosphor-icons/react";
import { Notification as AppNotification, NotificationType } from "../../state/messages";
import {
  clearNotifications,
  dismissNotification,
  toggleDrawer
} from "../../state/notificationSlice";
import { useAppDispatch, useAppSelector } from "../../state/store";
import { defaultAnimation } from "../../utils/animation";

export default function NotificationDrawer() {
  const { isOpen, notifications } = useAppSelector((store) => store.notifications);
  const dispatch = useAppDispatch();

  const { colorScheme } = useMantineColorScheme();

  const getIntent = (type: NotificationType): string => {
    switch (type) {
      case NotificationType.NOTIFY:
        return colorScheme === "dark" ? "brand.2" : "brand";
      case NotificationType.DANGER:
        return "red";
      case NotificationType.SUCCESS:
        return "green";
      case NotificationType.WARNING:
        return "yellow";
    }
  };

  return (
    <Drawer
      opened={isOpen}
      onClose={() => dispatch(toggleDrawer())}
      styles={{
        title: {
          width: "100%",
          marginRight: 0
        }
      }}
      title={
        <Group position="apart">
          <Text weight="bold" size="lg">
            Notifications
          </Text>
          <Tooltip label="Clear Notifications" position="left">
            <ActionIcon
              color="brand"
              size="md"
              disabled={notifications.length === 0}
              onClick={() => dispatch(clearNotifications())}>
              <BellSimpleSlash weight="bold" size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      }
      withCloseButton={false}
      position="right"
      padding="sm"
      size={350}>
      {notifications.length === 0 ? (
        <Center>
          <Text size="sm" color="dimmed">
            No notifications.
          </Text>
        </Center>
      ) : (
        <Stack
          spacing="xs"
          style={{ overflow: "scroll", height: "calc(100% - 44px)" }}>
          <Text size="xs" color="dimmed">
            Swipe a card left or right to dismiss.
          </Text>
          <AnimatePresence mode="popLayout">
            {notifications.map((notif: AppNotification) => (
              <motion.div
                {...defaultAnimation}
                key={notif.timestamp}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.x) > 90) {
                    dispatch(dismissNotification(notif));
                  }
                }}>
                <Tooltip
                  position="left"
                  label={new Date(notif.timestamp).toLocaleTimeString("en-US", {
                    timeStyle: "medium"
                  })}>
                  <Text
                    color="dimmed"
                    size="xs"
                    weight={500}
                    style={{ marginBottom: "0.25rem" }}>
                    {new Date(notif.timestamp).toLocaleTimeString("en-US", {
                      timeStyle: "short"
                    })}
                  </Text>
                </Tooltip>
                <Notification
                  color={getIntent(notif.appearance)}
                  styles={{
                    root: {
                      boxShadow: "none"
                    }
                  }}
                  title={notif.title}
                  onClose={() => dispatch(dismissNotification(notif))}>
                  {notif.detail}
                </Notification>
              </motion.div>
            ))}
          </AnimatePresence>
        </Stack>
      )}
    </Drawer>
  );
}
