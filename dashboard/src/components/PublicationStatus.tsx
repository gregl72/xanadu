import { useState } from 'react';
import { MARKETS } from '../lib/markets';
import { usePublicationStatus, togglePublicationStatus } from '../hooks/useSupabase';
import { getUserEmail } from '../lib/cognito';

// Helper to get date string in YYYY-MM-DD format
function getDateString(daysFromNow: number = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

type DateOption = 'today' | 'tomorrow';

export function PublicationStatus() {
  const [dateOption, setDateOption] = useState<DateOption>('today');
  const [toggling, setToggling] = useState<string | null>(null);

  const selectedDate = dateOption === 'today' ? getDateString(0) : getDateString(1);
  const { statuses, loading, refetch } = usePublicationStatus(selectedDate);

  async function handleToggle(market: string) {
    setToggling(market);
    try {
      const email = getUserEmail();
      const currentStatus = statuses[market] || false;
      await togglePublicationStatus(market, selectedDate, !currentStatus, email || undefined);
      refetch();
    } catch (err) {
      alert('Failed to update status: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setToggling(null);
    }
  }

  // Count completed markets
  const completedCount = MARKETS.filter(m => statuses[m]).length;

  return (
    <div className="publication-status">
      <div className="status-header">
        <div className="date-toggle">
          <button
            className={`date-button ${dateOption === 'today' ? 'active' : ''}`}
            onClick={() => setDateOption('today')}
          >
            Today
          </button>
          <button
            className={`date-button ${dateOption === 'tomorrow' ? 'active' : ''}`}
            onClick={() => setDateOption('tomorrow')}
          >
            Tomorrow
          </button>
        </div>
        <div className="status-summary">
          {completedCount} / {MARKETS.length} complete
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading status...</div>
      ) : (
        <div className="market-grid">
          {MARKETS.map(market => {
            const isComplete = statuses[market] || false;
            const isToggling = toggling === market;

            return (
              <button
                key={market}
                className={`market-status-card ${isComplete ? 'complete' : 'incomplete'}`}
                onClick={() => handleToggle(market)}
                disabled={isToggling}
              >
                <span className={`status-indicator ${isComplete ? 'green' : 'red'}`} />
                <span className="market-name">{market}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
