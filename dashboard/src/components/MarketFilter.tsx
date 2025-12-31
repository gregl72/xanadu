import { MARKETS } from '../lib/markets';

interface MarketFilterProps {
  selected: string;
  onChange: (market: string) => void;
}

export function MarketFilter({ selected, onChange }: MarketFilterProps) {
  return (
    <select
      className="market-filter"
      value={selected}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="All">All Markets</option>
      {MARKETS.map((market) => (
        <option key={market} value={market}>
          {market}
        </option>
      ))}
    </select>
  );
}
