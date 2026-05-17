# Destiny 데이팅 앱 프리미엄 디자인 시스템 가이드

본 문서는 'Destiny' 데이팅 앱의 디자인 시스템을 정의하며, Claude Code가 개발에 즉시 활용할 수 있도록 한국어로 작성된 상세 가이드라인과 Tailwind CSS 토큰을 제공합니다. '운명적인 만남'이라는 핵심 가치를 시각적으로 구현하여, 가볍지 않고 신뢰감 있는 프리미엄 사용자 경험을 제공하는 것을 목표로 합니다.

## 1. 브랜드 아이덴티티 및 무드

### 1.1. 브랜드 컨셉: "우주적 운명 (Cosmic Fate)"
*   **핵심 키워드:** 신비로움, 필연성, 신뢰, 프리미엄, 설렘
*   **디자인 의도:** 단순히 사람을 만나는 도구를 넘어, '밤하늘의 별들이 연결되듯 필연적인 인연을 만난다'는 서사를 시각적으로 전달합니다.

### 1.2. 리디자인된 로고
![Destiny 앱 로고](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/Ghb4CJeZ86mJlfnfQjgJgV-images_1778841167979_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbG9nb19yZWRlc2lnbg.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94L0doYjRDSmVaODZtSmxmbmZRamdKZ1YtaW1hZ2VzXzE3Nzg4NDExNjc5NzlfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJHOW5iMTl5WldSbGMybG5iZy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=QL-xnjbvt78wxmWT2S1LFmDqj4WnaF1cQ5iS2QJ2460oyhlPZPT4IArgvsO5MaZhuf2OIcFNls4Hv-M1mDtUNoVPlHZwTobUd3S~WNkOAAv7O3R4iflkd156zvxJSaMAlaOFNzoaQfhR0Azj0ehLN6-QoMHPQlFtL3W15wdiZ0OsQ0s1rvqQMygo~NpZyVtYrbfg3mb1O4mVYKv8eqDiocJTMGwivZB0hiH-5ciQN3wHpa7YNXKBkW9a9AQttEKonWhF7MdbIN88T0XjeA0ruLc2ensw1EQzYbvVaSc9Q7SijwsCXwB7DdVY46iScNTQ3gj7UlnublLBkNvV5wsSpA__)
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

## 3. 타이포그래피 (Typography)

*   **제목 (Title):** 우아한 **세리프(Serif)** 서체 사용 (예: Playfair Display). 클래식한 신뢰감과 무게감을 줍니다.
*   **본문 (Body):** **Pretendard** (산세리프). 한국어 가독성이 가장 뛰어나며 현대적인 느낌을 줍니다.
*   **디자인 팁:** 제목과 본문의 서체를 혼용하여 '고전적인 운명'과 '현대적인 서비스'의 조화를 꾀합니다.

## 4. UI 컴포넌트 가이드 (Tailwind CSS 기반)

Claude Code가 코드를 작성할 때 다음의 스타일 가이드를 준수하도록 지시해 주세요.

### 4.1. 글래스모피즘 카드 (Glassmorphism)
*   **Tailwind 클래스:** `bg-white/5 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl`
*   **효과:** 배경의 오로라나 별빛이 은은하게 비치도록 설계하여 깊이감을 줍니다.

### 4.2. 운명적 CTA 버튼 (Fate Button)
*   **그라데이션:** `bg-gradient-to-r from-[#7C3AED] to-[#BE185D]`
*   **효과:** 버튼 주변에 `shadow-[0_0_20px_rgba(124,58,237,0.5)]`와 같은 발광 효과를 주어 시선을 집중시킵니다.

### 4.3. 입력 필드 (Input)
*   **스타일:** 배경은 반투명하게, 포커스 시에는 `border-[#F59E0B]`와 함께 황금색 빛이 나도록 설정합니다.

## 5. 핵심 화면 디자인 설명 (목업 참조)

제공된 6장의 목업 이미지는 다음의 디자인 원칙을 따르고 있습니다.

1.  **로그인/인증:** 로고를 크게 배치하여 첫인상에서 브랜드의 무게감을 전달합니다.
2.  **월드컵(선택):** 선택지를 단순한 사진이 아닌, 하나의 '운명적 선택'처럼 보이도록 카드에 부드러운 빛 효과를 주었습니다.
3.  **AI 분석:** "AI가 분석 중"이라는 문구와 함께 궤도가 회전하는 애니메이션을 넣어 기술적 신뢰도를 높입니다.
4.  **매칭 결과:** 두 사람의 프로필을 별자리 라인으로 연결하여 '필연적인 만남'임을 시각화합니다.

## 6. 개발 적용을 위한 코드 토큰 (tailwind.config.js)

```javascript
module.exports = {
  theme: {
    extend: {
      colors: {
        destiny: {
          base: '#060612',
          violet: '#7C3AED',
          rose: '#BE185D',
          amber: '#F59E0B',
          glass: 'rgba(255, 255, 255, 0.055)',
        }
      },
      backgroundImage: {
        'fate-gradient': 'linear-gradient(to right, #7C3AED, #BE185D)',
      },
      backdropBlur: {
        'destiny': '24px',
      }
    }
  }
}
```

이 가이드는 'Destiny' 앱이 시장의 가벼운 데이팅 앱들과 차별화되는 **'진지하고 신비로운 프리미엄 서비스'**로 인식되게 하는 핵심 지침서입니다.
