/**
 * Parse pagination parameters from query string
 */
export function parsePagination(query: any): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Parse date range from query params
 */
export function parseDateRange(query: any): { startDate?: string; endDate?: string } {
  return {
    startDate: query.start_date || query.startDate || undefined,
    endDate: query.end_date || query.endDate || undefined,
  };
}

/**
 * Generate a padded number string
 */
export function padNumber(num: number, length: number): string {
  return num.toString().padStart(length, '0');
}

/**
 * Generate a random alphanumeric string
 */
export function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Format a number as Indian rupee
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(amount);
}

/**
 * Remove undefined keys from an object (useful for building UPDATE queries)
 */
export function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

/**
 * Build a dynamic UPDATE SET clause from an object
 * Returns { setClause: 'col1 = $1, col2 = $2', values: [...], nextIndex: 3 }
 */
export function buildUpdateSet(
  fields: Record<string, any>,
  startIndex: number = 1
): { setClause: string; values: any[]; nextIndex: number } {
  const entries = Object.entries(fields).filter(([_, v]) => v !== undefined);
  const setParts: string[] = [];
  const values: any[] = [];

  entries.forEach(([key, value], i) => {
    // Convert camelCase to snake_case for DB columns
    const columnName = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    setParts.push(`${columnName} = $${startIndex + i}`);
    values.push(value);
  });

  return {
    setClause: setParts.join(', '),
    values,
    nextIndex: startIndex + entries.length,
  };
}

/**
 * Build a dynamic WHERE clause from filter object
 */
export function buildWhereClause(
  filters: Record<string, any>,
  startIndex: number = 1
): { whereClause: string; values: any[]; nextIndex: number } {
  const entries = Object.entries(filters).filter(([_, v]) => v !== undefined && v !== null && v !== '');
  const parts: string[] = [];
  const values: any[] = [];

  entries.forEach(([key, value], i) => {
    const columnName = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    parts.push(`${columnName} = $${startIndex + i}`);
    values.push(value);
  });

  return {
    whereClause: parts.length > 0 ? `WHERE ${parts.join(' AND ')}` : '',
    values,
    nextIndex: startIndex + entries.length,
  };
}
