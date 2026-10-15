
export interface Cable {
  name: string;
  booking_url: string;
  booking_url_fi: string;
}

export interface Park {
  id: number;
  name: string;
  slug: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  water_type: string;
  website_url: string;
  website_url_fi: string;
  timezone: string;
  is_active: boolean;
  cables: Cable[];
}
