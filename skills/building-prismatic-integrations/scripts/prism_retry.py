#!/usr/bin/env python3
"""
prism_retry.py

PURPOSE: Reusable retry mechanism for Prism CLI commands with exponential backoff,
         and shared error pattern detection.

USAGE:
    from prism_retry import run_prism_command, is_network_error, is_auth_error

    # Drop-in replacement for subprocess.run()
    result = run_prism_command(
        ["prism", "me"],
        capture_output=True,
        text=True,
        env=os.environ,
        timeout=30,
    )

    # Check error types
    if is_network_error(result.stderr):
        print("Network issue detected")

FEATURES:
  - Exponential backoff with jitter (prevents thundering herd)
  - Smart error detection (retryable vs non-retryable errors)
  - Configurable retry parameters
  - Progress feedback for users
  - Preserves all subprocess.run() parameters

RETRY STRATEGY:
  - Network errors: Retry with exponential backoff
  - Timeout errors: Retry with exponential backoff
  - Authentication errors: No retry (fail fast)
  - Validation errors: No retry (fail fast)
  - Default: 5 attempts max, 1s base delay, 10s max delay

"""

import os
import random
import subprocess
import sys
import time

# Shared error patterns for network issues
NETWORK_ERROR_PATTERNS = [
    "enotfound",
    "econnrefused",
    "econnreset",
    "timeout",
    "network error",
    "could not resolve",
    "getaddrinfo",
    "connection refused",
    "failed to fetch",
    "socket hang up",
]

# Shared error patterns for auth issues
AUTH_ERROR_PATTERNS = [
    "not authenticated",
    "not logged in",
    "unauthorized",
    "invalid token",
    "authentication failed",
    "login required",
    "no valid credentials",
    "token expired",
    "forbidden",
]


def is_network_error(error_text):
    """Check if error text indicates a network issue."""
    if not error_text:
        return False
    lower = error_text.lower()
    return any(pattern in lower for pattern in NETWORK_ERROR_PATTERNS)


def is_auth_error(error_text):
    """Check if error text indicates an authentication issue."""
    if not error_text:
        return False
    lower = error_text.lower()
    return any(pattern in lower for pattern in AUTH_ERROR_PATTERNS)


class PrismCommandError(Exception):
    """Exception raised when a Prism command fails after all retries."""

    pass


def _is_retryable_error(exception, stderr_output=None):
    """Determine if an error is retryable (network/timeout) or not (auth/validation)."""
    # Timeout errors are always retryable
    if isinstance(exception, subprocess.TimeoutExpired):
        return True

    # Check stderr for specific error patterns
    if stderr_output:
        stderr_lower = stderr_output.lower()

        # Non-retryable errors (auth, validation, not found)
        non_retryable_patterns = [
            "unauthorized",
            "authentication failed",
            "invalid token",
            "not found",
            "invalid",
            "validation error",
            "permission denied",
            "forbidden",
        ]

        for pattern in non_retryable_patterns:
            if pattern in stderr_lower:
                return False

        # Retryable errors (network, connection, temporary)
        retryable_patterns = [
            "unexpected token",
            "network",
            "connection",
            "timeout",
            "econnreset",
            "enotfound",
            "econnrefused",
            "socket hang up",
            "429",  # Rate limit
            "500",  # Server error
            "502",  # Bad gateway
            "503",  # Service unavailable
            "504",  # Gateway timeout
        ]

        for pattern in retryable_patterns:
            if pattern in stderr_lower:
                return True

    # Default: network-related errors are retryable
    if isinstance(exception, (ConnectionError, OSError)):
        return True

    # FileNotFoundError (prism not found) is not retryable
    if isinstance(exception, FileNotFoundError):
        return False

    # Default to not retryable for unknown errors
    return False


def _calculate_backoff(attempt, base_delay=1.0, max_delay=10.0, jitter=True):
    """Calculate exponential backoff delay with optional jitter.

    Args:
        attempt: Current attempt number (0-based)
        base_delay: Base delay in seconds (default: 1.0)
        max_delay: Maximum delay in seconds (default: 10.0)
        jitter: Whether to add random jitter (default: True)

    Returns:
        Delay in seconds
    """
    # Exponential backoff: base_delay * 2^attempt
    delay = min(base_delay * (2**attempt), max_delay)

    # Add jitter: random value between 0.5 and 1.0 of calculated delay
    if jitter:
        delay = delay * (0.5 + random.random() * 0.5)

    return delay


def run_prism_command(
    command,
    max_attempts=5,
    base_delay=1.0,
    max_delay=10.0,
    show_retry_feedback=True,
    **subprocess_kwargs,
):
    """Execute a Prism command with retry logic and exponential backoff.

    This is a drop-in replacement for subprocess.run() with retry capabilities.

    Args:
        command: Command to execute (list of strings)
        max_attempts: Maximum number of attempts (default: 3)
        base_delay: Base delay in seconds for exponential backoff (default: 1.0)
        max_delay: Maximum delay in seconds (default: 10.0)
        show_retry_feedback: Whether to show retry progress to users (default: True)
        **subprocess_kwargs: All other arguments passed to subprocess.run()

    Returns:
        subprocess.CompletedProcess instance

    Raises:
        PrismCommandError: If command fails after all retries
        FileNotFoundError: If prism command not found (not retryable)

    Examples:
        # Basic usage (replaces subprocess.run)
        result = run_prism_command(
            ["prism", "me"],
            capture_output=True,
            text=True,
            env=os.environ,
            timeout=30,
        )

        # Custom retry parameters
        result = run_prism_command(
            ["prism", "components:list"],
            max_attempts=10,
            base_delay=2.0,
            max_delay=30.0,
            capture_output=True,
            text=True,
            timeout=60,
        )

        # Disable retry feedback for silent operations
        result = run_prism_command(
            ["prism", "me"],
            show_retry_feedback=False,
            capture_output=True,
            text=True,
        )
    """
    last_exception = None
    last_stderr = None

    for attempt in range(max_attempts):
        try:
            result = subprocess.run(command, **subprocess_kwargs)

            # If command succeeded (returncode 0), return immediately
            if result.returncode == 0:
                if attempt > 0 and show_retry_feedback:
                    print(f"✅ Command succeeded after {attempt + 1} attempt(s)")
                    print("")
                return result

            # Command failed with non-zero return code
            # Check if error is retryable
            stderr_output = (
                result.stderr if hasattr(result, "stderr") and result.stderr else None
            )

            if not _is_retryable_error(None, stderr_output):
                # Non-retryable error - return result immediately
                return result

            # Retryable error - save and continue to retry logic
            last_stderr = stderr_output
            last_exception = subprocess.CalledProcessError(
                result.returncode, command, result.stdout, result.stderr
            )

        except subprocess.TimeoutExpired as e:
            last_exception = e
            last_stderr = None
        except FileNotFoundError:
            # Prism CLI not found - don't retry
            raise
        except Exception as e:
            last_exception = e
            last_stderr = None

        # Check if we should retry
        if not _is_retryable_error(last_exception, last_stderr):
            # Non-retryable error
            if hasattr(last_exception, "returncode"):
                # Return the failed result for CalledProcessError
                return result
            else:
                # Re-raise other exceptions
                raise last_exception

        # We have a retryable error
        if attempt < max_attempts - 1:
            # Calculate backoff delay
            delay = _calculate_backoff(attempt, base_delay, max_delay)

            if show_retry_feedback:
                print(
                    f"⚠️  Network error on attempt {attempt + 1}/{max_attempts}. Retrying in {delay:.1f}s..."
                )
                if isinstance(last_exception, subprocess.TimeoutExpired):
                    print(f"   (Command timed out after {last_exception.timeout}s)")
                elif last_stderr:
                    # Show first line of error
                    first_error_line = (
                        last_stderr.split("\n")[0][:100]
                        if last_stderr
                        else "Unknown error"
                    )
                    print(f"   ({first_error_line})")

            time.sleep(delay)
        else:
            # Final attempt failed
            if show_retry_feedback:
                print(f"❌ Command failed after {max_attempts} attempt(s)")
                print("")

    # All retries exhausted
    if last_exception:
        if isinstance(last_exception, subprocess.CalledProcessError):
            # Return the failed result
            return subprocess.CompletedProcess(
                command,
                last_exception.returncode,
                last_exception.stdout,
                last_exception.stderr,
            )
        else:
            # Re-raise the exception
            raise last_exception

    # Should never reach here
    raise PrismCommandError(f"Command failed after {max_attempts} attempts")


# Convenience function for common Prism operations with preset retry configs
def run_prism_query(command, timeout=30, **kwargs):
    """Run a Prism query command (list, search, etc.) with standard retry config."""
    return run_prism_command(
        command,
        max_attempts=5,
        base_delay=1.0,
        max_delay=10.0,
        capture_output=True,
        text=True,
        env=os.environ,
        timeout=timeout,
        **kwargs,
    )


def run_prism_mutation(command, timeout=60, **kwargs):
    """Run a Prism mutation command (deploy, import, etc.) with extended retry config."""
    return run_prism_command(
        command,
        max_attempts=5,
        base_delay=2.0,
        max_delay=20.0,
        capture_output=True,
        text=True,
        env=os.environ,
        timeout=timeout,
        **kwargs,
    )


def run_prism_download(command, timeout=120, **kwargs):
    """Run a Prism download command with extended timeout and retry config."""
    return run_prism_command(
        command,
        max_attempts=5,
        base_delay=2.0,
        max_delay=30.0,
        capture_output=True,
        text=True,
        env=os.environ,
        timeout=timeout,
        **kwargs,
    )


if __name__ == "__main__":
    # Simple CLI for testing
    if len(sys.argv) < 2:
        print("Usage: python prism_retry.py <prism-command> [args...]")
        print("")
        print("Examples:")
        print("  python prism_retry.py prism me")
        print("  python prism_retry.py prism components:list -s slack")
        sys.exit(1)

    result = run_prism_command(
        sys.argv[1:],
        capture_output=True,
        text=True,
        env=os.environ,
    )

    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr, file=sys.stderr)

    sys.exit(result.returncode)
