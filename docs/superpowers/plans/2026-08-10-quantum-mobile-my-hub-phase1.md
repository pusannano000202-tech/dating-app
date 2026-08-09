# Quantum Mobile My Hub Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile My tab's long mixed menu with the approved A-style hub backed by real profile, photo, friend, request, and notification data without inventing unavailable friend photos or payment states.

**Architecture:** Keep existing web APIs and mobile API clients as the data boundary. Add a pure My-hub presentation mapper and focused native components, then make the tab screen orchestrate independent requests so one failing section cannot blank the rest of the page. Preserve the current onboarding order and hide incomplete future features until their server contracts exist.

**Tech Stack:** Expo Router, React Native, TypeScript, lucide-react-native, existing Supabase-backed Next.js APIs, Node test runner through `tsx`.

---

## File map

- Create `apps/mobile/src/domain/my-hub.ts`: pure status labels, progress derivation, and next-action routing.
- Create `apps/mobile/src/components/my/MyProfileHeader.tsx`: signed user photo, identity, step progress, and one primary action.
- Create `apps/mobile/src/components/my/MyPeopleSection.tsx`: real friend/request/notification counts with initials and failure states.
- Create `apps/mobile/src/components/my/MyProfileSection.tsx`: native basic/photo/worldcup entry tiles.
- Create `apps/mobile/src/components/my/MyFinanceSafetySection.tsx`: truthful 10,000 won contract entry, privacy note, and account actions.
- Modify `apps/mobile/app/(tabs)/profile.tsx`: independent loading, refresh, and composition.
- Modify `apps/mobile/tests/mobile-profile.test.ts`: lock native routing, hidden survey row, and real-data boundaries.
- Create `apps/mobile/tests/mobile-my-hub.test.ts`: unit tests for the pure presentation mapper.
- Create `apps/mobile/app/dev-my-preview.tsx`: development-only visual fixture using no production API or fake production count.
- Modify `apps/mobile/app/_layout.tsx`: register the preview only inside the development guard.

### Task 1: Lock the My-hub presentation contract

**Files:**
- Create: `apps/mobile/src/domain/my-hub.ts`
- Create: `apps/mobile/tests/mobile-my-hub.test.ts`

- [ ] **Step 1: Write failing tests for server-derived progress and actions**

Cover these exact cases:

```ts
assert.deepEqual(buildMyProfileProgress('basic'), { completed: 0, total: 4, percent: 0 })
assert.deepEqual(buildMyProfileProgress('worldcup'), { completed: 1, total: 4, percent: 25 })
assert.deepEqual(buildMyProfileProgress('survey'), { completed: 2, total: 4, percent: 50 })
assert.deepEqual(buildMyProfileProgress('photos'), { completed: 3, total: 4, percent: 75 })
assert.deepEqual(buildMyProfileProgress('complete'), { completed: 4, total: 4, percent: 100 })
assert.deepEqual(getMyPrimaryAction('photos'), { label: '프로필 사진 등록하기', route: '/profile/photos' })
assert.deepEqual(getMyPrimaryAction('complete'), { label: '프로필 확인하기', route: '/profile/basic' })
```

The four counted steps are basic, worldcup, survey, and photos. Survey remains in the completion contract but is not shown as a My menu row.

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run: `cd apps/mobile; npx tsx --test tests/mobile-my-hub.test.ts`

Expected: FAIL because `src/domain/my-hub.ts` does not exist.

- [ ] **Step 3: Implement the pure mapper**

Export:

```ts
export type MyProfileProgress = { completed: number; total: 4; percent: 0 | 25 | 50 | 75 | 100 };
export type MyPrimaryRoute = '/profile/basic' | '/profile/worldcup' | '/profile/survey' | '/profile/photos';
export function buildMyProfileProgress(step: MobileProfileStep): MyProfileProgress;
export function getMyPrimaryAction(step: MobileProfileStep): { label: string; route: MyPrimaryRoute };
export function getAppearanceStatusLabel(status: MobileAppearanceStatus): string;
```

Use exhaustive switches and never expose a numeric appearance score.

- [ ] **Step 4: Run the test and typecheck**

Run: `cd apps/mobile; npx tsx --test tests/mobile-my-hub.test.ts; npm run typecheck`

Expected: all focused tests PASS and TypeScript exits 0.

### Task 2: Build focused native My components

**Files:**
- Create: `apps/mobile/src/components/my/MyProfileHeader.tsx`
- Create: `apps/mobile/src/components/my/MyPeopleSection.tsx`
- Create: `apps/mobile/src/components/my/MyProfileSection.tsx`
- Create: `apps/mobile/src/components/my/MyFinanceSafetySection.tsx`
- Modify: `apps/mobile/tests/mobile-profile.test.ts`

- [ ] **Step 1: Update the source-contract test before components exist**

Assert the final screen imports all four components, does not contain a visible `성향 설문` menu row, retains `/profile/survey` in the protected navigator, and contains no generated friend-photo asset or hard-coded friend/notification count.

- [ ] **Step 2: Run the test and verify failure**

Run: `cd apps/mobile; npx tsx --test tests/mobile-profile.test.ts`

Expected: FAIL on missing component imports and the old survey row.

- [ ] **Step 3: Implement the four components**

Component contracts:

```ts
type MyProfileHeaderProps = {
  displayName: string;
  school: string | null;
  primaryPhotoUrl: string | null;
  progress: MyProfileProgress;
  actionLabel: string;
  onAction: () => void;
  loading: boolean;
  error: boolean;
};

type MyPeopleSectionProps = {
  friends: Array<{ userId: string; displayName: string | null }>;
  receivedRequestCount: number | null;
  unreadNotificationCount: number | null;
  onFriends: () => void;
  onNotifications: () => void;
};
```

`MyProfileSection` exposes only basic, photos, and worldcup. `MyFinanceSafetySection` shows `보증금 10,000원`, labels the state as `확정 매칭에서 상태 확인`, links to the existing deposit route, repeats the private appearance-score boundary, and keeps unavailable report/exclusion features out of the production surface. Account sign-out is visually secondary and requires the screen to ask for confirmation.

Use existing `colors`, `spacing`, `radii`, `layout`, and Lucide icons. Cards use at most 8px radius, controls are at least 44px, and images use a stable square or 4:3 frame with `resizeMode="cover"`.

- [ ] **Step 4: Re-run the profile test**

Run: `cd apps/mobile; npx tsx --test tests/mobile-profile.test.ts`

Expected: PASS.

### Task 3: Connect real data without all-or-nothing loading

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`
- Modify: `apps/mobile/tests/mobile-profile.test.ts`

- [ ] **Step 1: Add a failing source-contract test for independent requests**

Require the screen to call:

```ts
getQuantumApiClient().getProfileOnboarding()
getProfilePhotosApi().listPhotos()
getSocialApiClient().listFriends()
getSocialApiClient().listNotifications({ unreadOnly: true, limit: 200 })
```

The test must reject `Promise.all(...)` for these four calls and require independent settlement or independent error handling.

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/mobile; npx tsx --test tests/mobile-profile.test.ts`

Expected: FAIL because the old screen does not request My-hub data.

- [ ] **Step 3: Rewrite the screen as an orchestrator**

On focus, launch the four requests concurrently. Store profile, photos, friends, and notifications in separate state records with `loading | ready | error`. A failed request may only affect its section. Derive:

- Header name and school from `MobileProfileSummary.profile`.
- Header image from the current user's first signed photo only.
- Progress and primary route from `nextStep`.
- Friend count from `friends.length`.
- Request count from received rows whose status is `pending`.
- Notification count from the length of the unread-only response.

Do not render friend portraits, meeting album thumbnails, a paid deposit badge, or an appearance score. Move logout to the bottom and use `Alert.alert` confirmation.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `cd apps/mobile; npx tsx --test tests/mobile-profile.test.ts tests/mobile-my-hub.test.ts tests/mobile-social.test.ts tests/mobile-photos.test.ts; npm run typecheck`

Expected: all tests PASS and TypeScript exits 0.

### Task 4: Add a development-only visual QA route

**Files:**
- Create: `apps/mobile/app/dev-my-preview.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/tests/router-protection.test.ts`

- [ ] **Step 1: Write a failing route-boundary test**

Require `dev-my-preview` to be registered only inside `__DEV__`, and require the route itself to redirect to `/login` when `__DEV__` is false.

- [ ] **Step 2: Run and confirm failure**

Run: `cd apps/mobile; npx tsx --test tests/router-protection.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the fixture route**

Render the same production components with clearly local fixture values. Use initials instead of a synthetic friend photo. The fixture may show one local bundled neutral user-photo placeholder only when it is labelled as preview data in code and never imported by the production screen.

- [ ] **Step 4: Run route and profile tests**

Run: `cd apps/mobile; npx tsx --test tests/router-protection.test.ts tests/mobile-profile.test.ts`

Expected: PASS.

### Task 5: Verify the implemented flow

**Files:**
- No product file changes unless a defect is found.
- Capture: `artifacts/quantum-mobile-my-hub/03-implemented-my-top-390x844.png`
- Capture: `artifacts/quantum-mobile-my-hub/04-implemented-my-bottom-390x844.png`
- Capture: `artifacts/quantum-mobile-my-hub/05-implemented-my-430x932.png`

- [ ] **Step 1: Run the full mobile suite**

Run: `cd apps/mobile; npm test; npm run typecheck`

Expected: all tests PASS and TypeScript exits 0.

- [ ] **Step 2: Run affected root contracts**

Run: `npm run test:profile; npm run test:config; npm run typecheck`

Expected: all tests PASS and root TypeScript exits 0.

- [ ] **Step 3: Start a fresh Expo web preview**

Use an unused port. Open `/dev-my-preview` at 390x844 and 430x932.

- [ ] **Step 4: Inspect the visual contract**

Confirm no horizontal overflow, no overlapping text or controls, stable photo frames, visible focus labels, 44px tap targets, one primary CTA, and no fake friend photo, fake deposit status, or fake production count.

- [ ] **Step 5: Inspect interactions**

Click profile action, friends, notifications, basic information, photos, worldcup, deposit, and sign-out confirmation. Confirm every connected action reaches its intended route and unavailable future features are absent.

- [ ] **Step 6: Capture evidence and report remaining gates**

Save the three screenshots listed above. Report friend-photo privacy migration, meeting album, exclusion management, deposit refund/rollover/donation, real two-account E2E, Android build, and Play Store submission as separate remaining work.
