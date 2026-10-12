from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.park_db import ParkDB


def get_park_or_404(
    slug: str,
    db: Session = Depends(get_db),
) -> ParkDB:
    park = db.query(ParkDB).filter(ParkDB.slug == slug).first()

    if park is None:
        raise HTTPException(
            status_code=404,
            detail="Park not found",
        )

    return park
