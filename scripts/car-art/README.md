# 차 그림(선화) 만들기

앱의 차 전개도 그림(`public/car/*.svg`)과 부위 구역(`src/modules/repair/car-art-data.ts`)을 만드는 스크립트입니다.

- 원본: GetOutlines(https://getoutlines.com) 무료 도면, **CC BY 4.0**. 화면 아래와 도움말에 출처를 적었습니다.
  - 세단: hyundai-elantra-2017 / 해치백: hyundai-i30-2008(위 모습은 세단 것을 늘여 씀)
  - SUV: hyundai-santa-fe-2018 / 승합: hyundai-h-1-2008 / 소형 화물: kia-bongo-iii-2010(위 모습은 직접 그림)
- 원본 그림은 저장소에 넣지 않습니다. 위 이름의 무료 PNG/GIF 를 받아 스크립트와 같은 폴더에 두고 돌립니다.

```
pip install numpy pillow scipy shapely   # potrace 도 필요(apt-get install potrace)
python3 -I build.py OUT     # 자르기·엠블럼/안테나/워터마크 지우기·potrace 벡터화·실루엣·배치(layout.json)
python3 -I zones.py OUT ../../src/modules/repair/car-art-data.ts   # 부위 구역·3×3 칸 상자
cp OUT/*.svg ../../public/car/
```

부위 경계(이음선 x, 벨트라인 y, 램프·그릴 사각형 등)는 `zones.py` 의 `P` 에 차형·면별로 적혀 있습니다.
경계는 거칠게 잡고 화면에서 실루엣으로 잘라 씁니다.
