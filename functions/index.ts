import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import PDFDocument from 'pdfkit';
import axios from 'axios';

admin.initializeApp();

/**
 * Cloud Function triggered on new measurement creation (v2).
 * Generates a PDF report, uploads it to Storage, and updates the document with the URL.
 */
export const onMeasurementCreate = onDocumentCreated('measurements/{docId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  
  const measurement = snap.data();
  const docId = event.params.docId;

  console.log(`Generating PDF for measurement: ${docId}`);

  try {
    const pdfBuffer = await generatePdfBuffer(measurement);
    const fileName = `relatorio_${measurement.equipment.replace(/\s+/g, '_')}_${new Date(measurement.timestamp).getTime()}.pdf`;
    
    const bucket = admin.storage().bucket();
    const file = bucket.file(`reports/${fileName}`);
    
    await file.save(pdfBuffer, {
      metadata: { contentType: 'application/pdf' },
      public: true,
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
    
    // Update Firestore document with the PDF link
    await snap.ref.update({ pdfUrl: publicUrl });

    console.log(`PDF successfully generated and uploaded: ${publicUrl}`);
  } catch (error) {
    console.error("Error in PDF generation function:", error);
  }
});

/**
 * Helper function to generate the PDF buffer using pdfkit.
 */
async function generatePdfBuffer(measurement: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: any[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const primaryColor = '#002045';
      const accentColor = measurement.cor || '#16a34a';

      // Header
      doc.rect(0, 0, 612, 100).fill(primaryColor);
      doc.fillColor('white')
         .fontSize(20)
         .text('Relatorio de Medicao - Motor Industrial', 50, 35)
         .fontSize(10)
         .text('Sistema de Monitoramento de Condicao', 50, 60);
      
      doc.fontSize(8)
         .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 450, 40, { align: 'right' });

      // Measurement Data
      doc.fillColor(primaryColor).fontSize(14).text('Dados da Medicao', 50, 120);
      doc.moveTo(50, 140).lineTo(562, 140).stroke(primaryColor);

      doc.fillColor('black').fontSize(10);
      const dataY = 155;
      doc.text('Area:', 50, dataY).text(measurement.area, 150, dataY);
      doc.text('Equipamento:', 50, dataY + 20).text(measurement.equipment, 150, dataY + 20);
      doc.text('Data da Medicao:', 50, dataY + 40).text(new Date(measurement.timestamp).toLocaleString('pt-BR'), 150, dataY + 40);
      doc.text('IP do Usuario:', 50, dataY + 60).text(measurement.userIp || 'Indisponivel', 150, dataY + 60);

      doc.text('Isolamento (MOhm):', 300, dataY).text(measurement.isolation.toString(), 420, dataY);
      doc.text('Res. Ohmica (MicroOhm):', 300, dataY + 20).text(((measurement.ohmicAB + measurement.ohmicAC + measurement.ohmicBC) / 3).toFixed(1), 420, dataY + 20);
      doc.text('IP:', 300, dataY + 40).text(measurement.ip?.toString() || '---', 420, dataY + 40);
      doc.text('IA:', 300, dataY + 60).text(measurement.ia?.toString() || '---', 420, dataY + 60);

      // Diagnosis
      doc.fillColor(primaryColor).fontSize(14).text('Diagnostico Automatico', 50, 260);
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
        measurement.recomendacoes.forEach((rec: string) => {
          doc.text(`- ${rec}`, 75);
        });
        doc.moveDown(2);
      }

      // Trend Chart (QuickChart)
      try {
        const db = admin.firestore();
        const historySnap = await db.collection("measurements")
          .where("equipment", "==", measurement.equipment)
          .orderBy("timestamp", "desc")
          .limit(10)
          .get();

        const history = historySnap.docs.map(doc => doc.data()).reverse();
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
          }
        };
        const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=500&h=250`;
        const response = await axios.get(chartUrl, { responseType: 'arraybuffer' });
        doc.image(response.data, 50, 440, { width: 500 });
      } catch (e) {
        doc.text('Gráfico indisponível no momento.', 50, 440);
      }

      doc.fontSize(8).fillColor('#666').text('Relatório Gerado Automaticamente por MotorGuard', 50, 750, { align: 'center' });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
