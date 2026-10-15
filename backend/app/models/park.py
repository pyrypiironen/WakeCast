from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


class Cable(BaseModel):
    name: str | None = None
    booking_url: HttpUrl
    booking_url_fi: HttpUrl | None = None


class Park(BaseModel):
    id: int = Field(gt=0)

    name: str
    slug: str

    city: str
    country: str

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    water_type: Literal["sea", "lake"]

    website_url: HttpUrl
    website_url_fi: HttpUrl | None = None

    timezone: str
    is_active: bool = True

    cables: list[Cable]
