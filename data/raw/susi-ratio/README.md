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
| `prior_timeline.json` | `data/prior_timeline.json` | `main` | `e5ac027837498f74a6eecb0514cec5790a997d8e` | 2026-09-27 받음 |

(커밋 SHA는 2026-09-26/27 `git ls-remote https://github.com/esteacher2026/susi-ratio` 기준입니다.)

### prior_timeline.json — 원서접수 기간 시점별 경쟁률

원본은 **「2027 대입을 위한 실시간 경쟁률.xlsx」** 자료입니다. 이 파일의 원 제공자와 susi-ratio 저장소 작성자 모두 이 사이트에서
데이터를 재사용하도록 허락해 주셨습니다(코드는 가져오지 않고 데이터만 가져왔습니다).

- 대학×전형×모집단위(12,309행) 별로 2025·2026학년도 원서접수 기간의 **여섯 시점**(`t26`·`t25` 배열, 순서대로
  D-3·D-2·D-1·마감일 오전·마감일 오후·최종) 경쟁률과, 그 학년도 마지막 시점 대비 상승폭(`jump26`·`jump25`), 2027학년도
  모집인원(`quota27`), 2024~2026학년도 최종 경쟁률 3개(`fin`, 순서는 `[2026, 2025, 2024]`)가 있습니다.
- **`fin` 순서 확인**: 전체 12,309행에서 `fin[0]`(2026)은 `t26[5]`(2026 배열의 '최종')과 **항상** 같았고, `fin[1]`(2025)은
  `t25[5]`(2025 배열의 '최종')과 98.8%(12,159/12,309) 같았습니다(나머지는 마감 후 정정 등으로 보이는 작은 차이). 그래서
  `scripts/import-susi-timeline.mjs`는 2025·2026학년도 시점 그래프는 `t25`/`t26` 배열을 그대로 쓰고, 2024학년도는 다른 시점
  자료가 없어 `fin[2]`(최종 한 점)만 씁니다.
- `univ` 필드는 susi-ratio가 다른 파일(`universities.json`)에도 쓰는 정식 명칭이 아니라 **줄인 이름**입니다
  (예: `서울대`, `한국외대(글로벌)`, `국립공주대`). `scripts/import-susi-timeline.mjs`의 대학 매칭 방식은
  `data/README.md`의 [접수 기간 시점별 경쟁률 가져오기](../../README.md#접수-기간-시점별-경쟁률-가져오기-timelinecsv) 참고.

### timeline2027.csv (선택, 아직 없음)

원서접수 기간에 선생님이 직접 받아 두는 2027학년도 **시각별** 경쟁률(긴 형식: `대학,전형,모집단위,시각,모집,지원,경쟁률`)을
여기 두면 `npm run data:import-timeline` 이 함께 읽습니다. 아직 파일이 없어도 정상입니다(가져오기 스크립트가 안내만 남기고
건너뜁니다) — 자세한 형식은 `data/README.md`의 [접수 기간 시점별 경쟁률 가져오기](../../README.md#접수-기간-시점별-경쟁률-가져오기-timelinecsv) 참고.

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
curl -sS -L https://raw.githubusercontent.com/esteacher2026/susi-ratio/main/data/prior_timeline.json \
  -o data/raw/susi-ratio/prior_timeline.json

npm run data:import-susi       # data/competition.csv 다시 생성
npm run data:import-timeline   # data/timeline.csv 다시 생성 (접수 기간 시점별 경쟁률)
npm run data                   # 검사·빌드 확인
```

받은 날짜와 `git ls-remote https://github.com/esteacher2026/susi-ratio refs/heads/main` 로 확인한 커밋 SHA를 이 파일 위쪽의
표에 한 줄 추가해 두세요.

이 폴더는(다른 `data/raw/*`처럼) 원본 보관용이며 빌드가 직접 읽지 않습니다(`npm run data`는 `data/*.csv`만 읽습니다).

## 출처를 함께 밝혀야 하는 이유

이 데이터의 1차 출처는 진학어플라이·유웨이어플라이가 대학 입학처를 대신해 운영하는 경쟁률 공개 페이지이며,
susi-ratio 저장소는 이를 대학별로 모아 정리한 것입니다. 사이트 화면(대학정보·지난 경쟁률 탭)에는
"출처: 진학어플라이·유웨이어플라이 경쟁률 페이지(esteacher2026/susi-ratio 수집 자료) · 원서접수 마감 기준"
각주를 표시합니다.
