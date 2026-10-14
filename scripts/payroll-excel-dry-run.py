#!/usr/bin/env python3
"""Read-only payroll product mapping audit for the legacy Excel workbook."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import posixpath
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_REF = re.compile(r"^([A-Z]+)(\d+)$")


@dataclass(frozen=True)
class Cell:
    value: Any
    kind: str


@dataclass
class SourceRow:
    row: int
    code: str
    normalized_code: str
    name: str
    rate: str
    note: str
    validation: str
    mapping_status: str = "NOT_MEASURED"
    candidates: str = ""
    review_owner: str = ""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(char for char in normalized if unicodedata.category(char) != "Mn")


def normalize_code(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip().upper()


def normalized_label(value: Any) -> str:
    return re.sub(r"\s+", " ", strip_accents(str(value or "")).strip()).upper()


def column_number(reference: str) -> int:
    match = CELL_REF.match(reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {reference}")
    result = 0
    for char in match.group(1):
        result = result * 26 + ord(char) - 64
    return result


def row_number(reference: str) -> int:
    match = CELL_REF.match(reference)
    if not match:
        raise ValueError(f"Invalid cell reference: {reference}")
    return int(match.group(2))


def shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(node.text or "" for node in item.findall(f".//{{{MAIN_NS}}}t"))
        for item in root.findall(f"{{{MAIN_NS}}}si")
    ]


def worksheet_paths(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relations.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    result: dict[str, str] = {}
    for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
        relation_id = sheet.attrib[f"{{{DOC_REL_NS}}}id"]
        target = targets[relation_id]
        if target.startswith("/"):
            path = target.lstrip("/")
        else:
            path = posixpath.normpath(posixpath.join("xl", target))
        result[sheet.attrib["name"]] = path
    return result


def parse_number(raw: str) -> int | Decimal | str:
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return raw
    if value == value.to_integral_value():
        return int(value)
    return value


def read_sheet(
    archive: zipfile.ZipFile,
    path: str,
    strings: list[str],
) -> dict[str, Cell]:
    root = ET.fromstring(archive.read(path))
    result: dict[str, Cell] = {}
    for node in root.findall(f".//{{{MAIN_NS}}}c"):
        reference = node.attrib.get("r")
        if not reference:
            continue
        cell_type = node.attrib.get("t")
        formula = node.find(f"{{{MAIN_NS}}}f")
        value_node = node.find(f"{{{MAIN_NS}}}v")
        if cell_type == "inlineStr":
            value = "".join(
                item.text or "" for item in node.findall(f".//{{{MAIN_NS}}}t")
            )
            result[reference] = Cell(value, "text")
        elif value_node is None:
            result[reference] = Cell(None, "formula" if formula is not None else "blank")
        elif cell_type == "s":
            result[reference] = Cell(strings[int(value_node.text or "0")], "text")
        elif cell_type in {"str", "e"}:
            result[reference] = Cell(value_node.text or "", "error" if cell_type == "e" else "text")
        elif cell_type == "b":
            result[reference] = Cell(value_node.text == "1", "boolean")
        else:
            result[reference] = Cell(
                parse_number(value_node.text or ""),
                "formula" if formula is not None else "number",
            )
    return result


def cell_text(cell: Cell | None) -> str:
    if cell is None or cell.value is None:
        return ""
    return str(cell.value).strip()


def cell_decimal(cell: Cell | None) -> Decimal | None:
    if cell is None or cell.value is None or isinstance(cell.value, bool):
        return None
    try:
        value = Decimal(str(cell.value))
    except InvalidOperation:
        return None
    return value if value.is_finite() else None


def decimal_text(value: Decimal | None) -> str:
    if value is None:
        return ""
    raw = format(value, "f")
    return raw.rstrip("0").rstrip(".") if "." in raw else raw


def read_rate_source(cells: dict[str, Cell], owner: str) -> list[SourceRow]:
    max_row = max((row_number(reference) for reference in cells), default=1)
    raw_rows: list[tuple[int, str, str, Decimal | None, str]] = []
    for row in range(2, max_row + 1):
        code = cell_text(cells.get(f"A{row}"))
        name = cell_text(cells.get(f"B{row}"))
        rate = cell_decimal(cells.get(f"C{row}"))
        note = cell_text(cells.get(f"D{row}"))
        if not any((code, name, rate is not None, note)):
            continue
        raw_rows.append((row, code, name, rate, note))

    code_counts = Counter(normalize_code(code) for _, code, _, _, _ in raw_rows if normalize_code(code))
    result: list[SourceRow] = []
    for row, code, name, rate, note in raw_rows:
        normalized = normalize_code(code)
        errors: list[str] = []
        if not normalized:
            errors.append("MISSING_CODE")
        if not name:
            errors.append("MISSING_NAME")
        if rate is None:
            errors.append("INVALID_RATE")
        elif rate < 0:
            errors.append("NEGATIVE_RATE")
        if normalized and code_counts[normalized] > 1:
            errors.append("DUPLICATE_SOURCE_CODE")
        validation = "VALID" if not errors else ",".join(errors)
        result.append(
            SourceRow(
                row=row,
                code=code,
                normalized_code=normalized,
                name=name,
                rate=decimal_text(rate),
                note=note,
                validation=validation,
                review_owner="" if validation == "VALID" else owner,
            )
        )
    return result


def pick(record: dict[str, Any], *keys: str) -> Any:
    lowered = {str(key).lower(): value for key, value in record.items()}
    for key in keys:
        if key.lower() in lowered:
            return lowered[key.lower()]
    return None


def safe_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def load_catalog(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            records: Any = list(csv.DictReader(handle))
    elif path.suffix.lower() == ".json":
        with path.open("r", encoding="utf-8-sig") as handle:
            records = json.load(handle)
        if isinstance(records, dict):
            records = records.get("products", records.get("data", records.get("rows")))
    else:
        raise ValueError("Catalog must be a UTF-8 .json or .csv file")
    if not isinstance(records, list):
        raise ValueError("Catalog JSON must be an array or contain products/data/rows array")

    result: list[dict[str, Any]] = []
    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            raise ValueError(f"Catalog row {index} is not an object")
        sku = safe_text(pick(record, "sku", "product_code", "code"))
        result.append(
            {
                "id": safe_text(pick(record, "id", "product_id")),
                "sku": sku,
                "normalized_sku": normalize_code(sku),
                "name": safe_text(pick(record, "name", "product_name")),
                "price_list_id": safe_text(pick(record, "price_list_id")),
                "price_list_name": safe_text(pick(record, "price_list_name")),
                "price_list_year": safe_text(pick(record, "price_list_year")),
            }
        )
    return result


def candidate_key(record: dict[str, Any]) -> tuple[str, ...]:
    if record["id"]:
        return (record["id"],)
    return (
        record["normalized_sku"],
        record["name"],
        record["price_list_id"],
        record["price_list_name"],
        record["price_list_year"],
    )


def candidate_label(record: dict[str, Any]) -> str:
    identity = record["id"] or "NO_ID"
    name = record["name"] or "NO_NAME"
    price_list = record["price_list_name"] or record["price_list_id"] or "NO_PRICE_LIST"
    if record["price_list_year"]:
        price_list = f"{price_list} {record['price_list_year']}"
    return f"{identity} / {name} / {price_list}"


def apply_catalog_mapping(
    rows: list[SourceRow],
    catalog: list[dict[str, Any]] | None,
    owner: str,
) -> dict[str, Any]:
    if catalog is None:
        for row in rows:
            if row.validation == "VALID":
                row.mapping_status = "NOT_MEASURED"
                row.candidates = "Catalog CRM chua duoc cung cap"
                row.review_owner = owner
        return {
            "catalog_rows": None,
            "catalog_missing_sku": None,
            "mapped": None,
            "ambiguous": None,
            "missing": None,
            "not_measured": sum(row.validation == "VALID" for row in rows),
        }

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in catalog:
        if record["normalized_sku"]:
            grouped[record["normalized_sku"]].append(record)
    for code, candidates in list(grouped.items()):
        unique: dict[tuple[str, ...], dict[str, Any]] = {}
        for candidate in candidates:
            unique[candidate_key(candidate)] = candidate
        grouped[code] = list(unique.values())

    mapped = ambiguous = missing = 0
    for row in rows:
        if row.validation != "VALID":
            row.mapping_status = "SOURCE_REVIEW"
            row.candidates = "Khong map khi source invalid/trung"
            row.review_owner = owner
            continue
        candidates = grouped.get(row.normalized_code, [])
        if len(candidates) == 1:
            row.mapping_status = "MAPPED"
            row.candidates = candidate_label(candidates[0])
            row.review_owner = ""
            mapped += 1
        elif len(candidates) > 1:
            row.mapping_status = "AMBIGUOUS"
            row.candidates = "; ".join(candidate_label(item) for item in candidates)
            row.review_owner = owner
            ambiguous += 1
        else:
            row.mapping_status = "MISSING"
            row.candidates = "Khong co exact SKU"
            row.review_owner = owner
            missing += 1
    return {
        "catalog_rows": len(catalog),
        "catalog_missing_sku": sum(not item["normalized_sku"] for item in catalog),
        "mapped": mapped,
        "ambiguous": ambiguous,
        "missing": missing,
        "not_measured": 0,
    }


def bank_account_type_summary(
    sheets: dict[str, dict[str, Cell]],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for sheet_name, cells in sheets.items():
        account_columns = {
            column_number(reference)
            for reference, cell in cells.items()
            if "TAI KHOAN NGAN HANG" in normalized_label(cell.value)
            or normalized_label(cell.value).startswith("TK NGAN HANG")
        }
        counts: Counter[str] = Counter()
        for reference, cell in cells.items():
            if column_number(reference) not in account_columns:
                continue
            label = normalized_label(cell.value)
            if not cell_text(cell) or "TAI KHOAN NGAN HANG" in label or label.startswith("TK NGAN HANG"):
                continue
            counts[cell.kind] += 1
        result.append(
            {
                "sheet": sheet_name,
                "nonblank": sum(counts.values()),
                "text": counts["text"],
                "numeric": counts["number"],
                "formula_or_other": sum(
                    value for key, value in counts.items() if key not in {"text", "number"}
                ),
            }
        )
    return result


def md_escape(value: Any) -> str:
    return str(value if value is not None else "").replace("|", "\\|").replace("\n", " ")


def metric(value: Any) -> str:
    return "NOT MEASURED" if value is None else str(value)


def render_markdown(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# PAYROLL SPRINT 1 - EXCEL PRODUCT MAPPING DRY RUN",
        "",
        f"Generated at: {report['generated_at']}",
        f"Source workbook: {report['workbook']}",
        f"Review owner: {report['review_owner']}",
        "",
        "## 1. Execution boundary",
        "",
        "- Read-only workbook inspection.",
        "- Exact normalized SKU matching only. No fuzzy matching, name guessing or automatic merge.",
        "- No database connection and no database write.",
        "- Bank account values are never printed by this report.",
        "",
        "## 2. Workbook integrity proof",
        "",
        f"- SHA-256 before: {report['sha256_before']}",
        f"- SHA-256 after: {report['sha256_after']}",
        f"- Source unchanged: {'YES' if report['source_unchanged'] else 'NO'}",
        "",
        "## 3. Product mapping summary",
        "",
        "| Metric | Result |",
        "|---|---:|",
        f"| Source rows | {summary['source_rows']} |",
        f"| Valid source rows | {summary['valid_source_rows']} |",
        f"| Unique valid source codes | {summary['unique_valid_codes']} |",
        f"| Duplicate source rows | {summary['duplicate_source_rows']} |",
        f"| Invalid source rows | {summary['invalid_source_rows']} |",
        f"| Catalog rows | {metric(summary['catalog_rows'])} |",
        f"| Catalog rows missing SKU | {metric(summary['catalog_missing_sku'])} |",
        f"| Mapped exact | {metric(summary['mapped'])} |",
        f"| Ambiguous | {metric(summary['ambiguous'])} |",
        f"| Missing | {metric(summary['missing'])} |",
        f"| Not measured | {summary['not_measured']} |",
        "",
        f"Mapping verdict: **{report['mapping_verdict']}**",
        "",
        "## 4. Bank account identifier safety",
        "",
        "All account identifiers must enter PostgreSQL as text. Numeric Excel cells are flagged because any leading zero already lost in Excel cannot be reconstructed automatically.",
        "",
        "| Sheet | Nonblank identifiers | Text cells | Numeric cells | Formula/other |",
        "|---|---:|---:|---:|---:|",
    ]
    for item in report["bank_account_types"]:
        lines.append(
            f"| {md_escape(item['sheet'])} | {item['nonblank']} | {item['text']} | {item['numeric']} | {item['formula_or_other']} |"
        )
    lines.extend(
        [
            "",
            "## 5. Catalog input contract",
            "",
            "Provide a sanitized UTF-8 JSON/CSV export with at least id, sku and name. Include price_list_id, price_list_name and price_list_year so duplicate SKU values across price lists remain visible.",
            "",
            "## 6. Detailed source rows",
            "",
            "| Excel row | Code | Product name | Rate (VND) | Source note | Source validation | Mapping | CRM candidate | Review owner |",
            "|---:|---|---|---:|---|---|---|---|---|",
        ]
    )
    for item in report["rows"]:
        lines.append(
            "| "
            + " | ".join(
                md_escape(value)
                for value in (
                    item["row"],
                    item["code"],
                    item["name"],
                    item["rate"],
                    item["note"] or "-",
                    item["validation"],
                    item["mapping_status"],
                    item["candidates"],
                    item["review_owner"] or "-",
                )
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## 7. Next acceptance step",
            "",
            report["next_step"],
            "",
        ]
    )
    return "\n".join(lines)


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    workbook = Path(args.workbook).resolve()
    if not workbook.is_file():
        raise FileNotFoundError(f"Workbook not found: {workbook}")
    before = sha256(workbook)
    if args.expected_hash and before != args.expected_hash.upper():
        raise ValueError(f"Workbook hash mismatch: expected {args.expected_hash.upper()}, got {before}")

    with zipfile.ZipFile(workbook, "r") as archive:
        strings = shared_strings(archive)
        paths = worksheet_paths(archive)
        if "don-gia-moi" not in paths:
            raise ValueError("Required sheet don-gia-moi was not found")
        rows = read_rate_source(read_sheet(archive, paths["don-gia-moi"], strings), args.review_owner)
        bank_sheets = {
            name: read_sheet(archive, paths[name], strings)
            for name in ("luong_tong", "nv đóng bhxh")
            if name in paths
        }

    catalog = load_catalog(Path(args.catalog).resolve()) if args.catalog else None
    mapping = apply_catalog_mapping(rows, catalog, args.review_owner)
    after = sha256(workbook)

    valid_rows = [row for row in rows if row.validation == "VALID"]
    duplicate_rows = [row for row in rows if "DUPLICATE_SOURCE_CODE" in row.validation]
    invalid_rows = [
        row
        for row in rows
        if any(
            error in row.validation
            for error in ("MISSING_CODE", "MISSING_NAME", "INVALID_RATE", "NEGATIVE_RATE")
        )
    ]
    review_rows = [row for row in rows if row.validation != "VALID"]
    all_mapped = (
        catalog is not None
        and not review_rows
        and mapping["ambiguous"] == 0
        and mapping["missing"] == 0
        and mapping["mapped"] == len(valid_rows)
    )
    if catalog is None:
        verdict = "BLOCKED - SANITIZED CRM PRODUCT CATALOG NOT SUPPLIED"
        next_step = (
            "Export the staging product catalog using the contract above, rerun this command with "
            "--catalog, then assign every ambiguous/missing code to the review owner. Do not import rates yet."
        )
    elif all_mapped:
        verdict = "READY FOR OWNER REVIEW - NOT APPROVED FOR IMPORT"
        next_step = (
            "The owner must review the exact mappings and effective date, then approve a separate no-write "
            "staging import plan. This report does not authorize database changes."
        )
    else:
        verdict = "REVIEW REQUIRED - NOT APPROVED FOR IMPORT"
        next_step = (
            "Resolve every SOURCE_REVIEW, AMBIGUOUS and MISSING row with an explicit product identity. "
            "Do not use fuzzy mapping or create duplicate products."
        )

    return {
        "generated_at": __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds"),
        "workbook": workbook.name,
        "review_owner": args.review_owner,
        "sha256_before": before,
        "sha256_after": after,
        "source_unchanged": before == after,
        "mapping_verdict": verdict,
        "next_step": next_step,
        "summary": {
            "source_rows": len(rows),
            "valid_source_rows": len(valid_rows),
            "unique_valid_codes": len({row.normalized_code for row in valid_rows}),
            "duplicate_source_rows": len(duplicate_rows),
            "invalid_source_rows": len(invalid_rows),
            **mapping,
        },
        "bank_account_types": bank_account_type_summary(bank_sheets),
        "rows": [asdict(row) for row in rows],
    }


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only exact SKU dry-run for the legacy payroll workbook."
    )
    parser.add_argument("--workbook", required=True, help="Path to Copy of luong_2026 (1).xlsx")
    parser.add_argument("--catalog", help="Sanitized CRM product catalog (.json or .csv)")
    parser.add_argument("--expected-hash", help="Fail if the workbook SHA-256 differs")
    parser.add_argument("--review-owner", default="Chu he thong")
    parser.add_argument("--format", choices=("markdown", "json"), default="markdown")
    return parser.parse_args(list(argv))


def main(argv: Iterable[str]) -> int:
    try:
        args = parse_args(argv)
        report = build_report(args)
        if args.format == "json":
            print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
        else:
            print(render_markdown(report))
        return 0
    except (FileNotFoundError, ValueError, zipfile.BadZipFile, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
