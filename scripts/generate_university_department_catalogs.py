from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Iterable
from xml.etree import ElementTree


REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = (
    REPO_ROOT
    / "docs"
    / "research"
    / "university-departments"
    / "source-data"
    / "academyinfo_school_education_units_20241007.xlsx"
)
THEME_PATH = REPO_ROOT / "lib" / "school-theme.ts"
RUNTIME_DIRECTORY = REPO_ROOT / "public" / "university-departments"
AGGREGATE_PATH = (
    REPO_ROOT
    / "docs"
    / "research"
    / "university-departments"
    / "quantum_59_university_departments_2026-07-15.json"
)

SOURCE_TYPE = "대학알리미"
SOURCE_DATE = "2024-10-07"
EXPECTED_SCHOOL_COUNT = 59
EXPECTED_SOURCE_SHA256 = "C47323B0E9F2A5D4BF017597968DF533AB4F6EBFF64B702411DECC4974E6A3B6"
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_ZIP_ENTRIES = 64
MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024
MAX_ZIP_UNCOMPRESSED_BYTES = 80 * 1024 * 1024
MISSING_COLLEGE = "소속 단과대 미표기"
MISSING_STATUS = "상태 미표기"

MAIN_NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
RELATIONSHIP_NAMESPACE = (
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
)
PACKAGE_RELATIONSHIP_NAMESPACE = (
    "http://schemas.openxmlformats.org/package/2006/relationships"
)
NAMESPACES = {"main": MAIN_NAMESPACE}

REQUIRED_HEADERS = {
    "학교명",
    "단과대학명",
    "학부·과(전공)명",
    "학과상태",
}

GENERATION_RULES = [
    '학과상태에 "폐지"가 포함된 행 제외',
    "학교별 동일 학과명은 하나로 병합",
    '중복 학과의 고유 단과대명과 상태는 정렬 후 " / "로 병합',
    f'단과대명이 모두 비면 "{MISSING_COLLEGE}" 사용',
    f'학과상태가 모두 비면 "{MISSING_STATUS}" 사용',
    "학교와 학과는 결정적 순서로 생성",
]


@dataclass(frozen=True)
class School:
    school_id: str
    school_name: str


@dataclass
class DepartmentAccumulator:
    colleges: set[str] = field(default_factory=set)
    statuses: set[str] = field(default_factory=set)
    row_count: int = 0


@dataclass(frozen=True)
class GenerationStats:
    total_departments: int
    minimum_school_id: str
    minimum_department_count: int
    maximum_school_id: str
    maximum_department_count: int
    merged_duplicate_school_ids: tuple[str, ...]
    excluded_abolished_rows: int


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate deterministic university department catalogs from AcademyInfo XLSX."
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify generated files without writing them.",
    )
    return parser.parse_args()


def validate_source_archive(path: Path) -> None:
    size = path.stat().st_size
    if size <= 0 or size > MAX_SOURCE_BYTES:
        raise ValueError(
            f"Source XLSX size must be between 1 and {MAX_SOURCE_BYTES} bytes, found {size}"
        )

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)

    actual_hash = digest.hexdigest().upper()
    if actual_hash != EXPECTED_SOURCE_SHA256:
        raise ValueError(
            "Source XLSX checksum mismatch: "
            f"expected {EXPECTED_SOURCE_SHA256}, found {actual_hash}"
        )

    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ZIP_ENTRIES:
            raise ValueError(
                f"Source XLSX has too many ZIP entries: {len(entries)} > {MAX_ZIP_ENTRIES}"
            )

        total_uncompressed = 0
        for entry in entries:
            if entry.flag_bits & 0x1:
                raise ValueError(f"Encrypted XLSX entry is not allowed: {entry.filename}")
            if entry.file_size > MAX_ZIP_ENTRY_BYTES:
                raise ValueError(
                    f"XLSX entry is too large: {entry.filename} ({entry.file_size} bytes)"
                )
            total_uncompressed += entry.file_size

        if total_uncompressed > MAX_ZIP_UNCOMPRESSED_BYTES:
            raise ValueError(
                "Source XLSX uncompressed size is too large: "
                f"{total_uncompressed} > {MAX_ZIP_UNCOMPRESSED_BYTES}"
            )


def read_school_themes(path: Path) -> list[School]:
    source = path.read_text(encoding="utf-8")
    try:
        theme_block = source.split(
            "export const SCHOOL_THEMES: SchoolTheme[] = [", 1
        )[1].split("]\n\nexport const DEFAULT_SCHOOL_THEME_ID", 1)[0]
    except IndexError as error:
        raise ValueError(f"Could not locate SCHOOL_THEMES in {path}") from error

    schools = [
        School(school_id=school_id, school_name=school_name)
        for school_id, school_name in re.findall(
            r"\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'",
            theme_block,
        )
    ]

    if len(schools) != EXPECTED_SCHOOL_COUNT:
        raise ValueError(
            f"Expected {EXPECTED_SCHOOL_COUNT} SCHOOL_THEMES, found {len(schools)}"
        )

    ids = [school.school_id for school in schools]
    names = [school.school_name for school in schools]
    if len(set(ids)) != len(ids):
        raise ValueError("SCHOOL_THEMES contains duplicate ids")
    if len(set(names)) != len(names):
        raise ValueError("SCHOOL_THEMES contains duplicate names")

    return schools


def load_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in archive.namelist():
        return []

    strings: list[str] = []
    with archive.open(path) as stream:
        for _, element in ElementTree.iterparse(stream, events=("end",)):
            if element.tag != f"{{{MAIN_NAMESPACE}}}si":
                continue
            strings.append(
                "".join(
                    text_element.text or ""
                    for text_element in element.iter(f"{{{MAIN_NAMESPACE}}}t")
                )
            )
            element.clear()
    return strings


def worksheet_path(archive: zipfile.ZipFile) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    first_sheet = workbook.find("main:sheets/main:sheet", NAMESPACES)
    if first_sheet is None:
        raise ValueError("XLSX workbook has no worksheets")

    relationship_id = first_sheet.attrib.get(
        f"{{{RELATIONSHIP_NAMESPACE}}}id"
    )
    if not relationship_id:
        raise ValueError("XLSX worksheet relationship id is missing")

    relationships = ElementTree.fromstring(
        archive.read("xl/_rels/workbook.xml.rels")
    )
    for relationship in relationships.findall(
        f"{{{PACKAGE_RELATIONSHIP_NAMESPACE}}}Relationship"
    ):
        if relationship.attrib.get("Id") != relationship_id:
            continue
        target = relationship.attrib.get("Target")
        if not target:
            break
        if target.startswith("/"):
            return target.lstrip("/")
        return (PurePosixPath("xl") / target).as_posix()

    raise ValueError(f"Could not resolve worksheet relationship {relationship_id}")


def column_index(cell_reference: str) -> int:
    match = re.match(r"([A-Z]+)", cell_reference)
    if not match:
        raise ValueError(f"Invalid XLSX cell reference: {cell_reference}")

    index = 0
    for character in match.group(1):
        index = index * 26 + ord(character) - ord("A") + 1
    return index - 1


def cell_text(element: ElementTree.Element, shared_strings: list[str]) -> str:
    cell_type = element.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(
            text_element.text or ""
            for text_element in element.iter(f"{{{MAIN_NAMESPACE}}}t")
        )

    value_element = element.find("main:v", NAMESPACES)
    if value_element is None or value_element.text is None:
        return ""

    value = value_element.text
    if cell_type == "s":
        try:
            return shared_strings[int(value)]
        except (IndexError, ValueError) as error:
            raise ValueError(f"Invalid shared string index: {value}") from error
    return value


def worksheet_rows(
    archive: zipfile.ZipFile,
    path: str,
    shared_strings: list[str],
) -> Iterable[dict[int, str]]:
    with archive.open(path) as stream:
        for _, element in ElementTree.iterparse(stream, events=("end",)):
            if element.tag != f"{{{MAIN_NAMESPACE}}}row":
                continue

            row: dict[int, str] = {}
            for cell in element.findall("main:c", NAMESPACES):
                reference = cell.attrib.get("r")
                if not reference:
                    continue
                row[column_index(reference)] = cell_text(cell, shared_strings).strip()

            yield row
            element.clear()


def extract_departments(
    source_path: Path,
    schools: list[School],
) -> tuple[dict[str, dict[str, DepartmentAccumulator]], int]:
    target_names = {school.school_name for school in schools}
    departments_by_school: dict[str, dict[str, DepartmentAccumulator]] = {
        school.school_name: defaultdict(DepartmentAccumulator) for school in schools
    }
    source_row_counts = {school.school_name: 0 for school in schools}
    excluded_abolished_rows = 0

    with zipfile.ZipFile(source_path) as archive:
        shared_strings = load_shared_strings(archive)
        sheet_path = worksheet_path(archive)
        header_indexes: dict[str, int] | None = None

        for row in worksheet_rows(archive, sheet_path, shared_strings):
            if header_indexes is None:
                candidate = {value: index for index, value in row.items()}
                if REQUIRED_HEADERS.issubset(candidate):
                    header_indexes = {
                        header: candidate[header] for header in REQUIRED_HEADERS
                    }
                continue

            school_name = row.get(header_indexes["학교명"], "")
            if school_name not in target_names:
                continue

            source_row_counts[school_name] += 1
            status = row.get(header_indexes["학과상태"], "")
            if "폐지" in status:
                excluded_abolished_rows += 1
                continue

            department_name = row.get(header_indexes["학부·과(전공)명"], "")
            if not department_name:
                raise ValueError(f"{school_name} has an active row with no department name")

            accumulator = departments_by_school[school_name][department_name]
            accumulator.row_count += 1

            college = row.get(header_indexes["단과대학명"], "")
            if college:
                accumulator.colleges.add(college)
            if status:
                accumulator.statuses.add(status)

    if header_indexes is None:
        raise ValueError(
            "Could not find required XLSX headers: "
            + ", ".join(sorted(REQUIRED_HEADERS))
        )

    missing_source_schools = [
        school_name
        for school_name, row_count in source_row_counts.items()
        if row_count == 0
    ]
    if missing_source_schools:
        raise ValueError(
            "Theme school names missing from source XLSX: "
            + ", ".join(missing_source_schools)
        )

    return departments_by_school, excluded_abolished_rows


def build_catalogs(
    schools: list[School],
    departments_by_school: dict[str, dict[str, DepartmentAccumulator]],
) -> tuple[list[dict[str, object]], set[str]]:
    catalogs: list[dict[str, object]] = []
    merged_duplicate_school_ids: set[str] = set()

    for school in schools:
        source_departments = departments_by_school[school.school_name]
        if not source_departments:
            raise ValueError(f"{school.school_name} has zero active departments")

        departments: list[dict[str, str]] = []
        for department_name in sorted(source_departments):
            accumulator = source_departments[department_name]
            if accumulator.row_count > 1:
                merged_duplicate_school_ids.add(school.school_id)

            departments.append(
                {
                    "name": department_name,
                    "college": " / ".join(sorted(accumulator.colleges))
                    or MISSING_COLLEGE,
                    "status": " / ".join(sorted(accumulator.statuses))
                    or MISSING_STATUS,
                }
            )

        catalogs.append(
            {
                "schoolId": school.school_id,
                "schoolName": school.school_name,
                "sourceType": SOURCE_TYPE,
                "sourceDate": SOURCE_DATE,
                "departments": departments,
            }
        )

    return catalogs, merged_duplicate_school_ids


def build_aggregate(catalogs: list[dict[str, object]]) -> dict[str, object]:
    return {
        "metadata": {
            "sourceType": SOURCE_TYPE,
            "sourceFile": SOURCE_PATH.name,
            "sourceDate": SOURCE_DATE,
            "schoolCount": EXPECTED_SCHOOL_COUNT,
            "generationRules": GENERATION_RULES,
        },
        "schools": catalogs,
    }


def render_json(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def expected_outputs(catalogs: list[dict[str, object]]) -> dict[Path, bytes]:
    outputs = {
        RUNTIME_DIRECTORY / f"{catalog['schoolId']}.json": render_json(catalog)
        for catalog in catalogs
    }
    outputs[AGGREGATE_PATH] = render_json(build_aggregate(catalogs))
    return outputs


def unexpected_runtime_files(outputs: dict[Path, bytes]) -> list[Path]:
    if not RUNTIME_DIRECTORY.exists():
        return []
    expected_paths = {
        path.resolve()
        for path in outputs
        if path.parent == RUNTIME_DIRECTORY
    }
    return sorted(
        (
            path
            for path in RUNTIME_DIRECTORY.glob("*.json")
            if path.resolve() not in expected_paths
        ),
        key=lambda path: path.name,
    )


def write_outputs(outputs: dict[Path, bytes]) -> None:
    extras = unexpected_runtime_files(outputs)
    if extras:
        raise ValueError(
            "Unexpected runtime JSON files must be resolved before generation: "
            + ", ".join(path.name for path in extras)
        )

    for path, content in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


def check_outputs(outputs: dict[Path, bytes]) -> bool:
    problems: list[str] = []
    extras = unexpected_runtime_files(outputs)
    problems.extend(f"unexpected: {path.relative_to(REPO_ROOT)}" for path in extras)

    for path, expected_content in outputs.items():
        relative_path = path.relative_to(REPO_ROOT)
        if not path.exists():
            problems.append(f"missing: {relative_path}")
            continue
        actual_content = path.read_bytes().replace(b"\r\n", b"\n")
        normalized_expected = expected_content.replace(b"\r\n", b"\n")
        if actual_content != normalized_expected:
            problems.append(f"outdated: {relative_path}")

    if problems:
        print("University department catalogs are not current:", file=sys.stderr)
        for problem in problems:
            print(f"- {problem}", file=sys.stderr)
        return False

    print(f"Verified {len(outputs) - 1} runtime catalogs and aggregate JSON.")
    return True


def generation_stats(
    catalogs: list[dict[str, object]],
    merged_duplicate_school_ids: set[str],
    excluded_abolished_rows: int,
) -> GenerationStats:
    counts = [
        (str(catalog["schoolId"]), len(catalog["departments"]))
        for catalog in catalogs
    ]
    minimum_school_id, minimum_count = min(counts, key=lambda item: (item[1], item[0]))
    maximum_school_id, maximum_count = max(counts, key=lambda item: (item[1], item[0]))
    return GenerationStats(
        total_departments=sum(count for _, count in counts),
        minimum_school_id=minimum_school_id,
        minimum_department_count=minimum_count,
        maximum_school_id=maximum_school_id,
        maximum_department_count=maximum_count,
        merged_duplicate_school_ids=tuple(sorted(merged_duplicate_school_ids)),
        excluded_abolished_rows=excluded_abolished_rows,
    )


def print_stats(stats: GenerationStats) -> None:
    print(f"Schools: {EXPECTED_SCHOOL_COUNT}")
    print(f"Departments: {stats.total_departments}")
    print(
        "Department range: "
        f"{stats.minimum_school_id}={stats.minimum_department_count}, "
        f"{stats.maximum_school_id}={stats.maximum_department_count}"
    )
    print(
        "Schools with merged duplicate departments: "
        f"{len(stats.merged_duplicate_school_ids)}"
    )
    print(f"Excluded abolished rows: {stats.excluded_abolished_rows}")


def main() -> int:
    arguments = parse_arguments()
    try:
        validate_source_archive(SOURCE_PATH)
        schools = read_school_themes(THEME_PATH)
        extracted, excluded_abolished_rows = extract_departments(SOURCE_PATH, schools)
        catalogs, merged_duplicate_school_ids = build_catalogs(schools, extracted)
        outputs = expected_outputs(catalogs)
        stats = generation_stats(
            catalogs,
            merged_duplicate_school_ids,
            excluded_abolished_rows,
        )

        if arguments.check:
            if not check_outputs(outputs):
                return 1
        else:
            write_outputs(outputs)
            print(f"Generated {len(catalogs)} runtime catalogs and aggregate JSON.")

        print_stats(stats)
        return 0
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"Generation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
