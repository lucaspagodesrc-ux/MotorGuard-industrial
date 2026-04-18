import React, { useState, useMemo } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Activity } from 'lucide-react';

interface InsulationTestCardProps {
  onIaChange?: (val: number | null) => void;
  onIpChange?: (val: number | null) => void;
}

export default function InsulationTestCard({ onIaChange, onIpChange }: InsulationTestCardProps) {
  const [r30s, setR30s] = useState<string>('');
  const [r60s, setR60s] = useState<string>('');
  const [r1min, setR1min] = useState<string>('');
  const [r10min, setR10min] = useState<string>('');

  const clearFields = () => {
    setR30s('');
    setR60s('');
    setR1min('');
    setR10min('');
    onIaChange?.(null);
    onIpChange?.(null);
  };

  const ia = useMemo(() => {
    const r30 = parseFloat(r30s);
    const r60 = parseFloat(r60s);
    if (!isNaN(r30) && !isNaN(r60) && r30 > 0) {
      return parseFloat((r60 / r30).toFixed(2));
    }
    return null;
  }, [r30s, r60s]);

  const ip = useMemo(() => {
    const r1 = parseFloat(r1min);
    const r10 = parseFloat(r10min);
    if (!isNaN(r1) && !isNaN(r10) && r1 > 0) {
      return parseFloat((r10 / r1).toFixed(2));
    }
    return null;
  }, [r1min, r10min]);

  React.useEffect(() => {
    onIaChange?.(ia);
  }, [ia, onIaChange]);

  React.useEffect(() => {
    onIpChange?.(ip);
  }, [ip, onIpChange]);

  const iaStatus = useMemo(() => {
    if (ia === null) return null;
    if (ia < 1.0) return { label: 'Ruim', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (ia < 1.4) return { label: 'Questionável', color: 'text-yellow-600', bg: 'bg-yellow-500/10' };
    return { label: 'Bom', color: 'text-green-600', bg: 'bg-green-500/10' };
  }, [ia]);

  const ipStatus = useMemo(() => {
    if (ip === null) return null;
    if (ip < 1.0) return { label: 'Ruim', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (ip < 2.0) return { label: 'Duvidoso', color: 'text-yellow-600', bg: 'bg-yellow-500/10' };
    if (ip < 4.0) return { label: 'Bom', color: 'text-green-600', bg: 'bg-green-500/10' };
    return { label: 'Excelente', color: 'text-green-700', bg: 'bg-green-600/10' };
  }, [ip]);

  const generalCondition = useMemo(() => {
    if (iaStatus === null || ipStatus === null) return null;
    if (iaStatus.label === 'Ruim' || ipStatus.label === 'Ruim') {
      return { label: 'Crítico', color: 'bg-red-500', icon: XCircle };
    }
    if (iaStatus.label === 'Questionável' || ipStatus.label === 'Duvidoso') {
      return { label: 'Atenção', color: 'bg-yellow-500', icon: AlertTriangle };
    }
    return { label: 'Adequado', color: 'bg-green-500', icon: CheckCircle2 };
  }, [iaStatus, ipStatus]);

  const validateValue = (val: string) => {
    if (val && parseFloat(val) < 0) return 'Valor não pode ser negativo';
    return null;
  };

  const inconsistencies = useMemo(() => {
    const errors: string[] = [];
    const r30 = parseFloat(r30s);
    const r60 = parseFloat(r60s);
    const r1 = parseFloat(r1min);
    const r10 = parseFloat(r10min);

    if (!isNaN(r30) && !isNaN(r60) && r60 < r30) {
      errors.push('R60s é menor que R30s (IA < 1.0)');
    }
    if (!isNaN(r1) && !isNaN(r10) && r10 < r1) {
      errors.push('R10min é menor que R1min (IP < 1.0)');
    }
    return errors;
  }, [r30s, r60s, r1min, r10min]);

  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/5 flex items-center justify-center">
            <Activity className="text-primary w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-on-surface">Teste de Isolamento do Motor</h3>
            <p className="text-xs text-on-surface-variant">Cálculo de IP, IA e Resistência Ôhmica</p>
          </div>
        </div>
        <button 
          onClick={clearFields}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/5 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Limpar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Inputs Section */}
        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-4 flex items-center gap-2">
              <div className="w-1 h-3 bg-primary rounded-full"></div>
              Resistência de Isolamento (MΩ)
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">R30s</label>
                <input 
                  type="number"
                  value={r30s}
                  onChange={(e) => setR30s(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">R60s</label>
                <input 
                  type="number"
                  value={r60s}
                  onChange={(e) => setR60s(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">R1min</label>
                <input 
                  type="number"
                  value={r1min}
                  onChange={(e) => setR1min(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">R10min</label>
                <input 
                  type="number"
                  value={r10min}
                  onChange={(e) => setR10min(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="0.0"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="bg-surface-container rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Índice de Absorção (IA)</p>
                <p className="text-3xl font-bold text-on-surface">{ia !== null ? ia : '---'}</p>
              </div>
              {iaStatus && (
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${iaStatus.bg} ${iaStatus.color}`}>
                  {iaStatus.label}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Índice de Polarização (IP)</p>
                <p className="text-3xl font-bold text-on-surface">{ip !== null ? ip : '---'}</p>
              </div>
              {ipStatus && (
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${ipStatus.bg} ${ipStatus.color}`}>
                  {ipStatus.label}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-outline-variant/20">
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Condição Geral do Motor</p>
            {generalCondition ? (
              <div className={`flex items-center gap-4 p-4 rounded-xl text-white ${generalCondition.color}`}>
                <generalCondition.icon className="w-8 h-8" />
                <div>
                  <p className="text-xl font-bold leading-tight">{generalCondition.label}</p>
                  <p className="text-[10px] opacity-80 uppercase tracking-widest font-bold">Baseado nos índices calculados</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-surface-container-high text-on-surface-variant">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-current opacity-30"></div>
                <div>
                  <p className="text-sm font-bold">Aguardando dados...</p>
                  <p className="text-[10px] uppercase tracking-widest">Preencha os campos para calcular</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {(parseFloat(r30s) < 0 || parseFloat(r60s) < 0 || parseFloat(r1min) < 0 || parseFloat(r10min) < 0) && (
        <div className="mt-4 p-3 bg-red-500/10 text-red-600 rounded-lg text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Aviso: Valores negativos detectados. Por favor, insira apenas valores positivos.
        </div>
      )}

      {inconsistencies.length > 0 && (
        <div className="mt-2 p-3 bg-yellow-500/10 text-yellow-700 rounded-lg text-xs font-bold flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Aviso de Inconsistência:</span>
          </div>
          <ul className="list-disc list-inside pl-6 opacity-80">
            {inconsistencies.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
