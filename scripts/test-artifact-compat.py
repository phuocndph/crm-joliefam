import re
import zipfile
from pathlib import Path

src = Path('..') / 'outputs' / 'payroll-import-templates' / 'Mau_nhap_lieu_cham_cong_tien_luong.xlsx'
dst = Path('..') / 'outputs' / 'payroll-import-templates' / 'patched-test.xlsx'
with zipfile.ZipFile(src) as source, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as target:
    for name in source.namelist():
        data = source.read(name)
        if name.endswith('.xml') and b'<x:' in data:
            text = data.decode('utf-8-sig')
            text = re.sub(r'<(/?)x:', r'<\1', text)
            text = text.replace(' xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', ' xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
            data = text.encode('utf-8')
        if name.endswith('.rels'):
            text = data.decode('utf-8-sig').replace('Target="/xl/', 'Target="')
            if name == 'xl/_rels/workbook.xml.rels':
                ids = re.findall(r'Id="([^"]+)"', text)
                id_map = {old_id: f'rId{index}' for index, old_id in enumerate(ids, 1)}
                for old_id, new_id in id_map.items():
                    text = text.replace(f'Id="{old_id}"', f'Id="{new_id}"')
                Path('/tmp/artifact-id-map.txt').write_text('\n'.join(f'{k}={v}' for k,v in id_map.items()))
            data = text.encode('utf-8')
        if name == 'xl/workbook.xml':
            text = data.decode('utf-8-sig')
            id_map = dict(line.split('=', 1) for line in Path('/tmp/artifact-id-map.txt').read_text().splitlines())
            for old_id, new_id in id_map.items():
                text = text.replace(f'r:id="{old_id}"', f'r:id="{new_id}"')
            data = text.encode('utf-8')
        target.writestr(name, data)
print(dst)
