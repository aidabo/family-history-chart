import { useNavigate } from 'react-router-dom'
import FamilyChartList from '@/app/FamilyChartList'

export default function ChartListPage() {
  const navigate = useNavigate()

  return (
    <FamilyChartList
      onOpen={(id) => navigate(`/edit/${id}`)}
      onView={(id) => navigate(`/edit/${id}?mode=view`)}
    />
  )
}
