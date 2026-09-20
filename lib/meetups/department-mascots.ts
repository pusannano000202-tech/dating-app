/** Visual identity only. Never use this registry for department authorization. */
export type DepartmentMascotIdentity = { image?: string; label: string; icon: string }
const portraits: Record<string, { file: string; character: string }> = {
  건축학과: {file:'architecture-beaver',character:'설계 비버'},
  경영학과: {file:'business-fox',character:'전략 여우'},
  고고학과: {file:'archaeology-mole',character:'발굴 두더지'},
  컴퓨터공학부: {file:'computing-robot',character:'코딩 로봇'},
  정보컴퓨터공학부: {file:'computing-robot',character:'코딩 로봇'},
  컴퓨터공학전공: {file:'computing-robot',character:'코딩 로봇'},
  기계공학부: {file:'mechanical-bear',character:'메이커 곰'},
  간호학과: {file:'nursing-otter',character:'돌봄 수달'},
}
// Subject-specific library symbols cover departments outside the six approved
// character illustrations. They are not advertised as unique mascot artwork.
const subjects: readonly [RegExp,string][] = [
  [/고분자|유기소재/,'Network'], [/경제|통계|데이터/,'ChartNoAxesCombined'],
  [/건축|설계/,'DraftingCompass'], [/고고|사학|역사/,'Landmark'],
  [/컴퓨터|IT|인공지능|AI|소프트웨어/,'CodeXml'], [/간호|의학|의예/,'Stethoscope'],
  [/경영|산업공학/,'BriefcaseBusiness'], [/기계|메카트로닉스|제조/,'Cog'],
  [/에너지|전기/,'Zap'], [/전자|반도체|나노소자/,'Cpu'],
  [/항공|우주/,'Rocket'], [/조선|해양/,'Ship'], [/모빌리티/,'CarFront'],
  [/약학|제약/,'Pill'], [/분자|미생물|생명|바이오/,'Dna'],
  [/물리|원자력/,'Atom'], [/화학|화공/,'FlaskConical'], [/재료|소재/,'Gem'],
  [/수학|계산/,'Sigma'], [/도시|기반|스마트시티/,'Building2'],
  [/환경|조경|식물|원예|그린/,'Sprout'], [/동물/,'PawPrint'],
  [/대기/,'CloudSun'], [/지질|지구|지리/,'Mountain'],
  [/정치|행정|정책|사회/,'Scale'], [/심리|철학|윤리/,'Brain'],
  [/무역|국제|글로벌/,'Globe2'], [/관광/,'Compass'],
  [/미디어|영상/,'Clapperboard'], [/문헌|국문|한문/,'BookOpen'],
  [/어문|영문|일문|불문|노문|중문|독문|언어/,'Languages'],
  [/아동|유아|가족|특수교육/,'HeartHandshake'], [/교육/,'GraduationCap'],
  [/체육|스포츠|무용/,'Activity'], [/음악/,'Music2'],
  [/디자인|미술|조형/,'Palette'], [/의류/,'Shirt'], [/식품/,'Utensils'],
]
export function departmentMascot(department: string): DepartmentMascotIdentity {
  const name=department.trim(), portrait=portraits[name]
  return {
    ...(portrait?{image:`/images/departments/${portrait.file}.webp`}:{}),
    label:portrait?`${name} ${portrait.character}`:`${name || '학과'} 상징`,
    icon:subjects.find(([pattern])=>pattern.test(name))?.[1]??'GraduationCap',
  }
}
