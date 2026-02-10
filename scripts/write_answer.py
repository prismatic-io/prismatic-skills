#!/usr/bin/env python3
"""
write_answer.py

PURPOSE: Helper script for agents to write answers to the requirements file

This script simplifies the process of updating the answers JSON file during
requirements gathering. It loads existing answers, adds/updates one answer,
and writes back to the file.

USAGE:
  python write_answer.py <answers-file> <question-id> <answer>

EXAMPLES:
  # Text answer
  python write_answer.py requirements.json systems "Salesforce to Slack"

  # Choice answer
  python write_answer.py requirements.json trigger_type webhook

  # Multi-choice answer (JSON array)
  python write_answer.py requirements.json error_handling '["Automatic retry", "Log errors"]'

EXIT CODES:
  0 - Success
  1 - Error (missing arguments, invalid JSON, etc.)
"""

import json
import sys


def main():
    if len(sys.argv) < 4:
        print("❌ Usage: python write_answer.py <answers-file> <question-id> <answer>")
        return 1

    answers_file = sys.argv[1]
    question_id = sys.argv[2]
    answer_raw = sys.argv[3]

    # Try to parse answer as JSON (for arrays/objects), fall back to string
    try:
        answer = json.loads(answer_raw)
    except json.JSONDecodeError:
        answer = answer_raw

    # Load existing answers
    try:
        with open(answers_file, "r") as f:
            answers = json.load(f)
    except FileNotFoundError:
        answers = {}
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in {answers_file}: {e}", file=sys.stderr)
        return 1

    # Add/update answer
    answers[question_id] = answer

    # Validation warning for connection-type questions
    connection_questions = [
        "source_connection_type",
        "destination_connection_type",
    ]

    if question_id in connection_questions:
        if isinstance(answer, dict):
            if "inputs" not in answer or not answer.get("inputs"):
                print("", file=sys.stderr)
                print(
                    "⚠️  WARNING: Connection answer is missing 'inputs' array!",
                    file=sys.stderr,
                )
                print(
                    "   This will cause 'No credentials needed' error later.",
                    file=sys.stderr,
                )
                print("", file=sys.stderr)
                print(
                    "   Expected: Full object from choice 'value' field with:",
                    file=sys.stderr,
                )
                print("   - key", file=sys.stderr)
                print("   - label", file=sys.stderr)
                print("   - auth_type", file=sys.stderr)
                print("   - required_inputs (array)", file=sys.stderr)
                print("   - inputs (array) ← CRITICAL FOR CREDENTIALS", file=sys.stderr)
                print("", file=sys.stderr)
        else:
            print("", file=sys.stderr)
            print(
                "⚠️  WARNING: Connection answer should be an object, not string!",
                file=sys.stderr,
            )
            print(
                "   Use the full 'value' object from the choice, not just label.",
                file=sys.stderr,
            )
            print("", file=sys.stderr)

    # Write back
    try:
        with open(answers_file, "w") as f:
            json.dump(answers, f, indent=2)
        print(f"✅ Answer written to {answers_file}")
        print(f"   {question_id} = {answer}")
        return 0
    except Exception as e:
        print(f"❌ Failed to write file: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
