import type { HistoryRecord } from "trick-or-test/report";

export type TimelineEntry = {
  /** Run time of the history record. */
  time: string;
  gitCommit: string;
  newlyKilledIds: string[];
  /** `statusCounts.Survived` of the record. */
  survivors: number;
};

/**
 * One entry per history record, ordered by `time` ascending. Records with equal `time`
 * keep their input order. Pure: does not mutate `history`.
 */
export const buildTimeline = (history: readonly HistoryRecord[]): TimelineEntry[] =>
  history
    .map((record, index) => ({ record, index, at: Date.parse(record.time) }))
    .sort((a, b) => {
      if (a.at !== b.at) return a.at - b.at;
      if (a.record.time !== b.record.time) return a.record.time < b.record.time ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ record }) => ({
      time: record.time,
      gitCommit: record.gitCommit,
      newlyKilledIds: [...record.newlyKilledIds],
      survivors: record.statusCounts.Survived,
    }));
