export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, paymentId, txid } = req.body;
  const PI_API_KEY = process.env.PI_API_KEY;

  try {
    if (action === "complete") await new Promise(resolve => setTimeout(resolve, 3500));
    const response = await fetch(`https://api.minepi.com/v2/payments/${paymentId}/${action}`, {
      method: "POST",
      headers: { "Authorization": `Key ${PI_API_KEY}`, "Content-Type": "application/json" },
      body: action === "complete" ? JSON.stringify({ txid }) : undefined,
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
