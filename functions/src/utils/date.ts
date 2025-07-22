/**
 * Convert date to time
 * @param date 
 * @returns 
 */
export function dateToStringTime(date: Date) {
  return date.toLocaleString('en-US', { timeStyle: 'short' })
}

/**
 * Convert date to readable string
 * @param epochSecond 
 * @returns 
 */
export function epochToStringDate(epochSecond: number) {
  const startDate = new Date(epochSecond * 1000)
  const startDay = startDate.toLocaleDateString()
  const startTimestamp = startDate.toLocaleString('en-US', { timeStyle: 'short' })
  const start = `${startDay} ${startTimestamp}`
  return start
}