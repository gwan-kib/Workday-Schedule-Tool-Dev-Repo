import { debugFor } from "../../lib/debug";
import type { ConflictBlock, ScheduleEvent } from "../../lib/types";

const debug = debugFor("scheduleCollisions");

type MutableConflictBlock = Omit<ConflictBlock, "codes"> & {
  codes: Set<string>;
};

export function detectScheduleConflicts(eventsByDay: Map<string, ScheduleEvent[]> | null | undefined): {
  conflictBlocks: ConflictBlock[];
  conflictCodes: string[];
} {
  const conflictBlocks: MutableConflictBlock[] = [];
  const conflictCodes = new Set<string>();
  const blockMap = new Map<string, MutableConflictBlock>();

  if (!eventsByDay) return { conflictBlocks: [], conflictCodes: [] };

  eventsByDay.forEach((events, day) => {
    if (!Array.isArray(events) || events.length < 2) return;

    const sorted = [...events].sort(
      (left, right) => left.startIdx - right.startIdx || left.endIdx - right.endIdx,
    );

    for (let i = 0; i < sorted.length; i += 1) {
      const left = sorted[i];

      for (let j = i + 1; j < sorted.length; j += 1) {
        const right = sorted[j];
        if (right.startIdx >= left.endIdx) break;

        const overlapStart = Math.max(left.startIdx, right.startIdx);
        const overlapEnd = Math.min(left.endIdx, right.endIdx);
        if (overlapEnd <= overlapStart) continue;

        const key = `${day}|${overlapStart}|${overlapEnd}`;
        const existingBlock = blockMap.get(key);
        const block =
          existingBlock ??
          ({
            day,
            rowStart: overlapStart,
            rowSpan: overlapEnd - overlapStart,
            startIdx: overlapStart,
            endIdx: overlapEnd,
            codes: new Set<string>(),
          } satisfies MutableConflictBlock);

        if (!existingBlock) {
          blockMap.set(key, block);
          conflictBlocks.push(block);
        }

        const codeA = left.code || left.title;
        const codeB = right.code || right.title;

        if (codeA) {
          block.codes.add(codeA);
          conflictCodes.add(codeA);
        }

        if (codeB) {
          block.codes.add(codeB);
          conflictCodes.add(codeB);
        }
      }
    }
  });

  const normalizedBlocks: ConflictBlock[] = conflictBlocks.map((block) => ({
    ...block,
    codes: Array.from(block.codes).sort((left, right) => left.localeCompare(right)),
  }));

  const codes = Array.from(conflictCodes).sort((left, right) => left.localeCompare(right));
  debug.log({ id: "scheduleCollisions.detect" }, "Detected schedule conflicts", {
    codes,
    blocks: normalizedBlocks,
  });

  return {
    conflictBlocks: normalizedBlocks,
    conflictCodes: codes,
  };
}
