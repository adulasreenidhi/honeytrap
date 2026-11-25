"""Administrative CRUD routes."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import hash_password, require_role
from app.database import get_db
from app.models.resource import Resource
from app.models.session import Session as SessionModel
from app.models.user import Device, User
from app.schemas import (
    AdminResourceRead,
    DeviceCreate,
    DeviceRead,
    DeviceUpdate,
    ResourceCreate,
    ResourceUpdate,
    UserCreate,
    UserRead,
    UserUpdate,
)

router = APIRouter(prefix="/api", tags=["admin"], dependencies=[Depends(require_role("admin"))])


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED, summary="Create a user")
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    if db.query(User).filter((User.username == payload.username) | (User.email == payload.email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")
    user = User(
        username=payload.username,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
        status=payload.status,
        registered_device_id=payload.registered_device_id,
        usual_location=payload.usual_location,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users", response_model=list[UserRead], summary="List users")
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return db.query(User).order_by(User.id).all()


@router.get("/users/{user_id}", response_model=UserRead, summary="Get a user")
def get_user(user_id: int, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.patch("/users/{user_id}", response_model=UserRead, summary="Update a user")
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    password = changes.pop("password", None)
    for key, value in changes.items():
        setattr(user, key, value)
    if password:
        user.hashed_password = hash_password(password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a user")
def delete_user(user_id: int, db: Session = Depends(get_db)) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.query(SessionModel).filter(SessionModel.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return None


@router.post("/devices", response_model=DeviceRead, status_code=status.HTTP_201_CREATED, summary="Create a device")
def create_device(payload: DeviceCreate, db: Session = Depends(get_db)) -> Device:
    if db.query(Device).filter(Device.device_id == payload.device_id).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Device already exists")
    device = Device(device_id=payload.device_id, label=payload.label, status=payload.status)
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/devices", response_model=list[DeviceRead], summary="List devices")
def list_devices(db: Session = Depends(get_db)) -> list[Device]:
    return db.query(Device).order_by(Device.id).all()


@router.get("/devices/{device_id}", response_model=DeviceRead, summary="Get a device")
def get_device(device_id: int, db: Session = Depends(get_db)) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


@router.patch("/devices/{device_id}", response_model=DeviceRead, summary="Update a device")
def update_device(device_id: int, payload: DeviceUpdate, db: Session = Depends(get_db)) -> Device:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(device, key, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a device")
def delete_device(device_id: int, db: Session = Depends(get_db)) -> None:
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    db.delete(device)
    db.commit()
    return None


@router.post("/decoys", response_model=AdminResourceRead, status_code=status.HTTP_201_CREATED, summary="Create a decoy")
def create_decoy(payload: ResourceCreate, db: Session = Depends(get_db)) -> Resource:
    if db.query(Resource).filter(Resource.name == payload.name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Resource already exists")
    values = payload.model_dump()
    values["is_decoy"] = True
    decoy = Resource(**values)
    db.add(decoy)
    db.commit()
    db.refresh(decoy)
    return decoy


@router.get("/decoys", response_model=list[AdminResourceRead], summary="List decoys")
def list_decoys(db: Session = Depends(get_db)) -> list[Resource]:
    return db.query(Resource).filter(Resource.is_decoy.is_(True)).order_by(Resource.id).all()


@router.get("/decoys/{decoy_id}", response_model=AdminResourceRead, summary="Get a decoy")
def get_decoy(decoy_id: int, db: Session = Depends(get_db)) -> Resource:
    decoy = db.get(Resource, decoy_id)
    if decoy is None or not decoy.is_decoy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decoy not found")
    return decoy


@router.patch("/decoys/{decoy_id}", response_model=AdminResourceRead, summary="Update a decoy")
def update_decoy(decoy_id: int, payload: ResourceUpdate, db: Session = Depends(get_db)) -> Resource:
    decoy = db.get(Resource, decoy_id)
    if decoy is None or not decoy.is_decoy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decoy not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(decoy, key, value)
    decoy.is_decoy = True
    db.commit()
    db.refresh(decoy)
    return decoy


@router.delete("/decoys/{decoy_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a decoy")
def delete_decoy(decoy_id: int, db: Session = Depends(get_db)) -> None:
    decoy = db.get(Resource, decoy_id)
    if decoy is None or not decoy.is_decoy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Decoy not found")
    db.delete(decoy)
    db.commit()
    return None
