# Destiny 데이팅 앱 프리미엄 디자인 시스템 가이드 (업데이트)

본 문서는 한국 시장에 최적화된 Destiny 데이팅 앱의 디자인 시스템을 정의하며, Claude Code가 개발에 즉시 활용할 수 있도록 한국어로 작성된 상세 가이드라인과 Tailwind CSS 토큰을 제공합니다. '운명적인 만남'이라는 핵심 가치를 시각적으로 구현하여, 가볍지 않고 신뢰감 있는 프리미엄 사용자 경험을 제공하는 것을 목표로 합니다.

## 1. 브랜드 아이덴티티 및 무드

### 1.1. 브랜드 컨셉: "우주적 운명과 붉은 실 (Cosmic Fate & Red Thread)"
*   **핵심 키워드:** 신비로움, 필연성, 신뢰, 프리미엄, 설렘, 한국적 감성
*   **디자인 의도:** 단순히 사람을 만나는 도구를 넘어, '밤하늘의 별들이 연결되듯 필연적인 인연을 만나고, 보이지 않는 붉은 실로 이어진다'는 서사를 시각적으로 전달합니다. 한국 사용자들에게 더욱 친숙하고 감성적으로 다가갈 수 있도록 현지화된 요소를 강화했습니다.

### 1.2. 리디자인된 로고
![Destiny 앱 로고](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/psRhvkEDrjSajGorhXPOFZ-images_1778841727371_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbG9nb19yZWRlc2lnbg.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94L3BzUmh2a0VEcmpTYWpHb3JoWFBPRlotaW1hZ2VzXzE3Nzg4NDE3MjczNzFfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJHOW5iMTl5WldSbGMybG5iZy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=Jm2-iF0gEKnDck9TKDsAVN6V3R5eKsVtQ-TUZfTWGEEUVRUzSZgL8d0WHBr3~66Mb84i95J9~2AjT7Xb6FzF6uV2dL0sTv40Wg~IcfGbnBAGVS1qz1foChY3GFEidOPRsYgPGfao2Lc-GBmr-aIMuTG4nBwQwF8TQj9tCSmsnRtuUqloLEx176ruWwQwfs6AwYV-~V4UHweTaAEOGBS0HWmQjEaFXQrsgwWIE8SkI7ptKU2i0ojR7ohIo-SkTTp9Yjucu4KdliLDK4ag6xiSUA7xXY7jkmGtKcCrSyngHKDIqYsnRdR0EwIpoIuasg5fg8nLggjCBoyN7JKessuMIQ__)
*   **디자인 설명:** 두 개의 궤도가 교차하며 하트의 형상을 이루고, 그 중심에서 운명의 별이 빛나는 형태입니다. 얇고 세련된 선을 사용하여 가볍지 않은 고급스러움을 강조했습니다.
*   **활용 가이드:** 다크 모드 배경 위에서 로즈 골드와 바이올렛 그라데이션이 은은하게 빛나도록 배치합니다.

## 2. 컬러 시스템 (Color System)

| 역할 | 색상명 | Hex Code | 설명 |
|---|---|---|---|
| **배경 (Base)** | Midnight Deep | `#060612` | 깊은 밤하늘을 상징하는 메인 배경색 |
| **포인트 1 (Primary)** | Royal Violet | `#7C3AED` | 신비롭고 우아한 분위기를 조성 |
| **포인트 2 (Secondary)** | Deep Rose | `#BE185D` | 로맨틱한 설렘과 따뜻함을 부여 |
| **강조 (Accent)** | Amber Gold | `#F59E0B` | 운명적인 순간이나 중요한 버튼을 강조 |
| **글래스 (Surface)** | Glass White | `rgba(255,255,255,0.055)` | 카드 및 입력창의 유리 질감 배경 |
| **운명의 실 (Red Thread)** | Subtle Red | `rgba(255,0,0,0.3)` | 배경에 은은하게 녹아든 붉은 실 효과 |

## 3. 타이포그래피 (Typography)

*   **제목 (Title):** 우아한 **세리프(Serif)** 서체 사용 (예: Playfair Display). 클래식한 신뢰감과 무게감을 줍니다. 앱 이름 'Destiny' 및 주요 강조 문구에 사용됩니다.
*   **본문 (Body):** **Pretendard** (산세리프). 한국어 가독성이 가장 뛰어나며 현대적인 느낌을 줍니다. 모든 일반 텍스트에 사용됩니다.
*   **디자인 팁:** 제목과 본문의 서체를 혼용하여 '고전적인 운명'과 '현대적인 서비스'의 조화를 꾀합니다. 한국어 텍스트의 자간과 행간을 조절하여 시각적 안정감을 높입니다.

## 4. UI 컴포넌트 가이드 (Tailwind CSS 기반)

Claude Code가 코드를 작성할 때 다음의 스타일 가이드를 준수하도록 지시해 주세요.

### 4.1. 글래스모피즘 카드 (Glassmorphism)
*   **Tailwind 클래스:** `bg-white/5 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl`
*   **효과:** 배경의 오로라나 별빛, 그리고 은은한 붉은 실이 비치도록 설계하여 깊이감을 줍니다. 카드 테두리에는 미세한 그라데이션 발광 효과를 추가합니다.

### 4.2. 운명적 CTA 버튼 (Fate Button)
*   **그라데이션:** `bg-gradient-to-r from-[#7C3AED] to-[#BE185D]`
*   **효과:** 버튼 주변에 `shadow-[0_0_20px_rgba(124,58,237,0.5)]`와 같은 발광 효과를 주어 시선을 집중시킵니다. `hover`, `active` 시 발광 효과가 더욱 강조되거나 색상이 미묘하게 변하는 인터랙션을 추가합니다.

### 4.3. 입력 필드 (Input)
*   **스타일:** 배경은 반투명하게, 포커스 시에는 `border-[#F59E0B]`와 함께 황금색 빛이 나도록 설정합니다. 플레이스홀더 텍스트는 한국어 문구로 변경합니다.

### 4.4. 진행바 (Progress Bar)
*   **스타일:** `bg-base` 배경에 `brand-violet`에서 `brand-rose`로 이어지는 그라데이션 채움 효과를 적용합니다. 진행률에 따라 부드럽게 움직이는 애니메이션을 추가합니다.

## 5. 핵심 화면 디자인 설명 (업데이트된 목업 참조)

새롭게 제공된 목업 이미지들은 한국 사용자들의 감성과 미적 기준에 맞춰 다음과 같은 디자인 원칙을 따르고 있습니다.

1.  **로그인/인증 (`destiny_kr_auth.png`):**
    *   메인 문구: "당신의 인연이 여기서 시작됩니다"
    *   서브 문구: "운명적인 만남을 기다리고 있어요"
    *   CTA 버튼: "인연 찾기"
    *   배경에 은은하게 녹아든 붉은 실과 깊은 우주 배경이 조화를 이룹니다.

2.  **온보딩 - 이상형 월드컵 (`destiny_kr_onboarding.png`):**
    *   질문: "어떤 인연에 더 끌리나요?"
    *   카드 내 문구: "운명처럼 이끄는 사람", "함께 만들어가는 사람"
    *   모델: 세련된 한국인 남녀 모델을 사용하여 친숙함을 더했습니다.

3.  **온보딩 - AI 사진 분석 (`destiny_kr_ai_analysis.png`):**
    *   메인 문구: "거의 다 왔어요"
    *   서브 문구: "AI가 당신의 매력을 분석하여 더 정확한 궁합을 찾아드릴게요"
    *   AI 분석 중 문구: "AI가 당신의 매력을 분석 중입니다..."
    *   모델: 한국인 여성 모델의 프로필 사진을 활용하여 현지화했습니다.
    *   배경에 은은한 달빛 효과를 추가하여 신비로움을 강조했습니다.

4.  **프로필 완성 (`destiny_kr_complete.png`):**
    *   메인 문구: "당신의 인연이 완성되었습니다"
    *   체크리스트: "기본 정보", "별자리 프로필", "가치관 분석", "성격 유형"
    *   CTA 버튼: "그룹 만들기"
    *   축하 애니메이션과 함께 은은한 달빛과 별무리 효과가 어우러져 감동을 더합니다.

5.  **매칭 결과 (`destiny_kr_matching.png`):**
    *   메인 문구: "별들이 당신을 연결했습니다"
    *   모델: 한국인 남녀 모델의 프로필이 붉은 실과 별자리로 연결되어 운명적인 만남을 시각적으로 표현합니다.
    *   자동 매칭 약속 정보는 한국어로 제공됩니다.

6.  **그룹 대기 (`destiny_kr_waiting.png`):**
    *   메인 문구: "당신의 인연을 찾는 중입니다..."
    *   서브 문구: "운명은 가까이에 있어요"
    *   모델: 한국인 여성 모델들의 프로필이 그룹 멤버로 표시됩니다.
    *   중앙의 발광하는 하트와 별무리 애니메이션이 기대감을 높입니다.

## 6. 개발 적용을 위한 코드 토큰 (tailwind.config.js)

Claude Code가 디자인을 개발에 쉽게 적용할 수 있도록, 주요 컬러 및 간격 토큰을 Tailwind CSS 형식으로 정리합니다.

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        destiny: {
          base: '#060612', // Midnight Deep
          violet: '#7C3AED',
          rose: '#BE185D',
          amber: '#F59E0B',
          glass: 'rgba(255, 255, 255, 0.055)',
          'red-thread': 'rgba(255, 0, 0, 0.3)', // 운명의 붉은 실
        }
      },
      backgroundImage: {
        'fate-gradient': 'linear-gradient(to right, #7C3AED, #BE185D)',
      },
      backdropBlur: {
        'destiny': '24px',
      },
      boxShadow: {
        'glow-violet': '0 0 20px rgba(124, 58, 237, 0.5)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.5)',
      }
    }
  }
}
```

이 가이드는 'Destiny' 앱이 한국 시장에서 '진지하고 신비로운 프리미엄 서비스'로 인식되게 하는 핵심 지침서입니다. Claude Code가 이 가이드를 통해 사용자님의 비전을 완벽하게 구현할 수 있기를 바랍니다.
