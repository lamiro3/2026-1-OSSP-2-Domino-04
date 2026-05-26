# BackEnd 개발 리뷰 문서

> 작성일: 2025-05-25  
> 대상 범위: Express API 서버 / FastAPI AI 서버 / MySQL / Docker Compose

---

## 목차

1. [전체 프로젝트 흐름](#1-전체-프로젝트-흐름)
2. [프로젝트 구조도](#2-프로젝트-구조도)
3. [파일별 역할 개괄](#3-파일별-역할-개괄)
4. [레이어별 상세 설명](#4-레이어별-상세-설명)
5. [발생한 문제와 해결 방법](#5-발생한-문제와-해결-방법)
6. [추가 개선 방안 및 아이디어](#6-추가-개선-방안-및-아이디어)

---

## 1. 전체 프로젝트 흐름

이 프로젝트는 서울 지역 K-POP 관광 앱의 백엔드로, 핵심 기능은 두 가지다.

**기능 A: 장소 탐색 및 경로 안내**  
사용자가 목적지를 검색하면 Kakao Directions API가 최적 경로를 계산한다. 이 경로 데이터는 FastAPI로 전달되어 현재 활성 재난 구역과 겹치는지 분석된다. 결과로 `is_safe` 여부와 `total_penalty`(가중치 합산)가 반환되어 프론트엔드가 안전한 경로를 사용자에게 표시할 수 있다.

**기능 B: 재난 문자 파이프라인**  
서울시 공공 API에서 재난 안전 문자를 수신하고, Gemini LLM이 문자를 분석해 재난 발생 위치(위도/경도)와 위험 반경을 추출한다. 추출된 정보는 MySQL에 저장되며, APScheduler가 10분마다 이 파이프라인을 자동으로 실행한다.

```
[프론트엔드]
     |
     | REST (JSON)
     v
[Express API 서버 :3000]              <-- 보안 게이트웨이 역할
     |            |
     |            | 내부 HTTP (axios)
     |            v
     |     [FastAPI 서버 :8000]       <-- AI/ML + 재난 분석 담당
     |            |
     |            +-- [Gemini LLM]   (재난 문자 위치 추출)
     |            |
     |            +-- [MySQL :3306]  (재난 데이터 영속화)
     |            |
     |            +-- [APScheduler] (10분마다 자동 fetch-and-save)
     |
     +-- [Kakao Directions API]      (경로 계산)
     +-- [TripAdvisor API]           (장소 검색/상세)
     +-- [Seoul Open API]            (재난 안전 문자 수신)
     +-- [공공데이터포털 API]          (미디어 촬영 장소)
     +-- [Firebase Auth]             (사용자 인증)
```

### 경로 요청 흐름 (기능 A)

```
프론트 → GET /api/directions?origin=...&destination=...
    → Express: Kakao Directions API 호출
    → Express: FastAPI /route/calculate 에 Kakao 경로 전달
        → FastAPI: DB에서 활성 재난 조회 (1회 쿼리)
        → FastAPI: 경로 버텍스마다 재난 구역 겹침 검사 (Haversine)
        → FastAPI: { is_safe, total_penalty, affected_sections, disaster_warnings } 반환
    → Express: { route, disaster_analysis } 통합 응답
    ※ FastAPI 장애 시: disaster_analysis = null 로 graceful degradation
```

### 재난 파이프라인 흐름 (기능 B)

```
APScheduler (10분 주기) 또는 POST /disaster/fetch-and-save 수동 호출
    → Seoul Open API: 최신 재난 문자 5건 수신
    → 중복 체크: message 기준 DB 조회 → 이미 존재하면 skip
    → Gemini (gemini-2.5-flash): 문자 분석
        프롬프트: "이 문자에서 재난 중심 좌표(lat, lng)와 위험 반경(m)을 JSON으로 추출"
        응답: {"lat": 37.56, "lng": 126.97, "radius": 500}
    → 가중치 계산: radius <= 200 -> 30 / <= 500 -> 60 / > 500 -> 100
    → MySQL INSERT: POINT(lng lat) WKT 형식, expires_at = 수신 시각 + 2시간
```

---

## 2. 프로젝트 구조도

```
BackEnd/
├── docker-compose.yml              # 3개 서비스 오케스트레이션 (db, express-server, fastapi-server)
├── .env                            # 통합 환경변수 (모든 서비스 공유)
│
├── express-server/                 # Node.js API 게이트웨이
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js                  # 서버 진입점 + 미들웨어 설정
│       ├── routes/
│       │   └── map.js              # /api 라우터 (directions, tripadvisor)
│       ├── services/
│       │   ├── FastAPI_Service.js  # FastAPI 내부 통신 클라이언트
│       │   ├── Kakao_Service.js    # Kakao API 래퍼
│       │   ├── TripAdvisor_Service.js
│       │   ├── Firebase_Service.js
│       │   └── Public_Data_Service.js  # 공공데이터포털 API 클라이언트
│       ├── models/
│       │   ├── index.js            # Sequelize 초기화
│       │   ├── disasteralert.js    # DisasterAlert 모델 (제약조건 + unique 인덱스)
│       │   ├── user.js
│       │   ├── place.js
│       │   ├── kpoplocation.js
│       │   └── ...
│       └── config/
│           ├── config.json         # Sequelize DB 설정
│           ├── db.js               # Sequelize 연결
│           └── firebase.js         # Firebase Admin SDK 초기화
│
├── fastapi-server/                 # Python AI/ML 서버
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI 앱 + APScheduler 라이프사이클
│       ├── database.py             # SQLAlchemy 엔진 + 세션 팩토리
│       ├── routers/
│       │   ├── disaster.py         # /disaster/* HTTP 라우터 (얇은 레이어)
│       │   ├── route.py            # /route/calculate 라우터
│       │   └── population.py       # /population/* 라우터
│       └── services/
│           └── disaster_service.py # 재난 관련 비즈니스 로직 전담
│
└── docker/
    ├── fast.api/
    │   └── Dockerfile              # FastAPI 전용 빌드 파일
    └── mysql/
        └── healthcheck.sh          # DB 헬스체크 스크립트
```

---

## 3. 파일별 역할 개괄

| 파일 | 레이어 | 역할 |
|------|--------|------|
| `docker-compose.yml` | 인프라 | db / express-server / fastapi-server 3개 컨테이너를 app-network로 묶어 실행 |
| `express-server/src/app.js` | 진입점 | helmet, CORS, rate-limit 미들웨어 설정. 필수 환경변수 부재 시 즉시 종료 |
| `express-server/src/routes/map.js` | 라우터 | `/api/tripadvisor/*`, `/api/directions` 엔드포인트. Kakao + FastAPI 결과를 합쳐 응답 |
| `express-server/src/services/FastAPI_Service.js` | 서비스 | FastAPI 내부 통신. ECONNREFUSED 등 연결 오류 구분 처리, 10초 타임아웃 |
| `express-server/src/services/Public_Data_Service.js` | 서비스 | 공공데이터포털(ODCloud) API 호출. Authorization 헤더에 `Infuser` 접두사 포함 |
| `express-server/src/models/disasteralert.js` | 모델 | DisasterAlert Sequelize 모델. 필드 제약조건 및 message unique 인덱스 정의 |
| `fastapi-server/app/main.py` | 진입점 | FastAPI 앱 생성, 라우터 등록, APScheduler 10분 주기 작업 설정 |
| `fastapi-server/app/database.py` | DB 연결 | SQLAlchemy 엔진 + SessionLocal + get_db 의존성 함수 |
| `fastapi-server/app/routers/disaster.py` | 라우터 | `/disaster/*` 5개 엔드포인트. 입력 검증 후 서비스 레이어 위임 |
| `fastapi-server/app/routers/route.py` | 라우터 | `/route/calculate`. 재난 구역과 경로 버텍스 겹침 분석 |
| `fastapi-server/app/services/disaster_service.py` | 서비스 | Gemini 호출, DB 읽기/쓰기, 가중치 계산 등 재난 관련 핵심 로직 |

---

## 4. 레이어별 상세 설명

---

### 4-1. 인프라 레이어 — `docker-compose.yml`

**왜** 필요한가: 로컬과 프로덕션 양쪽에서 동일한 환경을 보장해야 하고, 세 서비스(DB, Express, FastAPI)가 서로를 hostname으로 찾을 수 있어야 한다.

**누가** 정의하는가: 운영자. `.env` 한 파일로 모든 서비스의 비밀값을 관리한다.

**어떻게** 동작하는가: `app-network` 브리지 네트워크로 컨테이너 간 통신한다. Express는 `db`라는 hostname으로 MySQL에, `fastapi-server:8000`으로 FastAPI에 접근한다. MySQL 헬스체크를 통과해야 Express와 FastAPI가 기동되도록 `depends_on.condition: service_healthy`가 설정되어 있다.

```yaml
express-server:
  environment:
    - DB_HOST=db                             # MySQL 컨테이너명으로 접근
    - FASTAPI_URL=http://fastapi-server:8000
  depends_on:
    db:
      condition: service_healthy             # DB가 준비된 후에만 기동
```

---

### 4-2. Express 진입점 — `src/app.js`

**왜** 필요한가: 모든 외부 요청이 통과하는 단일 관문이므로, 보안 미들웨어와 환경변수 검증을 이 파일에서 일괄 처리한다.

**언제** 실행되는가: `node app.js` 또는 Docker 컨테이너 기동 시.

**어떻게** 동작하는가:

1. `dotenv.config()` 로 `.env` 로드
2. 필수 환경변수 누락 검사 → 누락 시 `process.exit(1)` 로 즉시 종료
3. `helmet()` → HTTP 보안 헤더 자동 설정
4. `cors()` → 허용 도메인 화이트리스트 검사
5. `rateLimit()` → `/api` 전체에 분당 60회 제한
6. 라우터 마운트 → `app.use('/api', mapRoutes)`
7. 전역 에러 핸들러 → 스택 트레이스는 서버 로그에만 기록, 클라이언트에는 추상화된 메시지 반환

```javascript
// 필수 환경변수 검사 — 서버 기동 전에 차단
const missingVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingVars.length > 0) {
  console.error('[ERROR] Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}
```

---

### 4-3. Express 라우터 — `src/routes/map.js`

**왜** 필요한가: 외부 API(Kakao, TripAdvisor)를 프론트엔드에서 직접 호출하면 API 키가 노출된다. Express가 프록시 역할을 하면 키는 서버 측에만 존재한다.

**어떤** 엔드포인트가 있는가:

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/tripadvisor/search` | 장소 키워드 검색 |
| GET | `/api/tripadvisor/details/:locationId` | 장소 상세 조회 |
| GET | `/api/directions` | Kakao 경로 + FastAPI 재난 분석 통합 응답 |

**핵심 설계 — Graceful Degradation:**  
`/api/directions`에서 FastAPI 호출은 내부 try-catch로 격리되어 있다. FastAPI가 다운되거나 타임아웃이 발생해도 Kakao 경로 응답은 정상 반환되고, `disaster_analysis` 필드만 `null`이 된다. 사용자는 재난 정보 없이도 경로 안내를 받을 수 있다.

```javascript
let disasterAnalysis = null;
try {
    disasterAnalysis = await calculateRoute(kakaoData);
} catch (fastapiError) {
    console.error('[WARN] Disaster analysis failed, returning route only:', fastapiError.message);
}
res.json({ route: kakaoData, disaster_analysis: disasterAnalysis });
```

---

### 4-4. Express 서비스 — `src/services/FastAPI_Service.js`

**왜** 필요한가: FastAPI 통신 코드를 라우터에서 분리해 재사용성을 높이고, 연결 오류 유형(서버 다운 vs 요청 처리 실패)을 구분해 의미 있는 에러 메시지를 제공한다.

**어떻게** 동작하는가: `ECONNREFUSED` / `ENOTFOUND` 에러 코드로 FastAPI 서버 자체가 죽은 건지, 요청 처리 중 실패한 건지 분리한다. 모든 요청에 10초 타임아웃이 설정되어 있다.

```javascript
if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
  throw new Error('AI 분석 서버에 연결할 수 없습니다.');
}
// FastAPI detail 필드에서 구체적 오류 메시지 추출
const msg = error.response?.data?.detail || error.message;
```

---

### 4-5. Express 서비스 — `src/services/Public_Data_Service.js`

**왜** 필요한가: 공공데이터포털(ODCloud) API는 일반 REST API와 다르게 `Authorization: Infuser {key}` 헤더를 요구한다. 이 특수한 인증 방식을 전용 서비스 클래스로 캡슐화해 호출 측이 신경 쓰지 않도록 한다.

**무엇**이 개선됐는가: 초기 코드에 `console.log("헤더:", requestConfig.headers)` 디버그 로그가 있었는데, 이 한 줄이 서버 로그에 API 키를 그대로 출력했다. 운영 환경에서 로그가 외부에 노출되면 키 탈취가 가능하므로 제거했다.

---

### 4-6. Express 모델 — `src/models/disasteralert.js`

**왜** 필요한가: Sequelize 모델이 DB 스키마의 유일한 코드 표현이다. 제약조건이 없으면 잘못된 데이터가 조용히 DB에 들어가 이후 경로 계산에서 예상치 못한 버그를 유발한다.

**어떻게** 개선됐는가: 모든 필드에 `allowNull`, `defaultValue`, `validate` 를 추가했다. `message` 컬럼에 unique 인덱스를 선언해 Sequelize 레벨에서도 중복 삽입을 방어한다.

```javascript
message: {
  type: DataTypes.TEXT,
  allowNull: false,
  validate: { notEmpty: true },
},
radius_m: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 500,
  validate: { min: 0 },
},
```

---

### 4-7. FastAPI 진입점 — `app/main.py`

**왜** 필요한가: 재난 문자 수집은 외부 이벤트 없이 주기적으로 실행돼야 한다. 별도 cron 서버를 두는 대신 APScheduler를 FastAPI 프로세스 안에 내장해 운영 복잡도를 줄인다.

**어떻게** 동작하는가: FastAPI의 `lifespan` 컨텍스트 매니저를 사용해 서버 시작 시 스케줄러를 기동하고, 종료 시 cleanly shutdown한다. 스케줄러는 10분마다 `scheduled_fetch_and_save`를 비동기 실행한다.

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        scheduled_fetch_and_save,
        trigger=IntervalTrigger(minutes=10),
        id="fetch_and_save",
        replace_existing=True,
    )
    scheduler.start()
    yield                          # 서버 실행 구간
    scheduler.shutdown(wait=False)
```

---

### 4-8. FastAPI DB 연결 — `app/database.py`

**왜** 필요한가: SQLAlchemy 연결 설정을 한 곳에 모아두고, `get_db()` 의존성 함수로 모든 라우터에 일관된 세션 생명주기를 제공한다. 세션은 요청 종료 시 반드시 닫힌다.

**어떻게** 동작하는가: Docker 내부 통신을 위해 호스트를 `MYSQL_HOST` 환경변수(기본값 `db`)로 받아온다. 포트는 Docker 내부 포트인 3306을 고정으로 사용한다.

```python
def get_db():
    db = SessionLocal()
    try:
        yield db       # 요청 처리 중 세션 제공
    finally:
        db.close()     # 요청 완료 후 반드시 닫음
```

---

### 4-9. FastAPI 라우터 — `app/routers/disaster.py`

**왜** 필요한가: HTTP 요청/응답 처리와 비즈니스 로직을 분리해 코드 가독성과 테스트 용이성을 높인다. 라우터는 "어떤 요청이 오면 어떤 응답을 준다"는 선언적 역할만 한다.

**어떤** 엔드포인트가 있는가:

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/disaster/seoul/latest` | Seoul Open API 프록시, 최신 재난 문자 5건 반환 |
| POST | `/disaster/analyze` | 단건 문자 Gemini 분석 → 위치 + 반경 JSON 반환 |
| POST | `/disaster/fetch-and-save` | 수집 → 분석 → 저장 원스톱 파이프라인 수동 실행 |
| GET | `/disaster/active` | 현재 만료되지 않은 재난 목록 반환 |
| GET | `/disaster/nearby` | 특정 좌표 반경 내 활성 재난 반환 |

각 핸들러는 서비스 레이어를 한 줄로 호출한다:

```python
@router.post("/fetch-and-save")
async def fetch_analyze_save(db: Session = Depends(get_db)):
    if not SEOUL_API_KEY:
        raise HTTPException(status_code=500, detail="SEOUL_API_KEY is not configured")
    result = await disaster_service.fetch_and_save_alerts(SEOUL_API_KEY, db)
    return {"status": "success", **result}
```

---

### 4-10. FastAPI 서비스 — `app/services/disaster_service.py`

**왜** 필요한가: 재난 분석 로직은 라우터와 APScheduler 양쪽에서 호출된다. 서비스 레이어로 분리하지 않으면 코드가 중복되고, 수정 시 여러 곳을 동시에 바꿔야 한다.

**무엇**이 들어있는가:

- `analyze_alert(text)` — Gemini 호출 및 JSON 파싱
- `build_gemini_prompt(text)` — 프롬프트 생성 (순수 함수, 테스트 용이)
- `parse_gemini_response(raw)` — 마크다운 제거 후 JSON 파싱, 필수 필드 검증
- `calculate_weight_penalty(radius_m)` — 반경 크기별 페널티 분기
- `get_active_alerts(db)` — 만료되지 않은 재난 목록 조회
- `get_alerts_near_point(lat, lng, radius, db)` — 공간 쿼리 (ST_Distance_Sphere)
- `fetch_and_save_alerts(key, db)` — 수집 → 분석 → 저장 전체 파이프라인

```python
# 가중치 페널티: 반경 크기로 위험도 정량화
def calculate_weight_penalty(radius_m: int) -> int:
    if radius_m <= 200:   return 30   # 소규모
    elif radius_m <= 500: return 60   # 중규모
    return 100                        # 대규모
```

좌표 저장 시 주의사항: MySQL WKT는 `POINT(경도 위도)` 순서다. 일반적인 위도/경도 순서와 반대이므로 반드시 `f"POINT({lng} {lat})"` 형태로 작성해야 한다.

---

### 4-11. FastAPI 라우터 — `app/routers/route.py`

**왜** 필요한가: Kakao가 계산한 경로가 재난 구역을 통과하는지 서버 측에서 판단해야 한다. 이 판단 결과를 Express가 받아 프론트엔드에 전달한다.

**어떻게** 동작하는가:

1. DB에서 활성 재난을 한 번의 쿼리로 모두 불러온다 (N+1 문제 방지)
2. Kakao 응답 구조인 `routes[0].sections[n].roads[m].vertexes` 순회
3. 버텍스 배열은 `[lng0, lat0, lng1, lat1, ...]` 형태 (경도 먼저)
4. `VERTEX_SAMPLE_STEP = 3` 으로 3개마다 1개씩 검사해 CPU 부하 절감 (약 66%)
5. 각 버텍스에서 Haversine 공식으로 재난 중심까지 거리 계산

```python
# Kakao vertexes: 인덱스 i=경도, i+1=위도
while i + 1 < len(vertexes):
    if vertex_num % VERTEX_SAMPLE_STEP == 0:  # 샘플링
        v_lng = vertexes[i]
        v_lat = vertexes[i + 1]
        hits = _check_vertex_against_disasters(v_lat, v_lng, disasters)
    i += 2
    vertex_num += 1
```

응답 구조:

```json
{
  "is_safe": false,
  "total_penalty": 160,
  "affected_sections": [0, 2],
  "disaster_warnings": [
    {
      "section": 0,
      "road": 1,
      "penalty": 60,
      "disaster_center": { "lat": 37.56, "lng": 126.97 }
    }
  ]
}
```

---

## 5. 발생한 문제와 해결 방법

---

### 문제 1: 한국어 문자열 포함 파일 작성 시 파일 truncation

**무엇이**: Write/Edit 도구로 한국어 주석이 포함된 JS 파일을 작성할 때 특정 라인에서 파일이 잘렸다.

**어떻게 발견했나**: `node --check map.js` 실행 시 `SyntaxError: missing ) after argument list` 발생. `cat -A`로 확인하니 파일이 중간에서 끊겨 있었다.

**왜 발생했나**: Windows 환경에서 한국어 UTF-8 문자열이 포함된 파일을 Write 도구로 쓸 때 인코딩 불일치로 내용이 잘리거나, 이전 파일 내용이 완전히 덮어쓰이지 않고 null byte(`^@`)가 뒤에 붙는 현상이 발생했다.

**어떻게 해결했나**: 모든 파일 작성을 bash heredoc(`cat > file << 'ENDOFFILE'`)으로 전환했다. 소스코드 내 한국어 주석도 영어로 교체해 재발을 방지했다.

```bash
# 안전한 파일 작성 방법
cat > /path/to/file.js << 'ENDOFFILE'
... 파일 내용 (한국어 없이) ...
ENDOFFILE
```

---

### 문제 2: 이모지 문자가 Node.js SyntaxError 유발

**무엇이**: console.error 내부에 이모지를 사용한 코드에서 Node.js가 SyntaxError를 발생시켰다.

**왜 발생했나**: 이모지가 다중 바이트 Unicode 문자로, 파일 인코딩 처리 과정에서 문자열 리터럴을 손상시켰다.

**어떻게 해결했나**: 이모지를 ASCII 접두사 `[WARN]`, `[ERROR]`로 교체했다.

---

### 문제 3: Kakao vertexes 좌표 순서 오인

**무엇이**: 경로 계산 시 위도/경도가 뒤바뀌어 재난 구역 겹침 판단이 완전히 틀린 결과를 냈다.

**왜 발생했나**: Kakao Directions API의 `vertexes` 배열은 `[lng, lat, lng, lat, ...]` 순서로, 일반적인 지리 데이터 표기(위도 먼저)와 반대다. 코드에서 인덱스 0을 위도로 잘못 사용했다.

**어떻게 해결했나**: Kakao API 문서를 확인해 `vertexes[i]` = 경도, `vertexes[i+1]` = 위도로 수정했다.

```python
# 수정 전 (잘못됨)
v_lat = vertexes[i]
v_lng = vertexes[i + 1]

# 수정 후 (올바름 -- Kakao는 경도 먼저)
v_lng = vertexes[i]
v_lat = vertexes[i + 1]
```

---

### 문제 4: MySQL WKT 좌표 순서 혼동

**무엇이**: DB에 저장된 좌표를 `ST_Distance_Sphere`로 계산하면 거리가 수천 킬로미터로 나왔다.

**왜 발생했나**: MySQL의 `ST_GeomFromText('POINT(lat lng)')` 에 위도/경도를 일반적인 순서로 입력했는데, WKT 표준은 `POINT(경도 위도)` 순서를 요구한다.

**어떻게 해결했나**: 모든 WKT 생성 코드를 `f"POINT({lng} {lat})"` 형식으로 수정했다. `ST_X()` = 경도, `ST_Y()` = 위도임도 함께 확인했다.

---

### 문제 5: disaster.py 파일 중복 내용 누적

**무엇이**: 기존 파일에 `cat >>` 로 내용을 추가했는데, 파일에 이미 active/nearby 엔드포인트가 있었고 새로 추가한 내용과 충돌해 불완전한 파일이 됐다.

**왜 발생했나**: Write 도구로 작성된 파일의 실제 디스크 내용이 Read 도구가 보여주는 내용과 달랐다. Read 도구는 189줄을 보여줬으나 실제 파일에는 잘린 채 더 많은 내용이 들어있었다.

**어떻게 해결했나**: `wc -l`과 `tail`로 실제 파일 상태를 직접 확인하는 절차를 확립했다. 파일 전체를 heredoc으로 완전히 재작성해 해결했다.

---

### 문제 6: requirements.txt UTF-16 LE 인코딩

**무엇이**: `cat requirements.txt`로 보면 모든 문자 사이에 공백이 들어가 있었다. 일반적인 `echo >>` 방식으로 패키지를 추가하면 파일이 깨진다.

**왜 발생했나**: Windows에서 생성된 파일이 UTF-16 LE (BOM 포함) 인코딩으로 저장되어 있었다.

**어떻게 해결했나**: Python으로 인코딩을 탐지 후 동일한 인코딩으로 읽고 수정해 다시 썼다.

```python
with open(path, 'r', encoding='utf-16-le') as f:
    content = f.read()
content += '\napscheduler==3.11.0\n'
with open(path, 'w', encoding='utf-16-le') as f:
    f.write(content)
```

---

### 문제 7: analyze_disaster 응답이 HTTP 200으로 에러를 반환

**무엇이**: Gemini 응답이 파싱 실패해도 `{"status": "error"}` 를 HTTP 200으로 반환했다. Express에서 이 응답을 정상으로 처리해 잘못된 데이터가 파이프라인에 흘렀다.

**어떻게 해결했나**: 파싱 실패 시 `HTTPException(status_code=502)`를 raise 하도록 수정했다. Express는 5xx를 받으면 예외 처리 경로로 분기한다.

---

## 6. 추가 개선 방안 및 아이디어

---

### 6-1. [단기] Sequelize Migration으로 message 컬럼 unique 인덱스 반영

현재 `disasteralert.js` 모델에 unique 인덱스가 선언되어 있지만, MySQL TEXT 타입은 prefix 길이 없이 unique 인덱스를 걸 수 없다. Migration 파일을 추가해 `message(255)` prefix 인덱스를 명시적으로 생성해야 한다.

```javascript
await queryInterface.addIndex('DisasterAlerts', {
  fields: [sequelize.fn('SUBSTR', sequelize.col('message'), 1, 255)],
  unique: true,
  name: 'unique_message_prefix'
});
```

---

### 6-2. [단기] expires_at 기간을 재난 유형별로 차등 적용

현재 모든 재난의 유효기간이 수신 시각 + 2시간으로 고정되어 있다. Gemini 분석 결과에 `type` 필드(화재, 홍수, 지진 등)를 추가하고 유형별로 유효기간을 다르게 설정하면 더 정확한 위험 정보를 제공할 수 있다.

```python
EXPIRES_HOURS = {
    "fire": 3,
    "flood": 6,
    "earthquake": 12,
    "default": 2,
}
```

---

### 6-3. [단기] route.py VERTEX_SAMPLE_STEP 동적 조정

현재 샘플링 스텝이 상수 3으로 고정되어 있다. 경로 총 버텍스 수에 따라 동적으로 조정하면 짧은 경로에서 정확도를 유지하면서 긴 경로에서 더 많이 건너뛸 수 있다.

```python
total_vertices = sum(len(r["vertexes"]) // 2 for s in sections for r in s.get("roads", []))
VERTEX_SAMPLE_STEP = max(1, total_vertices // 200)  # 항상 최대 200점만 검사
```

---

### 6-4. [중기] Redis 캐싱으로 활성 재난 조회 최적화

`/route/calculate`가 호출될 때마다 `_load_active_disasters(db)`가 DB를 조회한다. 활성 재난 데이터는 최소 수분간 변하지 않으므로 Redis에 60초 TTL로 캐싱하면 DB 부하를 크게 줄일 수 있다. `docker-compose.yml`에 이미 `REDIS_HOST=redis` 환경변수가 준비되어 있다.

```python
def _load_active_disasters(db):
    cached = r.get("active_disasters")
    if cached:
        return json.loads(cached)
    result = [... DB 조회 ...]
    r.setex("active_disasters", 60, json.dumps(result))
    return result
```

---

### 6-5. [중기] Express 인증 미들웨어 도입

현재 `/api/*` 엔드포인트에 인증이 없다. Firebase Auth 토큰 검증 미들웨어를 라우터 앞에 추가하면 인증된 앱 사용자만 API를 호출할 수 있다. `Firebase_Service.js`와 `firebase.js` 설정이 이미 프로젝트에 존재하므로 연결 비용이 낮다.

```javascript
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
app.use('/api', verifyToken, mapRoutes);
```

---

### 6-6. [중기] Gemini 프롬프트 Few-shot 개선

현재 프롬프트는 예시를 하나만 제공한다. 실제 서울 재난 문자 샘플 5~10건을 few-shot 예시로 추가하면 파싱 성공률이 높아진다. 특히 "구체적 주소 없이 구(區) 단위로만 발송된 문자"에서 위치 추출 정확도가 개선된다.

---

### 6-7. [장기] 재난 위험도 히트맵 API

DB에 누적된 재난 데이터를 기반으로 격자(grid) 단위 위험도 점수를 계산하는 엔드포인트를 만들 수 있다. 이 데이터를 프론트엔드 지도에 오버레이하면 사용자가 현재 재난 분포를 시각적으로 파악할 수 있다.

---

### 6-8. [장기] FastAPI 테스트 자동화

현재 자동화 테스트가 없다. `pytest`와 `httpx.AsyncClient`로 각 엔드포인트의 정상 케이스와 에러 케이스를 커버하는 테스트를 작성하면 이후 리팩토링 시 회귀를 방지할 수 있다. `disaster_service.py`의 순수 함수들(`build_gemini_prompt`, `parse_gemini_response`, `calculate_weight_penalty`)은 외부 의존성 없이 바로 단위 테스트 작성이 가능하다.

```python
def test_calculate_weight_penalty():
    assert calculate_weight_penalty(100) == 30
    assert calculate_weight_penalty(300) == 60
    assert calculate_weight_penalty(1000) == 100
```

---

*이 문서는 개발 세션 종료 시점의 코드 상태를 기준으로 작성되었습니다.*
