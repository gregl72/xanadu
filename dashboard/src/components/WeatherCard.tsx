import type { Weather } from '../lib/supabase';

interface WeatherCardProps {
  weather: Weather;
}

export function WeatherCard({ weather }: WeatherCardProps) {
  return (
    <div className="weather-card">
      <div className="weather-header">
        <span className="city">{weather.city}</span>
        {weather.current_temp !== null && (
          <span className="temp">{weather.current_temp}°F</span>
        )}
      </div>
      {weather.bullet && <p className="weather-bullet">{weather.bullet}</p>}
    </div>
  );
}
