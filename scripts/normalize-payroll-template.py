"""Normalize artifact-tool XLSX output for browser ExcelJS and Excel.

The workbook generator intentionally keeps the source workbook simple, but the
artifact exporter uses namespace prefixes and package-absolute relationship
targets that older browser ZIP/XML readers do not resolve consistently. This
small post-processing step preserves workbook contents and normalizes only the
OOXML package metadata needed by the import screen.
"""

from __future__ import annotations

import re
import shutil
import sys
import zipfile
from pathlib import Path


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"


def normalise_main_xml(data: bytes) -> bytes:
    text = data.decode("utf-8-sig")
    if "xmlns:x=\"" + MAIN_NS + "\"" in text:
        text = text.replace(" xmlns:x=\"" + MAIN_NS + "\"", " xmlns=\"" + MAIN_NS + "\"")
        text = re.sub(r"<(/?)x:", r"<\1", text)
    return text.encode("utf-8")


def normalise_worksheet_relationship_refs(data: bytes) -> bytes:
    """Match tablePart r:id values to the normalized worksheet rel IDs."""
    text = data.decode("utf-8-sig")
    text = re.sub(r'r:id="R[^"]+"', 'r:id="rId1"', text)
    return text.encode("utf-8")


def normalise_relationships(name: str, data: bytes) -> bytes:
    text = data.decode("utf-8-sig")
    if name == "_rels/.rels":
        text = text.replace('Target="/xl/workbook.xml"', 'Target="xl/workbook.xml"')
    elif name == "xl/_rels/workbook.xml.rels":
        text = text.replace('Target="/xl/', 'Target="')
        ids = re.findall(r'Id="([^"]+)"', text)
        mapping = {old: f"rId{idx}" for idx, old in enumerate(ids, 1)}
        for old, new in mapping.items():
            text = text.replace(f'Id="{old}"', f'Id="{new}"')
        # The workbook references the same relationship IDs through r:id.
        global _WORKBOOK_ID_MAP
        _WORKBOOK_ID_MAP = mapping
    elif name.startswith("xl/worksheets/_rels/"):
        # Worksheet relationship parts are based in xl/worksheets/.
        text = text.replace('Target="/xl/tables/', 'Target="../tables/')
        text = text.replace('Target="/xl/', 'Target="../')
        ids = re.findall(r'Id="([^"]+)"', text)
        for idx, old in enumerate(ids, 1):
            text = text.replace(f'Id="{old}"', f'Id="rId{idx}"')
    return text.encode("utf-8")


_WORKBOOK_ID_MAP: dict[str, str] = {}


def normalise_workbook(data: bytes) -> bytes:
    text = data.decode("utf-8-sig")
    for old, new in _WORKBOOK_ID_MAP.items():
        text = text.replace(f'r:id="{old}"', f'r:id="{new}"')
    return text.encode("utf-8")


def normalize(source: Path, destination: Path) -> None:
    global _WORKBOOK_ID_MAP
    _WORKBOOK_ID_MAP = {}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp = destination.with_suffix(destination.suffix + ".tmp")
    with zipfile.ZipFile(source, "r") as source_zip, zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as target_zip:
        names = source_zip.namelist()
        raw = {name: source_zip.read(name) for name in names}
        # Process relationship parts first so workbook.xml can use normalized IDs.
        for name in names:
            if name == "xl/_rels/workbook.xml.rels" or name == "_rels/.rels" or name.startswith("xl/worksheets/_rels/"):
                raw[name] = normalise_relationships(name, raw[name])
        for name in names:
            data = raw[name]
            if name.endswith(".xml") and (name == "xl/workbook.xml" or name == "xl/styles.xml" or name == "xl/sharedStrings.xml" or name.startswith("xl/worksheets/") or name.startswith("xl/tables/")):
                data = normalise_main_xml(data)
            if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"):
                data = normalise_worksheet_relationship_refs(data)
            if name == "xl/workbook.xml":
                data = normalise_workbook(data)
            target_zip.writestr(name, data)
    temp.replace(destination)


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: normalize-payroll-template.py input.xlsx [output.xlsx]")
    source = Path(sys.argv[1]).resolve()
    destination = Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else source
    if source == destination:
        staged = source.with_suffix(source.suffix + ".source")
        shutil.copy2(source, staged)
        try:
            normalize(staged, destination)
        finally:
            staged.unlink(missing_ok=True)
    else:
        normalize(source, destination)
    print(destination)
