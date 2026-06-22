export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Metodo non consentito' });
  }

  const { action, paymentId, txid } = req.body;
  const PI_API_KEY = process.env.PI_API_KEY;

  try {
    if (action === 'approve') {
      console.log("Approvazione richiesta per:", paymentId);
      // Comunicazione ufficiale all'API di Pi per approvare il pagamento
      const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/approve`, {
        method: 'POST',
        headers: { 
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json' 
        }
      });
      
      const data = await response.json();
      return res.status(200).json({ success: true, data });
    } 
    
    if (action === 'complete') {
      console.log("Completamento richiesto per:", paymentId, "TXID:", txid);
      // Comunicazione ufficiale all'API di Pi per completare il pagamento
      const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/complete`, {
        method: 'POST',
        headers: { 
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ txid: txid })
      });

      const data = await response.json();
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ success: false, error: 'Azione non valida' });
  } catch (err) {
    console.error("Errore nel pi-payment:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
