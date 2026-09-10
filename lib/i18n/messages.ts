export const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'zh'] as const
export type QuantumLocale = typeof SUPPORTED_LOCALES[number]
export type MessageSet = Record<string, Record<QuantumLocale, string>>
export const LOCALE_NAMES: Record<QuantumLocale, string> = { ko: '한국어', en: 'English', ja: '日本語', zh: '简体中文' }
export const baseMessages: MessageSet = {
  'nav.home': { ko:'홈', en:'Home', ja:'ホーム', zh:'首页' },
  'nav.match': { ko:'매칭', en:'Match', ja:'マッチ', zh:'配对' },
  'nav.meetups': { ko:'모임', en:'Meetups', ja:'集まり', zh:'活动' },
  'nav.community': { ko:'커뮤니티', en:'Community', ja:'コミュニティ', zh:'社区' },
  'nav.chat': { ko:'채팅', en:'Chats', ja:'チャット', zh:'聊天' },
  'nav.profile': { ko:'마이', en:'Me', ja:'マイページ', zh:'我的' },
  'common.language': { ko:'언어', en:'Language', ja:'言語', zh:'语言' },
  'common.back': { ko:'돌아가기', en:'Back', ja:'戻る', zh:'返回' },
  'common.next': { ko:'다음', en:'Continue', ja:'次へ', zh:'下一步' },
  'common.cancel': { ko:'취소', en:'Cancel', ja:'キャンセル', zh:'取消' },
  'common.retry': { ko:'다시 확인', en:'Try again', ja:'再確認', zh:'重试' },
  'common.close': { ko:'닫기', en:'Close', ja:'閉じる', zh:'关闭' },
  'common.loading': { ko:'확인하고 있어요…', en:'Checking…', ja:'確認しています…', zh:'正在确认…' },
  'locale.scope': { ko:'언어를 선택해 주세요. 사용자 글과 수업명은 원문으로 표시해요.', en:'Choose a language. Member posts and course names stay in their original language.', ja:'言語を選んでください。投稿と授業名は原文で表示します。', zh:'请选择语言。用户帖子和课程名称保留原文。' },
  'locale.partial': { ko:'번역은 순차 적용 중이에요. 아직 일부 화면은 한국어로 표시돼요.', en:'Translations are being added. Some screens are still in Korean.', ja:'翻訳は順次対応中です。一部の画面は韓国語で表示されます。', zh:'翻译正在逐步完善，部分页面仍以韩语显示。' },
  'locale.storage': { ko:'이 브라우저에서는 언어를 저장할 수 없어 현재 화면에만 적용돼요.', en:'This browser cannot save your language. It applies to this session only.', ja:'このブラウザでは言語を保存できません。現在のセッションのみ適用されます。', zh:'此浏览器无法保存语言设置，仅在当前会话生效。' },
  'meetup.title': { ko:'모임', en:'Find your people', ja:'仲間を見つけよう', zh:'找到你的同伴' },
  'meetup.subtitle': { ko:'지금 하고 싶은 일로, 학교 친구를 만나요.', en:'Meet campus friends through what you want to do.', ja:'今やりたいことから、同じ大学の仲間と出会おう。', zh:'从现在想做的事开始，认识校园里的朋友。' },
  'meetup.play': { ko:'같이 놀 사람!', en:'Make time for fun', ja:'一緒に遊ぼう！', zh:'一起玩吧！' },
  'meetup.playSub': { ko:'학과 상관없이 가볍게 모여요', en:'New friends, any department', ja:'学科を問わず気軽に集まろう', zh:'不限专业，轻松相聚' },
  'meetup.achieve': { ko:'같이 해낼 사람!', en:'Better together', ja:'一緒にやり遂げよう！', zh:'一起实现目标！' },
  'meetup.achieveSub': { ko:'어학 · 취업 · 프로젝트', en:'Languages · Careers · Projects', ja:'語学・就職・プロジェクト', zh:'语言 · 求职 · 项目' },
  'meetup.department': { ko:'우리 과끼리', en:'My department', ja:'同じ学科で', zh:'同专业的我们' },
  'meetup.departmentSub': { ko:'전공 · 멘토링 · 친목', en:'Courses · Mentoring · Friends', ja:'専攻・メンタリング・交流', zh:'专业学习 · 互助指导 · 交友' },
  'meetup.challenge': { ko:'학과 대항전', en:'Campus rivalries', ja:'学科対抗戦', zh:'院系挑战赛' },
  'meetup.challengeSub': { ko:'함께 뛰는 더 큰 우리', en:'Team up and play for your department', ja:'仲間と一緒に学科の代表へ', zh:'组队为自己的专业而战' },
  'meetup.create': { ko:'내가 원하는 모임 열기', en:'Start your own meetup', ja:'自分で集まりを開く', zh:'发起自己的活动' },
  'play.heading': { ko:'어떤 걸 하며 가까워질까요?', en:'What brings us together?', ja:'何をして仲良くなろう？', zh:'做点什么，一起熟悉起来？' },
  'play.lifestyle': { ko:'오늘, 같이 놀래?', en:'Hang out today?', ja:'今日、一緒に遊ばない？', zh:'今天一起出来玩？' },
  'play.games': { ko:'오늘부터 같은 팀', en:'Your team starts here', ja:'今日から同じチーム', zh:'从今天起，我们是一队' },
  'play.exercise': { ko:'땀 좀 나눠볼까?', en:'Move together, click together', ja:'一緒にいい汗かこう', zh:'一起挥洒汗水吧' },
  'play.lifestyleSub': { ko:'카페 · 맛집 · 소품숍 · 산책', en:'Cafés · Food · Shops · Walks', ja:'カフェ・グルメ・雑貨店・散歩', zh:'咖啡 · 美食 · 小店 · 散步' },
  'play.gamesSub': { ko:'보드게임 · PC방 팀 게임', en:'Board games · PC team games', ja:'ボードゲーム・PCチームゲーム', zh:'桌游 · 网吧组队游戏' },
  'play.exerciseSub': { ko:'러닝 · 라켓 운동 · 구기 종목 · 등산', en:'Running · Racket sports · Ball games · Hiking', ja:'ランニング・ラケット競技・球技・登山', zh:'跑步 · 球拍运动 · 球类 · 登山' },
  'play.choose': { ko:'활동 고르기', en:'Choose an activity', ja:'活動を選ぶ', zh:'选择活动' },
}

export function isQuantumLocale(value: unknown): value is QuantumLocale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as QuantumLocale)
}

export function formatMessage(messages: MessageSet, locale: QuantumLocale, key: string, params: Record<string, string | number> = {}): string {
  const entry = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : undefined
  const template = entry?.[locale] ?? entry?.ko ?? key
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match)
}
