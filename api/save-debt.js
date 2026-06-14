export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo richieste POST consentite' });
  }

  const { username, debtor, amount } = req.body;
  
  // Questo è l'indirizzo che hai appena preso da Make.com
  const MAKE_WEBHOOK_URL = "https://hook.eu1.make.com/qm0a79c6wi3as3iexr9y1ta6qh34fouo";

  try {
    const response = await fetch(MAKE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username,
        debtor: debtor,
        amount: amount,
        status: "PENDING"
      })
    });
    
    return res.status(200).json({ success: true, message: "Dato inviato a Make!" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
