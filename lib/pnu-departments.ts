// 부산대학교 학부 단과대/학과 목록. 프로필의 profiles.department에 저장되는 후보 source다.
export interface PnuDepartmentGroup {
  college: string
  departments: string[]
}

export const PNU_DEPARTMENT_GROUPS: PnuDepartmentGroup[] = [
  {
    college: '인문대학',
    departments: [
      '국어국문학과',
      '일어일문학과',
      '불어불문학과',
      '노어노문학과',
      '중어중문학과',
      '영어영문학과',
      '독어독문학과',
      '한문학과',
      '언어정보학과',
      '사학과',
      '철학과',
      '고고학과',
    ],
  },
  {
    college: '사회과학대학',
    departments: [
      '행정학과',
      '정치외교학과',
      '사회복지학과',
      '사회학과',
      '심리학과',
      '문헌정보학과',
      '미디어커뮤니케이션학과',
    ],
  },
  {
    college: '자연과학대학',
    departments: [
      '수학과',
      '통계학과',
      '물리학과',
      '화학과',
      '생명과학과',
      '미생물학과',
      '분자생물학과',
      '지질환경과학과',
      '대기환경과학과',
      '해양학과',
    ],
  },
  {
    college: '공과대학',
    departments: [
      '기계공학부',
      '고분자공학과',
      '유기소재시스템공학과',
      '화공생명공학과',
      '환경공학과',
      '전기전자공학부',
      '전자공학전공',
      '전기공학전공',
      '반도체공학전공',
      '조선해양공학과',
      '재료공학부',
      '산업공학과',
      '항공우주공학과',
      '건축공학과',
      '건축학과',
      '도시공학과',
      '사회기반시스템공학과',
      '미래도시건축환경융합전공',
      '첨단IT자율전공',
      '첨단모빌리티자율전공',
      '첨단소재자율전공',
      '스마트시티전공',
    ],
  },
  {
    college: '사범대학',
    departments: [
      '국어교육과',
      '영어교육과',
      '독어교육과',
      '불어교육과',
      '교육학과',
      '유아교육과',
      '특수교육과',
      '일반사회교육과',
      '역사교육과',
      '지리교육과',
      '윤리교육과',
      '수학교육과',
      '물리교육과',
      '화학교육과',
      '생물교육과',
      '지구과학교육과',
      '체육교육과',
    ],
  },
  {
    college: '경제통상대학',
    departments: ['무역학부', '경제학부', '관광컨벤션학과', '국제학부', '공공정책학부'],
  },
  {
    college: '경영대학',
    departments: ['경영학과'],
  },
  {
    college: '약학대학',
    departments: ['약학전공', '제약학전공'],
  },
  {
    college: '생활과학대학',
    departments: ['아동가족학과', '의류학과', '식품영양학과', '실내환경디자인학과', '스포츠과학과'],
  },
  {
    college: '예술대학',
    departments: ['음악학과', '한국음악학과', '미술학과', '조형학과', '디자인학과', '무용학과', '예술문화영상학과'],
  },
  {
    college: '나노과학기술대학',
    departments: ['나노메카트로닉스공학과', '나노에너지공학과', '광메카트로닉스공학과'],
  },
  {
    college: '생명자원과학대학',
    departments: [
      '식물생명과학과',
      '원예생명과학과',
      '동물생명자원과학과',
      '식품공학과',
      '생명환경화학과',
      '바이오소재과학과',
      '바이오산업기계공학과',
      '조경학과',
      '식품자원경제학과',
      'IT응용공학과',
      '바이오환경에너지학과',
    ],
  },
  {
    college: '간호대학',
    departments: ['간호학과'],
  },
  {
    college: '의과대학',
    departments: ['의예과', '의학과'],
  },
  {
    college: '정보의생명공학대학',
    departments: ['정보컴퓨터공학부', '컴퓨터공학전공', '인공지능전공', '디자인테크놀로지전공', '의생명융합공학부', '정보의생명공학자율전공'],
  },
  {
    college: '학부대학',
    departments: [
      '자유전공학부',
      '첨단융합학부',
      '미래에너지전공',
      '나노소자첨단제조전공',
      '광메카트로닉스공학전공',
      'AI융합계산과학전공',
      '응용생명융합학부',
      '그린바이오과학전공',
      '생명자원시스템공학전공',
      '글로벌자유전공학부',
    ],
  },
]

export const PNU_DEPARTMENTS: string[] = PNU_DEPARTMENT_GROUPS.flatMap((group) => group.departments)

function normalizeDepartmentSearchText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

export function searchDepartments(query: string, limit = 8): string[] {
  const q = normalizeDepartmentSearchText(query)
  const matches = q
    ? PNU_DEPARTMENT_GROUPS.flatMap((group) =>
        group.departments.filter((department) => {
          const haystack = normalizeDepartmentSearchText(`${group.college}${department}`)
          return haystack.includes(q)
        }),
      )
    : PNU_DEPARTMENTS

  return Array.from(new Set(matches)).slice(0, limit)
}

export function getDepartmentCollege(department: string): string | null {
  const normalized = normalizeDepartmentSearchText(department)
  if (!normalized) return null

  const group = PNU_DEPARTMENT_GROUPS.find((item) =>
    item.departments.some((candidate) => normalizeDepartmentSearchText(candidate) === normalized),
  )

  return group?.college ?? null
}
