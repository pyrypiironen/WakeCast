export interface Cable {
  name: string | null;
  booking_url: string;
  booking_url_fi: string | null;
}

export interface Park {
  id: number;
  name: string;
  slug: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  water_type: "sea" | "lake";
  website_url: string;
  website_url_fi: string | null;
  timezone: string;
  is_active: boolean;
  cables: Cable[];
}
