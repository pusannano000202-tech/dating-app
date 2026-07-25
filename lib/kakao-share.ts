'use client'

const KAKAO_SDK_SCRIPT_ID = 'kakao-javascript-sdk'
const KAKAO_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.5/kakao.min.js'

type KakaoLink = {
  mobileWebUrl: string
  webUrl: string
}

type KakaoTextShareSettings = {
  objectType: 'text'
  text: string
  link: KakaoLink
  buttonTitle?: string
}

type KakaoSdk = {
  init: (javascriptKey: string) => void
  isInitialized: () => boolean
  Share?: {
    sendDefault: (settings: KakaoTextShareSettings) => void
  }
}

declare global {
  interface Window {
    Kakao?: KakaoSdk
  }
}

export type KakaoInviteSharePayload = {
  title: string
  description: string
  url: string
  buttonTitle?: string
}

let kakaoSdkPromise: Promise<KakaoSdk> | null = null

export function hasKakaoJavaScriptKey(): boolean {
  return getKakaoJavaScriptKey().length > 0
}

export async function shareGroupInviteOnKakao({
  title,
  description,
  url,
  buttonTitle = '초대 수락하기',
}: KakaoInviteSharePayload) {
  const kakao = await loadKakaoSdk()

  if (!kakao.Share?.sendDefault) {
    throw new Error('kakao_share_unavailable')
  }

  const link = { mobileWebUrl: url, webUrl: url }
  const shareButtonTitle = buttonTitle ?? '초대 확인하기'
  const shareText = normalizeKakaoShareText(title, description)
  kakao.Share.sendDefault({
    objectType: 'text',
    text: shareText,
    link,
    buttonTitle: shareButtonTitle,
  })
}

function normalizeKakaoShareText(title: string, description: string): string {
  const rawText = `${title}\n${description}`.trim()
  if (!rawText || rawText.length > 200 || looksMojibake(rawText)) {
    return 'Quantum 팀 초대가 도착했어요. 로그인하고 그룹에 합류해 주세요.'
  }
  return rawText
}

function looksMojibake(value: string): boolean {
  return /[珥移怨蹂濡洹留]|�/.test(value)
}

function getKakaoJavaScriptKey(): string {
  return process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY?.trim() ?? ''
}

function loadKakaoSdk(): Promise<KakaoSdk> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('browser_required'))
  }

  const javascriptKey = getKakaoJavaScriptKey()
  if (!javascriptKey) {
    return Promise.reject(new Error('kakao_key_missing'))
  }

  if (window.Kakao) {
    return Promise.resolve(initializeKakaoSdk(javascriptKey))
  }

  if (kakaoSdkPromise) return kakaoSdkPromise

  kakaoSdkPromise = new Promise((resolve, reject) => {
    const done = () => {
      try {
        resolve(initializeKakaoSdk(javascriptKey))
      } catch (error) {
        reject(error)
      }
    }

    document.getElementById(KAKAO_SDK_SCRIPT_ID)?.remove()

    const script = document.createElement('script')
    script.id = KAKAO_SDK_SCRIPT_ID
    script.src = KAKAO_SDK_SRC
    script.async = true
    script.onload = done
    script.onerror = () => {
      kakaoSdkPromise = null
      script.remove()
      reject(new Error('kakao_sdk_load_failed'))
    }
    document.head.appendChild(script)
  })

  return kakaoSdkPromise
}

function initializeKakaoSdk(javascriptKey: string): KakaoSdk {
  const kakao = window.Kakao
  if (!kakao) throw new Error('kakao_sdk_unavailable')

  if (!kakao.isInitialized()) {
    kakao.init(javascriptKey)
  }

  return kakao
}
