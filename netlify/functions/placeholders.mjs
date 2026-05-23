// Generate consistent SVG placeholder album covers
// These are swappable — can be replaced with real URLs later

const placeholders = {
  rec_fleetwood_rumours: {
    color: "#8B4513",
    title: "Rumours",
    artist: "Fleetwood Mac",
    year: 1977,
    style: "brown-gold-serif"
  },
  rec_moby_play: {
    color: "#2C3E50",
    title: "Play",
    artist: "Moby",
    year: 1999,
    style: "dark-minimal"
  },
  rec_portishead_dummy: {
    color: "#1a1a1a",
    title: "Dummy",
    artist: "Portishead",
    year: 1994,
    style: "black-stark"
  },
  rec_nina_simone: {
    color: "#D4AF37",
    title: "Little Girl Blue",
    artist: "Nina Simone",
    year: 1958,
    style: "gold-classic"
  },
  rec_steely_aja: {
    color: "#A0522D",
    title: "Aja",
    artist: "Steely Dan",
    year: 1977,
    style: "sienna-serif"
  }
};

function generateSVG(id) {
  const meta = placeholders[id];
  if (!meta) return null;
  
  const svg = `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
    <rect width="300" height="300" fill="${meta.color}"/>
    <rect width="300" height="300" fill="url(#noise)" opacity="0.1"/>
    <defs>
      <pattern id="noise" patternUnits="userSpaceOnUse" width="4" height="4">
        <rect width="4" height="4" fill="${meta.color}"/>
        <circle cx="2" cy="2" r="0.5" fill="rgba(255,255,255,0.1)"/>
      </pattern>
    </defs>
    <text x="150" y="130" font-family="Georgia, serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle" opacity="0.9">${meta.title}</text>
    <text x="150" y="165" font-family="Georgia, serif" font-size="18" fill="white" text-anchor="middle" opacity="0.8">${meta.artist}</text>
    <text x="150" y="280" font-family="monospace" font-size="12" fill="white" text-anchor="middle" opacity="0.6">${meta.year}</text>
  </svg>`;
  
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export const config = { path: "/api/placeholder/:id" };

export default async (req, context) => {
  const id = req.path.split('/').pop();
  const dataURI = generateSVG(id);
  
  if (!dataURI) {
    return new Response(JSON.stringify({ error: 'Unknown placeholder ID' }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ cover_url: dataURI }), { 
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
