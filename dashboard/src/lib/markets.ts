// Kansas news markets - must match Python markets.py
export const MARKETS = [
  'Ark Valley',
  'Pittsburg',
  'Liberal',
  'Garden City',
  'Dodge City',
  'Great Bend',
  'McPherson',
  'Salina',
  'Hutchinson',
  'Abilene',
  'Junction City',
  'Manhattan',
  'Topeka',
  'Lawrence',
  'Hays',
  'Emporia',
  'At Large',
] as const;

export type Market = typeof MARKETS[number];

// Map markets to weather cities (for weather lookup)
export const WEATHER_CITIES: Record<string, string> = {
  'Ark Valley': 'Arkansas City',
  'Pittsburg': 'Pittsburg',
  'Liberal': 'Liberal',
  'Garden City': 'Garden City',
  'Dodge City': 'Dodge City',
  'Great Bend': 'Great Bend',
  'McPherson': 'McPherson',
  'Salina': 'Salina',
  'Hutchinson': 'Hutchinson',
  'Abilene': 'Abilene',
  'Junction City': 'Junction City',
  'Manhattan': 'Manhattan',
  'Topeka': 'Topeka',
  'Lawrence': 'Lawrence',
  'Hays': 'Hays',
  'Emporia': 'Emporia',
};
