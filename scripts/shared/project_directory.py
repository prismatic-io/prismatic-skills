"""
project_directory.py

Utility to determine the plugin directory and session paths.

Session Management:
    All sessions are stored relative to the current working directory:
    .prismatic/sessions/<type>/<name>/requirements.json

    Types: components, integrations
"""

import os


def get_project_root():
    """Determine the project root directory.

    Uses the current working directory as the project root. This is where
    the user is running Claude Code from, and where session data will be stored.

    Returns:
        str: The project root directory (absolute path)
    """
    return os.getcwd()


def get_plugin_root():
    """Get the plugin root directory.

    Uses CLAUDE_PLUGIN_ROOT environment variable if available,
    otherwise falls back to the directory containing this script's parent.

    Returns:
        str: Path to the plugin root directory
    """
    env_root = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if env_root:
        return env_root

    # Fall back to two levels up from shared/ directory
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_skill_directory():
    """Get the plugin root directory.

    Alias for get_plugin_root() for backward compatibility.

    Returns:
        str: Path to the plugin root directory
    """
    return get_plugin_root()


def get_session_directory(name, session_type="components"):
    """Get the session directory for a skill session.

    Session types:
        - components: Component build sessions
        - integrations: CNI build sessions

    Args:
        name: Name of the session (e.g., "canny", "hubspot-crm")
        session_type: Type of session (default: "components")

    Returns:
        str: Path to the session directory
    """
    root = get_project_root()
    return os.path.join(root, ".prismatic", "sessions", session_type, name)


def ensure_session_directory(name, session_type="components"):
    """Create the session directory if it doesn't exist.

    Args:
        name: Name of the session
        session_type: Type of session (default: "components")

    Returns:
        str: Path to the session directory
    """
    session_dir = get_session_directory(name, session_type)
    os.makedirs(session_dir, exist_ok=True)
    return session_dir


def get_component_directory(component_name):
    """Get the component project directory.

    Args:
        component_name: Name of the component

    Returns:
        str: Path to the component directory in the current project
    """
    root = get_project_root()
    return os.path.join(root, component_name)
