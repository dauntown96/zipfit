"""src/<방향>.html 의 __ZF_DATA__ · /*__CORE__*/ 를 채워 design-lab/<방향>/index.html(자기완결 한 파일)을 만든다."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent
lab = root.parent
data = (lab / '_data.json').read_text(encoding='utf-8')
json.loads(data)
core = (root / 'core.js').read_text(encoding='utf-8')
for src in sorted((root / 'src').glob('*.html')):
    html = src.read_text(encoding='utf-8')
    assert '__ZF_DATA__' in html and '/*__CORE__*/' in html, src.name
    html = html.replace('__ZF_DATA__', data.replace('</', '<\\/')).replace('/*__CORE__*/', core)
    out = lab / src.stem / 'index.html'
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    print(out.relative_to(lab.parent), len(html.encode()))
