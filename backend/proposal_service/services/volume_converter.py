"""
volume_converter.py
-------------------
Converts a free-text volume string (e.g. "600 Per Month", "1000 per day",
"Weekly 500 cases") into an integer *daily* volume.
"""

import re


# Divisors relative to a 30-day month / 365-day year
_PERIOD_MAP = {
    "day":       1,
    "daily":     1,
    "week":      7,
    "weekly":    7,
    "month":     30,
    "monthly":   30,
    "quarter":   90,
    "quarterly": 90,
    "year":      365,
    "yearly":    365,
    "annual":    365,
    "annually":  365,
}


def _extract_first_number(text: str) -> float | None:
    """Return the first numeric value (int or float) found in text."""
    # Handle ranges like "300-400" → take midpoint
    range_match = re.search(r"(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)", text)
    if range_match:
        lo = float(range_match.group(1).replace(",", ""))
        hi = float(range_match.group(2).replace(",", ""))
        return (lo + hi) / 2

    single = re.search(r"(\d[\d,.]*[kK]?)", text)
    if not single:
        return None
    raw = single.group(1)
    if raw.lower().endswith("k"):
        return float(raw[:-1].replace(",", "")) * 1000
    return float(raw.replace(",", ""))


def _detect_period(text: str) -> int:
    """
    Return the divisor to convert the given period to daily.
    Defaults to 30 (monthly) when no period is found.
    """
    lower = text.lower()
    # Longest match first so 'quarterly' beats 'quarter'
    for keyword in sorted(_PERIOD_MAP.keys(), key=len, reverse=True):
        if keyword in lower:
            return _PERIOD_MAP[keyword]
    # fallback: monthly
    return 30


def to_daily(raw: str) -> int:
    """
    Convert a raw volume string to an integer daily volume.

    Examples
    --------
    "600 Per Month"          → 20
    "1000 per day"           → 1000
    "Weekly 500 cases"       → 72  (≈500/7)
    "20000 Per Month"        → 667
    "300-400 cases per month"→ 12  (≈350/30)
    "1000 per day\\nFor ..."  → 1000  (takes first number + first period)
    """
    if not raw:
        return 0

    # Only look at the first line if multi-line
    first_line = raw.split("\n")[0].strip()

    number = _extract_first_number(first_line)
    if number is None:
        return 0

    divisor = _detect_period(first_line)
    daily = number / divisor
    return max(1, round(daily))
