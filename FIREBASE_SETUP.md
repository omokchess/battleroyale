# Firebase Setup

이 프로젝트의 로그인, 랭킹, 코인, 상점 데이터는 Firebase Authentication + Firestore를 사용합니다.

## 1. Firebase 프로젝트

1. Firebase Console에서 프로젝트를 만듭니다.
2. Authentication > Sign-in method에서 Email/Password를 활성화합니다.
3. Google 로그인을 쓸 경우 Google 제공자도 활성화합니다.
4. Firestore Database를 만들고 프로덕션 모드로 시작합니다.
5. Project settings > Your apps에서 Web app을 추가하고 SDK 설정값을 복사합니다.

`.env.local`:

```env
VITE_FIREBASE_API_KEY="..."
VITE_FIREBASE_AUTH_DOMAIN="..."
VITE_FIREBASE_PROJECT_ID="..."
VITE_FIREBASE_STORAGE_BUCKET="..."
VITE_FIREBASE_MESSAGING_SENDER_ID="..."
VITE_FIREBASE_APP_ID="..."
```

## 2. Firestore 데이터 구조

앱은 다음 컬렉션을 사용합니다.

- `profiles/{uid}`: 유저 프로필, 코인, 누적 킬/데스, 착용 슬롯
- `profiles/{uid}/user_items/{itemId}`: 보유 아이템
- `profiles/{uid}/user_costumes/{costumeId}`: 레거시 코스튬 보유 호환
- `profiles/{uid}/match_logs/{autoId}`: 매치 기록
- `items/{itemId}`: 선택 사항. 비어 있으면 앱 내 기본 카탈로그 사용
- `costumes/{costumeId}`: 선택 사항. 비어 있으면 앱 내 기본 카탈로그 사용

## 3. 최소 보안 규칙

클라이언트 트랜잭션으로 구매/장착을 처리하므로, 운영 전에는 Cloud Functions로 서버 검증을 옮기는 것이 더 안전합니다.
우선 테스트용 규칙은 아래처럼 시작할 수 있습니다.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /items/{itemId} {
      allow read: if true;
      allow write: if false;
    }

    match /costumes/{costumeId} {
      allow read: if true;
      allow write: if false;
    }

    match /profiles/{userId} {
      allow read: if true;
      allow create, update: if request.auth != null && request.auth.uid == userId;

      match /user_items/{itemId} {
        allow read, create: if request.auth != null && request.auth.uid == userId;
      }

      match /user_costumes/{costumeId} {
        allow read, create: if request.auth != null && request.auth.uid == userId;
      }

      match /match_logs/{logId} {
        allow read, create: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## 4. 배포와 시드

Firebase CLI 로그인이 필요합니다.

```powershell
npx firebase-tools login
npm run firebase:deploy:rules
```

상점 카탈로그를 Firestore에 넣으려면 Admin 권한이 필요합니다. Firebase Console에서 서비스 계정 JSON을 받은 뒤 아래 중 하나로 실행합니다.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
npm run firebase:seed
```

또는 JSON 전체를 `FIREBASE_SERVICE_ACCOUNT_JSON` 환경변수로 넣어도 됩니다.
