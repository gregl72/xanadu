interface TimeFilterProps {
  selected: number;
  onChange: (hours: number) => void;
}

const TIME_OPTIONS = [
  { label: '24h', hours: 24 },
  { label: '48h', hours: 48 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
];

export function TimeFilter({ selected, onChange }: TimeFilterProps) {
  return (
    <div className="time-filter">
      {TIME_OPTIONS.map(({ label, hours }) => (
        <button
          key={hours}
          className={selected === hours ? 'active' : ''}
          onClick={() => onChange(hours)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
