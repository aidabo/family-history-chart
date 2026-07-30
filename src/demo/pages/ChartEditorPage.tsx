import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import FamilyChartEditor from '@/app/FamilyChartEditor'

export default function ChartEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mode = searchParams.get('mode') === 'view' ? 'view' : 'edit'

  if (!id) return null

  // Standalone demo has no site menubar → give the editor the full viewport.
  return (
    <div className="w-screen h-screen">
      <FamilyChartEditor
        id={id}
        mode={mode}
        onBack={() => navigate('/charts')}
        onOpenView={(chartId) => navigate(`/edit/${chartId}?mode=view`)}
        onOpenEdit={(chartId) => navigate(`/edit/${chartId}`)}
      />
    </div>
  )
}
