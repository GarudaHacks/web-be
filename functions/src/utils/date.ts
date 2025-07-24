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