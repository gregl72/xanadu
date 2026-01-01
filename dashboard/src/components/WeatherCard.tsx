import type { Weather } from '../lib/supabase';

interface WeatherCardProps {
  weather: Weather;
  onPublish?: (bullet: string) => void;
}

export function WeatherCard({ weather, onPublish }: WeatherCardProps) {
  return (
    <div className="weather-card">
      <div className="weather-header">
        <span className="city">{weather.city}</span>
        {weather.current_temp !== null && (
          <span className="temp">{weather.current_temp}°F</span>
        )}
      </div>
      {weather.bullet && (
        <div className="weather-content">
          <p className="weather-bullet">{weather.bullet}</p>
          {onPublish && (
            <button
              className="weather-publish-btn"
              onClick={() => onPublish(weather.bullet!)}
            >
              + Add
            </button>
          )}
        </div>
      )}
    </div>
  );
}
