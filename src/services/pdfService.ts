import PDFDocument from 'pdfkit';
import axios from 'axios';
import * as admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import { readFileSync } from 'fs';

// Load Firebase configuration manually
let firebaseConfig: any;
try {
  const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
  firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, "utf-8"));
} catch (error) {
  console.error("Error loading firebase-applet-config.json in pdfService:", error);
  firebaseConfig = {};
}

export async function generateAndUploadPdf(measurement: any, docId: string) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: any[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(chunks);
        const fileName = `relatorio_${measurement.equipment.replace(/\s+/g, '_')}_${new Date(measurement.timestamp).getTime()}.pdf`;
        
        try {
          const bucket = getStorage().bucket("gen-lang-client-0024013062.firebasestorage.app");
          const file = bucket.file(`reports/${fileName}`);
          
          await file.save(pdfBuffer, {
            metadata: { contentType: 'application/pdf' },
            public: true,
          });

          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
          
          // Update Firestore
          const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
          await db.collection("measurements").doc(docId).update({ pdfUrl: publicUrl });

          console.log(`PDF generated and uploaded: ${publicUrl}`);
          resolve(publicUrl);
        } catch (error) {
          console.error("Error uploading PDF:", error);
          reject(error);
        }
      });

      // --- PDF CONTENT ---
      const primaryColor = '#002045';
      const secondaryColor = '#666666';
      const accentColor = measurement.cor || '#16a34a';

      // Header
      doc.rect(0, 0, 612, 100).fill(primaryColor);
      doc.fillColor('white')
         .fontSize(20)
         .text('Relatório de Medição - Motor Industrial', 50, 35)
         .fontSize(10)
         .text('Sistema de Monitoramento de Condição', 50, 60);
      
      doc.fontSize(8)
         .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 450, 40, { align: 'right' });

      doc.moveDown(5);

      // Section: Measurement Data
      doc.fillColor(primaryColor).fontSize(14).text('Dados da Medição', 50, 120);
      doc.moveTo(50, 140).lineTo(562, 140).stroke(primaryColor);

      doc.moveDown(1);
      doc.fillColor('black').fontSize(10);
      
      const dataY = 155;
      const col1 = 50;
      const col2 = 300;

      doc.text('Área:', col1, dataY).text(measurement.area, col1 + 100, dataY);
      doc.text('Equipamento:', col1, dataY + 20).text(measurement.equipment, col1 + 100, dataY + 20);
      doc.text('Data da Medição:', col1, dataY + 40).text(new Date(measurement.timestamp).toLocaleString('pt-BR'), col1 + 100, dataY + 40);
      doc.text('IP do Usuário:', col1, dataY + 60).text(measurement.userIp || 'Indisponível', col1 + 100, dataY + 60);

      doc.text('Isolamento (MΩ):', col2, dataY).text(measurement.isolation.toString(), col2 + 120, dataY);
      doc.text('Res. Ôhmica (µΩ):', col2, dataY + 20).text(((measurement.ohmicAB + measurement.ohmicAC + measurement.ohmicBC) / 3).toFixed(1), col2 + 120, dataY + 20);
      doc.text('Índice Polarização (IP):', col2, dataY + 40).text(measurement.ip?.toString() || '---', col2 + 120, dataY + 40);
      doc.text('Índice Absorção (IA):', col2, dataY + 60).text(measurement.ia?.toString() || '---', col2 + 120, dataY + 60);

      // Section: Diagnosis
      doc.moveDown(4);
      doc.fillColor(primaryColor).fontSize(14).text('Diagnóstico Automático', 50, 260);
      doc.moveTo(50, 280).lineTo(562, 280).stroke(primaryColor);

      doc.rect(50, 295, 512, 100).fill('#f8f9fa');
      doc.fillColor('black').fontSize(10);
      
      doc.text('Status:', 70, 310).fillColor(accentColor).text(measurement.status || 'NORMAL', 120, 310).fillColor('black');
      doc.text('Tendencia:', 300, 310).fillColor(measurement.tendenciaCor || '#16a34a').text(measurement.tendencia || 'Estavel', 360, 310).fillColor('black');
      
      doc.text('Condicao:', 70, 330).text(measurement.condicao || 'Motor OK', 130, 330);
      doc.text('Diagnostico:', 70, 350).fontSize(9).text(measurement.diagnostico || 'Equipamento operando dentro dos padroes.', 150, 350, { width: 380 });

      if (measurement.tendenciaDiagnostico) {
        doc.moveDown(0.5);
        doc.text('Analise Tendencia:', 70, 375).text(measurement.tendenciaDiagnostico, 160, 375, { width: 370 });
      }

      if (measurement.recomendacoes && measurement.recomendacoes.length > 0) {
        doc.moveDown(2);
        doc.fillColor(primaryColor).fontSize(12).text('Recomendacoes Tecnicas', 70);
        doc.fillColor('black').fontSize(9);
        measurement.recomendacoes.forEach((rec: string, index: number) => {
          doc.text(`- ${rec}`, 75);
        });
      }

      // Section: Trend Chart
      doc.moveDown(6);
      doc.fillColor(primaryColor).fontSize(14).text('Gráfico de Tendência', 50, 400);
      doc.moveTo(50, 420).lineTo(562, 420).stroke(primaryColor);

      // Fetch chart from QuickChart
      try {
        const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId || "(default)");
        let history: any[] = [];
        
        try {
          const historySnap = await db.collection("measurements")
            .where("equipment", "==", measurement.equipment)
            .orderBy("timestamp", "desc")
            .limit(10)
            .get();
          history = historySnap.docs.map(doc => doc.data()).reverse();
        } catch (queryError) {
          console.warn("Composite index missing for chart query. Falling back to client-side filtering.");
          const fallbackSnap = await db.collection("measurements")
            .orderBy("timestamp", "desc")
            .limit(100)
            .get();
          history = fallbackSnap.docs
            .map(doc => doc.data())
            .filter((h: any) => h.equipment === measurement.equipment)
            .slice(0, 10)
            .reverse();
        }

        if (history.length > 0) {
          const chartConfig = {
            type: 'line',
            data: {
              labels: history.map((h: any) => new Date(h.timestamp).toLocaleDateString('pt-BR')),
              datasets: [{
                label: 'Isolamento (MΩ)',
                data: history.map((h: any) => h.isolation),
                borderColor: '#002045',
                backgroundColor: 'rgba(0, 32, 69, 0.1)',
                fill: true,
                tension: 0.4
              }]
            },
            options: {
              title: { display: true, text: `Histórico: ${measurement.equipment}` },
              scales: {
                yAxes: [{ scaleLabel: { display: true, labelString: 'MΩ' } }]
              }
            }
          };

          const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=250`;
          const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
          doc.image(response.data, 50, 440, { width: 500 });
        } else {
          doc.text('Nenhum histórico encontrado para este equipamento.', 50, 440);
        }
      } catch (chartError) {
        console.error("Error adding chart to PDF:", chartError);
        doc.text('Não foi possível gerar o gráfico de tendência.', 50, 440);
      }

      // Footer
      doc.fontSize(8).fillColor(secondaryColor).text('MotorGuard Industrial Monitoring - Relatório Gerado Automaticamente', 50, 750, { align: 'center' });

      doc.end();
    } catch (error) {
      console.error("Error generating PDF:", error);
      reject(error);
    }
  });
}
