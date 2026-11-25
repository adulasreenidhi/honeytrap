"""Resource listing routes."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.user import User
from app.schemas import ResourceRead

router = APIRouter(prefix="/api/resources", tags=["resources"])


@router.get("", summary="List resources visible to the current role")
def list_resources(
    context: tuple[User, SessionModel] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ResourceRead]:
    user, _ = context
    query = db.query(Resource)
    if user.role != "admin":
        query = query.filter(Resource.department == user.department)
    resources = query.order_by(Resource.id).all()
    return [ResourceRead.model_validate(resource) for resource in resources]


# TODO: Monitored resource access pipeline will be implemented in prompt 2.
