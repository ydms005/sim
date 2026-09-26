# data/raw/susi-ratio/ — 수시 전형별 경쟁률 원본 (esteacher2026/susi-ratio)

이 폴더의 JSON은 GitHub 저장소 [esteacher2026/susi-ratio](https://github.com/esteacher2026/susi-ratio)가
진학어플라이·유웨이어플라이 등 각 대학 입학처의 **수시 경쟁률 페이지**를 모아 정리한 자료입니다. 저장소 작성자가
이 사이트 운영자(선생님)에게 재사용을 허락해 주셔서 가져왔습니다(코드는 가져오지 않고 **데이터만** 가져왔습니다).

## 받은 파일과 커밋

| 파일 | 원본 경로 | 브랜치 | 커밋 SHA | collectedAt |
|---|---|---|---|---|
| `universities.json` | `universities.json` | `main` | `e5ac027837498f74a6eecb0514cec5790a997d8e` | — (대학 목록·경쟁률 페이지 URL) |
| `final2026.json` | `data/final2026.json` | `main` | `e5ac027837498f74a6eecb0514cec5790a997d8e` | `2026-09-15T11:08` |
| `feed2027.json` | `feed.json` | `jinhak-feed` | `fe2bb812672d95f4253bccea0b446ea93f384ea7` | `2026-09-15T11:08` |

(커밋 SHA는 2026-09-26 `git ls-remote https://github.com/esteacher2026/susi-ratio` 기준입니다.)

## 각 파일

- **`universities.json`** — susi-ratio가 추적하는 대학 207곳 목록. `id`(`u001`…)·대학명(캠퍼스가 있으면 `대학명(캠퍼스)`
  형태, 두 캠퍼스를 한 페이지에서 같이 보여 주는 경우 `campus` 값이 `통합 공개: ...`)·지역·설립구분·대학 홈페이지·
  원서접수 마감일·학년도별(2025~2027) 경쟁률 페이지 URL이 있습니다.
- **`final2026.json`** — **2026학년도 수시 최종** 경쟁률(원서접수 마감 기준). 207개 대학 중 178곳을 성공적으로
  가져왔고(`ok: true`), 나머지는 페이지 구조가 달라 못 가져왔습니다(`ok: false`). 대학마다 `units[]`에
  모집단위(학과)×전형별 모집인원(`quota`)·지원자 수(`app`)가 있습니다.
- **`feed2027.json`** — **2027학년도 수시**(2026-09-15 수집 시점, 진학어플라이를 쓰는 **91개 대학만** — 유웨이어플라이
  대학의 2027학년도 자료는 이 저장소에 없습니다, 배포 사이트에만 있고 API로는 접근할 수 없었다고 합니다). 모양은
  `final2026.json`과 같습니다.

## 우리 사이트에서 쓰는 법

`scripts/import-susi-ratio.mjs`(`npm run data:import-susi`)가 이 세 파일을 읽어 `data/competition.csv`
(대학ID,학년도,모집단위,전형명,전형유형,모집인원,지원자수)를 새로 만듭니다. 대학 매칭·전형유형(대분류) 분류
규칙은 그 스크립트 안에 있고, 실행하면 매칭 결과·분류 분포를 콘솔에 보여 줍니다.

## 다시 받는 법(자료 갱신)

susi-ratio 저장소가 자료를 새로 갱신하면(예: 2027학년도 최종 확정) 아래로 다시 받은 뒤 가져오기를 다시 실행하세요.

```bash
curl -sS -L https://raw.githubusercontent.com/esteacher2026/susi-ratio/main/universities.json \
  -o data/raw/susi-ratio/universities.json
curl -sS -L https://raw.githubusercontent.com/esteacher2026/susi-ratio/main/data/final2026.json \
  -o data/raw/susi-ratio/final2026.json
curl -sS -L https://raw.githubusercontent.com/esteacher2026/susi-ratio/jinhak-feed/feed.json \
  -o data/raw/susi-ratio/feed2027.json

npm run data:import-susi   # data/competition.csv 다시 생성
npm run data               # 검사·빌드 확인
```

이 폴더는(다른 `data/raw/*`처럼) 원본 보관용이며 빌드가 직접 읽지 않습니다(`npm run data`는 `data/*.csv`만 읽습니다).

## 출처를 함께 밝혀야 하는 이유

이 데이터의 1차 출처는 진학어플라이·유웨이어플라이가 대학 입학처를 대신해 운영하는 경쟁률 공개 페이지이며,
susi-ratio 저장소는 이를 대학별로 모아 정리한 것입니다. 사이트 화면(대학정보·지난 경쟁률 탭)에는
"출처: 진학어플라이·유웨이어플라이 경쟁률 페이지(esteacher2026/susi-ratio 수집 자료) · 원서접수 마감 기준"
각주를 표시합니다.
