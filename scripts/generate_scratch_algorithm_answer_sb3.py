from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "scratch-algorithm-packages-20260616"
OUT_FILE = OUT_DIR / "answer-sa03-even-odd.sb3"


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


def block(opcode: str, *, parent: str | None, next_id: str | None = None, inputs=None, fields=None, top_level=False):
    data = {
        "opcode": opcode,
        "next": next_id,
        "parent": parent,
        "inputs": inputs or {},
        "fields": fields or {},
        "shadow": False,
        "topLevel": top_level,
    }
    if top_level:
        data["x"] = 80
        data["y"] = 80
    return data


def project_json(costume: dict[str, object]) -> str:
    input_var = "inputVar"
    output_var = "outputVar"
    blocks = {
        "flag": block(
            "event_whenflagclicked",
            parent=None,
            next_id="ifEven",
            top_level=True,
        ),
        "ifEven": block(
            "control_if_else",
            parent="flag",
            inputs={
                "CONDITION": [2, "isEven"],
                "SUBSTACK": [2, "setEven"],
                "SUBSTACK2": [2, "setOdd"],
            },
        ),
        "isEven": block(
            "operator_equals",
            parent="ifEven",
            inputs={
                "OPERAND1": [2, "modTwo"],
                "OPERAND2": [1, [4, "0"]],
            },
        ),
        "modTwo": block(
            "operator_mod",
            parent="isEven",
            inputs={
                "NUM1": [2, "inputReporter"],
                "NUM2": [1, [4, "2"]],
            },
        ),
        "inputReporter": block(
            "data_variable",
            parent="modTwo",
            fields={"VARIABLE": ["input", input_var]},
        ),
        "setEven": block(
            "data_setvariableto",
            parent="ifEven",
            inputs={"VALUE": [1, [10, "even"]]},
            fields={"VARIABLE": ["output", output_var]},
        ),
        "setOdd": block(
            "data_setvariableto",
            parent="ifEven",
            inputs={"VALUE": [1, [10, "odd"]]},
            fields={"VARIABLE": ["output", output_var]},
        ),
    }
    return json.dumps(
        {
            "targets": [
                {
                    "isStage": True,
                    "name": "Stage",
                    "variables": {
                        input_var: ["input", ""],
                        output_var: ["output", ""],
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
                "agent": "Codex test generator",
            },
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    asset_name, costume, svg = minimal_costume()
    with zipfile.ZipFile(OUT_FILE, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("project.json", project_json(costume).encode("utf-8"))
        archive.writestr(asset_name, svg.encode("utf-8"))
    print(OUT_FILE)


if __name__ == "__main__":
    main()
