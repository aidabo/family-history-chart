export interface ChartProps {
  dynasties: any[];
  persons: any[];
  relationships: any[];
  events: any[];
}

export interface PageProps {
  id: string;
  title: string;
  description?: string; 
  image?: string;
  created_at?: Date;
  options?: any;
  chartProps: ChartProps;
}