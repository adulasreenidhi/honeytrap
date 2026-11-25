"""API routes and shared pagination helpers."""

from typing import Any


def paginate(query: Any, page: int, page_size: int) -> tuple[list[Any], int]:
    """Return one bounded page of query results and the total row count."""

    total = query.order_by(None).count()
    items = query.offset((page - 1) * page_size).limit(page_size).all()
    return items, total
