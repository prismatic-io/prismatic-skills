"""
timing.py

Timing utilities for skill scripts.

Usage:
    from timing import timed_step, print_timing_summary

    @timed_step("My Step Name")
    def my_function():
        # ... do work ...
        return result

    # At end of script:
    print_timing_summary()
"""

import time
from functools import wraps

# Track step timings for final summary
step_timings = []


def format_duration(seconds):
    """Format duration in seconds to a human-readable string."""
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    elif seconds < 60:
        return f"{seconds:.1f}s"
    else:
        minutes = int(seconds // 60)
        secs = seconds % 60
        return f"{minutes}m {secs:.0f}s"


def timed_step(step_name):
    """Decorator that times a step and records it for later summary."""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            result = func(*args, **kwargs)
            duration = time.time() - start_time
            step_timings.append((step_name, duration))
            return result

        return wrapper

    return decorator


def print_timing_summary():
    """Print a summary of all timed steps."""
    if not step_timings:
        return

    total_time = sum(t[1] for t in step_timings)
    print("")
    print("Timing:")
    for step_name, duration in step_timings:
        print(f"   {step_name}: {format_duration(duration)}")
    print("   ─────────────────")
    print(f"   Total: {format_duration(total_time)}")


def clear_timings():
    """Clear all recorded timings."""
    step_timings.clear()
