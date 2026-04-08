
export type MotorStatus = 'Normal' | 'Atenção' | 'Crítico';
export type MotorTrend = 'Crescente' | 'Estável' | 'Decrescente';

export interface MotorAnalysisInput {
  isolamento: number;
  ohmica: number;
  ip: number;
  ia: number;
  historicoIsolamento: number[];
  historicoOhmica?: number[];
}

export interface MotorAnalysisResult {
  status: MotorStatus;
  tendencia: MotorTrend;
  recomendacao: string;
}

/**
 * Analisa a condição do motor com base em medições técnicas.
 * @param input Dados de medição e histórico.
 * @returns Status, tendência e recomendação técnica.
 */
export function analyzeMotorCondition(input: MotorAnalysisInput): MotorAnalysisResult {
  const { isolamento, ohmica, ip, ia, historicoIsolamento, historicoOhmica } = input;

  // 1. Analisar Tendência (baseado no último valor do histórico)
  let tendencia: MotorTrend = 'Estável';
  if (historicoIsolamento && historicoIsolamento.length > 0) {
    const lastValue = historicoIsolamento[0]; // Assume-se que o histórico está ordenado do mais recente para o mais antigo
    
    const diffPercent = (isolamento - lastValue) / lastValue;
    
    if (diffPercent > 0.02) { // Aumento de mais de 2%
      tendencia = 'Crescente';
    } else if (diffPercent < -0.02) { // Queda de mais de 2%
      tendencia = 'Decrescente';
    } else {
      tendencia = 'Estável';
    }
  }

  // 2. Determinar Status com base nas regras de decisão
  let status: MotorStatus = 'Normal';

  // Regras para CRÍTICO
  const isCriticalIP = ip < 1.0;
  const isCriticalIA = ia < 1.0;
  const isSharpDrop = historicoIsolamento.length > 0 && isolamento < (historicoIsolamento[0] * 0.5); // Queda > 50%
  const isVeryLowInsulation = isolamento < 2.0; // Valor de referência técnica comum para criticidade imediata

  if (isCriticalIP || isCriticalIA || isSharpDrop || isVeryLowInsulation) {
    status = 'Crítico';
  } else {
    // Regras para ATENÇÃO
    const isAttentionIP = ip >= 1.0 && ip <= 1.5;
    const isAttentionIA = ia >= 1.0 && ia <= 1.25;
    const isGradualDrop = tendencia === 'Decrescente';

    if (isAttentionIP || isAttentionIA || isGradualDrop) {
      status = 'Atenção';
    }
  }

  // 3. Gerar Recomendação Técnica
  let recomendacao = '';
  switch (status) {
    case 'Crítico':
      recomendacao = "Tendência de degradação acentuada do isolamento. Recomenda-se retirada imediata de operação, realização de testes complementares (PI/DAR) e avaliação para secagem ou recondicionamento.";
      break;
    case 'Atenção':
      recomendacao = "Queda gradual detectada na resistência de isolamento. Recomenda-se inspeção, limpeza e aumento da frequência de monitoramento.";
      break;
    case 'Normal':
      recomendacao = "Equipamento operando dentro dos padrões. Manter plano de manutenção preventiva.";
      break;
  }

  // Recomendação opcional para resistência ôhmica
  if (historicoOhmica && historicoOhmica.length > 0) {
    const lastOhmic = historicoOhmica[0];
    // Se a resistência ôhmica aumentou significativamente (ex: > 5%)
    if (ohmica > lastOhmic * 1.05) {
      recomendacao += " NOTA: Aumento na resistência ôhmica detectado, possível mau contato ou conexão frouxa.";
    }
  }

  return {
    status,
    tendencia,
    recomendacao
  };
}
