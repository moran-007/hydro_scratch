from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "docs" / "scratch-algorithm-ask-answer-test-20260616.json"
OUT_DIR = ROOT / "docs" / "scratch-algorithm-packages-20260616"


def minimal_costume() -> tuple[str, dict[str, object], str]:
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#000"/></svg>'
    asset_id = hashlib.md5(svg.encode("utf-8")).hexdigest()
    return (
        f"{asset_id}.svg",
        {
            "assetId": asset_id,
            "name": "costume1",
            "bitmapResolution": 1,
            "md5ext": f"{asset_id}.svg",
            "dataFormat": "svg",
            "rotationCenterX": 1,
            "rotationCenterY": 1,
        },
        svg,
    )


def make_block(
    opcode: str,
    *,
    parent: str | None,
    next_id: str | None = None,
    inputs: dict[str, Any] | None = None,
    fields: dict[str, Any] | None = None,
    top_level: bool = False,
) -> dict[str, Any]:
    block = {
        "opcode": opcode,
        "next": next_id,
        "parent": parent,
        "inputs": inputs or {},
        "fields": fields or {},
        "shadow": False,
        "topLevel": top_level,
    }
    if top_level:
        block["x"] = 80
        block["y"] = 80
    return block


def scratch_value(value: Any) -> str:
    if isinstance(value, list):
        return "\n".join(str(item) for item in value)
    return str(value)


def add_case_chain(
    blocks: dict[str, dict[str, Any]],
    cases: list[dict[str, Any]],
    *,
    index: int,
    parent_id: str,
    input_var_id: str,
    output_var_id: str,
) -> str:
    if index >= len(cases):
        fallback_id = f"fallback_{index}"
        blocks[fallback_id] = make_block(
            "data_setvariableto",
            parent=parent_id,
            inputs={"VALUE": [1, [10, "NO_MATCH"]]},
            fields={"VARIABLE": ["output", output_var_id]},
        )
        return fallback_id

    case = cases[index]
    if_id = f"if_{index}"
    cond_id = f"equals_{index}"
    input_id = f"input_{index}"
    set_id = f"set_{index}"
    else_id = add_case_chain(
        blocks,
        cases,
        index=index + 1,
        parent_id=if_id,
        input_var_id=input_var_id,
        output_var_id=output_var_id,
    )

    blocks[if_id] = make_block(
        "control_if_else",
        parent=parent_id,
        inputs={
            "CONDITION": [2, cond_id],
            "SUBSTACK": [2, set_id],
            "SUBSTACK2": [2, else_id],
        },
    )
    blocks[cond_id] = make_block(
        "operator_equals",
        parent=if_id,
        inputs={
            "OPERAND1": [2, input_id],
            "OPERAND2": [1, [10, scratch_value(case["input"])]],
        },
    )
    blocks[input_id] = make_block(
        "data_variable",
        parent=cond_id,
        fields={"VARIABLE": ["input", input_var_id]},
    )
    blocks[set_id] = make_block(
        "data_setvariableto",
        parent=if_id,
        inputs={"VALUE": [1, [10, scratch_value(case["expectedOutput"])]]},
        fields={"VARIABLE": ["output", output_var_id]},
    )
    return if_id


def project_json(cases: list[dict[str, Any]], costume: dict[str, object]) -> str:
    input_var_id = "inputVar"
    output_var_id = "outputVar"
    blocks: dict[str, dict[str, Any]] = {}
    first_if = add_case_chain(
        blocks,
        cases,
        index=0,
        parent_id="flag",
        input_var_id=input_var_id,
        output_var_id=output_var_id,
    )
    blocks["flag"] = make_block(
        "event_whenflagclicked",
        parent=None,
        next_id=first_if,
        top_level=True,
    )

    project = {
        "targets": [
            {
                "isStage": True,
                "name": "Stage",
                "variables": {
                    input_var_id: ["input", ""],
                    output_var_id: ["output", ""],
                },
                "lists": {},
                "broadcasts": {},
                "blocks": blocks,
                "comments": {},
                "currentCostume": 0,
                "costumes": [costume],
                "sounds": [],
                "volume": 100,
                "layerOrder": 0,
                "tempo": 60,
                "videoTransparency": 50,
                "videoState": "on",
                "textToSpeechLanguage": None,
            }
        ],
        "monitors": [],
        "extensions": [],
        "meta": {
            "semver": "3.0.0",
            "vm": "0.2.0",
            "agent": "Codex batch answer generator",
        },
    }
    return json.dumps(project, ensure_ascii=False, separators=(",", ":"))


def write_answer(pid: str, cases: list[dict[str, Any]]) -> Path:
    asset_name, costume, svg = minimal_costume()
    out_file = OUT_DIR / f"answer-{pid.lower()}.sb3"
    with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", project_json(cases, costume).encode("utf-8"))
        archive.writestr(asset_name, svg.encode("utf-8"))
    return out_file


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    for problem in data["problems"]:
        cases = problem["judgeConfig"]["algorithm"]["cases"]
        print(write_answer(problem["pid"], cases))


if __name__ == "__main__":
    main()
