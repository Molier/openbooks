import { HTMLMotionProps } from "framer-motion";

export const defaultAnimation: HTMLMotionProps<"div"> = {
  layout: true,
  initial: { y: 8, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  exit: { y: -6, opacity: 0 },
  transition: { duration: 0.22, ease: "easeOut" }
};
