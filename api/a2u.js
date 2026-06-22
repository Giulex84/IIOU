    const data = await response.json();
    if (!response.ok) {
        // Logghiamo l'errore reale che arriva da Pi
        console.error("Risposta API Pi:", JSON.stringify(data)); 
        throw new Error(data.message || "Errore Pi API");
    }
