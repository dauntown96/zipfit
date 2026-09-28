#!/usr/bin/env python3
"""housing_units.extra_note → extracted_facts (규칙 버전 `B57-facts-v1`).

🔴 결정적으로 뽑히는 것만 뽑는다. 원문(`extra_note`)은 바꾸지 않고, 뽑은 값마다
그 값이 나온 원문 조각(`text`)을 함께 담는다 — 조각은 언제나 `extra_note`의 부분 문자열이다.

키(값은 언제나 배열 — 한 행에 둘 이상 나오면 `label`로 가른다):
  대기예비자수   {value:int, text}
  세대당계약면적 {value:float(㎡), text, label?}
  건설호수       {value:int, text, scope?('단지'), label?}
  계약금         {value:int(원), text, label?}
  최대전환       {text, 증액:{금액,보증금,월임대료}, 감액?:{금액,보증금,월임대료}}

label: 한 행에 같은 키가 둘 이상일 때만 — 바로 앞의 「가군」·「나군」(계약금) 또는
       바로 앞의 전용면적 「36.71㎡」(계약면적·건설호수).
scope: 「단지 건설 호수」처럼 단지 전체 수라고 원문이 밝힌 경우만 '단지'.

쓰는 법: python3 facts_v1.py rows.json > facts.json
  rows.json = [{"id": ..., "extra_note": ...}, ...]
"""
import json
import re
import sys

VERSION = 'B57-facts-v1'
NUM = lambda s: int(s.replace(',', ''))

RX_WAIT = re.compile(r'대기\s*중?인?\s*예비(?:자|입주자)\s*수?\s*:?\s*([0-9,]+)\s*(?:명|세대|호)?')
RX_AREA = re.compile(r'(?:세대당|세대별)\s*계약\s*면적\s*:?\s*([0-9.]+)\s*㎡')
RX_BUILT = re.compile(r'건설\s*(?:호수|세대수)?\s*:?\s*([0-9,]+)\s*호')
RX_DOWN = re.compile(r'계약금\s*:?\s*([0-9,]+)\s*원')
RX_MC = re.compile(r'최대\s*전환시\s*—\s*증액\s*\(\+\)\s*([0-9,]+)원\s*→\s*보증금\s*([0-9,]+)원·월임대료\s*([0-9,]+)원'
                   r'(?:\s*/\s*감액\s*\(-\)\s*([0-9,]+)원\s*→\s*보증금\s*([0-9,]+)원·월임대료\s*([0-9,]+)원)?')
RX_LBL_GROUP = re.compile(r'([가-힣]군)\([^()]*\):\s*임대보증금 계 [0-9,]+원\($')
RX_LBL_AREA = re.compile(r'(\d+(?:\.\d+)?㎡)\s*\(?\s*$')
RX_LBL_BUILT = re.compile(r'(\d+(?:\.\d+)?㎡)(?:\((?:세대당|세대별)\s*계약\s*면적\s*:?\s*[0-9.]+\s*㎡\)?[·\s]*|\s+)$')
RX_BUILT_OTHER_TYPE =re.compile(r'\d+[A-Z]?형\($')   # 「39B형(건설58호)」 — 다른 주택형 이야기


def label_before(note, start, rx, span=60):
    m = rx.search(note[max(0, start - span):start])
    return m.group(1) if m else None


def extract(note):
    f = {}
    w = [dict(value=NUM(m.group(1)), text=m.group(0).strip()) for m in RX_WAIT.finditer(note)]
    if w:
        f['대기예비자수'] = w
    a = [(m, dict(value=float(m.group(1)), text=m.group(0))) for m in RX_AREA.finditer(note)]
    if a:
        if len(a) > 1:
            for m, d in a:
                lb = label_before(note, m.start(), RX_LBL_AREA, 25)
                if lb: d['label'] = lb
        f['세대당계약면적'] = [d for _, d in a]
    b = []
    for m in RX_BUILT.finditer(note):
        if RX_BUILT_OTHER_TYPE.search(note[max(0, m.start() - 8):m.start()]):
            continue
        d = dict(value=NUM(m.group(1)), text=m.group(0))
        pre = note[max(0, m.start() - 4):m.start()]
        if re.search(r'단지\s*$', pre):      # 「전체 건설호수」는 주택형 전체일 수도 있어 표시하지 않는다
            d['scope'] = '단지'
        b.append((m, d))
    if b:
        if len(b) > 1:
            for m, d in b:
                lb = label_before(note, m.start(), RX_LBL_BUILT, 45)
                if lb: d['label'] = lb
        f['건설호수'] = [d for _, d in b]
    c = [(m, dict(value=NUM(m.group(1)), text=m.group(0))) for m in RX_DOWN.finditer(note)]
    if c:
        if len(c) > 1:
            for m, d in c:
                lb = label_before(note, m.start(), RX_LBL_GROUP, 80)
                if lb: d['label'] = lb
        f['계약금'] = [d for _, d in c]
    mc = []
    for m in RX_MC.finditer(note):
        d = dict(text=m.group(0), 증액=dict(금액=NUM(m.group(1)), 보증금=NUM(m.group(2)), 월임대료=NUM(m.group(3))))
        if m.group(4):
            d['감액'] = dict(금액=NUM(m.group(4)), 보증금=NUM(m.group(5)), 월임대료=NUM(m.group(6)))
        mc.append(d)
    if mc:
        f['최대전환'] = mc
    for k, arr in f.items():          # 조각은 원문의 부분 문자열이어야 한다
        for d in arr:
            assert d['text'] in note, (k, d['text'])
    return f


if __name__ == '__main__':
    rows = json.load(open(sys.argv[1]))
    out = {}
    for r in rows:
        fx = extract(r['extra_note'] or '')
        if fx:
            out[r['id']] = fx
    json.dump(out, sys.stdout, ensure_ascii=False)
