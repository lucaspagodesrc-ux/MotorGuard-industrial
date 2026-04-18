
export type MotorStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO' | 'FALHA';

export interface MotorAnalysisInput {
  isolamento: number;
  ohmicAB: number;
  ohmicAC: number;
  ohmicBC: number;
  historicoIsolamento: number[]; // Most recent is index 0
  historicoOhmicaMedia: number[]; // Most recent is index 0
}

export interface MotorAnalysisResult {
  status: MotorStatus;
  cor: string;
  condicao: string;
  diagnostico: string;
  recomendacoes: string[];
  tendencia: string; // Simplified text
  tendenciaCor: string; // Trend color
  tendenciaDiagnostico: string; // Long technical explanation
}

/**
 * Calcula a tendencia com base na variacao percentual.
 */
export const calcularTendencia = (valorAtual: number, valorAnterior: number) => {
  const variacao = ((valorAtual - valorAnterior) / valorAnterior) * 100;

  if (variacao >= -5 && variacao <= 5) return { texto: "Estavel", cor: "#16a34a" };
  if (variacao < -5 && variacao >= -20) return { texto: "Queda leve", cor: "#eab308" };
  if (variacao < -20) return { texto: "Queda acentuada", cor: "#dc2626" };
  if (variacao > 5 && variacao <= 20) return { texto: "Subida leve", cor: "#2563eb" };
  if (variacao > 20) return { texto: "Subida acentuada", cor: "#2563eb" };
  
  return { texto: "Estavel", cor: "#16a34a" };
};

/**
 * Analisa a condição do motor com base em medições técnicas detalhadas e normas industriais.
 */
export function analyzeMotorCondition(input: MotorAnalysisInput): MotorAnalysisResult {
  const { isolamento, ohmicAB, ohmicAC, ohmicBC, historicoIsolamento, historicoOhmicaMedia } = input;
  const currentOhmicMedia = (ohmicAB + ohmicAC + ohmicBC) / 3;

  const logsTendencia: string[] = [];
  
  // 1. ANÁLISE DE ISOLAMENTO (IR)
  let irStatus: MotorStatus = 'NORMAL';
  if (isolamento < 10) irStatus = 'FALHA';
  else if (isolamento < 100) irStatus = 'CRÍTICO';
  else if (isolamento <= 500) irStatus = 'ATENÇÃO';

  // 2. TENDÊNCIA DE ISOLAMENTO (Cálculo Simplificado)
  let trendData = { texto: "Estavel", cor: "#16a34a" };
  if (historicoIsolamento.length > 0) {
    const lastIR = historicoIsolamento[0];
    const variacaoIR = ((isolamento - lastIR) / lastIR) * 100;
    trendData = calcularTendencia(isolamento, lastIR);
    
    if (variacaoIR < -20) {
      logsTendencia.push("Tendencia de queda na resistencia de isolamento, indicando possivel contaminacao, umidade ou envelhecimento do isolamento.");
    }
  }

  // 3. RESISTÊNCIA ÔHMICA (TENDÊNCIA DA MÉDIA)
  let rdTrendStatus: MotorStatus = 'NORMAL';
  if (historicoOhmicaMedia.length > 0) {
    const lastOhmicMedia = historicoOhmicaMedia[0];
    const variacaoOhmic = ((currentOhmicMedia - lastOhmicMedia) / lastOhmicMedia) * 100;

    if (variacaoOhmic > 20) {
      rdTrendStatus = 'CRÍTICO';
      logsTendencia.push("Elevacao da resistencia ohmica sugere aquecimento excessivo, oxidacao ou mau contato.");
    } else if (variacaoOhmic > 10) {
      rdTrendStatus = 'ATENÇÃO';
    }
  }

  // 4. DESBALANCEAMENTO ENTRE FASES
  const values = [ohmicAB, ohmicAC, ohmicBC];
  const maxOhmic = Math.max(...values);
  const minOhmic = Math.min(...values);
  const imbalance = ((maxOhmic - minOhmic) / currentOhmicMedia) * 100;

  let imbalanceStatus: MotorStatus = 'NORMAL';
  if (imbalance > 5) {
    imbalanceStatus = 'CRÍTICO';
    logsTendencia.push("Desbalanceamento entre fases indica possivel assimetria no enrolamento ou falha localizada.");
  } else if (imbalance >= 2) {
    imbalanceStatus = 'ATENÇÃO';
  }

  // DEFINIÇÃO DO STATUS FINAL
  const severities = { 'NORMAL': 0, 'ATENÇÃO': 1, 'CRÍTICO': 2, 'FALHA': 3 };
  const finalScore = Math.max(
    severities[irStatus], 
    severities[rdTrendStatus], 
    severities[imbalanceStatus]
  );
  
  const statusMap: Record<number, MotorStatus> = { 0: 'NORMAL', 1: 'ATENÇÃO', 2: 'CRÍTICO', 3: 'FALHA' };
  const status = statusMap[finalScore];

  // MAPEAMENTO DE CORES E TEXTOS PADRONIZADOS
  const config = {
    'NORMAL': {
      cor: '#16a34a',
      condicao: "Motor em condicao operacional normal",
      diagnostico: "Motor operando dentro dos padroes esperados. Nao ha indicios de degradacao eletrica ou anomalias nas medicoes.",
      recs: ["Manter plano de manutencao preventiva", "Registrar medicoes periodicas"]
    },
    'ATENÇÃO': {
      cor: '#eab308',
      condicao: "Motor com indicios de degradacao",
      diagnostico: "Identificada variacao nos parametros eletricos. Tendencia indica possivel inicio de degradacao. Recomenda-se acompanhamento continuo.",
      recs: ["Aumentar frequencia de monitoramento", "Programar inspecao detalhada", "Avaliar condicoes ambientais (umidade, sujeira)"]
    },
    'CRÍTICO': {
      cor: '#f97316',
      condicao: "Motor em condicao critica",
      diagnostico: "Parametros eletricos fora da faixa aceitavel. Evidencia de degradacao significativa do isolamento e/ou anomalias resistivas. Risco elevado de falha operacional.",
      recs: ["Programar parada controlada", "Realizar ensaios complementares (megger, surge test)", "Inspecionar conexoes e isolamento"]
    },
    'FALHA': {
      cor: '#dc2626',
      condicao: "Motor com falha eletrica grave (possivel motor queimado)",
      diagnostico: "Falha eletrica detectada. Isolamento comprometido e/ou desbalanceamento severo. Alta probabilidade de dano no enrolamento do motor.",
      recs: ["Retirar motor de operacao imediatamente", "Encaminhar para analise em oficina especializada", "Avaliar rebobinamento ou substituicao"]
    }
  };

  const finalConfig = config[status];

  return {
    status,
    cor: finalConfig.cor,
    condicao: finalConfig.condicao,
    diagnostico: finalConfig.diagnostico,
    recomendacoes: finalConfig.recs,
    tendencia: trendData.texto,
    tendenciaCor: trendData.cor,
    tendenciaDiagnostico: logsTendencia.length > 0 ? logsTendencia.join(' ') : "Parametros dentro da normalidade estatistica e operacional."
  };
}
