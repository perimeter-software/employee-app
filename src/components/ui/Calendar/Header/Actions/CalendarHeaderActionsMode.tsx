"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { Mode, calendarModes } from "../../types";
import { useCalendarContext } from "../../../Calendar";
import { calendarModeIconMap } from "../../CalendarModeIconMap";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { clsxm } from "@/lib/utils";

export default function CalendarHeaderActionsMode() {
  const { mode, setMode } = useCalendarContext();

  return (
    <LayoutGroup>
      <ToggleGroup
        className="flex gap-0 -space-x-px rounded-sm border overflow-hidden shadow-sm shadow-black/5 rtl:space-x-reverse"
        type="single"
        variant="outline"
        value={mode}
        onValueChange={(value) => {
          if (value) setMode(value as Mode);
        }}
      >
        {calendarModes.map((modeValue) => {
          const isSelected = mode === modeValue;
          return (
            <motion.div
              key={modeValue}
              layout
              className="flex-1 flex divide-x"
              animate={{ flex: isSelected ? 1.6 : 1 }}
              transition={{
                flex: {
                  type: "spring",
                  stiffness: 400,
                  damping: 30,
                },
              }}
            >
              <ToggleGroupItem
                value={modeValue}
                className={clsxm(
                  "w-full rounded-none shadow-none focus-visible:z-10 text-sm lg:text-base flex items-center justify-center gap-1 lg:gap-2 relative border-none",
                  isSelected && "z-10"
                )}
              >
                <motion.div
                  layout
                  className="flex items-center justify-center gap-1 lg:gap-2 py-1.5 lg:py-2 px-2 lg:px-3"
                  initial={false}
                  animate={{
                    scale: isSelected ? 1 : 0.95,
                  }}
                  transition={{
                    scale: {
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    },
                    layout: {
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    },
                  }}
                >
                  <motion.div
                    layout="position"
                    initial={false}
                    animate={{
                      scale: isSelected ? 0.9 : 1,
                    }}
                    transition={{
                      scale: {
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      },
                    }}
                  >
                    {calendarModeIconMap[modeValue]}
                  </motion.div>
                  <AnimatePresence mode="popLayout">
                    {isSelected && (
                      <motion.p
                        layout="position"
                        key={`text-${modeValue}`}
                        className="font-medium origin-left whitespace-nowrap"
                        initial={{
                          opacity: 0,
                          x: -2,
                          scale: 0.95,
                        }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          scale: 1,
                          transition: {
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                            opacity: { duration: 0.15 },
                          },
                        }}
                        exit={{
                          opacity: 0,
                          x: -2,
                          scale: 0.95,
                          transition: {
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                            opacity: { duration: 0.1 },
                          },
                        }}
                      >
                        {modeValue.charAt(0).toUpperCase() + modeValue.slice(1)}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              </ToggleGroupItem>
            </motion.div>
          );
        })}
      </ToggleGroup>
    </LayoutGroup>
  );
}
