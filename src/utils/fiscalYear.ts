/**
 * Centralized utility for fiscal year calculations.
 * In India, the financial year runs from April 1st to March 31st.
 * Example: For April 1, 2026 to March 31, 2027, the prefix is "2627".
 */

export function getFiscalYearPrefix(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed (0=Jan, 2=Mar, 3=Apr)
  const fullYear = date.getFullYear();
  
  let startYear: number;
  let endYear: number;
  
  if (month >= 3) {
    // April (3) to December (11)
    startYear = fullYear;
    endYear = fullYear + 1;
  } else {
    // January (0) to March (2)
    startYear = fullYear - 1;
    endYear = fullYear;
  }
  
  // Return YY of start and YY of end (e.g., 2026 -> "26", 2027 -> "27" => "2627")
  const startYY = startYear.toString().slice(-2);
  const endYY = endYear.toString().slice(-2);
  
  return `${startYY}${endYY}`;
}

export function getCurrentYearPrefix(): string {
  // Original logic was just the full year (e.g., "2026")
  return new Date().getFullYear().toString();
}
