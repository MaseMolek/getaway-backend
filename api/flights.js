module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { origin, destination, departDate, returnDate, adults } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'Missing origin or destination' });

  const rapidKey = process.env.RAPIDAPI_KEY;
  if (!rapidKey) return res.status(500).json({ error: 'Server not configured — add RAPIDAPI_KEY to Vercel env vars' });

  const dep = departDate || (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
  const ret = returnDate || (() => { const d = new Date(dep); d.setDate(d.getDate() + 5); return d.toISOString().split('T')[0]; })();
  const pax = adults || 1;

  try {
    const url = `https://flights-sky.p.rapidapi.com/flights/search-roundtrip?fromEntityId=${origin}&toEntityId=${destination}&departDate=${dep}&returnDate=${ret}&adults=${pax}&currency=USD&countryCode=US&market=en-US`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'flights-sky.p.rapidapi.com',
        'x-rapidapi-key': rapidKey,
      },
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).json({ error: `Flight API error: ${txt.slice(0, 120)}` });
    }

    const data = await response.json();
    const itineraries = data?.data?.itineraries || [];

    if (!itineraries.length) {
      return res.status(200).json({ flights: [], error: 'No flights found for these dates. Try adjusting your travel dates.' });
    }

    const badges = ['best', 'popular', 'premium'];
    const badgeLabels = ['🏆 Best Value', '⭐ Popular', '🔵 Fastest'];

    const flights = itineraries.slice(0, 3).map((it, i) => {
      const leg = it.legs?.[0] || {};
      const price = it.price?.raw || 0;
      const airline = leg.carriers?.marketing?.[0]?.name || 'Unknown Airline';
      const logo = leg.carriers?.marketing?.[0]?.logoUrl || '';
      const stops = leg.stopCount === 0 ? 'Nonstop' : `${leg.stopCount} stop${leg.stopCount > 1 ? 's' : ''}`;
      const mins = leg.durationInMinutes || 0;
      const duration = mins ? `${Math.floor(mins / 60)}h ${mins % 60}m` : '';
      const depTime = leg.departure ? new Date(leg.departure).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const arrTime = leg.arrival ? new Date(leg.arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const bookingUrl = it.deeplink || `https://www.skyscanner.com/transport/flights/${origin}/${destination}/${dep.replace(/-/g, '').slice(2)}/${ret.replace(/-/g, '').slice(2)}/?adults=${pax}`;

      return { id: `f${i + 1}`, airline, logo, stops, duration, depTime, arrTime, price: Math.round(price), badge: badges[i], badgeLabel: badgeLabels[i], from: origin, to: destination, url: bookingUrl };
    });

    return res.status(200).json({ flights });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
