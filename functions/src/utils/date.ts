import { DateTime } from "luxon";

/**
 * Convert date to time
 * @param date
 * @returns
 */
export function dateToStringTime(date: Date) {
  return date.toLocaleString('id-ID', { timeStyle: 'short', timeZone: 'Asia/Jakarta' })
}

/**
 * Convert date to readable string
 * @param epochSecond 
 * @returns 
 */
export function epochToStringDate(epochSecond: number) {
  const startDate = new Date(epochSecond * 1000);
  const startDay = startDate.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
  const startTimestamp = startDate.toLocaleString('id-ID', {
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  });
  const timeZoneName = new Intl.DateTimeFormat('id-ID', {
    timeZoneName: 'short',
    timeZone: 'Asia/Jakarta',
  }).formatToParts(startDate).find(part => part.type === 'timeZoneName')?.value || 'WIB';
  const start = `${startDay} ${startTimestamp} ${timeZoneName}`;
  return start;
}

export interface ScheduleDisplay {
  wib: string;
  utc: string;
  pacific: string;
  pacificLabel: string; // "PST" or "PDT" depending on the date
}

/**
 * Format an epoch-second range in WIB, UTC, and US Pacific time so the
 * same schedule reads correctly wherever the recipient is.
 * @param startEpochSecond
 * @param endEpochSecond
 * @returns
 */
export function epochRangeToScheduleDisplay(
  startEpochSecond: number,
  endEpochSecond: number
): ScheduleDisplay {
  const formatRange = (zone: string): string => {
    const start = DateTime.fromSeconds(startEpochSecond, { zone });
    const end = DateTime.fromSeconds(endEpochSecond, { zone });
    const startStr = start.toFormat("ccc, dd LLL yyyy, HH:mm");
    const endStr = start.hasSame(end, "day")
      ? end.toFormat("HH:mm")
      : end.toFormat("ccc, dd LLL yyyy, HH:mm");
    return `${startStr} - ${endStr}`;
  };

  return {
    wib: formatRange("Asia/Jakarta"),
    utc: formatRange("UTC"),
    pacific: formatRange("America/Los_Angeles"),
    pacificLabel: DateTime.fromSeconds(startEpochSecond, { zone: "America/Los_Angeles" }).toFormat("ZZZZ"),
  };
}