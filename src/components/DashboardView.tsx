import React, { useState, useEffect, useMemo } from 'react';
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

  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

  const generateClientPdf = async (data: any) => {
    // @ts-ignore
    if (!window.jspdf || !window.html2canvas) {
      console.error('PDF libraries not loaded');
      alert('Bibliotecas PDF não carregadas. Verifique sua conexão com a internet.');
      return;
    }

    // @ts-ignore
    const { jsPDF } = window.jspdf;
    // @ts-ignore
    const html2canvas = window.html2canvas;
    const doc = new jsPDF();

    // Header
    doc.setFillColor(0, 32, 69); // Dark blue
    doc.rect(0, 0, 210, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("Relatorio de Medicao", 105, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text("Monitoramento Tecnico de Motores Industriais", 105, 28, { align: 'center' });
    
    // Main Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Informacoes do Equipamento", 20, 50);
    doc.line(20, 52, 190, 52);
    
    doc.setFont("helvetica", "normal");
    doc.text(`Equipamento: ${data.equipment || 'N/A'}`, 20, 60);
    doc.text(`Data da Medicao: ${data.timestamp || 'N/A'}`, 20, 68);
    
    // Results
    doc.setFont("helvetica", "bold");
    doc.text("Resultados da Medicao", 20, 80);
    doc.line(20, 82, 190, 82);
    
    doc.setFont("helvetica", "bold");
    doc.text("Resistencia de Isolamento: ", 20, 90);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.isolation || 'N/A'} MOhms`, 75, 90);
    
    const avgOhmic = data.ohmicAB !== undefined && data.ohmicAC !== undefined && data.ohmicBC !== undefined
      ? ((data.ohmicAB + data.ohmicAC + data.ohmicBC) / 3).toFixed(1)
      : (data.ohmicAB || 'N/A');
    
    doc.setFont("helvetica", "bold");
    doc.text("Resistencia Ohmica (Media): ", 20, 98);
    doc.setFont("helvetica", "normal");
    doc.text(`${avgOhmic} uOhms`, 75, 98);
    
    if (data.ia) {
      doc.setFont("helvetica", "bold");
      doc.text("Indice de Absorcao (IA): ", 20, 106);
      doc.setFont("helvetica", "normal");
      doc.text(`${data.ia}`, 75, 106);
    }
    if (data.ip) {
      doc.setFont("helvetica", "bold");
      doc.text("Indice de Polarizacao (IP): ", 20, 114);
      doc.setFont("helvetica", "normal");
      doc.text(`${data.ip}`, 75, 114);
    }

    // Diagnosis
    doc.setFont("helvetica", "bold");
    doc.text("Diagnostico e Recomendacoes", 20, 128);
    doc.line(20, 130, 190, 130);
    
    doc.setFont("helvetica", "bold");
    doc.text("Status: ", 20, 138);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.status || 'N/A'}`, 40, 138);
    
    doc.setFont("helvetica", "bold");
    doc.text("Situacao: ", 20, 146);
    doc.setFont("helvetica", "normal");
    doc.text(`${data.tendencia || 'N/A'}`, 40, 146);
    
    const recommendation = data.recomendacao || 'N/A';
    const splitRecommendation = doc.splitTextToSize(`Recomendacao: ${recommendation}`, 170);
    doc.text(splitRecommendation, 20, 154);

    // Chart
    const chartElement = document.getElementById('trend-chart-container');
    if (chartElement) {
      try {
        const canvas = await html2canvas(chartElement, {
          backgroundColor: '#ffffff',
          scale: 2
        });
        const imgData = canvas.toDataURL('image/png');
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.text("Grafico de Tendencia de Isolamento", 105, 20, { align: 'center' });
        doc.addImage(imgData, 'PNG', 15, 30, 180, 90);
      } catch (err) {
        console.error("Erro ao capturar gráfico:", err);
      }
    }

    // History Table
    if (filteredLogs.length > 0) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.text("Historico Recente de Medicoes", 105, 20, { align: 'center' });
      
      doc.setFillColor(240, 242, 245);
      doc.rect(15, 30, 180, 10, 'F');
      doc.setFontSize(9);
      doc.text("Data", 20, 36);
      doc.text("Isolamento (MOhms)", 60, 36);
      doc.text("Ohmica (uOhms)", 110, 36);
      doc.text("Status", 160, 36);
      
      let yPos = 48;
      filteredLogs.slice(0, 15).forEach((log) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 30;
        }
        doc.setFont("helvetica", "normal");
        doc.text(log.timestamp.split(',')[0], 20, yPos);
        doc.text(log.isolation.toString(), 60, yPos);
        const logAvgOhmic = ((log.ohmicAB + log.ohmicAC + log.ohmicBC) / 3).toFixed(1);
        doc.text(logAvgOhmic, 110, yPos);
        doc.text(log.status, 160, yPos);
        doc.line(15, yPos + 2, 195, yPos + 2);
        yPos += 10;
      });
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Gerado em: ${new Date().toLocaleString()}`, 20, 285);
      doc.text(`Página ${i} de ${pageCount}`, 190, 285, { align: 'right' });
    }

    doc.save(`relatorio_${data.equipment || 'motor'}_${new Date().getTime()}.pdf`);
  };

  const handleGeneratePdf = async (docId: string, existingUrl?: string) => {
    if (existingUrl) {
      window.open(existingUrl, '_blank');
      return;
    }

    // Use client-side generation if the log is in memory
    const log = filteredLogs.find(l => l.id === docId);
    if (log) {
      await generateClientPdf(log);
      return;
    }

    setGeneratingPdfId(docId);
    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId }),
      });
      
      let result;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Erro no servidor: Resposta inesperada (${response.status})`);
      }

      if (result.success && result.url) {
        window.open(result.url, '_blank');
      } else {
        console.error("Failed to generate PDF:", result.error);
        alert(`Erro ao gerar PDF: ${result.error || 'Erro desconhecido'}`);
      }
    } catch (error) {
      console.error("Error calling PDF API:", error);
      alert(`Erro na chamada da API de PDF: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setGeneratingPdfId(null);
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

                  await generateClientPdf({
                    area: area,
                    equipment: equipment,
                    timestamp: dataVal,
                    isolation: isolamentoVal,
                    ohmicAB: parseFloat(ohmicAB) || 0,
                    ohmicAC: parseFloat(ohmicAC) || 0,
                    ohmicBC: parseFloat(ohmicBC) || 0,
                    ia: ia,
                    ip: ip,
                    status: analysis.status,
                    tendencia: analysis.tendencia,
                    recomendacao: analysis.recomendacao
                  });
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
                        handleGeneratePdf(log.id, log.pdfUrl);
                      }}
                      disabled={generatingPdfId === log.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        log.pdfUrl 
                          ? 'bg-primary/10 text-primary hover:bg-primary/20' 
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                      } ${generatingPdfId === log.id ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      <FileText size={14} className={generatingPdfId === log.id ? 'animate-pulse' : ''} />
                      {generatingPdfId === log.id ? 'Gerando...' : (log.pdfUrl ? 'Ver PDF' : 'Gerar PDF')}
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
      <div className="max-w-7xl mx-auto space-y-8">
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
