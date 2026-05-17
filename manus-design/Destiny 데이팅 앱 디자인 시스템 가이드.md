# Destiny 데이팅 앱 디자인 시스템 가이드

본 문서는 'Destiny' 데이팅 앱의 디자인 시스템을 정의하고, Claude Code가 개발에 활용할 수 있도록 Tailwind CSS 토큰을 포함한 상세 가이드라인을 제공합니다. '운명적인 만남'이라는 핵심 컨셉을 바탕으로 프리미엄하고 신비로운 사용자 경험을 제공하는 것을 목표로 합니다.

## 1. 브랜드 아이덴티티

### 1.1. 앱 로고

'Destiny' 앱의 메인 로고는 운명적인 만남과 영원한 연결을 상징하는 디자인으로 리디자인되었습니다.

![Destiny 앱 로고](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbG9nb19yZWRlc2lnbg.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJHOW5iMTl5WldSbGMybG5iZy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=TRbwe2L9kmlM3V7-TSzft8l6stHZQP66zrR29DSi~QTxhk395MimEEr0a0GSrJ0jemp4It-53A0~hipAOt8~eVuqKzOKlSu9VpEF5L74dN7BBStvv33RuhFN8~iz5beH7uCQcli5P77zE16W0aBy3L3YYFXEw5mBrpkIOZAOMOikZlK99M6oHoG4uP1aNEf2J2dH16AymabzrLUQ9pT~0F2Xh65Oz58S1pqP3ZCnyjJX0ddrBkwnbJiHk~jTiDPM3msu4FwoRmTkFyJQHo4u0pXjdOjLic-pfZpuzlrlw2l22qYr13n-EDQZkxdlpZmmMkfuDgctafRnKO-ohLdruA__)

*   **컨셉:** 두 개의 궤도가 교차하며 미묘한 하트 모양을 이루고, 중앙에는 빛나는 4포인트 별이 위치합니다. 이는 운명적인 만남과 끊임없는 연결을 의미합니다.
*   **색상:** 부드러운 로즈 골드와 바이올렛 그라데이션을 사용하여 고급스럽고 신비로운 느낌을 강조했습니다.
*   **텍스트:** 로고 하단에는 'DESTINY'라는 단어가 프리미엄 세리프 폰트로 표기되어 브랜드의 신뢰감을 더합니다.

### 1.2. 브랜드 무드보드

전체적인 앱의 분위기와 핵심 디자인 컨셉을 시각적으로 표현한 무드보드입니다.

![Destiny 브랜드 무드보드](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfYnJhbmRfbW9vZGJvYXJk.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZlluSmhibVJmYlc5dlpHSnZZWEprLnBuZyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=EN6DySMkU3u2GIx8Xg5-8vHl5-iFgW08LTlds2f1ObZ9CmoWEaRJ9JniWhJ~ulBd8NpovVCQOaj2MgOcsgLm5GLHJf1efyV5qjoUcqo6Nyb4HHxXL0Aj7QvrNngcOffgCvLIkdt4pTbJwGd3t6DCX6gQUXHLYnxgQmlNY9We2pLFqFqYBAOoL5GsT20Pea07R~7LSsj99srOILej7O9jDAAHCR1kFLyvx-6zWrUe0N5dheleqJigH1XwywLICpoVtQ7C9idL8TX6f0keS8wW2qBTotmdE-n9nLMFxLVLxPh7kcSkBr7GumJKDwKXGbKMCkA~CVQN8tW~WcXRIEQ78Q__)

*   **테마:** Fate and Cosmic Connection (운명과 우주적 연결)
*   **분위기:** 신비롭고, 로맨틱하며, 프리미엄한 느낌을 지향합니다.

## 2. 컬러 팔레트

'Destiny' 앱의 주요 색상 팔레트는 깊은 밤하늘과 우주적 신비로움을 표현하며, 따뜻한 골드 포인트로 운명적인 만남의 설렘을 더합니다.

| 역할 | 색상 이름 | Hex Code | Tailwind CSS 변수 | 설명 |
|---|---|---|---|---|
| **배경 (Primary Background)** | Deep Midnight Blue | `#060612` | `bg-base` | 앱의 주 배경색으로, 깊은 밤하늘을 연상시킵니다. |
| **브랜드 포인트 (Primary Accent)** | Royal Violet | `#7c3aed` | `brand-violet` | 신비롭고 우아한 느낌을 주는 보라색입니다. |
| **브랜드 포인트 (Secondary Accent)** | Deep Rose | `#be185d` | `brand-rose` | 로맨틱하고 따뜻한 느낌을 주는 장미색입니다. |
| **브랜드 포인트 (Tertiary Accent)** | Amber Gold | `#f59e0b` | `brand-amber` | 운명적인 순간을 강조하는 황금색 포인트입니다. |
| **글래스모피즘 배경** | Glassmorphism BG | `rgba(255,255,255,0.055)` | `glass-bg` | 투명하고 흐릿한 카드 배경에 사용됩니다. |

## 3. 타이포그래피

가독성과 브랜드의 고급스러움을 동시에 고려한 폰트 조합입니다.

*   **제목 (Headings):** 우아한 세리프 폰트 (예: Playfair Display, Lora) - 'Destiny' 로고 텍스트 및 주요 제목에 사용되어 클래식하고 신뢰감 있는 느낌을 줍니다.
*   **본문 (Body Text):** Pretendard (한국어 최적화) - 가독성이 높고 현대적인 산세리프 폰트로, 정보 전달에 용이합니다.

## 4. 주요 UI 컴포넌트 스타일

### 4.1. 카드 (Glassmorphism Card)

*   **배경:** `glass-bg` 변수를 사용하며, `backdrop-filter: blur(24px)`를 적용하여 투명하고 흐릿한 효과를 줍니다.
*   **테두리:** 얇고 은은한 그라데이션 테두리 (로즈 골드/바이올렛)를 적용하여 고급스러움을 더합니다.
*   **그림자:** 은은한 드롭 섀도우를 사용하여 입체감을 부여합니다.

### 4.2. 버튼 (Call-to-Action Button)

*   **스타일:** `brand-violet`에서 `brand-rose`로 이어지는 그라데이션 배경에 은은한 발광(glow) 효과를 줍니다.
*   **텍스트:** 흰색 또는 샴페인 골드 색상의 텍스트를 사용하며, 세리프 또는 Pretendard 폰트를 적용합니다.
*   **상태:** `hover`, `active` 시 발광 효과가 강조되거나 미묘하게 색상이 변하는 인터랙션을 추가합니다.

### 4.3. 인풋 필드 (Input Field)

*   **스타일:** `glass-bg`와 유사한 배경에 얇은 테두리를 적용합니다. `focus` 시 테두리나 플레이스홀더 텍스트에 `brand-violet` 또는 `brand-amber` 색상의 발광 효과를 줍니다.

### 4.4. 진행바 (Progress Bar)

*   **스타일:** `bg-base` 배경에 `brand-violet`에서 `brand-rose`로 이어지는 그라데이션 채움 효과를 적용합니다. 진행률에 따라 부드럽게 움직이는 애니메이션을 추가합니다.

## 5. 핵심 화면 목업

아래는 'Destiny' 앱의 핵심 화면들에 대한 고충실도 목업 이미지입니다. 이 이미지들을 통해 앱의 전반적인 디자인 컨셉과 사용자 경험을 파악할 수 있습니다.

### 5.1. 인증 및 온보딩 화면

![Destiny 인증 및 온보딩 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX2F1dGg.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDJGMWRHZy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=MRucWJ-GPbPWB2BR0lXSAP9KE1xj6mSRQai~qa79w~WDCLQPClVVgrNYhDbKlTPAVU8NNxU6LfhsUvFfQyJ2y3lkamxJ1G3YAtMkrh3AMrDvQxyDXFiYUtqslLVDOaWUMHsP1P1MZ0oITZERBbWpgkyVjLfImPMpMnWOyDD~ElikV9oCQSu4mCxXSMfZBBvQYDYhoU~TBIv5eG0ITSp0OJty2j~B7YLExt7dv5e3VcZr2o9zl6J9nYenragRX1Tnd061NF-bPptI12K9ob-THyRfGxHnHXNBWdVtvG-ZZL4l-4A~m3qnBLd3wl7o-R7rHzteit42FDuXaNHdiP4ZvA__)

*   **로그인 화면:** 리디자인된 로고와 함께 
서브카피, 휴대폰 번호 입력 필드, 그리고 CTA 버튼이 포함되어 있습니다. OTP 입력 화면은 신비로운 배경과 글래스모피즘 UI로 구성되어 있습니다.

### 5.2. 프로필 입력 화면 (일부)

![Destiny 이상형 월드컵 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX29uYm9hcmRpbmdfMQ.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDI5dVltOWhjbVJwYm1kZk1RLnBuZyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=MEm5Ae3zhnEkjHOISXOEpHzopL1S73VKNz8QJQ87pKf-sshryZtknu7SXhAr1N3Bo8yZHyFpbrTHdiA1wOQHHW6XD4W7aY-rG3ZbiTYE3vrtPtYjNzl2PQdvPjBR~B5IW2F2sBqPOYzjnT-6X2l0j19vOmY~pkN9Nmi4ni9y~G-2TnEPqzJBrBx6arKtNDCwJYXrdyOcD897Ama2VjBarQBvTZkQjA46QDF7GGM4WRfq2cP6ljlHz83wDY7jBGLQ7F6n87vdeN5TJ81M2dBDv3wazqgmEXgv5xoTsREPAx~GdS-DcQUGhSwIKh3A~xaJBFlQvxswY5QBZpjIDDjj4A__)

*   **이상형 월드컵:** 두 개의 이미지 카드가 나란히 배치되어 있으며, 사용자에게 선택을 유도하는 질문과 진행 바가 상단에 표시됩니다.

![Destiny 사진 업로드 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX29uYm9hcmRpbmdfMg.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDI5dVltOWhjbVJwYm1kZk1nLnBuZyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=Ol6VweabiyP2XgS6mHOUO~8tCOtoJrvrnxeq5O0rZKuPTLXcIC6esgs6Li9hRK8iiL4tkDJAUCc4PSLHaEGxCI6PDP9k56BcXjpQGiMqPx-Puu2j3islmmS13Rlmv5POXpsb8~dnSa6Ywg5jmw~QqpGmchKFmrSMiOta4Y9LvG7n6ruzmZsGkRLaCui3FsSQMCzTG~BRzto2U72uoMj7Ha5tNGEwfXc0F5g2f9Zng8QAjWRi-YMiU5KkDBpt5Vm~nbzHaa~LR6fPdTpyK912ApLyzw5mss0YvUVMWpzBTyoaiknKI0bX9AIYGJxDfQ6F9akp40w7OBZiaaly05RJdA__)

*   **사진 업로드:** 세 개의 사진 슬롯이 있으며, AI 분석 중인 상태를 시각적으로 표현하여 신뢰감을 줍니다.

### 5.3. 프로필 완성 및 매칭 화면

![Destiny 프로필 완성 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX3Byb2ZpbGVfY29tcGxldGU.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDNCeWIyWnBiR1ZmWTI5dGNHeGxkR1UucG5nIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=PERA5v~~cdohLGALTETVEoUbTjx1PuEHVFcCa5W-eIXUTEyxl5lZRO6jNwt~r4YH3JXnkZnepCoj6eKV1zTl3xp0RMGVP~9zeMJKHGJaiE2JQWNh0CJiGuy-uvj30WYMqYG-cJf50KHbmhP2usrh93UN9xTNEHu2Q2RIu20yIZ1dVsrn3d6x793yyX9Ga7dPhNt~sUd~43peij2bEwc~Ag1x2~rEnTuVrP2yuFMm2e7uwuPcN4V8VYYei6r-GToyCFdlzsxBRP1GP434j~a33X-fME4mNg-hWn2dEOcd2Yv79KwXPacNJ3Fs~8nTDV~hmd7YgEsUlm3qbey3NYcpmw__)

*   **프로필 완성:** 축하 애니메이션과 함께 완료된 항목 체크리스트, 그리고 그룹 생성 CTA 버튼이 표시됩니다.

![Destiny 매칭 결과 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX21hdGNoaW5n.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDIxaGRHTm9hVzVuLnBuZyIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=Sorolmk1aURrxuDVW8DMLW-ijxOyVLlztNdZE4HjlIEZ1Txre5BHWrG6refKQjxQIlXddxDJVAfAcQMwJkINf5-PjE~JEX5Z~TgjVsPNqwuCRUFSXS17JKNNK3JaSBhJxh3RKwmQvO8OE5sjXnVFHveNffQx8FhX1PFtqhDfBVrSy0MouWTKud6I-x-cMVGysrBIG3RjFjjdBPk2NjlOhAepP3Kbx2gh~IGOK29wM5WAM2-kgVrmxsCfTJw1s7NiLxfsoCh-LA4wXTNhZfEGKlTiXljlXmdF8VmL3tXUe~lT1dhsXlL8j3LQe3OjQTyR93Z1bYHt1NLfJ9NuYy~fFQ__)

*   **매칭 결과:** 두 프로필이 별자리처럼 연결되어 운명적인 만남을 시각적으로 표현하며, 자동 확정된 만남 시간과 장소 정보가 제공됩니다.

![Destiny 그룹 대기 화면](https://private-us-east-1.manuscdn.com/sessionFile/CPJYohAqO6BzQN5orNwTyb/sandbox/2M9JsEN2R5K6cOkSIWrydg-images_1778840931573_na1fn_L2hvbWUvdWJ1bnR1L2Rlc3RpbnlfbW9ja3VwX2dyb3VwX3dhaXRpbmc.png?Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvQ1BKWW9oQXFPNkJ6UU41b3JOd1R5Yi9zYW5kYm94LzJNOUpzRU4yUjVLNmNPa1NJV3J5ZGctaW1hZ2VzXzE3Nzg4NDA5MzE1NzNfbmExZm5fTDJodmJXVXZkV0oxYm5SMUwyUmxjM1JwYm5sZmJXOWphM1Z3WDJkeWIzVndYM2RoYVhScGJtYy5wbmciLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=wEAOSGpBOSM3~Xywzt9Cu48hkn6PBKyJNhmkFxPkWxvQ~BoafXecuBiQMWfWdse~3jzwMKrHDv-DeEg9L5MWGCXsEJ-WFoorM6wSedwD8eAHC2Qikps1Zc-6GIyTJni8E180sGspP8kc~b~MeUVtosoEDH87ehJBOyHrm0i~iLLdXiGEAFhVK8VJsPtp39uhZFHIR3KNgy6dWoMKGuPibiT~J5kqG3aSv19glbqdhzhQ4ru6mBqxPQTobe-LyrvyAOC2Eu8KqsbuWm46JP4KfrYVY3g-RYnkjKutKtXKCGFtupl8RNf5GKTA~6HHlZ~hFgizNwkSNidKyHeR0nDMeg__)

*   **그룹 대기:** 그룹 멤버들의 프로필과 함께 매칭 대기 중임을 알리는 애니메이션, 그리고 예상 대기 시간이 표시됩니다.

## 6. Tailwind CSS 토큰

Claude Code가 디자인을 개발에 쉽게 적용할 수 있도록, 주요 컬러 및 간격 토큰을 Tailwind CSS 형식으로 정리합니다.

```css
/* Colors */
--color-bg-base: #060612; /* Deep Midnight Blue */
--color-brand-violet: #7c3aed;
--color-brand-rose: #be185d;
--color-brand-amber: #f59e0b;
--color-glass-bg: rgba(255, 255, 255, 0.055);

/* Spacing (예시) */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;

/* Border Radius (예시) */
--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-full: 9999px;

/* Box Shadow (Glassmorphism Card 예시) */
--shadow-glass: 0 4px 30px rgba(0, 0, 0, 0.1);

/* Blur (Glassmorphism) */
--blur-glass: 24px;
```

## 7. 핵심 인터랙션 가이드 (예시)

*   **월드컵 카드 선택 애니메이션:** 카드를 선택할 때 선택된 카드가 미묘하게 확대되고 빛나는 효과를 주며, 선택되지 않은 카드는 어두워지면서 사라지는 애니메이션을 적용합니다.
*   **버튼 hover/active 상태:** 버튼에 마우스를 올리거나 탭할 때, 배경 그라데이션의 발광 효과가 더욱 강조되거나 색상이 미묘하게 변화하는 효과를 줍니다.
*   **페이지 전환 방향:** 온보딩 플로우와 같이 순차적인 페이지 전환 시에는 오른쪽에서 왼쪽으로 슬라이드 인/아웃 애니메이션을 사용하고, 모달이나 특정 기능 호출 시에는 아래에서 위로 나타나는 애니메이션을 사용합니다.

이 가이드라인과 함께 제공된 목업 이미지를 통해 Claude Code가 Destiny 앱의 디자인을 정확하고 효율적으로 구현할 수 있을 것입니다.
