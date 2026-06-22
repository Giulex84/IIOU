export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo non consentito' });
  }

  const { action, paymentId, txid } = req.body;

  try {
    if (action === 'approve') {
      console.log("Approvazione richiesta per:", paymentId);
      // Qui aggiungeresti la logica per validare il pagamento lato server
      return res.status(200).json({ success: true, message: "Approvazione ricevuta" });
    } 
    
    if (action === 'complete') {
      console.log("Completamento richiesto per:", paymentId, "TXID:", txid);
      // Qui aggiungeresti la logica per finalizzare il pagamento
      return res.status(200).json({ success: true, message: "Completamento ricevuto" });
    }

    return res.status(400).json({ success: false, error: 'Azione non valida' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
