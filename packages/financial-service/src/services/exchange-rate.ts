interface RateCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let cache: RateCache | null = null;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function fetchRates(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;

  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  const url = apiKey
    ? `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`
    : 'https://open.er-api.com/v6/latest/USD';

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Exchange rate fetch failed: ${res.status}`);

  const data = await res.json() as { rates?: Record<string, number>; conversion_rates?: Record<string, number> };
  const rates = data.rates ?? data.conversion_rates ?? {};

  cache = { rates, fetchedAt: Date.now() };
  console.log('[exchange-rate] Rates refreshed');
  return rates;
}

export interface ConversionResult {
  amountCop: number;
  exchangeRate: number;
}

export async function convertToCOP(amount: number, currency: string): Promise<ConversionResult> {
  const cur = currency.toUpperCase();
  if (cur === 'COP') return { amountCop: amount, exchangeRate: 1 };

  const rates = await fetchRates();
  const copPerUsd = rates['COP'];
  const unitsPerUsd = rates[cur];

  if (!copPerUsd || !unitsPerUsd) {
    console.warn(`[exchange-rate] No rate for ${cur} — storing amountCop=0`);
    return { amountCop: 0, exchangeRate: 0 };
  }

  // rates relative to USD: 1 CUR = (copPerUsd / unitsPerUsd) COP
  const exchangeRate = Math.round((copPerUsd / unitsPerUsd) * 10000) / 10000;
  const amountCop = Math.round(amount * exchangeRate * 100) / 100;
  return { amountCop, exchangeRate };
}
