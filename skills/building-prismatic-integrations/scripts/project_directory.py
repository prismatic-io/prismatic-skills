"""
project_directory.py

Shared utility to determine the user's project directory.

When invoked from within a Claude Code skill, the CWD may be the skill
directory itself. This module detects that and returns the actual project root.
"""

import os


def get_project_directory():
    """Determine the user's project directory.

    When invoked from within a Claude Code skill, the CWD may be the skill
    directory. This function detects that by looking for SKILL.md and
    navigates up to find the project root.

    Returns:
        str: The user's project directory (absolute path)
    """
    cwd = os.getcwd()

    # Method 1: Check if we're in a .claude/skills/ directory structure
    # Pattern: /path/to/project/.claude/skills/skill-name
    marker = os.path.join(".claude", "skills")
    if marker in cwd:
        idx = cwd.find(marker)
        return cwd[:idx].rstrip(os.sep)

    # Method 2: Check if SKILL.md exists (we're in a skill directory)
    # Navigate up to find the project root
    if os.path.exists(os.path.join(cwd, "SKILL.md")):
        # We're in a skill directory - go up to find project root
        # Typical structure: project/skills/skill-name/ or project/.claude/skills/skill-name/
        parent = os.path.dirname(cwd)  # skills/ or .claude/skills/
        grandparent = os.path.dirname(parent)  # project/ or .claude/

        # Check if grandparent is .claude (symlinked scenario)
        if os.path.basename(grandparent) == ".claude":
            return os.path.dirname(grandparent)

        # Check if parent is named "skills" (direct skills folder)
        if os.path.basename(parent) == "skills":
            return grandparent

    return cwd


def get_integration_directory(project_dir, integration_name):
    """Get the integration project directory.

    Args:
        project_dir: The project directory (parent of integration projects)
        integration_name: Name of the integration being built

    Returns:
        str: Path to the integration project directory
    """
    return os.path.join(project_dir, integration_name)


def get_session_directory(project_dir, integration_name):
    """Get the session directory for an integration build.

    Session files (like requirements.json) are stored inside the integration
    project directory under <integration-name>/.prismatic/.

    Args:
        project_dir: The project directory (parent of integration projects)
        integration_name: Name of the integration being built

    Returns:
        str: Path to the session directory
    """
    return os.path.join(project_dir, integration_name, ".prismatic")


def ensure_session_directory(project_dir, integration_name):
    """Create the session directory if it doesn't exist.

    Args:
        project_dir: The project directory
        integration_name: Name of the integration being built

    Returns:
        str: Path to the session directory
    """
    session_dir = get_session_directory(project_dir, integration_name)
    os.makedirs(session_dir, exist_ok=True)
    return session_dir
