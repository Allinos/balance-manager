import { useAppData } from './useAppData.jsx';
import { maskAmount, useAmountsHidden } from './usePrivacy.js';
import { currencyInfo } from '../services/documentService.js';
import { formatMoney } from '../utils/format.js';

/** Format money in the base currency; hidden while the privacy eye is on. */
export function useMoney() {
  const { settings } = useAppData();
  const [hidden] = useAmountsHidden();
  const cur = currencyInfo(settings, settings.baseCurrency);
  const doc = { currency: cur.code, currency_symbol: cur.symbol, currency_decimals: cur.decimals };
  return (v) => maskAmount(formatMoney(v, doc), hidden, cur.symbol);
}
