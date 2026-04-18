import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from "jspdf";
import { 
  PlusCircle, 
  Package, 
  Save, 
  Database, 
  BarChart3,
  X,
  Edit2,
  Trash2,
  Activity,
  FileText,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MaintenanceLog, Area, Equipment } from '../types';
import { db, auth } from '../firebase';
import InsulationTestCard from './InsulationTestCard';
import { analyzeMotorCondition } from '../services/motorAnalysisService';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  where,
  limit,
  Timestamp,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { View } from '../types';

interface DashboardViewProps {
  currentView: View;
}

export default function DashboardView({ currentView }: DashboardViewProps) {
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [area, setArea] = useState('');
  const [equipment, setEquipment] = useState('');
  const [isolation, setIsolation] = useState('');
  const [ohmicAB, setOhmicAB] = useState('');
  const [ohmicAC, setOhmicAC] = useState('');
  const [ohmicBC, setOhmicBC] = useState('');
  const [ia, setIa] = useState<number | null>(null);
  const [ip, setIp] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [testKey, setTestKey] = useState(0);

  // Set default area
  useEffect(() => {
    if (areas.length > 0 && !area) {
      setArea(areas[0].name);
    }
  }, [areas, area]);

  // Modal states
  const [showAreaModal, setShowAreaModal] = useState(false);
  const [showEquipModal, setShowEquipModal] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [editingEquip, setEditingEquip] = useState<Equipment | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipAreaId, setNewEquipAreaId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'area' | 'equip', id: string } | null>(null);

  // Fetch logs with real-time updates based on selected area and equipment
  useEffect(() => {
    if (!area || !equipment) {
      setLogs([]);
      return;
    }

    // Attempt dynamic query (requires composite index)
    const q = query(
      collection(db, 'measurements'),
      where('area', '==', area),
      where('equipment', '==', equipment),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    let unsubscribe: () => void;

    const startListening = (queryToUse: any, isFallback = false) => {
      return onSnapshot(queryToUse, (snapshot) => {
        const newLogs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: new Date(doc.data().timestamp).toLocaleString('pt-BR'),
        })) as MaintenanceLog[];
        
        if (isFallback) {
          // Filter in memory if we are using the fallback query
          setLogs(newLogs.filter(log => log.area === area && log.equipment === equipment));
        } else {
          setLogs(newLogs);
        }
      }, (error) => {
        if (error.code === 'failed-precondition' && !isFallback) {
          console.warn("Composite index missing. Falling back to client-side filtering.");
          const fallbackQ = query(collection(db, 'measurements'), orderBy('timestamp', 'desc'), limit(500));
          if (unsubscribe) unsubscribe();
          unsubscribe = startListening(fallbackQ, true);
        } else {
          handleFirestoreError(error, OperationType.LIST, 'measurements');
        }
      });
    };

    unsubscribe = startListening(q);
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [area, equipment]);

  // Fetch areas
  useEffect(() => {
    const q = query(collection(db, 'areas'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newAreas = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Area[];
      setAreas(newAreas);
      if (newAreas.length > 0 && !area) {
        setArea(newAreas[0].name);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'areas');
    });
    return () => unsubscribe();
  }, []);

  // Fetch equipments
  useEffect(() => {
    const q = query(collection(db, 'equipments'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newEquips = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Equipment[];
      setEquipments(newEquips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'equipments');
    });
    return () => unsubscribe();
  }, []);

  const filteredEquipments = useMemo(() => {
    const selectedArea = areas.find(a => a.name === area);
    if (!selectedArea) return [];
    return equipments.filter(e => e.areaId === selectedArea.id);
  }, [area, areas, equipments]);

  useEffect(() => {
    if (filteredEquipments.length > 0 && !filteredEquipments.find(e => e.name === equipment)) {
      setEquipment(filteredEquipments[0].name);
    }
  }, [filteredEquipments]);

  const gerarPDFProfissional = (logData: any = null) => {
    try {
      const pdf = new jsPDF();
      
      const normalizeText = (text: string) => {
        return text
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/µ/g, "Micro")
          .replace(/Ω/g, "Ohm");
      };

      // Fallback to current state if no specific log data provided
      const reportData = logData || {
        area: area,
        equipment: equipment,
        isolation: parseFloat(isolation) || 0,
        ohmicAB: parseFloat(ohmicAB) || 0,
        ohmicAC: parseFloat(ohmicAC) || 0,
        ohmicBC: parseFloat(ohmicBC) || 0,
        timestamp: (document.getElementById('input-data') as HTMLInputElement)?.value || new Date().toLocaleString(),
        operator: auth.currentUser?.displayName || 'Operador do Sistema'
      };

      const avgOhmic = ((reportData.ohmicAB || 0) + (reportData.ohmicAC || 0) + (reportData.ohmicBC || 0)) / 3;

      // Logic Analysis
      let statusString = "NORMAL";
      let statusColor = [0, 128, 0]; // Green
      if (reportData.isolation < 100) {
        statusString = "CRITICO";
        statusColor = [255, 0, 0]; // Red
      } else if (reportData.isolation <= 500) {
        statusString = "ATENCAO";
        statusColor = [255, 165, 0]; // Orange
      }

      let y = 20;

      // CABEÇALHO
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(0, 32, 69); // Dark blue
      pdf.text(normalizeText("RELATORIO TECNICO DE MANUTENCAO"), 105, y, { align: "center" });
      
      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text("MotorGuard Industrial Monitoring System", 10, y);
      pdf.text(normalizeText(`Gerado em: ${new Date().toLocaleString()}`), 200, y, { align: "right" });

      y += 5;
      pdf.setDrawColor(0, 32, 69);
      pdf.setLineWidth(0.5);
      pdf.line(10, y, 200, y);

      // DADOS DO EQUIPAMENTO
      y += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(0, 32, 69);
      pdf.text(normalizeText("DADOS DO EQUIPAMENTO"), 10, y);
      
      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(0, 0, 0);
      pdf.text(normalizeText(`Area Operacional: ${reportData.area}`), 15, y);
      y += 7;
      pdf.text(normalizeText(`Equipamento: ${reportData.equipment}`), 15, y);

      // MEDIÇÕES
      y += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 32, 69);
      pdf.text(normalizeText("MEDICOES TECNICAS"), 10, y);
      
      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 0, 0);
      pdf.text(normalizeText(`Resistencia de Isolamento: ${reportData.isolation} MegaOhm`), 15, y);
      y += 7;
      pdf.text(normalizeText(`Resistencia Ohmica (Media): ${avgOhmic.toFixed(2)} MicroOhm`), 15, y);
      y += 7;
      pdf.text(normalizeText(`Data do Registro: ${reportData.timestamp}`), 15, y);

      // ANÁLISE AUTOMÁTICA
      y += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 32, 69);
      pdf.text(normalizeText("ANALISE DE INTEGRIDADE"), 10, y);
      
      y += 10;
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
      pdf.text(normalizeText(`STATUS DO MOTOR: ${statusString}`), 15, y);
      pdf.setTextColor(0, 0, 0);

      // RECOMENDAÇÕES
      y += 15;
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0, 32, 69);
      pdf.text(normalizeText("RECOMENDACOES TECNICAS"), 10, y);
      
      y += 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.setTextColor(50, 50, 50);
      
      if (statusString === "CRITICO") {
        pdf.text(normalizeText("- Inspecionar isolamento imediatamente"), 15, y); y += 6;
        pdf.text(normalizeText("- Verificar sinais de umidade ou contaminacao excessiva"), 15, y); y += 6;
        pdf.text(normalizeText("- Programar manutencao corretiva de carater emergencial"), 15, y); y += 6;
      } else if (statusString === "ATENCAO") {
        pdf.text(normalizeText("- Monitorar tendencia de isolamento nas proximas medicoes"), 15, y); y += 6;
        pdf.text(normalizeText("- Planejar limpeza tecnica e secagem dos enrolamentos"), 15, y); y += 6;
        pdf.text(normalizeText("- Antecipar ciclo de manutencao preventiva"), 15, y); y += 6;
      } else {
        pdf.text(normalizeText("- Manter plano de monitoramento e manutencao preventiva padrao"), 15, y); y += 6;
        pdf.text(normalizeText("- Realizar nova inspecao conforme cronograma operacional"), 15, y); y += 6;
      }

      // Adição do Gráfico de Tendência (se existir um canvas na página)
      const chartCanvas = document.querySelector("canvas");
      if (chartCanvas) {
        try {
          const chartImage = chartCanvas.toDataURL("image/png");
          pdf.addPage();
          y = 20;
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(14);
          pdf.setTextColor(0, 32, 69);
          pdf.text(normalizeText("GRAFICO DE TENDENCIA"), 10, y);
          y += 10;
          pdf.addImage(chartImage, "PNG", 10, y, 190, 90);
        } catch (chartErr) {
          console.error("Erro ao incluir gráfico no PDF:", chartErr);
        }
      }

      // RODAPÉ (na última página)
      y = 280;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.1);
      pdf.line(10, y, 200, y);
      y += 5;
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);
      pdf.text(normalizeText("Este documento e um relatorio tecnico automatizado gerado pela plataforma MotorGuard Industrial."), 105, y, { align: "center" });
      y += 4;
      pdf.text(normalizeText(`Responsavel Tecnico: ${reportData.operator}`), 105, y, { align: "center" });

      pdf.save(`relatorio_${reportData.equipment.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`);

    } catch (error) {
      console.error("Erro ao gerar relatório PDF profissional:", error);
      alert("Houve um problema ao processar o relatório técnico.");
    }
  };

  const filteredLogs = useMemo(() => {
    // If the query is already filtered by Firestore, we just return logs
    // But we keep this for safety and in case the fallback is used
    return logs.filter(log => log.area === area && log.equipment === equipment);
  }, [logs, area, equipment]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isolation || !ohmicAB || !ohmicAC || !ohmicBC) return;

    setLoading(true);
    try {
      // Capture IP address
      let userIp = 'Indisponível';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        userIp = ipData.ip;
      } catch (ipErr) {
        console.error('Failed to capture IP:', ipErr);
      }

      const currentIsolation = parseFloat(isolation);
      const currentOhmicAB = parseFloat(ohmicAB);
      const currentOhmicAC = parseFloat(ohmicAC);
      const currentOhmicBC = parseFloat(ohmicBC);
      const avgOhmic = (currentOhmicAB + currentOhmicAC + currentOhmicBC) / 3;

      // Get history for analysis
      const historyIsolamento = filteredLogs.map(l => l.isolation);
      const historyOhmica = filteredLogs.map(l => (l.ohmicAB + l.ohmicAC + l.ohmicBC) / 3);

      const analysis = analyzeMotorCondition({
        isolamento: currentIsolation,
        ohmica: avgOhmic,
        ip: ip || 0,
        ia: ia || 0,
        historicoIsolamento: historyIsolamento,
        historicoOhmica: historyOhmica
      });

      const newMeasurement = {
        area,
        equipment,
        timestamp: new Date().toISOString(),
        isolation: currentIsolation,
        ohmicAB: currentOhmicAB,
        ohmicAC: currentOhmicAC,
        ohmicBC: currentOhmicBC,
        ...(ia !== null && { ia }),
        ...(ip !== null && { ip }),
        status: analysis.status,
        tendencia: analysis.tendencia,
        recomendacao: analysis.recomendacao,
        operator: auth.currentUser?.displayName || 'Operador',
        uid: auth.currentUser?.uid,
        userIp // Adding IP to the document
      };

      await addDoc(collection(db, 'measurements'), newMeasurement);

      setIsolation('');
      setOhmicAB('');
      setOhmicAC('');
      setOhmicBC('');
      setIa(null);
      setIp(null);
      setTestKey(prev => prev + 1);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'measurements');
    } finally {
      setLoading(false);
    }
  };

  const handleAreaCRUD = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName) return;
    try {
      if (editingArea) {
        await updateDoc(doc(db, 'areas', editingArea.id), { name: newAreaName });
      } else {
        await addDoc(collection(db, 'areas'), { name: newAreaName, uid: auth.currentUser?.uid });
      }
      setNewAreaName('');
      setEditingArea(null);
      setShowAreaModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'areas');
    }
  };

  const handleDeleteArea = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'areas', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'areas');
    }
  };

  const handleEquipCRUD = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEquipName || !newEquipAreaId) return;
    try {
      if (editingEquip) {
        await updateDoc(doc(db, 'equipments', editingEquip.id), { name: newEquipName, areaId: newEquipAreaId });
      } else {
        await addDoc(collection(db, 'equipments'), { 
          name: newEquipName, 
          areaId: newEquipAreaId, 
          uid: auth.currentUser?.uid 
        });
      }
      setNewEquipName('');
      setNewEquipAreaId('');
      setEditingEquip(null);
      setShowEquipModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'equipments');
    }
  };

  const handleDeleteEquip = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'equipments', id));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'equipments');
    }
  };

  // Trend detection logic
  const trend = useMemo(() => {
    if (filteredLogs.length < 2) return { status: 'Estável', color: 'bg-green-400', level: 100 };
    
    const latest = filteredLogs[0].isolation;
    const previous = filteredLogs[1].isolation;
    
    if (latest < previous * 0.9) {
      return { status: 'Atenção: Queda Detectada', color: 'bg-red-500', level: (latest / previous * 100).toFixed(1) };
    }
    return { status: 'Operação Estável', color: 'bg-green-400', level: 98.4 };
  }, [filteredLogs]);

  // Chart data
  const chartData = useMemo(() => {
    const sorted = [...filteredLogs].reverse();
    return {
      labels: sorted.map(l => l.timestamp.split(' ')[0]),
      datasets: [
        {
          label: 'Isolamento (mΩ)',
          data: sorted.map(l => l.isolation),
          borderColor: '#002045',
          backgroundColor: 'rgba(0, 32, 69, 0.1)',
          fill: true,
          tension: 0.4,
        },
        {
          label: 'Ôhmica AB (µΩ)',
          data: sorted.map(l => l.ohmicAB || 0),
          borderColor: '#86a0cd',
          borderDash: [5, 5],
          tension: 0.4,
        },
        {
          label: 'Ôhmica AC (µΩ)',
          data: sorted.map(l => l.ohmicAC || 0),
          borderColor: '#a3b8e0',
          borderDash: [5, 5],
          tension: 0.4,
        },
        {
          label: 'Ôhmica BC (µΩ)',
          data: sorted.map(l => l.ohmicBC || 0),
          borderColor: '#c0d0f3',
          borderDash: [5, 5],
          tension: 0.4,
        }
      ]
    };
  }, [filteredLogs]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: { grid: { color: '#e5e9eb' } },
      x: { grid: { display: false } }
    }
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Header Actions Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">Manutenção de Motores</h2>
          <p className="text-on-surface-variant text-sm">Dashboard Principal de Monitoramento Técnico</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => setShowAreaModal(true)}
            className="flex items-center gap-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95"
          >
            <PlusCircle className="w-5 h-5" />
            Áreas
          </button>
          <button 
            onClick={() => setShowEquipModal(true)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-all active:scale-95 shadow-md"
          >
            <Package className="w-5 h-5" />
            Equipamentos
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selection Card */}
        <div className="bg-surface-container-low rounded-2xl border border-surface-container-high p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Database className="text-primary w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface">Configuração</h3>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Área</label>
              <select 
                id="select-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all mb-4"
              >
                {areas.map(a => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Equipamento</label>
              <select 
                id="select-equipamento"
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
              >
                {filteredEquipments.map(e => (
                  <option key={e.id} value={e.name}>{e.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Trend Card */}
        <div className="lg:col-span-2 bg-surface-container-low rounded-2xl border border-surface-container-high p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="text-primary w-5 h-5" />
              </div>
              <h3 className="font-bold text-on-surface">Tendência de Isolamento</h3>
            </div>
          </div>
          
          <div id="trend-chart-container" className="h-48">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Diagnosis Section */}
      {filteredLogs.length > 0 && (
        <div className="bg-surface-container-low rounded-2xl border border-surface-container-high p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="text-primary w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface">Diagnóstico Automático</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status Atual</p>
              <div className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${
                  filteredLogs[0].status === 'Crítico' ? 'bg-red-500' : 
                  filteredLogs[0].status === 'Atenção' ? 'bg-yellow-500' : 'bg-green-500'
                }`}></div>
                <span className="text-lg font-bold text-on-surface">{filteredLogs[0].status || 'Normal'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Tendência</p>
              <span className="text-lg font-bold text-on-surface">{filteredLogs[0].tendencia || 'Estável'}</span>
            </div>
            <div className="md:col-span-3 bg-surface-container-high p-4 rounded-xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Recomendação Técnica</p>
              <p className="text-sm text-on-surface leading-relaxed">
                {filteredLogs[0].recomendacao || 'Equipamento operando dentro dos padrões. Manter plano de manutenção preventiva.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-surface-container-low rounded-2xl border border-surface-container-high p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Save className="text-primary w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface">Nova Medição</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Data da Medição</label>
                <input 
                  id="input-data"
                  type="date" 
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Isolamento (mΩ)</label>
                <input 
                  id="input-isolamento"
                  type="number" 
                  step="0.1"
                  value={isolation}
                  onChange={(e) => setIsolation(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Ôhmica AB (µΩ)</label>
                <input 
                  id="input-ohmica"
                  type="number" 
                  step="0.1"
                  value={ohmicAB}
                  onChange={(e) => setOhmicAB(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Ôhmica AC (µΩ)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={ohmicAC}
                  onChange={(e) => setOhmicAC(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
                  placeholder="0.0"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">Ôhmica BC (µΩ)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={ohmicBC}
                  onChange={(e) => setOhmicBC(e.target.value)}
                  className="w-full bg-surface-container-high border-none rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-primary transition-all"
                  placeholder="0.0"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-primary/90 transition-all active:scale-[0.98] shadow-lg disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Registrar Medição'}
              </button>
              <button 
                type="button"
                onClick={async () => {
                  const dataVal = (document.getElementById('input-data') as HTMLInputElement)?.value || new Date().toISOString().split('T')[0];
                  const isolamentoVal = parseFloat(isolation) || 0;
                  const ohmicaVal = parseFloat(ohmicAB) || 0;
                  
                  // Calculate analysis for the PDF
                  const historyIsolamento = filteredLogs.map(l => l.isolation);
                  const historyOhmica = filteredLogs.map(l => (l.ohmicAB + l.ohmicAC + l.ohmicBC) / 3);
                  
                  const analysis = analyzeMotorCondition({
                    isolamento: isolamentoVal,
                    ohmica: ohmicaVal,
                    ip: ip || 0,
                    ia: ia || 0,
                    historicoIsolamento: historyIsolamento,
                    historicoOhmica: historyOhmica
                  });

                  gerarPDFProfissional();
                }}
                className="flex items-center justify-center gap-2 px-6 bg-surface-container-highest text-on-surface py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-surface-container-highest/80 transition-all active:scale-[0.98] shadow-md"
              >
                <FileText className="w-5 h-5" />
                Gerar PDF
              </button>
            </div>
          </form>
        </div>

        <div key={testKey}>
          <InsulationTestCard onIaChange={setIa} onIpChange={setIp} />
        </div>
      </div>

      {/* History Table */}
      <div className="bg-surface-container-low rounded-2xl border border-surface-container-high shadow-sm overflow-hidden">
        <div className="p-6 border-b border-surface-container-high flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Activity className="text-primary w-5 h-5" />
            </div>
            <h3 className="font-bold text-on-surface">Histórico Recente</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-400">Filtrar por:</span>
            <div className="bg-surface-container-high px-3 py-1 rounded text-xs font-bold cursor-pointer hover:bg-surface-container-highest transition-colors">Todas as Áreas</div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low">
              <tr>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Data/Hora</th>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Equipamento</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">Isolamento (mΩ)</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">AB (µΩ)</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">AC (µΩ)</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">BC (µΩ)</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">IA</th>
                <th className="px-8 py-4 text-[10px] font-bold tracking-widest text-on-surface-variant">IP</th>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Operador</th>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Status</th>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Tendência</th>
                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Relatório</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-high">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-bright transition-colors cursor-pointer">
                  <td className="px-8 py-4 text-sm font-medium">{log.timestamp}</td>
                  <td className="px-8 py-4 text-sm font-bold text-primary">{log.equipment}</td>
                  <td className="px-8 py-4 text-sm font-mono">{(log.isolation || 0).toFixed(1)}</td>
                  <td className="px-8 py-4 text-sm font-mono">{(log.ohmicAB || 0).toFixed(1)}</td>
                  <td className="px-8 py-4 text-sm font-mono">{(log.ohmicAC || 0).toFixed(1)}</td>
                  <td className="px-8 py-4 text-sm font-mono">{(log.ohmicBC || 0).toFixed(1)}</td>
                  <td className="px-8 py-4 text-sm font-mono">{log.ia ? log.ia.toFixed(2) : '---'}</td>
                  <td className="px-8 py-4 text-sm font-mono">{log.ip ? log.ip.toFixed(2) : '---'}</td>
                  <td className="px-8 py-4 text-sm">{log.operator}</td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        log.status === 'Crítico' ? 'bg-red-500' : 
                        log.status === 'Atenção' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}></div>
                      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                        {log.status || 'Normal'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <span className="text-xs font-medium text-on-surface-variant">{log.tendencia || 'Estável'}</span>
                  </td>
                  <td className="px-8 py-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        gerarPDFProfissional(log);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        log.pdfUrl 
                          ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                      }`}
                    >
                      <FileText size={14} />
                      {log.pdfUrl ? 'Ver PDF' : 'Gerar PDF'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-surface-container-low flex justify-center border-t border-surface-container-high">
          <button className="text-primary text-xs font-bold uppercase tracking-widest hover:underline transition-all">Ver Histórico Completo</button>
        </div>
      </div>
    </div>
  );

  const renderMotorHealth = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">Saúde do Motor</h2>
          <p className="text-on-surface-variant text-sm">Análise detalhada de integridade e performance</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Temperatura', value: '72°C', status: 'Normal', color: 'text-green-500' },
          { label: 'Vibração', value: '2.4 mm/s', status: 'Normal', color: 'text-green-500' },
          { label: 'Corrente', value: '45.2 A', status: 'Atenção', color: 'text-yellow-500' },
          { label: 'Eficiência', value: '94.1%', status: 'Excelente', color: 'text-blue-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface-container-low p-6 rounded-2xl border border-surface-container-high shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">{stat.label}</p>
            <p className="text-2xl font-bold text-on-surface mb-1">{stat.value}</p>
            <p className={`text-xs font-bold ${stat.color}`}>{stat.status}</p>
          </div>
        ))}
      </div>
      <div className="bg-surface-container-low p-8 rounded-2xl border border-surface-container-high shadow-sm">
        <h3 className="font-bold text-on-surface mb-4">Diagnóstico de IA</h3>
        <p className="text-on-surface-variant text-sm leading-relaxed">
          O sistema de inteligência artificial detectou um padrão de desgaste leve nos rolamentos do motor MTR-04. 
          Recomenda-se inspeção visual na próxima parada programada. A probabilidade de falha nos próximos 30 dias é de 4.2%.
        </p>
      </div>
    </div>
  );

  const renderPrevention = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">Tarefas Preventivas</h2>
          <p className="text-on-surface-variant text-sm">Cronograma de manutenção e ações preventivas</p>
        </div>
      </div>
      <div className="space-y-4">
        {[
          { task: 'Lubrificação de Rolamentos', date: '05/04/2026', priority: 'Alta', status: 'Pendente' },
          { task: 'Limpeza de Filtros de Ar', date: '08/04/2026', priority: 'Média', status: 'Agendado' },
          { task: 'Inspeção de Termografia', date: '12/04/2026', priority: 'Baixa', status: 'Agendado' },
        ].map((item, i) => (
          <div key={i} className="bg-surface-container-low p-4 rounded-xl border border-surface-container-high flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-2 h-2 rounded-full ${item.priority === 'Alta' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
              <div>
                <p className="font-bold text-on-surface text-sm">{item.task}</p>
                <p className="text-xs text-on-surface-variant">Data Limite: {item.date}</p>
              </div>
            </div>
            <button className="text-primary text-xs font-bold uppercase tracking-widest px-4 py-2 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors">
              Concluir
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">Relatórios e BI</h2>
          <p className="text-on-surface-variant text-sm">Geração de relatórios técnicos e análise de dados</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container-low p-6 rounded-2xl border border-surface-container-high shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">Relatório Mensal de Disponibilidade</h3>
          <div className="h-40 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant text-xs italic">
            [Gráfico de Disponibilidade]
          </div>
          <button className="w-full mt-4 bg-primary text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md">
            Exportar PDF
          </button>
        </div>
        <div className="bg-surface-container-low p-6 rounded-2xl border border-surface-container-high shadow-sm">
          <h3 className="font-bold text-on-surface mb-4">Consumo Energético por Setor</h3>
          <div className="h-40 bg-surface-container-high rounded-xl flex items-center justify-center text-on-surface-variant text-xs italic">
            [Gráfico de Consumo]
          </div>
          <button className="w-full mt-4 bg-primary text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest shadow-md">
            Exportar CSV
          </button>
        </div>
      </div>
    </div>
  );

  const renderLogs = () => (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-on-surface tracking-tight">Logs do Sistema</h2>
          <p className="text-on-surface-variant text-sm">Rastreabilidade de ações e eventos técnicos</p>
        </div>
      </div>
      <div className="bg-surface-container-low rounded-2xl border border-surface-container-high shadow-sm overflow-hidden">
        <div className="divide-y divide-surface-container-high">
          {[
            { event: 'Login de Usuário', user: 'lucaspagodesrc@gmail.com', time: '15:28:24', details: 'Acesso via Web App' },
            { event: 'Nova Medição Registrada', user: 'Operador', time: '15:20:10', details: 'Equipamento MTR-04' },
            { event: 'Área Criada', user: 'Admin', time: '14:45:00', details: 'Nova área: Setor de Embalagem' },
          ].map((log, i) => (
            <div key={i} className="p-4 flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-on-surface-variant">{log.time}</span>
                <div>
                  <p className="font-bold text-on-surface">{log.event}</p>
                  <p className="text-xs text-on-surface-variant">{log.details}</p>
                </div>
              </div>
              <span className="text-xs font-medium text-primary">{log.user}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentView) {
      case 'overview': return renderOverview();
      case 'motor-health': return renderMotorHealth();
      case 'prevention': return renderPrevention();
      case 'reports': return renderReports();
      case 'logs': return renderLogs();
      default: return renderOverview();
    }
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-surface">
      <div id="relatorio" className="max-w-7xl mx-auto space-y-8 p-4 bg-surface">
        {renderContent()}

      </div>

      {/* Area Management Modal */}
      <AnimatePresence>
        {showAreaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between bg-primary text-white">
                <h3 className="font-bold">Gerenciar Áreas</h3>
                <button onClick={() => { setShowAreaModal(false); setEditingArea(null); setNewAreaName(''); }} className="hover:bg-white/10 p-1 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <form onSubmit={handleAreaCRUD} className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Nome da nova área" 
                    className="flex-1 bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                  />
                  <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold">
                    {editingArea ? 'Atualizar' : 'Adicionar'}
                  </button>
                </form>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {areas.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg group">
                      <span className="text-sm font-medium">{a.name}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => { setEditingArea(a); setNewAreaName(a.name); }}
                          className="p-1.5 hover:bg-primary/10 text-primary rounded transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirm({ type: 'area', id: a.id })}
                          className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Equipment Management Modal */}
      <AnimatePresence>
        {showEquipModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-outline-variant/10 flex items-center justify-between bg-primary text-white">
                <h3 className="font-bold">Gerenciar Equipamentos</h3>
                <button onClick={() => { setShowEquipModal(false); setEditingEquip(null); setNewEquipName(''); setNewEquipAreaId(''); }} className="hover:bg-white/10 p-1 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <form onSubmit={handleEquipCRUD} className="space-y-3">
                  <select 
                    className="w-full bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
                    value={newEquipAreaId}
                    onChange={(e) => setNewEquipAreaId(e.target.value)}
                    required
                  >
                    <option value="" disabled>Selecione a área</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Nome do equipamento" 
                      className="flex-1 bg-surface-container-high border-none rounded-lg text-sm focus:ring-2 focus:ring-primary/20"
                      value={newEquipName}
                      onChange={(e) => setNewEquipName(e.target.value)}
                      required
                    />
                    <button type="submit" className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-bold">
                      {editingEquip ? 'Atualizar' : 'Adicionar'}
                    </button>
                  </div>
                </form>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                  {equipments.map(e => {
                    const areaName = areas.find(a => a.id === e.areaId)?.name || 'Sem Área';
                    return (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg group">
                        <div>
                          <p className="text-sm font-bold">{e.name}</p>
                          <p className="text-[10px] uppercase tracking-widest text-slate-500">{areaName}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => { setEditingEquip(e); setNewEquipName(e.name); setNewEquipAreaId(e.areaId); }}
                            className="p-1.5 hover:bg-primary/10 text-primary rounded transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setDeleteConfirm({ type: 'equip', id: e.id })}
                            className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container-lowest w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold mb-2">Confirmar Exclusão</h3>
              <p className="text-sm text-on-surface-variant mb-6">
                Tem certeza que deseja excluir este {deleteConfirm.type === 'area' ? 'setor' : 'equipamento'}? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2 bg-surface-container-high rounded-lg text-sm font-bold hover:bg-surface-container-highest transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => deleteConfirm.type === 'area' ? handleDeleteArea(deleteConfirm.id) : handleDeleteEquip(deleteConfirm.id)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </main>
  );
}
