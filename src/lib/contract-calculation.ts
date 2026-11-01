export { canonicalContract, contractBusinessDate, contractDateLabel, contractPrefillItems, normalizedContractDates, validateContract, validateContractDates } from '../../server/contract-calculation';
import { quoteLineAmount } from '../../server/quote-calculation';
export function contractLineAmount(quantity: unknown, price: unknown) {
  try { return quoteLineAmount(quantity,price); } catch { return 0; }
}
