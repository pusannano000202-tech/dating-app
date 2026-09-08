# 응원 팀 카탈로그 출처

검증일: 2026-09-07

이 문서는 `lib/voice/cheer-catalog.ts`의 표시명과 로컬 검토용 로고가
어디에서 왔는지 기록한다. 팀 수와 표시명은 아래 공식 리그 페이지를
기준으로 고정했다.

- LCK: [LoL Esports 2026 Split 3 참가팀](https://lolesports.com/en-US/tournament/113503357263583149/overview)
- KBO: [KBO 구단 소개](https://www.koreabaseball.com/Kbo/League/TeamInfo.aspx)

## LCK

| ID | 공식 표시명 | 로고 원본 |
| --- | --- | --- |
| `lck-hanwha-life-esports` | Hanwha Life Esports | [Riot CDN](https://static.lolesports.com/teams/1631819564399_hle-2021-worlds.png) |
| `lck-t1` | T1 | [Riot CDN](https://static.lolesports.com/teams/1726801573959_539px-T1_2019_full_allmode.png) |
| `lck-bnk-fearx` | BNK FEARX | [Riot CDN](https://static.lolesports.com/teams/1734691810721_BFXfullcolorfordarkbg.png) |
| `lck-dn-soopers` | DN SOOPers | [Riot CDN](https://static.lolesports.com/teams/1767340467921_DN_SOOPerslogo_profile.webp) |
| `lck-hanjin-brion` | HANJIN BRION | [Riot CDN](https://static.lolesports.com/teams/1716454325887_Nowyprojekt.png) |
| `lck-gen-g-esports` | Gen.G Esports | [Riot CDN](https://static.lolesports.com/teams/1773829250929_GENGLOGO_GOLD.png) |
| `lck-dplus-kia` | Dplus KIA | [Riot CDN](https://static.lolesports.com/teams/1673260049703_DPlusKIALOGO11.png) |
| `lck-kt-rolster` | kt Rolster | [Riot CDN](https://static.lolesports.com/teams/kt_darkbackground.png) |
| `lck-nongshim-red-force` | NONGSHIM RED FORCE | [Riot CDN](https://static.lolesports.com/teams/NSFullonDark.png) |
| `lck-kiwoom-drx` | KIWOOM DRX | [Riot CDN](https://static.lolesports.com/teams/1774247803537_horizontal_EN_Wh.png) |

`KIWOOM DRX`, `HANJIN BRION`, `DN SOOPers`처럼 2026 공식 페이지에서
확인한 현재 표시명을 사용한다. CDN 파일명은 표시명의 근거로 사용하지
않는다.

## KBO

| ID | 공식 표시명 | 로고 원본 |
| --- | --- | --- |
| `kbo-lg-twins` | LG 트윈스 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_LG.png) |
| `kbo-hanwha-eagles` | 한화 이글스 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_HH.png) |
| `kbo-ssg-landers` | SSG 랜더스 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_SK.png) |
| `kbo-samsung-lions` | 삼성 라이온즈 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_SS.png) |
| `kbo-nc-dinos` | NC 다이노스 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_NC.png) |
| `kbo-kt-wiz` | KT 위즈 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_KT.png) |
| `kbo-lotte-giants` | 롯데 자이언츠 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_LT.png) |
| `kbo-kia-tigers` | KIA 타이거즈 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_HT.png) |
| `kbo-doosan-bears` | 두산 베어스 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_OB.png) |
| `kbo-kiwoom-heroes` | 키움 히어로즈 | [KBO CDN](https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/emblem/regular/fixed/emblem_WO.png) |

KBO CDN의 `SK`, `HT`, `OB`, `WO` 같은 역사적 내부 파일명은 현재 팀
이름이 아니다. UI 라벨은 카탈로그의 공식 표시명만 사용한다.

## 사용 경계

- 이 저장소의 사본은 로컬 UI 검토용이다. 배포·광고·상업적 사용 승인을
  의미하지 않는다.
- 공식 페이지에서 파일을 공개한다는 사실만으로 재배포 권리가 생기지
  않는다. 출시 전 LCK/KBO 및 각 구단의 로고·상표 사용 권리를 별도로
  확인해야 한다. 참고: [Riot 공식 IP 정책](https://www.riotgames.com/en/legal),
  [KBO가 계약으로 구단 CI 사용권을 부여한 사례](https://www.koreabaseball.com/MediaNews/Notice/View.aspx?bdSe=11875).
- 운영 화면에서 외부 CDN을 직접 hotlink하지 않는다. 권리 확인 후 승인된
  사본과 출처·검증일을 함께 관리한다.
- 흰색 또는 밝은 로고는 카드에서 어두운 중립 배경을 사용해야 한다.
  로고 자체의 색·비율·형태는 임의로 바꾸지 않는다.
