import { notFound } from 'next/navigation'
import CampusSevenExperience from '@/components/matching/campus-seven/CampusSevenExperience'
import { getCampusSevenPreviewScene } from '@/lib/campus-seven/preview'

export default async function CampusSevenPreviewPage(props: { params: Promise<{ scene: string }> }) {
  const params = await props.params;
  if (process.env.NODE_ENV !== 'development') notFound()

  const preview = getCampusSevenPreviewScene(params.scene)
  if (!preview) notFound()

  return (
    <CampusSevenExperience
      applicationsOpen={false}
      cardPaymentsEnabled={false}
      preview={preview}
    />
  )
}
