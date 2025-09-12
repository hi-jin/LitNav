# LitNav (Electron)

로컬 폴더를 워크스페이스로 지정해 논문 PDF를 정적 로딩하고, 혼합 검색(sparse + dense)으로 원하는 문맥을 빠르게 찾는 데스크톱 앱입니다. 모든 데이터는 메모리에만 상주하며 별도 DB를 사용하지 않습니다.

## 주요 기능

- 워크스페이스: 로컬 폴더 선택 → 하위 PDF 선택/제외
- 전처리: 페이지 단위 텍스트 추출 → 겹치는 청크 분할 → 임베딩 생성(메모리 유지)
- 검색: MiniSearch 기반 sparse + 임베딩 cosine 유사도 기반 dense 점수 결합(가중 평균)
- 결과: 문서별 최대 n개 문맥 제공, PDF 페이지 점프, 문맥 스니펫 표시, 논문별 노트
- 설정: 임베딩 API Host/모델(오픈AI Compatible), API Key(선택), 청크 크기/오버랩, 문서별 n

## 요구사항

- Node.js 20.x 이상 권장 (Vite 7 권장 환경: 20.19+)
- 임베딩 API: OpenAI Compatible 엔진 (예: Ollama `http://localhost:11434`, `nomic-embed-text` 등)

## 설치/실행

```bash
npm install
npm run start   # 렌더러 빌드 후 Electron 실행
```

임베딩 설정(Host/Model)을 먼저 저장하고, 워크스페이스를 선택한 뒤 전처리를 시작하세요.

## 빌드

```bash
npm run build   # electron-builder 로 패키징 (현재 OS 타겟)
```

macOS/Windows 각각 해당 OS에서 빌드해야 합니다.

## 설계 메모

- PDF 텍스트 추출은 `pdfjs-dist`(legacy build)로 페이지별 텍스트를 수집합니다.
- 청크 분할은 문자 기반 고정 길이 + 오버랩(기본 1200/200)로 단순 구현했습니다.
- Sparse 검색은 `minisearch`, Dense 검색은 OpenAI 호환 `/v1/embeddings`를 사용해 cosine 유사도 계산합니다.
- 전처리/임베딩/인덱싱은 메모리에만 유지되며, 앱 종료/초기화 시 사라집니다.
- PDF 하이라이트는 초기 버전에서는 페이지 점프 + 스니펫 표시로 대체했습니다. (텍스트 계층 하이라이트는 차기)

## 주의사항

- 대용량 워크스페이스는 임베딩 시간이 오래 걸릴 수 있습니다. 배치 크기(`64`)를 조정하세요.
- 로컬 엔진/프록시마다 임베딩 응답 형식 차이가 있을 수 있으므로 OpenAI 호환 스펙을 준수해야 합니다.

