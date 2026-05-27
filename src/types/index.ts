export type TripProfile = {
  name?: string;
  nationality?: string;
  isLocal?: boolean;
  currentCity?: string;
  homeCity?: string;
  favoriteTeam?: string;
  matches?: Array<{ date: string; teams: string; venue: string; city: string }>;
  hotel?: string;
  hotelAddress?: string;
  budget?: 'budget' | 'mid' | 'luxury';
  language?: string;
  lat?: number;
  lng?: number;
};
