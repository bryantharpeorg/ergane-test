import re
from typing import Tuple

CATEGORIES: Tuple[str, ...] = ("Lodging", "Food", "Transport", "Gear", "Fees", "Other")

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_AMOUNT_RE = re.compile(r"^\d+(\.\d{1,2})?$")


class ValidationError(ValueError):
    """Raised when a value cannot pass validation."""


def parse_amount_to_cents(value: str) -> int:
    """Convert a decimal dollar string to integer cents.

    Accepts values matching ``^\\d+(\\.\\d{1,2})?$``, rejects zero, negative,
    and more than two decimal places.
    """
    value = value.strip()
    if not _AMOUNT_RE.match(value):
        raise ValidationError("must be a positive number with at most two decimals")
    dollars, _, cents_part = value.partition(".")
    dollars = int(dollars)
    cents = int(cents_part.ljust(2, "0")) if cents_part else 0
    total = dollars * 100 + cents
    if total <= 0:
        raise ValidationError("amount must be greater than zero")
    return total


def parse_date(value: str) -> str:
    """Validate an ISO-8601 date string and return it unchanged."""
    value = value.strip()
    if not _DATE_RE.match(value):
        raise ValidationError("must be a date in YYYY-MM-DD format")
    year, month, day = int(value[:4]), int(value[5:7]), int(value[8:10])
    if not (1 <= month <= 12 and 1 <= day <= 31):
        raise ValidationError("must be a valid date")
    # Minimal calendar validation; Python's date constructor would be simpler,
    # but keeping the function stdlib-only with no hidden side effects.
    if day > 30 and month in (4, 6, 9, 11):
        raise ValidationError("must be a valid date")
    if month == 2:
        leap = (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
        max_day = 29 if leap else 28
        if day > max_day:
            raise ValidationError("must be a valid date")
    return value


def parse_category(value: str, *, lenient: bool = False) -> str:
    """Return the canonical category name.

    Exact, case-sensitive match by default. When lenient is True, trim and
    case-fold the input first so spreadsheet values round-trip.
    """
    if lenient:
        value = value.strip().casefold()
        for category in CATEGORIES:
            if category.casefold() == value:
                return category
        raise ValidationError("category not one of the six")
    else:
        value = value.strip()
        if value in CATEGORIES:
            return value
        raise ValidationError("category not one of the six")


def format_cents(cents: int) -> str:
    """Format integer cents as a two-decimal dollar string."""
    return f"{cents // 100}.{cents % 100:02d}"
