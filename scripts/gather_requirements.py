#!/usr/bin/env python3
"""
gather_requirements.py

PURPOSE: Interactive requirements gathering for Phase 2 using a DAG-based questionnaire

WORKFLOW:
  1. Load question DAG from JSON file (defines available questions and flow logic)
  2. Load existing answers from JSON file (if continuing a session)
  3. Traverse DAG to find next unanswered question
  4. Output question as JSON for agent to present to user
  5. Agent writes user's answer back to answers file
  6. Re-run script - it continues from where it left off
  7. When all questions answered, output completion status

QUESTION DAG STRUCTURE:
  {
    "questions": {
      "q1": {
        "id": "q1",
        "text": "What type of component are you building?",
        "type": "choice",
        "choices": ["Utility Component", "Application Connector"],
        "next": ["q2_utility", "q2_connector"]
      },
      "q2_utility": {
        "id": "q2_utility",
        "text": "What actions should the utility provide?",
        "type": "text",
        "condition": {"question": "q1", "answer": "Utility Component"},
        "next": []
      }
    },
    "start": "q1"
  }

EXIT CODES:
  0  - Success: either question with inference allowed, or phase complete
  2  - Error (invalid files, parsing issues, etc.)
  42 - BLOCKING: User input required. Agent MUST stop and wait for user response.
"""

import json
import re
import subprocess
import sys


def substitute_template(template, answers):
    """
    Replace {variable} placeholders in a template string with answer values.
    Example: "Research {api_name} API" -> "Research Canny API"
    """
    if not isinstance(template, str):
        return template

    def replacer(match):
        var_name = match.group(1)
        return str(answers.get(var_name, match.group(0)))

    return re.sub(r"\{(\w+)\}", replacer, template)


def load_json_file(filepath, is_answers_file=False):
    """Load and parse a JSON file."""
    try:
        with open(filepath, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        if is_answers_file:
            # Answers file doesn't exist yet - return empty dict
            return {}
        print(f"File not found: {filepath}", file=sys.stderr)
        return None
    except json.JSONDecodeError as e:
        print(f"Invalid JSON in {filepath}: {e}", file=sys.stderr)
        return None


def evaluate_condition(condition, answers):
    """Check if a condition is met based on current answers.

    Supports:
    - {"question": "q1", "answer": "value"} - exact match or contains for multi-choice
    - {"question": "q1", "answer_is": "empty"} - true if answer is empty/skipped/None
    - {"question": "q1", "answer_is": "not_empty"} - true if answer has a value
    """
    if not condition:
        return True

    question_id = condition.get("question")
    expected_answer = condition.get("answer")
    answer_is = condition.get("answer_is")

    # Handle answer_is conditions (empty/not_empty checks)
    if answer_is:
        user_answer = answers.get(question_id)
        is_empty = (
            user_answer is None
            or user_answer == ""
            or user_answer == []
            or user_answer == "skipped"
        )
        if answer_is == "empty":
            return is_empty
        elif answer_is == "not_empty":
            return not is_empty
        else:
            return False

    # Standard exact match condition
    if question_id not in answers:
        return False

    user_answer = answers[question_id]

    # Support both exact match and "contains" for multi-choice
    if isinstance(user_answer, list):
        return expected_answer in user_answer
    else:
        return user_answer == expected_answer


def find_next_question(dag, answers):
    """
    Traverse the DAG to find the next unanswered question.
    Returns (question_dict, None) if found, or (None, error_message) if error.
    """
    questions = dag.get("questions", {})
    start_id = dag.get("start")

    if not start_id or start_id not in questions:
        return None, "Invalid DAG: missing or invalid 'start' field"

    # BFS to find next unanswered question
    visited = set()
    queue = [start_id]

    while queue:
        current_id = queue.pop(0)

        if current_id in visited:
            continue
        visited.add(current_id)

        question = questions.get(current_id)
        if not question:
            continue

        # Check condition if present
        condition = question.get("condition")
        if not evaluate_condition(condition, answers):
            continue

        # If not answered, this is our next question
        if current_id not in answers:
            return question, None

        # Already answered - add next questions to queue
        next_questions = question.get("next", [])
        for next_id in next_questions:
            if next_id not in visited:
                queue.append(next_id)

    # No unanswered questions found
    return None, None


def substitute_variables(command, answers):
    """
    Replace {variable} placeholders in command with answer values.
    Example: ["python", "search.py", "{system}"] -> ["python", "search.py", "Salesforce"]
    """
    substituted = []
    for part in command:
        if isinstance(part, str) and "{" in part and "}" in part:
            # Find all {var} patterns and replace them
            import re

            def replacer(match):
                var_name = match.group(1)
                return str(answers.get(var_name, match.group(0)))

            substituted.append(re.sub(r"\{(\w+)\}", replacer, part))
        else:
            substituted.append(part)
    return substituted


def execute_dynamic_command(command, answers):
    """
    Execute a command to get dynamic choices.
    Supports variable substitution from answers.
    Returns (choices_list, error) where choices_list is None if error.
    """
    try:
        # Substitute variables from answers
        command = substitute_variables(command, answers)

        # Resolve relative script paths to absolute paths
        # (scripts/foo.py -> /path/to/skill/scripts/foo.py)
        import os

        resolved_command = []
        skill_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

        for part in command:
            if isinstance(part, str) and part.startswith("scripts/"):
                # Resolve relative to skill directory
                resolved_command.append(os.path.join(skill_dir, part))
            else:
                resolved_command.append(part)

        command = resolved_command

        result = subprocess.run(
            command, capture_output=True, text=True, timeout=30, check=False
        )

        if result.returncode != 0:
            return None, f"Command failed: {result.stderr or result.stdout}"

        # Parse JSON output (first JSON array/object in output)
        output = result.stdout.strip()
        if not output:
            return None, "Command returned empty output"

        # Try to find JSON in output
        json_start = output.find("[")
        if json_start == -1:
            json_start = output.find("{")
        if json_start == -1:
            return None, f"No JSON found in command output: ${output}"

        # Use JSONDecoder to parse just the first valid JSON object/array
        # This handles cases where there's additional text after the JSON
        decoder = json.JSONDecoder()
        try:
            parsed, _ = decoder.raw_decode(output, json_start)
        except json.JSONDecodeError:
            # Fall back to trying to parse the whole thing
            json_output = output[json_start:]
            parsed = json.loads(json_output)

        if isinstance(parsed, list):
            return parsed, None
        elif isinstance(parsed, dict):
            return [parsed], None
        else:
            return None, "Command output is not a JSON array or object"

    except subprocess.TimeoutExpired:
        return None, "Command timed out after 30 seconds"
    except json.JSONDecodeError as e:
        return None, f"Failed to parse command output as JSON: {e}"
    except Exception as e:
        return None, f"Unexpected error executing command: {e}"


def prepare_question_output(question, answers):
    """
    Prepare question data for agent consumption.
    Handles dynamic choice execution and agent tasks.
    """
    question_type = question.get("type")

    # Handle agent_task type - this spawns an agent, not a question to ask
    if question_type == "agent_task":
        output = {
            "status": "agent_task",
            "question_id": question.get("id"),
            "task": {
                "agent": question.get("agent"),
                "description": substitute_template(
                    question.get("description", ""), answers
                ),
                "prompt": substitute_template(
                    question.get("prompt_template", ""), answers
                ),
            },
            "instruction": (
                "1. Spawn this agent using the Task tool with subagent_type set to the agent name. "
                "2. After the agent completes, mark this question as answered using write_answer.py "
                "with value 'completed'. "
                "3. Re-run gather_requirements.py to continue to the next question."
            ),
        }
        return output, None

    output = {
        "id": question["id"],
        "text": question["text"],
        "type": question["type"],
    }

    # Add allow_skip flag if present
    if question.get("allow_skip"):
        output["allow_skip"] = True

    # Add inference information if present
    if question.get("allow_inference"):
        output["allow_inference"] = True
        inference_sources = question.get("inference_sources", [])
        output["inference_sources"] = inference_sources

        # Provide the actual answers from inference sources for agent's convenience
        inference_context = {}
        for source_id in inference_sources:
            if source_id in answers:
                inference_context[source_id] = answers[source_id]
        output["inference_context"] = inference_context

    # Handle static choices
    if question_type in ["choice", "multi_choice"] and "choices" in question:
        output["choices"] = question["choices"]

    # Handle dynamic choices
    elif question_type == "dynamic_choice":
        command = question.get("command")
        if not command:
            return None, "Dynamic choice question missing 'command' field"

        choices_data, error = execute_dynamic_command(command, answers)
        if error:
            # If allow_skip is true, this is non-fatal
            if question.get("allow_skip"):
                output["choices"] = []
                output["skip_reason"] = error
                return output, None
            return None, error

        # Extract choice values and labels
        choice_key = question.get("choice_key", "value")
        choice_label = question.get("choice_label", "label")
        store_full_object = question.get("store_full_object", False)

        choices = []
        for item in choices_data:
            if isinstance(item, dict):
                value = item.get(choice_key, str(item))
                label = item.get(choice_label, value)

                if store_full_object:
                    # Store entire object, but show display_value for reference
                    choices.append(
                        {
                            "value": item,  # Full object
                            "label": label,
                            "display_value": value,  # For UI/debugging
                        }
                    )
                else:
                    # Normal behavior - just extract key
                    choices.append({"value": value, "label": label})
            else:
                choices.append({"value": str(item), "label": str(item)})

        output["choices"] = choices

        # Pass through store_full_object flag to agent with explicit instruction
        if store_full_object:
            output["store_full_object"] = True
            output["write_instruction"] = (
                "When writing the answer, use the 'value' field from the selected choice "
                "(the full object), NOT the 'label' string."
            )

    return output, None


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Interactive requirements gathering using a DAG-based questionnaire"
    )
    parser.add_argument("questions_file", help="Path to questions DAG JSON file")
    parser.add_argument("answers_file", help="Path to answers JSON file")
    parser.add_argument(
        "--context",
        help="Pre-populated context JSON file (for orchestration by parent skills)",
    )
    args = parser.parse_args()

    questions_file = args.questions_file
    answers_file = args.answers_file

    # Load question DAG
    dag = load_json_file(questions_file)
    if dag is None:
        return 2

    # Load existing answers
    answers = load_json_file(answers_file, is_answers_file=True)

    # Merge context if provided (context fills gaps, doesn't override existing answers)
    if args.context:
        context = load_json_file(args.context, is_answers_file=True)
        if context:
            merged_count = 0
            for key, value in context.items():
                if key not in answers:
                    answers[key] = value
                    merged_count += 1
            if merged_count > 0:
                # Save merged answers
                with open(answers_file, "w") as f:
                    json.dump(answers, f, indent=2)
                print(
                    f"Merged {merged_count} pre-populated answers from context file",
                    file=sys.stderr,
                )

    # Find next unanswered question
    next_question, error = find_next_question(dag, answers)

    if error:
        print(f"{error}", file=sys.stderr)
        return 2

    if next_question is None:
        # All questions answered!
        component_name = answers.get("component_name", "unknown")

        output = {
            "status": "complete",
            "answers": answers,
            "next_action": {
                "type": "scaffold",
                "command": f"python scripts/scaffold_component.py {component_name}",
                "instruction": (
                    "Run scaffold_component.py to create the component structure using prism CLI. "
                    "For utility components, Phase 4 will remove unused connector files."
                ),
            },
        }
        print(json.dumps(output, indent=2))
        print("\nPhase 2 complete - all requirements gathered", file=sys.stderr)
        return 0

    # Prepare question for output
    question_output, error = prepare_question_output(next_question, answers)
    if error:
        print(f"{error}", file=sys.stderr)
        return 2

    # Handle agent_task type - output task instructions and exit 0 (proceed)
    if question_output.get("status") == "agent_task":
        print()
        print("=" * 70)
        print("AGENT TASK - SPAWN EXTERNAL AGENT")
        print("=" * 70)
        print()
        print(json.dumps(question_output, indent=2))
        print()
        print("INSTRUCTIONS:")
        print(f"  1. Spawn the agent using Task tool with subagent_type: {question_output['task']['agent']}")
        print(f"  2. Wait for the agent to complete")
        print(f"  3. Mark as answered: python scripts/write_answer.py {answers_file} {question_output['question_id']} completed")
        print(f"  4. Re-run gather_requirements.py to continue")
        print()
        print("=" * 70)
        return 0

    has_inference = question_output.get("allow_inference", False)

    if has_inference:
        # Question allows inference - output JSON format
        output = {
            "status": "question",
            "allow_inference": True,
            "question": question_output,
            "instruction": (
                "You MAY infer the answer if 100% confident from inference_context. "
                "If ANY uncertainty, ask the user."
            ),
        }
        print(json.dumps(output, indent=2))
        return 0
    else:
        # Question REQUIRES user input - output blocking format
        # Plain text instruction FIRST, then question data
        print()
        print("!" * 70)
        print("!" * 70)
        print("!!  MANDATORY STOP - USER INPUT REQUIRED                            !!")
        print("!" * 70)
        print("!" * 70)
        print()
        print(">>> THIS IS A HARD STOP. YOU MUST NOT CONTINUE. <<<")
        print()
        print("=" * 70)
        print("ONE QUESTION ONLY - DO NOT COMBINE WITH OTHER QUESTIONS")
        print("=" * 70)
        print("  - This script presents ONE question at a time")
        print("  - Do NOT combine this with other questions in your response")
        print("  - Do NOT ask about multiple systems/connections in one message")
        print("  - Bad example: 'Which connection for source AND destination?'")
        print("  - Good example: Ask this ONE question, wait, then re-run script")
        print()
        print("INSTRUCTIONS:")
        print("  1. Present the question below to the user")
        print("  2. WAIT for the user to type their response")
        print("  3. Write their answer using write_answer.py")
        print("  4. Re-run this script to get the NEXT question")
        print()
        print("VIOLATIONS (DO NOT DO ANY OF THESE):")
        print("  X Do NOT answer this question yourself")
        print("  X Do NOT infer the answer from context")
        print("  X Do NOT assume you know what the user wants")
        print("  X Do NOT proceed to the next phase")
        print("  X Do NOT skip this question")
        print("  X Do NOT combine multiple questions into one")
        print()
        print("Even if the answer seems obvious, the user MUST confirm their intent.")
        print(
            "Requirements gathering exists to capture USER decisions, not agent assumptions."
        )
        print()
        print("-" * 70)
        print(f"QUESTION TO ASK USER: {question_output['text']}")
        print("-" * 70)

        # Show choices if applicable - output AskUserQuestion format
        if "choices" in question_output:
            choices = question_output["choices"]
            print()
            print("=" * 70)
            print("USE AskUserQuestion TOOL TO PRESENT CHOICES:")
            print("=" * 70)
            print()
            print("Use labels exactly as shown - do not rewrite or simplify them!")
            print()

            # Build AskUserQuestion options
            options = []
            for choice in choices:
                if isinstance(choice, dict):
                    label = choice.get("label", choice.get("value", str(choice)))
                    # Truncate label if too long for AskUserQuestion
                    if len(label) > 50:
                        label = label[:47] + "..."
                    options.append({"label": label, "description": ""})
                else:
                    options.append({"label": str(choice), "description": ""})

            # Truncate header to max 12 chars as required by AskUserQuestion
            header = question_output["id"].replace("_", " ").title()[:12]

            ask_params = {
                "questions": [
                    {
                        "question": question_output["text"],
                        "header": header,
                        "options": options,
                        "multiSelect": question_output["type"] == "multi_choice",
                    }
                ]
            }
            print("AskUserQuestion parameters:")
            print(json.dumps(ask_params, indent=2))
            print()
            print("After user selects, write their choice using write_answer.py")

        # Show write instruction if store_full_object is true
        if question_output.get("store_full_object"):
            print()
            print("IMPORTANT: " + question_output.get("write_instruction", ""))

        print()
        print(f"ANSWER FILE: {answers_file}")
        print(f"QUESTION ID: {question_output['id']}")
        print()
        print("!" * 70)
        print("EXIT CODE 42 = FULL STOP. ASK USER. WAIT. DO NOT PROCEED.")
        print("!" * 70)

        # Also output JSON for programmatic access (after the blocking message)
        print()
        print("--- Question Data (for write_answer.py) ---")
        # Include full question_output so agent has access to choices with value objects
        json_output = {
            "id": question_output["id"],
            "type": question_output["type"],
        }
        if "choices" in question_output:
            json_output["choices"] = question_output["choices"]
        if question_output.get("store_full_object"):
            json_output["store_full_object"] = True
            json_output["write_instruction"] = question_output.get("write_instruction")
        print(json.dumps(json_output, indent=2))

        return 42


if __name__ == "__main__":
    sys.exit(main())
