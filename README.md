# LitNav

로컬 워크스페이스 기반 논문 탐색 도구 - PDF 문서에서 semantic vector 검색으로 원하는 문맥을 빠르게 찾고 정확한 위치로 이동할 수 있는 Electron 데스크톱 앱입니다.

## ✨ 주요 기능

- **워크스페이스 관리**: 로컬 폴더 선택 후 PDF 파일 포함/제외 설정
- **Vector 검색**: Dense embedding을 통한 semantic 검색으로 정확한 컨텍스트 발견
- **정밀한 하이라이트**: 클릭한 컨텍스트의 정확한 위치에 좌표 기반 하이라이트 표시
- **스마트 네비게이션**: 
  - 페이지 간 점프
  - 같은 페이지 내 컨텍스트 위치로 부드러운 스크롤
  - PDF 줌 및 스케일링 지원
- **노트 작성**: 문서별 메모 및 노트 관리
- **VSCode 스타일 UI**: 친숙한 인터페이스로 편리한 사용

## 🔧 요구사항

- **Node.js**: 20.x 이상 권장 (Vite 7 권장 환경: 20.19+)
- **임베딩 API**: OpenAI Compatible 엔진
  - 예: Ollama (`http://localhost:11434`)
  - 모델 예시: `nomic-embed-text`, `all-MiniLM-L6-v2` 등

## 🚀 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발/실행
npm run start   # 렌더러 빌드 후 Electron 실행
```

### 사용 방법
1. **설정**: 임베딩 API Host/Model 설정 (예: `http://localhost:11434`, `nomic-embed-text`)
2. **워크스페이스**: 로컬 폴더 선택 후 PDF 파일 포함/제외 설정  
3. **전처리**: "임베딩 생성" 버튼으로 텍스트 추출 및 vector 생성
4. **검색**: 자연어로 질문하여 관련 컨텍스트 발견
5. **탐색**: 결과 클릭 시 PDF의 정확한 위치로 이동 및 하이라이트

## 📦 빌드

```bash
npm run build   # electron-builder로 패키징 (현재 OS 타겟)
```

### 앱 아이콘 설정
프로젝트 루트에 `icon.png` 파일이 있으면 자동으로 앱 아이콘으로 사용됩니다:
- **권장 크기**: 512x512 픽셀 이상 (PNG 형식)
- **용도**: 설치 파일 아이콘, Alt+Tab 아이콘, 독(Dock)/태스크바 아이콘
- **자동 변환**: electron-builder가 각 플랫폼에 맞게 자동 변환

> **주의**: macOS/Windows 각각 해당 OS에서 빌드해야 합니다.

## 🏗️ 아키텍처

### 검색 엔진
- **Pure Dense Vector Search**: OpenAI 호환 `/v1/embeddings` API 사용
- **Semantic 매칭**: Cosine similarity 기반 정확한 의미 검색
- **성능 최적화**: Sparse 검색 제거로 빠른 검색 속도

### PDF 처리
- **텍스트 추출**: `pdfjs-dist` (legacy build)로 페이지별 텍스트 수집
- **청크 분할**: 문자 기반 고정 길이 + 오버랩 (기본: 1200자/200자 오버랩)
- **좌표 기반 하이라이트**: PDF.js의 `getTextContent()`로 정확한 텍스트 위치 계산

### 데이터 관리
- **인메모리**: 모든 데이터를 메모리에 유지 (DB 없음)
- **세션 기반**: 앱 종료 시 데이터 초기화
- **배치 처리**: 64개씩 배치로 임베딩 생성

## ⚠️ 주의사항

- **대용량 워크스페이스**: 임베딩 생성 시간이 오래 걸릴 수 있음
- **API 호환성**: OpenAI 호환 스펙을 준수하는 임베딩 서버 필요
- **메모리 사용량**: 대량의 PDF 처리 시 메모리 사용량 증가

## 🗺️ 향후 계획

- [ ] Multi-query search 지원
- [ ] Query expansion 기능
- [ ] 하이라이트 스타일 커스터마이징
- [ ] 검색 결과 필터링 및 정렬
- [ ] 워크스페이스 영구 저장

