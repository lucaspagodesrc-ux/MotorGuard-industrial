const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

/**
 * Cloud Function to automatically send an email report when a new measurement is recorded.
 * Triggered by onCreate event in the 'measurements' collection.
 */
exports.sendMeasurementReport = functions.firestore
  .document('measurements/{docId}')
  .onCreate(async (snap, context) => {
    const measurement = snap.data();
    const recipient = "lucas-rochamartins@hotmail.com";

    // Configuration from environment variables (set via firebase functions:config:set)
    const smtpConfig = functions.config().smtp;
    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
      console.error("SMTP configuration missing in Cloud Functions environment.");
      return null;
    }

    try {
      // 1. Fetch History from Firestore (last 10 for this equipment)
      const historySnap = await admin.firestore()
        .collection('measurements')
        .where('equipment', '==', measurement.equipment)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      const history = historySnap.docs.map(doc => doc.data()).reverse();

      // 2. Trend Analysis
      let status = "Estável";
      let statusColor = "#4caf50";
      let analysis = "Estável: Valores dentro da normalidade.";

      if (history.length >= 2) {
        const current = measurement.isolation;
        const previous = history[history.length - 2].isolation;
        
        if (current < previous * 0.9) {
          status = "Degradação";
          statusColor = "#f44336";
          analysis = "Tendência de Degradação: Queda significativa na resistência de isolamento detectada. Recomenda-se inspeção imediata.";
        } else if (current < previous) {
          status = "Atenção";
          statusColor = "#ffeb3b";
          analysis = "Atenção: Leve queda na resistência detectada. Monitorar com maior frequência.";
        } else if (current > previous * 1.1) {
          status = "Melhoria";
          statusColor = "#2196f3";
          analysis = "Melhoria: Resistência de isolamento em níveis crescentes.";
        }
      }

      // 3. Generate QuickChart URL
      const chartConfig = {
        type: 'line',
        data: {
          labels: history.map(h => new Date(h.timestamp).toLocaleDateString('pt-BR')),
          datasets: [{
            label: 'Isolamento (MΩ)',
            data: history.map(h => h.isolation),
            borderColor: '#002045',
            backgroundColor: 'rgba(0, 32, 69, 0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          title: { display: true, text: `Tendência de Isolamento: ${measurement.equipment}` }
        }
      };
      const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

      // 4. Setup Nodemailer
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: parseInt(smtpConfig.port || "587"),
        secure: smtpConfig.port === "465",
        auth: {
          user: smtpConfig.user,
          pass: smtpConfig.pass,
        },
      });

      // 5. Construct HTML Email
      const mailOptions = {
        from: smtpConfig.from || smtpConfig.user,
        to: recipient,
        subject: `[MotorGuard] Relatório de Medição: ${measurement.equipment} - ${status}`,
        html: `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; color: #333; max-width: 650px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
            <div style="background-color: #002045; color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; letter-spacing: 1px;">MotorGuard Industrial</h1>
              <p style="margin: 5px 0 0; opacity: 0.7; font-size: 14px; font-weight: 300;">Relatório Automático de Medição</p>
            </div>
            
            <div style="padding: 30px; background-color: #ffffff;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px;">
                <h2 style="margin: 0; font-size: 18px; color: #002045;">Dados da Medição</h2>
                <div style="background-color: ${statusColor}; color: ${status === 'Atenção' ? '#333' : 'white'}; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: bold; text-transform: uppercase;">
                  Status: ${status}
                </div>
              </div>

              <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 30px;">
                <tr><td style="padding: 10px 0; color: #666; width: 40%;">Área Operacional:</td><td style="padding: 10px 0; font-weight: 600;">${measurement.area}</td></tr>
                <tr><td style="padding: 10px 0; color: #666;">Equipamento:</td><td style="padding: 10px 0; font-weight: 600; color: #002045;">${measurement.equipment}</td></tr>
                <tr><td style="padding: 10px 0; color: #666;">Data do Registro:</td><td style="padding: 10px 0; font-weight: 600;">${new Date(measurement.timestamp).toLocaleString('pt-BR')}</td></tr>
                <tr><td style="padding: 10px 0; color: #666;">Operador:</td><td style="padding: 10px 0; font-weight: 600;">${measurement.operator}</td></tr>
                <tr><td style="padding: 10px 0; color: #666;">IP do Usuário:</td><td style="padding: 10px 0; font-family: monospace; font-size: 12px;">${measurement.userIp || 'Indisponível'}</td></tr>
              </table>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 35px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #eee;">
                  <p style="margin: 0; font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 1px;">Isolamento</p>
                  <p style="margin: 8px 0 0; font-size: 24px; font-weight: 800; color: #002045;">${measurement.isolation} <span style="font-size: 14px; font-weight: 400;">MΩ</span></p>
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #eee;">
                  <p style="margin: 0; font-size: 10px; text-transform: uppercase; color: #888; font-weight: bold; letter-spacing: 1px;">Res. Ôhmica (Média)</p>
                  <p style="margin: 8px 0 0; font-size: 24px; font-weight: 800; color: #002045;">${((measurement.ohmicAB + measurement.ohmicAC + measurement.ohmicBC) / 3).toFixed(1)} <span style="font-size: 14px; font-weight: 400;">µΩ</span></p>
                </div>
              </div>

              <h2 style="margin: 0 0 15px; font-size: 18px; color: #002045; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Gráfico de Tendência</h2>
              <div style="text-align: center; margin-bottom: 35px; background-color: #fff; padding: 10px; border: 1px solid #f0f0f0; border-radius: 8px;">
                <img src="${chartUrl}" alt="Tendência de Isolamento" style="max-width: 100%; height: auto; display: block; margin: 0 auto;" />
              </div>

              <div style="background-color: #f0f4f8; padding: 25px; border-radius: 12px; border-left: 6px solid #002045;">
                <h3 style="margin: 0 0 10px; color: #002045; font-size: 16px;">Análise IA MotorGuard</h3>
                <p style="margin: 0; font-style: italic; color: #444; line-height: 1.5; font-size: 14px;">"${analysis}"</p>
              </div>
            </div>

            <div style="background-color: #f8f9fa; padding: 25px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee;">
              <p style="margin: 0 0 10px;">Este é um e-mail automático gerado pelo sistema <strong>MotorGuard Industrial</strong>.</p>
              <p style="margin: 0;">&copy; 2026 MotorGuard Industrial Monitoring - Todos os direitos reservados.</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`Email report sent for document ${context.params.docId}`);
      return null;
    } catch (error) {
      console.error("Error in sendMeasurementReport Cloud Function:", error);
      return null;
    }
  });
