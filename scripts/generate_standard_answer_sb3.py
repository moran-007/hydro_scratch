from __future__ import annotations

import json
import shutil
import zipfile
from hashlib import md5
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "generated" / "leledati-derived-scratch-bank-20260617"
OUT = BANK / "answers"
DEFAULT_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ffffff"/></svg>'
DEFAULT_ASSET_ID = md5(DEFAULT_SVG).hexdigest()
DEFAULT_MD5EXT = f"{DEFAULT_ASSET_ID}.svg"


class ProjectBuilder:
    def __init__(self) -> None:
        self.next_id = 1

    def bid(self, prefix: str = "b") -> str:
        value = f"{prefix}{self.next_id}"
        self.next_id += 1
        return value

    def block(
        self,
        opcode: str,
        *,
        next_: str | None = None,
        parent: str | None = None,
        inputs: dict[str, Any] | None = None,
        fields: dict[str, Any] | None = None,
        top_level: bool = False,
        x: int = 0,
        y: int = 0,
    ) -> dict[str, Any]:
        data: dict[str, Any] = {
            "opcode": opcode,
            "next": next_,
            "parent": parent,
            "inputs": inputs or {},
            "fields": fields or {},
            "shadow": False,
            "topLevel": top_level,
        }
        if top_level:
            data["x"] = x
            data["y"] = y
        return data

    def lit_str(self, value: str) -> list[Any]:
        return [1, [10, value]]

    def lit_num(self, value: int | float | str) -> list[Any]:
        return [1, [4, str(value)]]

    def expr_input(self, block_id: str) -> list[Any]:
        return [3, block_id, [10, ""]]

    def bool_input(self, block_id: str) -> list[Any]:
        return [2, block_id]

    def substack_input(self, block_id: str | None) -> list[Any]:
        return [2, block_id] if block_id else [1, None]


def chain(blocks: dict[str, dict[str, Any]], ids: list[str], parent: str | None = None) -> None:
    for index, block_id in enumerate(ids):
        blocks[block_id]["next"] = ids[index + 1] if index + 1 < len(ids) else None
        if index > 0 or parent is not None:
            blocks[block_id]["parent"] = parent if index == 0 and parent is not None else ids[index - 1]


def default_costume(is_stage: bool) -> dict[str, Any]:
    return {
        "assetId": DEFAULT_ASSET_ID,
        "name": "backdrop1" if is_stage else "costume1",
        "md5ext": DEFAULT_MD5EXT,
        "dataFormat": "svg",
        "rotationCenterX": 240 if is_stage else 1,
        "rotationCenterY": 180 if is_stage else 1,
        "bitmapResolution": 1,
    }


def target(name: str, *, is_stage: bool = False, variables: dict[str, list[Any]] | None = None,
           lists: dict[str, list[Any]] | None = None, blocks: dict[str, dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "isStage": is_stage,
        "name": name,
        "variables": variables or {},
        "lists": lists or {},
        "broadcasts": {},
        "blocks": blocks or {},
        "comments": {},
        "currentCostume": 0,
        "costumes": [default_costume(is_stage)],
        "sounds": [],
        "volume": 100,
        "layerOrder": 0 if is_stage else 1,
    }


def project(targets: list[dict[str, Any]], extensions: list[str] | None = None) -> dict[str, Any]:
    return {
        "targets": targets,
        "monitors": [],
        "extensions": extensions or [],
        "meta": {"semver": "3.0.0", "vm": "0.2.0", "agent": "codex-standard-answer"},
    }


def write_sb3(path: Path, project_json: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("project.json", json.dumps(project_json, ensure_ascii=False, separators=(",", ":")))
        zf.writestr(DEFAULT_MD5EXT, DEFAULT_SVG)


def variable(name: str, value: Any = "") -> list[Any]:
    return [name, value]


def list_var(name: str, values: list[Any] | None = None) -> list[Any]:
    return [name, values or []]


def green_flag_script(pb: ProjectBuilder, opcodes: list[str], *, variable_fields: dict[str, str] | None = None) -> dict[str, dict[str, Any]]:
    blocks: dict[str, dict[str, Any]] = {}
    ids: list[str] = []
    hat = pb.bid("hat")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    ids.append(hat)
    for opcode in opcodes:
        bid = pb.bid("cmd")
        fields: dict[str, Any] = {}
        inputs: dict[str, Any] = {}
        if opcode == "data_setvariableto":
            var_name, var_id = next(iter((variable_fields or {"score": "var_score"}).items()))
            fields = {"VARIABLE": [var_name, var_id]}
            inputs = {"VALUE": pb.lit_num(0)}
        elif opcode == "data_changevariableby":
            var_name, var_id = next(iter((variable_fields or {"score": "var_score"}).items()))
            fields = {"VARIABLE": [var_name, var_id]}
            inputs = {"VALUE": pb.lit_num(1)}
        elif opcode == "motion_gotoxy":
            inputs = {"X": pb.lit_num(0), "Y": pb.lit_num(0)}
        elif opcode == "motion_glidesecstoxy":
            inputs = {"SECS": pb.lit_num(1), "X": pb.lit_num(0), "Y": pb.lit_num(0)}
        elif opcode == "motion_movesteps":
            inputs = {"STEPS": pb.lit_num(10)}
        elif opcode in {"motion_turnright", "motion_turnleft"}:
            inputs = {"DEGREES": pb.lit_num(90)}
        elif opcode == "looks_sayforsecs":
            inputs = {"MESSAGE": pb.lit_str("完成"), "SECS": pb.lit_num(2)}
        elif opcode == "looks_switchcostumeto":
            inputs = {"COSTUME": pb.lit_str("costume2")}
        elif opcode == "control_wait":
            inputs = {"DURATION": pb.lit_num(0.2)}
        elif opcode == "control_repeat":
            inputs = {"TIMES": pb.lit_num(3), "SUBSTACK": pb.substack_input(None)}
        elif opcode == "control_if":
            inputs = {"CONDITION": pb.lit_str("true"), "SUBSTACK": pb.substack_input(None)}
        elif opcode == "control_create_clone_of":
            inputs = {"CLONE_OPTION": pb.lit_str("_myself_")}
        blocks[bid] = pb.block(opcode, inputs=inputs, fields=fields)
        ids.append(bid)
    chain(blocks, ids)
    return blocks


def make_task_projects() -> dict[str, dict[str, Any]]:
    projects: dict[str, dict[str, Any]] = {}

    pb = ProjectBuilder()
    blocks = green_flag_script(pb, ["motion_gotoxy", "data_setvariableto", "motion_gotoxy"], variable_fields={"score": "var_score"})
    projects["llscratcht01"] = project([
        target("Stage", is_stage=True, variables={"var_score": variable("score", 0)}),
        target("Player", variables={"var_score": variable("score", 0)}, blocks=blocks),
        target("Star"),
    ])

    pb = ProjectBuilder()
    blocks = green_flag_script(pb, [
        "data_setvariableto", "control_repeat", "looks_switchcostumeto", "control_wait", "data_changevariableby",
    ], variable_fields={"changeCount": "var_change"})
    projects["llscratcht02"] = project([
        target("Stage", is_stage=True, variables={"var_change": variable("changeCount", 0)}),
        target("Gift", variables={"var_change": variable("changeCount", 0)}, blocks=blocks),
    ])

    pb = ProjectBuilder()
    blocks = green_flag_script(pb, [
        "data_setvariableto", "motion_glidesecstoxy", "data_changevariableby", "motion_glidesecstoxy",
        "data_changevariableby", "motion_glidesecstoxy", "data_changevariableby", "looks_sayforsecs",
    ], variable_fields={"steps": "var_steps"})
    projects["llscratcht03"] = project([
        target("Stage", is_stage=True, variables={"var_steps": variable("steps", 0)}),
        target("Bird", variables={"var_steps": variable("steps", 0)}, blocks=blocks),
        target("Tree"),
    ])

    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    key = pb.bid("key")
    move = pb.bid("move")
    change = pb.bid("chg")
    cond = pb.bid("cond")
    compare = pb.bid("cmp")
    say = pb.bid("say")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    blocks[key] = pb.block("event_whenkeypressed", fields={"KEY_OPTION": ["right arrow", None]}, top_level=True, x=220, y=20)
    blocks[move] = pb.block("motion_changexby", inputs={"DX": pb.lit_num(10)})
    blocks[change] = pb.block("data_changevariableby", inputs={"VALUE": pb.lit_num(10)}, fields={"VARIABLE": ["distance", "var_distance"]})
    blocks[compare] = pb.block("operator_gt", inputs={"OPERAND1": pb.lit_num(100), "OPERAND2": pb.lit_num(99)}, parent=cond)
    blocks[say] = pb.block("looks_sayforsecs", inputs={"MESSAGE": pb.lit_str("到达终点"), "SECS": pb.lit_num(2)}, parent=cond)
    blocks[cond] = pb.block("control_if", inputs={"CONDITION": pb.bool_input(compare), "SUBSTACK": pb.substack_input(say)})
    chain(blocks, [key, move, change, cond])
    projects["llscratcht04"] = project([
        target("Stage", is_stage=True, variables={"var_distance": variable("distance", 0)}),
        target("Car", variables={"var_distance": variable("distance", 0)}, blocks=blocks),
    ])

    pb = ProjectBuilder()
    blocks = green_flag_script(pb, [
        "pen_clear", "data_setvariableto", "motion_gotoxy", "pen_penDown", "control_repeat",
        "motion_movesteps", "motion_turnright",
    ], variable_fields={"side": "var_side"})
    projects["llscratcht05"] = project([
        target("Stage", is_stage=True, variables={"var_side": variable("side", 60)}),
        target("Painter", variables={"var_side": variable("side", 60)}, blocks=blocks),
    ], extensions=["pen"])

    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    setv = pb.bid("set")
    create = pb.bid("clone")
    clone_hat = pb.bid("clonehat")
    move = pb.bid("move")
    cond = pb.bid("if")
    compare = pb.bid("cmp")
    delete = pb.bid("del")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    blocks[setv] = pb.block("data_setvariableto", inputs={"VALUE": pb.lit_num(0)}, fields={"VARIABLE": ["caught", "var_caught"]})
    blocks[create] = pb.block("control_create_clone_of", inputs={"CLONE_OPTION": pb.lit_str("_myself_")})
    chain(blocks, [hat, setv, create])
    blocks[clone_hat] = pb.block("control_start_as_clone", top_level=True, x=220, y=20)
    blocks[move] = pb.block("motion_changeyby", inputs={"DY": pb.lit_num(-10)})
    blocks[compare] = pb.block("operator_lt", inputs={"OPERAND1": pb.lit_num(-180), "OPERAND2": pb.lit_num(-170)}, parent=cond)
    blocks[delete] = pb.block("control_delete_this_clone", parent=cond)
    blocks[cond] = pb.block("control_if", inputs={"CONDITION": pb.bool_input(compare), "SUBSTACK": pb.substack_input(delete)})
    chain(blocks, [clone_hat, move, cond])
    projects["llscratcht06"] = project([
        target("Stage", is_stage=True, variables={"var_caught": variable("caught", 0)}),
        target("Star", variables={"var_caught": variable("caught", 0)}, blocks=blocks),
    ])

    return projects


def add_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, opcode: str, *, inputs: dict[str, Any] | None = None,
             fields: dict[str, Any] | None = None, parent: str | None = None) -> str:
    bid = pb.bid("expr")
    blocks[bid] = pb.block(opcode, inputs=inputs, fields=fields, parent=parent)
    return bid


def answer_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, parent: str | None = None) -> str:
    return add_expr(blocks, pb, "sensing_answer", parent=parent)


def join_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, left: list[Any] | str, right: list[Any] | str,
              parent: str | None = None) -> str:
    bid = pb.bid("expr")
    left_input = pb.expr_input(left) if isinstance(left, str) else left
    right_input = pb.expr_input(right) if isinstance(right, str) else right
    blocks[bid] = pb.block("operator_join", inputs={"STRING1": left_input, "STRING2": right_input}, parent=parent)
    return bid


def equals_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, left: list[Any] | str, right: list[Any] | str,
                parent: str | None = None) -> str:
    left_input = pb.expr_input(left) if isinstance(left, str) else left
    right_input = pb.expr_input(right) if isinstance(right, str) else right
    return add_expr(blocks, pb, "operator_equals", inputs={"OPERAND1": left_input, "OPERAND2": right_input}, parent=parent)


def and_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, left: str, right: str, parent: str | None = None) -> str:
    return add_expr(blocks, pb, "operator_and", inputs={"OPERAND1": pb.bool_input(left), "OPERAND2": pb.bool_input(right)}, parent=parent)


def length_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, list_name: str, list_id: str, parent: str | None = None) -> str:
    return add_expr(blocks, pb, "data_lengthoflist", fields={"LIST": [list_name, list_id]}, parent=parent)


def item_expr(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, list_name: str, list_id: str, index: int,
              parent: str | None = None) -> str:
    return add_expr(blocks, pb, "data_itemoflist", inputs={"INDEX": pb.lit_num(index)}, fields={"LIST": [list_name, list_id]}, parent=parent)


def if_set_result(blocks: dict[str, dict[str, Any]], pb: ProjectBuilder, condition: str, variable_name: str,
                  variable_id: str, value: str) -> str:
    if_id = pb.bid("if")
    set_id = pb.bid("set")
    blocks[set_id] = pb.block(
        "data_setvariableto",
        inputs={"VALUE": pb.lit_str(value)},
        fields={"VARIABLE": [variable_name, variable_id]},
        parent=if_id,
    )
    blocks[if_id] = pb.block("control_if", inputs={"CONDITION": pb.bool_input(condition), "SUBSTACK": pb.substack_input(set_id)})
    return if_id


def make_a01() -> dict[str, Any]:
    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    ask = pb.bid("ask")
    set_date = pb.bid("set")
    say = pb.bid("say")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    blocks[ask] = pb.block("sensing_askandwait", inputs={"QUESTION": pb.lit_str("请输入8位数字的考试日期（例如20260615）：")})
    letters = []
    for i in range(1, 9):
        ans = answer_expr(blocks, pb, set_date)
        letters.append(add_expr(blocks, pb, "operator_letter_of", inputs={"LETTER": pb.lit_num(i), "STRING": pb.expr_input(ans)}, parent=set_date))
    year = join_expr(blocks, pb, join_expr(blocks, pb, join_expr(blocks, pb, letters[0], letters[1], set_date), letters[2], set_date), letters[3], set_date)
    month = join_expr(blocks, pb, letters[4], letters[5], set_date)
    day = join_expr(blocks, pb, letters[6], letters[7], set_date)
    date1 = join_expr(blocks, pb, year, pb.lit_str("年"), set_date)
    date2 = join_expr(blocks, pb, date1, month, set_date)
    date3 = join_expr(blocks, pb, date2, pb.lit_str("月"), set_date)
    date4 = join_expr(blocks, pb, date3, day, set_date)
    date5 = join_expr(blocks, pb, date4, pb.lit_str("日"), set_date)
    blocks[set_date] = pb.block("data_setvariableto", inputs={"VALUE": pb.expr_input(date5)}, fields={"VARIABLE": ["标准日期", "var_date"]})
    date_var = add_expr(blocks, pb, "data_variable", fields={"VARIABLE": ["标准日期", "var_date"]}, parent=say)
    msg = join_expr(blocks, pb, pb.lit_str("转换完成！考试日期是："), date_var, say)
    blocks[say] = pb.block("looks_say", inputs={"MESSAGE": pb.expr_input(msg)})
    chain(blocks, [hat, ask, set_date, say])
    return project([
        target("Stage", is_stage=True, variables={"var_date": variable("标准日期", "")}),
        target("Sprite1", blocks=blocks),
    ])


def make_ask_say_cases(pid: str, cases: dict[str, str], question: str) -> dict[str, Any]:
    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    ask = pb.bid("ask")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    blocks[ask] = pb.block("sensing_askandwait", inputs={"QUESTION": pb.lit_str(question)})
    ids = [hat, ask]
    for input_value, output_value in cases.items():
        ans = answer_expr(blocks, pb)
        cond = equals_expr(blocks, pb, ans, pb.lit_str(input_value))
        if_id = pb.bid("if")
        say_id = pb.bid("say")
        blocks[say_id] = pb.block("looks_say", inputs={"MESSAGE": pb.lit_str(output_value)}, parent=if_id)
        blocks[if_id] = pb.block("control_if", inputs={"CONDITION": pb.bool_input(cond), "SUBSTACK": pb.substack_input(say_id)})
        blocks[cond]["parent"] = if_id
        ids.append(if_id)
    chain(blocks, ids)
    return project([
        target("Stage", is_stage=True),
        target("Sprite1", blocks=blocks),
    ])


def make_a03() -> dict[str, Any]:
    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    setv = pb.bid("set")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    blocks[setv] = pb.block("data_setvariableto", inputs={"VALUE": pb.lit_str("千万孤独")}, fields={"VARIABLE": ["藏头", "var_acrostic"]})
    chain(blocks, [hat, setv])
    return project([
        target("Stage", is_stage=True, variables={"var_acrostic": variable("藏头", ""), "var_input": variable("input", "")}, lists={"list_poem": list_var("江雪", [])}),
        target("Sprite1", blocks=blocks),
    ])


def make_list_case_project(list_name: str, list_id: str, cases: list[tuple[int, str, str]]) -> dict[str, Any]:
    pb = ProjectBuilder()
    blocks: dict[str, dict[str, Any]] = {}
    hat = pb.bid("hat")
    blocks[hat] = pb.block("event_whenflagclicked", top_level=True, x=20, y=20)
    ids = [hat]
    for expected_length, first_value, result in cases:
        len_block = length_expr(blocks, pb, list_name, list_id)
        len_eq = equals_expr(blocks, pb, len_block, pb.lit_num(expected_length))
        first = item_expr(blocks, pb, list_name, list_id, 1)
        first_eq = equals_expr(blocks, pb, first, pb.lit_str(first_value))
        cond = and_expr(blocks, pb, len_eq, first_eq)
        ids.append(if_set_result(blocks, pb, cond, "result", "var_result", result))
    chain(blocks, ids)
    return project([
        target("Stage", is_stage=True, variables={"var_result": variable("result", "")}, lists={list_id: list_var(list_name, [])}),
        target("Sprite1", blocks=blocks),
    ])


def make_algorithm_projects() -> dict[str, dict[str, Any]]:
    return {
        "llscratcha01": make_a01(),
        "llscratcha02": make_ask_say_cases("llscratcha02", {
            "45": "是3的倍数",
            "47": "不是3的倍数",
            "99": "是3的倍数",
            "30": "是3的倍数",
            "58": "不是3的倍数",
        }, "请输入10-99之间的数字"),
        "llscratcha03": make_a03(),
        "llscratcha04": make_list_case_project("苹果重量", "list_apples", [
            (5, "150", "3#1080"),
            (4, "300", "2#801"),
            (3, "350", "3#1080"),
            (3, "100", "0#0"),
            (6, "420", "4#1626"),
        ]),
        "llscratcha05": make_ask_say_cases("llscratcha05", {
            "95": "优秀",
            "89": "良好",
            "60": "合格",
            "42": "继续努力",
            "90": "优秀",
        }, "请输入成绩"),
        "llscratcha06": make_list_case_project("list", "list_input", [
            (10, "13", "9#12#21#19#4#5#17#7#15#13"),
            (10, "5", "48#81#30#60#90#85#20#50#10#5"),
            (4, "3", "3#6#9#12"),
            (4, "5", "20#15#10#5"),
            (6, "30", "18#27#33#45#14#30"),
        ]),
    }


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True, exist_ok=True)
    all_projects = {**make_task_projects(), **make_algorithm_projects()}
    manifest = []
    for pid, project_json in sorted(all_projects.items()):
        path = OUT / f"{pid}-answer.sb3"
        write_sb3(path, project_json)
        manifest.append({"pid": pid, "answer": str(path.relative_to(ROOT))})
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
