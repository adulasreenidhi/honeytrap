"""HTTP security controls shared by every route."""

import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.types import ASGIApp, Scope

ASGIMessage = dict[str, Any]
Receive = Callable[[], Awaitable[ASGIMessage]]
Send = Callable[[ASGIMessage], Awaitable[None]]


class SecurityMiddleware:
    """Apply response protections and reject oversized request bodies."""

    def __init__(self, app: ASGIApp, max_body_size: int) -> None:
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Generate the request ID server-side so clients cannot choose log correlation IDs.
        request_id = uuid.uuid4().hex
        scope.setdefault("state", {})["request_id"] = request_id

        body_size = 0
        too_large = False
        response_started = False

        async def limited_receive() -> ASGIMessage:
            nonlocal body_size, too_large
            message = await receive()
            if message["type"] == "http.request":
                body_size += len(message.get("body", b""))
                if body_size > self.max_body_size:
                    too_large = True
                    return {"type": "http.disconnect"}
            return message

        async def add_security_headers(message: ASGIMessage) -> None:
            nonlocal response_started
            if too_large:
                if message["type"] == "http.response.start" and not response_started:
                    response_started = True
                    await self._send_response(
                        send,
                        request_id,
                        413,
                        {"error": "RequestTooLarge", "detail": "Request body exceeds the allowed size"},
                    )
                return
            if message["type"] == "http.response.start":
                response_started = True
                headers = list(message.get("headers", []))
                # Prevent MIME sniffing, framing, referrer leakage, caching, and inline resource loading.
                headers.extend([
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"x-request-id", request_id.encode("ascii")),
                ])
                path = scope.get("path", "")
                if path.startswith("/api/"):
                    headers.append((b"cache-control", b"no-store"))
                if path not in {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}:
                    headers.append((
                        b"content-security-policy",
                        b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
                    ))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, limited_receive, add_security_headers)
        except Exception:
            if too_large and not response_started:
                await self._send_response(
                    send,
                    request_id,
                    413,
                    {"error": "RequestTooLarge", "detail": "Request body exceeds the allowed size"},
                )
                return
            raise

    async def _send_response(
        self,
        send: Send,
        request_id: str,
        status_code: int,
        content: dict[str, str],
    ) -> None:
        json_body = json.dumps(content).encode("utf-8")
        headers = [
            (b"content-type", b"application/json"),
            (b"content-length", str(len(json_body)).encode("ascii")),
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"no-referrer"),
            (b"x-request-id", request_id.encode("ascii")),
            (b"cache-control", b"no-store"),
            (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"),
        ]
        await send({"type": "http.response.start", "status": status_code, "headers": headers})
        await send({"type": "http.response.body", "body": json_body})
