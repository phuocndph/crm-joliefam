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
