const ENCODING_MAP: Record<string, string> = {
  '0': 'C', '1': 'R', '2': 'A', '3': 'Z', '4': 'Y',
  '5': 'W', '6': 'O', '7': 'M', '8': 'E', '9': 'N',
  '.': 'X',
};

const DECODING_MAP: Record<string, string> = {
  'C': '0', 'R': '1', 'A': '2', 'Z': '3', 'Y': '4',
  'W': '5', 'O': '6', 'M': '7', 'E': '8', 'N': '9',
  'X': '.',
};

/**
 * Encode cost using CRAZYWOMEN cipher
 */
export function encodeCost(cost: number): string {
  const costStr = Math.floor(cost).toString();
  return costStr
    .split('')
    .map((char) => ENCODING_MAP[char] || char)
    .join('');
}

/**
 * Decode cost from CRAZYWOMEN cipher
 */
export function decodeCost(encoded: string): string {
  return encoded
    .split('')
    .map((char) => DECODING_MAP[char] || char)
    .join('');
}

/**
 * Encode cost with vendor-specific logic 
 * (Only CRAZYWOMEN vendors get encoded)
 */
export function encodeCostForVendor(cost: number | string, vendorName: string): string {
  const costStr = typeof cost === 'number' ? cost.toString() : cost;

  if (
    vendorName.toUpperCase().includes('CRAZY') ||
    vendorName.toUpperCase().includes('WOMEN')
  ) {
    return costStr
      .split('')
      .map((char) => ENCODING_MAP[char] || char)
      .join('');
  }

  return costStr;
}
