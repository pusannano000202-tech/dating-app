# Male Final 64 Usage Report

- Source: Manus MI01-MI96 commit `086a76a5c04e85f20d1238b72a9fdaf5dd007755`
- Selection: Codex first-pass visual review, 8 images x 8 male types
- Active male items in `METADATA.json`: 64
- Rejected male candidates retained in metadata: 32

## Active IDs By Type

### 훈훈/부드러운형

MI01, MI03, MI04, MI05, MI06, MI08, MI09, MI11

### 댄디/단정형

MI13, MI14, MI15, MI16, MI17, MI18, MI19, MI20

### 시크/날카로운형

MI25, MI26, MI27, MI28, MI29, MI31, MI32, MI35

### 소년미/귀여운형

MI37, MI38, MI39, MI41, MI42, MI43, MI44, MI48

### 운동/건강형

MI49, MI50, MI51, MI52, MI53, MI55, MI56, MI57

### 지적/안경형

MI61, MI62, MI63, MI64, MI66, MI67, MI68, MI69

### 강한 인상/남성미형

MI73, MI75, MI76, MI78, MI79, MI80, MI81, MI84

### 스타일리시/개성형

MI85, MI86, MI87, MI88, MI90, MI91, MI92, MI94

## Rejected IDs

- `MI02`: weaker warm/soft signal than selected alternatives
- `MI07`: duplicate warm hoodie/selfie signal
- `MI10`: high polish and score-ceiling risk
- `MI12`: duplicate hoodie/student signal
- `MI21`: leather/night styling reads strong/chic, not dandy
- `MI22`: model-like profile pose and high-score risk
- `MI23`: hoodie/denim reads casual soft, not dandy
- `MI24`: graffiti/bomber reads street/chic, not dandy
- `MI30`: too soft/neutral for chic/sharp
- `MI33`: dark image and weaker face clarity
- `MI34`: too polished and high-score risk
- `MI36`: yellow sweatshirt/smile reads warm/cute
- `MI40`: reject: elementary-school background and too-young impression
- `MI45`: weak boyish/cute signal
- `MI46`: general campus/soft rather than boyish/cute
- `MI47`: more athletic/soft than cute
- `MI54`: high-score risk
- `MI58`: category mismatch: glasses/library, not athletic
- `MI59`: category mismatch: glasses/cafe, not athletic
- `MI60`: category mismatch: glasses/library, not athletic
- `MI65`: backup only; weaker intellectual signal
- `MI70`: category mismatch: no clear glasses signal
- `MI71`: category mismatch: no clear glasses signal
- `MI72`: category mismatch: no clear glasses signal
- `MI74`: too soft/neutral for strong masculine
- `MI77`: too soft/ordinary for strong masculine
- `MI82`: tennis/campus reads soft/healthy
- `MI83`: neutral and weak strong-masculine signal
- `MI89`: fashion/high-score risk
- `MI93`: too posed/techwear; less natural dating-app feel
- `MI95`: influencer/high-score risk
- `MI96`: more dandy/high-polish than unique

## Remaining Gate

Run the external/measured image analysis pass when available. Replace or downgrade any active item whose measured score exceeds 77 or whose measured type no longer matches the intended bucket.
