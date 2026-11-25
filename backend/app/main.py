"""HoneyGate FastAPI application entry point."""

import logging
from time import perf_counter

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database import SessionLocal, init_db
from app.routes.activity_routes import router as activity_router
from app.routes.admin_routes import router as admin_router
from app.routes.alert_routes import router as alert_router
from app.routes.auth_routes import router as auth_router
from app.routes.resource_routes import router as resource_router
from app.routes.access_routes import router as access_router
from app.routes.report_routes import router as report_router
from app.routes.demo_routes import router as demo_router
from app.seed import seed
from app.security import SecurityMiddleware
from app.services.audit_integrity import initialize_chain

logger = logging.getLogger("honeygate.request")
app = FastAPI(title="HoneyGate", debug=False)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(
    SecurityMiddleware,
    max_body_size=settings.MAX_REQUEST_BODY_SIZE_BYTES,
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log HTTP method, path, status, and duration without request credentials."""

    started = perf_counter()
    response = await call_next(request)
    elapsed_ms = (perf_counter() - started) * 1000
    logger.info(
        "%s %s -> %s (%.1f ms)",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "detail": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "error": "RequestValidationError",
            "detail": [
                {"loc": error.get("loc"), "msg": error.get("msg"), "type": error.get("type")}
                for error in exc.errors()
            ],
        },
    )


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "DatabaseError", "detail": "A database operation failed"},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "detail": "Internal server error"},
    )


@app.on_event("startup")
def startup() -> None:
    init_db()
    db = SessionLocal()
    try:
        seed(db)
        initialize_chain(db)
    finally:
        db.close()


app.include_router(auth_router)
app.include_router(resource_router)
app.include_router(admin_router)
app.include_router(activity_router)
app.include_router(alert_router)
app.include_router(access_router)
app.include_router(report_router)
app.include_router(demo_router)


@app.get("/api/health", tags=["health"], summary="Check backend health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def custom_openapi() -> dict:
    """Ensure every operation has a visible tag and description in Swagger."""

    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )
    for path_item in schema.get("paths", {}).values():
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            operation.setdefault("tags", ["HoneyGate"])
            operation.setdefault(
                "description",
                f"HoneyGate operation: {operation.get('summary', 'API request')}.",
            )
    app.openapi_schema = schema
    return schema


app.openapi = custom_openapi
