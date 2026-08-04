# Redmine MCP Server

레드마인 REST API를 Claude의 MCP 커넥터로 연결해주는 서버입니다.
이 서버를 배포하면 Claude 채팅에서 "이슈 32819 보여줘" 같은 요청을 바로 처리할 수 있습니다.

## 제공 기능 (Tools)

- `get_issue` — 이슈 단건 조회
- `list_issues` — 이슈 목록 조회 (프로젝트/상태/담당자 필터)
- `create_issue` — 이슈 생성
- `update_issue` — 이슈 수정 (상태 변경, 코멘트 추가 등)

## 로컬 실행

```bash
npm install
cp .env.example .env
# .env 파일 열어서 REDMINE_URL, REDMINE_API_KEY, MCP_SHARED_SECRET 채우기
npm start
```

정상 실행되면: `Redmine MCP 서버 실행 중: http://localhost:3000/mcp`

## 원격 배포 (Claude 커넥터로 등록하려면 필수)

Claude.ai(웹/앱)에서 커넥터로 등록하려면 로컬이 아닌, 외부에서 접근 가능한 HTTPS 주소가 필요합니다.
아래 중 편한 방법으로 배포하세요.

### 옵션 A: Render (무료 티어 있음)
1. 이 폴더를 GitHub 저장소에 push
2. https://render.com 에서 "New Web Service" → 저장소 연결
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment 탭에서 `REDMINE_URL`, `REDMINE_API_KEY`, `MCP_SHARED_SECRET` 등록
6. 배포 완료 후 발급되는 주소 뒤에 `/mcp`를 붙여서 사용
   예: `https://redmine-mcp-server.onrender.com/mcp`

### 옵션 B: 사내 서버 / VPN 내부 호스팅
사내망 안에서만 레드마인에 접근 가능하다면, 이 서버도 사내 네트워크 안에서 실행하고
사내 도메인 + HTTPS(리버스 프록시, 예: nginx + Let's Encrypt)로 노출해야 합니다.

## Claude에 커넥터로 등록하기

1. Claude 설정 > 커넥터(Connectors) 메뉴로 이동
2. "사용자 지정 커넥터 추가" 선택
3. 서버 주소 입력 (예: `https://redmine-mcp-server.onrender.com/mcp`)
4. `MCP_SHARED_SECRET`을 설정했다면, 인증 헤더에 `Bearer <MCP_SHARED_SECRET>` 값을 등록
5. 연결 후 "이슈 32819 조회해줘" 같은 요청으로 테스트

## 보안 참고사항

- `MCP_SHARED_SECRET`은 아무나 이 서버에 접근해 사내 레드마인 데이터를 조회/수정하지 못하도록 막는 최소한의 보호 장치입니다. 반드시 설정하세요.
- 사내 레드마인이 외부에서 접근 불가능한 경우, 이 MCP 서버도 사내망 안에서만 실행해야 정상 동작합니다.
- API 키, 시크릿 값은 절대 코드에 하드코딩하지 말고 환경변수로만 관리하세요.
