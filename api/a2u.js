export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo non consentito' });
  }

  try {
    const { amount, uid } = req.body;

    if (!amount || !uid) {
      return res.status(400).json({ success: false, error: "Dati mancanti (amount o uid)" });
    }

    // Qui inserirai la logica di chiamata alle API di Pi per l'A2U
    // Esempio: await piApi.transfer({ ... });
    
    console.log(`Esecuzione A2U: ${amount} Pi verso ${uid}`);

    // Risposta di successo sempre in formato JSON
    return res.status(200).json({ 
      success: true, 
      message: "Pagamento A2U elaborato con successo" 
    });

  } catch (err) {
    console.error("Errore critico A2U:", err);
    // Risposta di errore sempre in formato JSON
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
}
