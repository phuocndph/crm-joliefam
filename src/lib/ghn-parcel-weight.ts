/**
 * Informational GHN dimensional weight: cm³ / 5 = grams (cm³ / 5,000 = kg).
 * Do not use this value to replace measured API weight or calculate a tariff.
 * Keep fractional grams; display precision is not a provider billing increment.
 * Source: GHN Express public weighing policy, checked 26/10/2026.
 */
export function ghnDimensionalWeightGrams(parcel: {length:number;width:number;height:number}): number|null {
  const dimensions=[parcel.length,parcel.width,parcel.height];
  if(!dimensions.every(value=>Number.isInteger(value)&&value>=1&&value<=200))return null;
  return parcel.length*parcel.width*parcel.height/5;
}

/** Display-only chargeable grams. Keep measured weight in provider payloads. */
export function ghnChargeableWeightGrams(parcel: {weight:number;length:number;width:number;height:number}): number|null {
  const volume = ghnDimensionalWeightGrams(parcel);
  return volume === null || !Number.isSafeInteger(parcel.weight) || parcel.weight < 1 || parcel.weight > 50000 ? null : Math.max(parcel.weight, volume);
}

export function ghnTotalChargeableWeightGrams(parcels: readonly {weight:number;length:number;width:number;height:number}[]): number|null {
  if (!parcels.length || parcels.length > 100) return null;
  let total = 0;
  for (const parcel of parcels) {
    const grams = ghnChargeableWeightGrams(parcel);
    if (grams === null) return null;
    total += Math.max(parcel.weight*5,parcel.length*parcel.width*parcel.height);
  }
  return total/5;
}
