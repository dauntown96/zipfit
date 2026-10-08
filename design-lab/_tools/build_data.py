"""시안 실데이터 묶음을 만든다 — 배포본 공개 REST(anon) 응답 세 개에서만 값을 뽑는다.

입력(스크래치): ann.json = rpc/get_announcements_deduped(null,null,null)
               price.json = rpc/get_announcement_price_summary(p_ids)
               units.json = housing_units?announcement_id=in.(...)
출력: design-lab/_data.json — 값마다 출처(공고 ID · 행 id)를 함께 둔다.
"""
import json, sys, os
src = sys.argv[1]
ann = {r['announcement_id']: r for r in json.load(open(os.path.join(src, 'ann.json')))}
price = {r['announcement_id']: r for r in json.load(open(os.path.join(src, 'price.json')))}
units = json.load(open(os.path.join(src, 'units.json')))
allrows = json.load(open(os.path.join(src, 'ann.json')))

def card(aid, name, typ, extra):
    a, p = ann[aid], price[aid]
    c = dict(aid=aid, rpcRowId=a['id'], title=a['title'], name=name, type=typ,
             sido=a['sido_nm'], sigungu=a['sigungu_nm'], status=a['status'],
             annDate=a['announcement_date'], applyStart=a['apply_start'], applyEnd=a['apply_end'],
             depMin=p['deposit_min'], depMax=p['deposit_max'], rentMin=p['rent_min'], rentMax=p['rent_max'],
             areaMin=p['area_min'], areaMax=p['area_max'], url=a['url'])
    c.update(extra)
    return c

u58 = sorted([x for x in units if x['announcement_id'] == '2015122300020858'], key=lambda x: x['seq'])
u76 = [x for x in units if x['announcement_id'] == '0000061176']
u26 = [x for x in units if x['announcement_id'] == '2015122300020726']

cards = [
    card('2015122300020858', '인천석남 어울림센터', '행복주택',
         dict(recruit=sum((x['group_recruit_count'] or 0) if x['group_recruit_count'] else 0 for x in u58[:1]) + sum((x['recruit_count'] or 0) for x in u58),
              recruitNote='세대 정보 합(21A 56+6 · 26A 5 · 26AS 10 · 26B 2 · 44A 31) = 공고 total_units 110')),
    card('2015122300020726', '아산지역 국민임대', '국민임대',
         dict(sites=len({x['building_name'] for x in u26}), siteNames=sorted({x['building_name'] for x in u26}))),
    card('0000061176', '대전천동3 5블록', '10년 분양전환 공공임대',
         dict(recruit=sum(x['recruit_count'] or 0 for x in u76), complexUnits=ann['0000061176']['total_units'],
              recruitNote='세대 정보 39A 80 · 51A 50 · 59D 80')),
]

a = ann['2015122300020858']
g21 = [x for x in u58 if x['unit_group'] == '21A']
detail = dict(
    aid=a['announcement_id'], rpcRowId=a['id'], title=a['title'], name='인천석남 어울림센터 행복주택',
    type='행복주택', status=a['status'], org=a['supply_org'], address=a['precise_address'],
    annDate=a['announcement_date'], applyStart=a['apply_start'], applyEnd=a['apply_end'],
    docStart=a['doc_submit_start'], docEnd=a['doc_submit_end'], winner=a['winner_announce_date'],
    contractStart=a['contract_start'], moveIn=a['move_in_date'], heating=a['heating_type'],
    totalUnits=a['total_units'], url=a['url'],
    depMin=price[a['announcement_id']]['deposit_min'], depMax=price[a['announcement_id']]['deposit_max'],
    rentMin=price[a['announcement_id']]['rent_min'], rentMax=price[a['announcement_id']]['rent_max'],
    areaMin=price[a['announcement_id']]['area_min'], areaMax=price[a['announcement_id']]['area_max'],
    group=dict(type='21A', area=g21[0]['area_sqm'],
               shared=next(x['group_recruit_count'] for x in g21 if x['group_recruit_count']),
               total=next(x['group_recruit_count'] for x in g21 if x['group_recruit_count']) + sum(x['recruit_count'] or 0 for x in g21),
               rows=[dict(unitId=x['id'], target=x['supply_target'], dep=x['deposit'], rent=x['monthly_rent'],
                          count=x['recruit_count'], inShared=x['group_recruit_count'] is not None) for x in g21]),
    others=[dict(unitId=x['id'], type=x['unit_type'], area=x['area_sqm'], target=x['supply_target'],
                 dep=x['deposit'], rent=x['monthly_rent'], count=x['recruit_count']) for x in u58 if x['unit_group'] != '21A'],
)
st = {}
for r in allrows: st[r['status']] = st.get(r['status'], 0) + 1
out = dict(asOf='2026-10-08', source='https://kkokzip.com 배포본 공개 REST(anon) · 2026-10-08 KST 조회',
           openCount=st.get('공고중', 0) + st.get('접수중', 0) + st.get('정정공고중', 0),
           receivingCount=st.get('접수중', 0), statusCounts=st, cards=cards, detail=detail)
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False)[:1500])
