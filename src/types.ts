export interface Area {
  id: string;
  name: string;
  uid: string;
}

export interface Equipment {
  id: string;
  name: string;
  areaId: string;
  uid: string;
}

export interface MaintenanceLog {
  id: string;
  timestamp: string;
  area: string;
  equipment: string;
  isolation: number;
  ohmicAB: number;
  ohmicAC: number;
  ohmicBC: number;
  ia?: number;
  ip?: number;
  operator: string;
  status?: 'Normal' | 'Atenção' | 'Crítico';
  tendencia?: 'Crescente' | 'Estável' | 'Decrescente';
  recomendacao?: string;
  pdfUrl?: string;
  uid: string;
}

export type View = 'login' | 'overview' | 'motor-health' | 'prevention' | 'reports' | 'logs';
