# 메이플 보스 수익 관리 — Cloudflare 배포판

V16 웹사이트의 보스/메모/아이템 기능을 유지하면서, 로컬 BAT/Node.js 서버의 넥슨 API 조회 기능을 Cloudflare Worker로 옮긴 배포판입니다.

## 배포 (Cloudflare + GitHub)

1. 이 압축파일을 풀고 **압축 안의 파일과 폴더를 저장소 최상위에** 업로드합니다. `public/index.html`, `src/index.js`, `wrangler.jsonc` 경로가 유지되어야 합니다. `.env` 또는 실제 API 키는 업로드하지 않습니다.
2. Cloudflare Workers & Pages에서 해당 GitHub 저장소를 선택합니다.
3. 프로젝트 이름: `maplerich` (다른 이름을 원하면 `wrangler.jsonc`의 `name`도 함께 수정).
4. Build command: **비워 두기** / Deploy command: `npx wrangler deploy`.
5. 배포 후 Workers & Pages → 프로젝트 `maplerich` → Settings → Variables and Secrets → Add 에서 **Secret**으로 등록합니다.
   - 변수 이름: `NEXON_API_KEY`
   - 값: 본인의 넥슨 Open API 키 (절대 GitHub에 올리지 말 것)
6. 설정 저장 후 필요하면 재배포하고, `https://<발급된 주소>/api/health`에 접속해 `characterApiConfigured: true`가 나오는지 확인합니다. 이어서 사이트에서 캐릭터 검색을 테스트합니다.

> **주소 주의**: 현재 Cloudflare 화면은 Workers 배포 흐름이므로 기본 주소는 보통 `*.workers.dev`입니다. `*.pages.dev`가 아니어도 정상입니다.

## 동작 방식

- `public/index.html`: 원본 V16 화면 및 브라우저 저장 기능
- `public/items/`: 원본 아이템 이미지
- `src/index.js`: `/api/character`, `/api/portrait`, `/api/health` 처리
- `wrangler.jsonc`: Cloudflare Worker 및 정적 파일 설정
- 캐릭터 조회는 넥슨 API를 **캐릭터당 최대 2번** 호출하고, 성공 결과는 Cloudflare 캐시에 5분 저장합니다. (캐시 상황에 따라 실제 호출 수 달라짐.)

## 꼭 알아둘 점

- **로그인/기기 간 동기화는 아직 없습니다.** 캐릭터·보스·메모·첨부 사진은 기존처럼 접속한 브라우저의 로컬 저장소에 저장됩니다.
- 기존 `http://127.0.0.1:3777`의 기록은 새로운 Cloudflare 주소에 자동으로 옮겨지지 않습니다. 기존 데이터가 중요한 경우 원본 환경을 삭제하지 마세요.
- GitHub 저장소가 Public이면 소스코드는 공개됩니다. 비밀키는 Cloudflare Secret에만 보관하세요.
- 사이트 주소가 공개되면 다른 사람도 캐릭터 검색을 이용해 API 할당량을 사용할 수 있습니다. 정식 공개 전에는 추가적인 인증·요청 제한을 권장합니다.
- 무료 사용량/정책, 넥슨 API 호출 제한은 각 서비스의 현재 정책에 따릅니다.
