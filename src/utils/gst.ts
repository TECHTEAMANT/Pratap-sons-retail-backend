export type GSTType = 'AUTO_5_18' | 'FLAT_5';

export interface GSTCalculation {
  gstPercentage: number;
  cgstPercentage: number;
  sgstPercentage: number;
  cgstAmount: number;
  sgstAmount: number;
  totalGst: number;
}

export function calculateGST(
  taxableValue: number,
  gstLogic: GSTType
): GSTCalculation {
  let gstPercentage: number;

  if (gstLogic === 'AUTO_5_18') {
    gstPercentage = taxableValue < 2500 ? 5 : 18;
  } else {
    gstPercentage = 5;
  }

  const cgstPercentage = gstPercentage / 2;
  const sgstPercentage = gstPercentage / 2;

  const totalGst = (taxableValue * gstPercentage) / 100;
  const cgstAmount = totalGst / 2;
  const sgstAmount = totalGst / 2;

  return {
    gstPercentage,
    cgstPercentage,
    sgstPercentage,
    cgstAmount: parseFloat(cgstAmount.toFixed(2)),
    sgstAmount: parseFloat(sgstAmount.toFixed(2)),
    totalGst: parseFloat(totalGst.toFixed(2)),
  };
}

export function calculateReverseGST(
  mrpInclusive: number,
  gstLogic: GSTType
): { basePrice: number; gstAmount: number; gstPercentage: number } {
  let gstPercentage: number;

  if (gstLogic === 'AUTO_5_18') {
    gstPercentage = mrpInclusive < 2500 ? 5 : 18;
  } else {
    gstPercentage = 5;
  }

  const basePrice = mrpInclusive / (1 + gstPercentage / 100);
  const gstAmount = mrpInclusive - basePrice;

  return {
    basePrice: parseFloat(basePrice.toFixed(2)),
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    gstPercentage,
  };
}

export function applyRoundOff(amount: number): { rounded: number; roundOff: number } {
  const rounded = Math.round(amount);
  const roundOff = parseFloat((rounded - amount).toFixed(2));
  return { rounded, roundOff };
}

export interface InvoiceCalculation {
  totalMrp: number;
  totalDiscount: number;
  taxableValue: number;
  cgst5: number;
  sgst5: number;
  cgst18: number;
  sgst18: number;
  totalGst: number;
  subtotal: number;
  roundOff: number;
  netPayable: number;
}

export interface InvoiceItem {
  mrp: number;
  discount: number;
  gstLogic: GSTType;
}

export function calculateInvoiceTotal(
  items: InvoiceItem[],
  loyaltyRedemption: number = 0
): InvoiceCalculation {
  let totalMrp = 0;
  let totalDiscount = 0;
  let cgst5 = 0;
  let sgst5 = 0;
  let cgst18 = 0;
  let sgst18 = 0;

  items.forEach((item) => {
    totalMrp += item.mrp;
    totalDiscount += item.discount;

    const taxableValue = item.mrp - item.discount;
    const gst = calculateGST(taxableValue, item.gstLogic);

    if (gst.gstPercentage === 5) {
      cgst5 += gst.cgstAmount;
      sgst5 += gst.sgstAmount;
    } else if (gst.gstPercentage === 18) {
      cgst18 += gst.cgstAmount;
      sgst18 += gst.sgstAmount;
    }
  });

  const taxableValue = totalMrp - totalDiscount;
  const totalGst = cgst5 + sgst5 + cgst18 + sgst18;
  const subtotal = taxableValue + totalGst - loyaltyRedemption;

  const { rounded, roundOff } = applyRoundOff(subtotal);

  return {
    totalMrp: parseFloat(totalMrp.toFixed(2)),
    totalDiscount: parseFloat(totalDiscount.toFixed(2)),
    taxableValue: parseFloat(taxableValue.toFixed(2)),
    cgst5: parseFloat(cgst5.toFixed(2)),
    sgst5: parseFloat(sgst5.toFixed(2)),
    cgst18: parseFloat(cgst18.toFixed(2)),
    sgst18: parseFloat(sgst18.toFixed(2)),
    totalGst: parseFloat(totalGst.toFixed(2)),
    subtotal: parseFloat(subtotal.toFixed(2)),
    roundOff,
    netPayable: rounded,
  };
}
