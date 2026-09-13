'use client'

import PhotoSceneCarousel from '@/components/social/PhotoSceneCarousel'
import { COMMUNITY_EXPERIENCES } from '@/lib/community/experience-explorer'

export default function CommunityExperienceExplorer({ campusEatsEnabled = false }: { campusEatsEnabled?: boolean }) {
  return <PhotoSceneCarousel label="즐길 거리" items={COMMUNITY_EXPERIENCES.map(item => ({
    id:item.id, eyebrow:item.shortLabel, title:item.title, description:item.description,
    image:item.image, imageAlt:item.imageAlt, actionLabel:item.cta, href:item.href,
    disabled:item.id === 'visit' && !campusEatsEnabled,
    note:item.notice,
  }))}/>
}
