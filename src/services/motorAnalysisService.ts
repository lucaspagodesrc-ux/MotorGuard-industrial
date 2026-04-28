
export type MotorStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO' | 'FALHA' | 'PRIMEIRA MEDIÇÃO';

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

  if (variacao >= -5 && variacao <= 0) return { texto: "Estavel", cor: "#16a34a" };
  if (variacao < -5 && variacao > -25) return { texto: "Queda leve", cor: "#eab308" };
  if (variacao <= -25 && variacao > -40) return { texto: "Queda acentuada", cor: "#dc2626" };
  if (variacao <= -40) return { texto: "Queda severa", cor: "#7f1d1d" };
  if (variacao > 0 && variacao <= 25) return { texto: "Subida leve", cor: "#2563eb" };
  if (variacao > 25) return { texto: "Subida acentuada", cor: "#2563eb" };
  
  return { texto: "Estavel", cor: "#16a34a" };
};

/**
 * Analisa a condição do motor com base em medições técnicas detalhadas e normas industriais.
 * Implementa lógica refinada com base no número de medições e variação percentual.
 */
export function analyzeMotorCondition(input: MotorAnalysisInput): MotorAnalysisResult {
  const { isolamento, ohmicAB, ohmicAC, ohmicBC, historicoIsolamento, historicoOhmicaMedia } = input;
  const currentOhmicMedia = (ohmicAB + ohmicAC + ohmicBC) / 3;
  const totalCount = 1 + historicoIsolamento.length;

  const logsTendencia: string[] = [];
  let status: MotorStatus = 'NORMAL';
  
  // 1. CONDIÇÃO DE FALHA (PRIORIDADE MÁXIMA - VALOR ABSOLUTO)
  // Definido quando a resistência de isolamento está próxima de zero (curto ou massa)
  const LIMIAR_FALHA_IR = 1; // em MΩ
  
  const values = [ohmicAB, ohmicAC, ohmicBC];
  const maxOhmic = Math.max(...values);
  const minOhmic = Math.min(...values);
  const imbalance = ((maxOhmic - minOhmic) / currentOhmicMedia) * 100;
  const variacaoOhmic = historicoOhmicaMedia.length > 0 ? ((currentOhmicMedia - historicoOhmicaMedia[0]) / historicoOhmicaMedia[0]) * 100 : 0;

  let isFalha = false;
  if (isolamento <= LIMIAR_FALHA_IR || isolamento === 0) {
    isFalha = true;
    logsTendencia.push("Resistencia de isolamento criticamente baixa ou em curto (<= 1 MOhm), indicando falha grave e risco imediato.");
  }
  
  // Outras condições técnicas que indicam falha física real
  if (imbalance > 10) { // Aumentado limiar de desbalanceamento para falha
    isFalha = true;
    logsTendencia.push("Desbalanceamento severo (>10%) indica falha física no enrolamento.");
  }

  if (isFalha) {
    status = 'FALHA';
  } else if (totalCount === 1) {
    status = 'PRIMEIRA MEDIÇÃO';
  } else {
    const lastIR = historicoIsolamento[0];
    const variacaoIR = ((isolamento - lastIR) / lastIR) * 100;

    // 🔴 1. CONDIÇÃO DE FALHA (CRÍTICO ABSOLUTO)
    if (isolamento <= LIMIAR_FALHA_IR || isolamento === 0) {
      status = 'FALHA';
    } 
    // 🔴 2. QUEDA SEVERA
    else if (variacaoIR <= -40) {
      status = 'CRÍTICO';
    }
    // 🟠 3. QUEDA ACENTUADA
    else if (variacaoIR <= -25) {
      status = 'CRÍTICO';
    }
    // 📈 4. SUBIDA -> NORMAL
    else if (variacaoIR > 0) {
      status = 'NORMAL';
    }
    // 🟡 5. ATENÇÃO (QUEDA LEVE)
    else if (variacaoIR < 0 && variacaoIR > -25) {
      status = 'ATENÇÃO';
    }
    // 🟢 6. NORMAL (ESTÁVEL)
    else {
      status = 'NORMAL';
    }
  }

  // Função interna para gerar diagnóstico padronizado conforme solicitado
  const gerarDiagnosticoTecnico = () => {
    if (status === 'PRIMEIRA MEDIÇÃO') {
      return "Primeira medicao registrada. Ainda nao ha dados suficientes para analise de tendencia ou diagnostico confiavel.";
    }

    const lastIR = historicoIsolamento[0] || isolamento;
    const variacaoIR = historicoIsolamento.length > 0 ? ((isolamento - lastIR) / lastIR) * 100 : 0;
    
    let texto = "";
    
    // Lógica de texto baseada nas regras de engenharia solicitadas
    if (status === "NORMAL" && (historicoIsolamento.length === 0 || variacaoIR >= 0)) {
      texto = "O equipamento apresenta condicao estavel de isolamento, sem indicios de degradacao. A resistencia medida encontra-se dentro dos padroes esperados.";
    } else if (variacaoIR > 0) {
      texto = "Foi observada elevacao na resistencia de isolamento, indicando melhora nas condicoes dieletricas do equipamento.";
    } else if (variacaoIR < 0 && variacaoIR > -25) {
      texto = "Foi identificada reducao na resistencia de isolamento em relacao a medicao anterior, indicando possivel inicio de degradacao.";
    } else if (variacaoIR <= -25 && variacaoIR > -40) {
      texto = "Foi identificada queda acentuada na resistencia de isolamento, indicando degradacao relevante do sistema isolante.";
    } else if (variacaoIR <= -40) {
      texto = "Foi identificada queda severa na resistencia de isolamento, indicando alto nivel de degradacao e risco elevado de falha.";
    } else if (status === 'FALHA') {
      texto = "A resistencia de isolamento encontra-se em nivel critico ou proximo de zero, indicando falha no sistema isolante.";
    } else {
      texto = "Condicao nao classificada.";
    }

    // Complemento de desbalanceamento ohmico (Threshold técnico > 5%)
    if (imbalance > 5) {
      texto += " Foi identificado desbalanceamento entre as resistencias ohmicas das fases, indicando possivel assimetria nos enrolamentos.";
    }

    return texto;
  };

  const diagTecnico = gerarDiagnosticoTecnico();

  // MAPEAMENTO DE RECOMENDAÇÕES E CORES
  const configResult = {
    'PRIMEIRA MEDIÇÃO': {
      cor: "#64748b",
      condicao: "Aguardando historico",
      recs: ["Realizar novas medicoes periodicas", "Acompanhar evolucao dos parametros", "Evitar conclusoes com base em um unico ponto"]
    },
    'NORMAL': {
      cor: '#16a34a',
      condicao: "Condicao operacional estavel",
      recs: ["Manter plano de manutencao preventiva", "Registrar tendencia nas proximas medicoes"]
    },
    'ATENÇÃO': {
      cor: '#eab308',
      condicao: "Inicio de degradacao identificado",
      recs: ["Aumentar frequencia de monitoramento", "Verificar condicoes ambientais (umidade/sujeira)", "Limpar terminais e repetir medicao"]
    },
    'CRÍTICO': {
      cor: '#dc2626',
      condicao: "Degradacao relevante do isolamento",
      recs: ["Programar parada para inspecao detalhada", "Avaliar secagem do enrolamento", "Realizar testes complementares"]
    },
    'FALHA': {
      cor: '#7f1d1d',
      condicao: "Falha iminente ou curto-circuito",
      recs: ["Nao energizar o equipamento", "Isolar motor para manutencao corretiva", "Inspecionar cabos e caixa de ligacao"]
    }
  };

  const currentCfg = configResult[status as keyof typeof configResult];
  const lastIR_val = historicoIsolamento[0] || isolamento;
  const variacaoIR_val = historicoIsolamento.length > 0 ? ((isolamento - lastIR_val) / lastIR_val) * 100 : 0;

  return {
    status,
    cor: currentCfg.cor,
    condicao: currentCfg.condicao,
    diagnostico: diagTecnico,
    recomendacoes: currentCfg.recs,
    tendencia: variacaoIR_val > 0 ? (variacaoIR_val > 25 ? "Subida acentuada" : "Subida leve") : (historicoIsolamento.length > 0 ? calcularTendencia(isolamento, lastIR_val).texto : "Estavel"),
    tendenciaCor: variacaoIR_val > 0 ? "#2563eb" : (historicoIsolamento.length > 0 ? calcularTendencia(isolamento, lastIR_val).cor : "#16a34a"),
    tendenciaDiagnostico: status === 'PRIMEIRA MEDIÇÃO' ? "Aguardando historico para gerar analise de tendencia." : `Variacao de ${variacaoIR_val.toFixed(1)}% em relacao ao ponto anterior.`
  };
}
