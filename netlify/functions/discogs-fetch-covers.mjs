/**
 * DISCOGS COVER FETCHER — One-time utility function
 * Fetches album artwork from Discogs and stores in Netlify Blobs
 * 
 * Usage: Deploy, call once, then delete
 * POST /api/discogs-fetch-covers with album list
 */

import { getStore } from '@netlify/blobs';

const COVERS_STORE = 'covers';

// Your known album collection (from Vinyl Scout catalog)
const ALBUMS = [
  { id: 'rec_moby_play', artist: 'Moby', title: 'Play', year: 1999 },
  { id: 'rec_fleetwood_rumours', artist: 'Fleetwood Mac', title: 'Rumours', year: 1977 },
  { id: 'rec_steely_aja', artist: 'Steely Dan', title: 'Aja', year: 1977 },
  { id: 'rec_nina_simone', artist: 'Nina Simone', title: 'Little Girl Blue', year: 1958 },
  { id: 'rec_portishead_dummy', artist: 'Portishead', title: 'Dummy', year: 1994 },
  { id: 'rec_cure_boys_boys', artist: 'The Cure', title: 'Boys Boys Boys', year: 1985 },
  { id: 'rec_cure_disintegration', artist: 'The Cure', title: 'Disintegration', year: 1989 },
  { id: 'rec_cure_wish', artist: 'The Cure', title: 'Wish', year: 1992 },
  { id: 'rec_aretha_franklin', artist: 'Aretha Franklin', title: 'I Never Loved a Man the Way I Love You', year: 1967 },
  { id: 'rec_harry_belafonte', artist: 'Harry Belafonte', title: 'Calypso', year: 1956 },
  { id: 'rec_sade', artist: 'Sade', title: 'Diamond Life', year: 1984 },
  { id: 'rec_b52s', artist: 'The B-52s', title: 'The B-52s', year: 1979 },
  { id: 'rec_eurythmics', artist: 'Eurythmics', title: 'Sweet Dreams', year: 1983 },
  { id: 'rec_donald_fagen', artist: 'Donald Fagen', title: 'The Nightfly', year: 1982 },
  { id: 'rec_buena_vista', artist: 'Buena Vista Social Club', title: 'Buena Vista Social Club', year: 1997 },
  { id: 'rec_diana_ross', artist: 'Diana Ross', title: 'Baby It\'s Me', year: 1977 },
  { id: 'rec_culture', artist: 'Culture', title: 'Two Sevens Clash', year: 1977 },
  { id: 'rec_clash', artist: 'The Clash', title: 'The Clash', year: 1977 },
  { id: 'rec_cocteau_twins', artist: 'Cocteau Twins', title: 'Heaven or Las Vegas', year: 1990 },
  { id: 'rec_st_germain', artist: 'St. Germain', title: 'Tourist', year: 1999 },
  { id: 'rec_kraftwerk_autobahn', artist: 'Kraftwerk', title: 'Autobahn', year: 1974 },
  { id: 'rec_kraftwerk_tdf', artist: 'Kraftwerk', title: 'Tour de France', year: 1983 },
  { id: 'rec_kruder_dorfmeister_1', artist: 'Kruder & Dorfmeister', title: 'The K&D Sessions', year: 1998 },
  { id: 'rec_kruder_dorfmeister_2', artist: 'Kruder & Dorfmeister', title: 'G Strophe', year: 2001 },
  { id: 'rec_madonna', artist: 'Madonna', title: 'Like a Virgin', year: 1984 },
  { id: 'rec_veronica_electronica', artist: 'Veronica Electronica', title: 'Veronica Electronica', year: 1995 },
  { id: 'rec_nightmares_wax', artist: 'Nightmares on Wax', title: 'Cartagena', year: 2002 },
  { id: 'rec_talking_heads', artist: 'Talking Heads', title: 'Remain in Light', year: 1980 },
  { id: 'rec_donna_summer', artist: 'Donna Summer', title: 'Bad Girls', year: 1979 },
  { id: 'rec_smiths', artist: 'The Smiths', title: 'The Queen Is Dead', year: 1986 },
  { id: 'rec_dre_chronic', artist: 'Dr. Dre', title: 'The Chronic', year: 1992 },
  { id: 'rec_peter_gabriel', artist: 'Peter Gabriel', title: 'So', year: 1986 },
  { id: 'rec_air_moon_safari', artist: 'Air', title: 'Moon Safari', year: 1998 },
  { id: 'rec_michael_mcdonald', artist: 'Michael McDonald', title: 'If That\'s What It Takes', year: 1982 },
  { id: 'rec_fleetwood_mac_rumours_2', artist: 'Fleetwood Mac', title: 'Fleetwood Mac', year: 1975 },
  { id: 'rec_kd_lang', artist: 'k.d. lang', title: 'Ingénue', year: 1992 },
  { id: 'rec_grace_jones', artist: 'Grace Jones', title: 'Living My Life', year: 1982 },
  { id: 'rec_bryan_ferry', artist: 'Bryan Ferry', title: 'These Foolish Things', year: 1973 },
  { id: 'rec_joy_division', artist: 'Joy Division', title: 'Closer', year: 1980 },
  { id: 'rec_crosby_stills_nash', artist: 'Crosby, Stills & Nash', title: 'Crosby, Stills & Nash', year: 1969 },
  { id: 'rec_rob_garza', artist: 'Rob Garza', title: 'Citlali', year: 2000 },
  { id: 'rec_selecter', artist: 'The Selecter', title: 'Too Much Pressure', year: 1980 },
  { id: 'rec_steel_pulse', artist: 'Steel Pulse', title: 'Handsworth Revolution', year: 1978 },
  { id: 'rec_bob_marley_1', artist: 'Bob Marley', title: 'Legend', year: 1984 },
  { id: 'rec_bob_marley_2', artist: 'Bob Marley', title: 'Kaya', year: 1978 },
  { id: 'rec_bob_marley_3', artist: 'Bob Marley', title: 'Exodus', year: 1977 },
  { id: 'rec_bob_marley_4', artist: 'Bob Marley', title: 'Rastaman Vibration', year: 1976 },
  { id: 'rec_pitch_black', artist: 'Pitch Black', title: 'Pitch Black', year: 1999 },
  { id: 'rec_scientist_1', artist: 'The Scientist', title: 'The Scientist', year: 1981 },
  { id: 'rec_scientist_2', artist: 'The Scientist', title: 'The Scientist Wins the Grammy', year: 1986 },
  { id: 'rec_cal_tjader', artist: 'Cal Tjader', title: 'Latino', year: 1985 },
  { id: 'rec_al_dimeola', artist: 'Al Di Meola', title: 'Elegant Gypsy', year: 1976 },
  { id: 'rec_scott_joplin', artist: 'Scott Joplin', title: 'Scott Joplin', year: 1970 },
  { id: 'rec_tania_maria', artist: 'Tania Maria', title: 'Tania Maria', year: 1981 },
  { id: 'rec_ramsey_lewis', artist: 'Ramsey Lewis', title: 'The In Crowd', year: 1965 },
  { id: 'rec_oliver_nelson', artist: 'Oliver Nelson', title: 'Blues and the Abstract Truth', year: 1961 },
  { id: 'rec_burning_spear', artist: 'Burning Spear', title: 'Marcus Garvey', year: 1975 },
  { id: 'rec_cesaria_evora', artist: 'Cesária Évora', title: 'Mar Azul', year: 1992 },
  { id: 'rec_billie_holiday', artist: 'Billie Holiday', title: 'Lady in Satin', year: 1958 },
  { id: 'rec_sidney_bechet', artist: 'Sidney Bechet', title: 'Sidney Bechet', year: 1960 },
  { id: 'rec_grant_green', artist: 'Grant Green', title: 'Idle Moments', year: 1965 },
  { id: 'rec_dave_brubeck', artist: 'Dave Brubeck', title: 'Time Out', year: 1959 },
  { id: 'rec_benny_goodman', artist: 'Benny Goodman', title: 'Benny Goodman Quartet', year: 1950 },
  { id: 'rec_duke_ellington', artist: 'Duke Ellington', title: 'Such Sweet Thunder', year: 1957 },
  { id: 'rec_chick_corea', artist: 'Chick Corea', title: 'Electro Kinetic Band', year: 1999 },
  { id: 'rec_desmond_dekker', artist: 'Desmond Dekker', title: '007 Shantytown', year: 1967 },
  { id: 'rec_augustus_pablo', artist: 'Augustus Pablo', title: 'East of the Dub', year: 1974 },
  { id: 'rec_rolling_stones', artist: 'The Rolling Stones', title: 'Beggars Banquet', year: 1968 },
  { id: 'rec_thievery_corp_1', artist: 'Thievery Corporation', title: 'Mirrors', year: 2008 },
  { id: 'rec_thievery_corp_2', artist: 'Thievery Corporation', title: 'The Outerspace Broadcast', year: 2001 },
  { id: 'rec_tosca', artist: 'Tosca', title: 'Pork Soaked Guitar', year: 2002 },
  { id: 'rec_vladimir_horowitz_1', artist: 'Vladimir Horowitz', title: 'The Last Recordings', year: 1989 },
  { id: 'rec_vladimir_horowitz_2', artist: 'Vladimir Horowitz', title: 'Carnegie Hall', year: 1978 },
  { id: 'rec_joan_sutherland', artist: 'Joan Sutherland', title: 'Joan Sutherland', year: 1973 },
  { id: 'rec_ravi_shankar_1', artist: 'Ravi Shankar', title: 'In New York', year: 1967 },
  { id: 'rec_ravi_shankar_2', artist: 'Ravi Shankar', title: 'Ravi Shankar', year: 1962 },
  { id: 'rec_boney_m', artist: 'Boney M', title: 'Night Flight to Venus', year: 1978 },
  { id: 'rec_easy_star_radiodread', artist: 'Easy Star All-Stars', title: 'Radiodread', year: 2006 },
  { id: 'rec_easy_star_dubside', artist: 'Easy Star All-Stars', title: 'Dub Side of the Moon', year: 2003 },
  { id: 'rec_mozart_requiem', artist: 'Wolfgang Amadeus Mozart', title: 'Requiem', year: 1990 },
  { id: 'rec_maria_callas', artist: 'Maria Callas', title: 'La Traviata', year: 1983 },
  { id: 'rec_swingle_singers', artist: 'The Swingle Singers', title: 'The Swingle Singers', year: 1964 },
  { id: 'rec_bach_goldberg', artist: 'Johann Sebastian Bach', title: 'Goldberg Variations', year: 1981 },
  { id: 'rec_beethoven', artist: 'Ludwig van Beethoven', title: 'Symphony No. 9', year: 1979 },
  { id: 'rec_jimmy_smith', artist: 'Jimmy Smith', title: 'Home Cookin\'', year: 1958 },
  { id: 'rec_django_reinhardt', artist: 'Django Reinhardt', title: 'The Best of Django', year: 1975 },
  { id: 'rec_moby_play_2', artist: 'Moby', title: 'Animal Rights', year: 1996 },
  { id: 'rec_oscar_peterson', artist: 'Oscar Peterson', title: 'Live in Russia', year: 1978 },
  { id: 'rec_max_richter', artist: 'Max Richter', title: 'The Four Seasons', year: 2012 },
  { id: 'rec_john_lee_hooker', artist: 'John Lee Hooker', title: 'The Ultimate Collection', year: 2006 },
];

async function fetchAndStoreCovers() {
  const store = getStore(COVERS_STORE);
  const results = [];
  
  for (const album of ALBUMS) {
    try {
      // Search Discogs for the album
      const searchRes = await fetch(
        `https://api.discogs.com/database/search?artist=${encodeURIComponent(album.artist)}&release_title=${encodeURIComponent(album.title)}&year=${album.year}&token=YOUR_DISCOGS_TOKEN`
      );
      
      if (!searchRes.ok) {
        results.push({ id: album.id, status: 'search_failed', reason: searchRes.statusText });
        continue;
      }
      
      const searchData = await searchRes.json();
      
      if (!searchData.results || searchData.results.length === 0) {
        results.push({ id: album.id, status: 'not_found', artist: album.artist, title: album.title });
        continue;
      }
      
      // Get the first result (most likely match)
      const release = searchData.results[0];
      const releaseRes = await fetch(`https://api.discogs.com/releases/${release.id}?token=YOUR_DISCOGS_TOKEN`);
      
      if (!releaseRes.ok) {
        results.push({ id: album.id, status: 'release_failed' });
        continue;
      }
      
      const releaseData = await releaseRes.json();
      
      if (!releaseData.images || releaseData.images.length === 0) {
        results.push({ id: album.id, status: 'no_image', discogs_id: release.id });
        continue;
      }
      
      // Get the first image (primary cover)
      const imageUrl = releaseData.images[0].uri;
      
      // Fetch the actual image
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        results.push({ id: album.id, status: 'image_fetch_failed', url: imageUrl });
        continue;
      }
      
      // Store in Netlify Blobs
      const imageBuffer = await imageRes.arrayBuffer();
      const contentType = releaseData.images[0].type === 'primary' ? 'image/jpeg' : 'image/jpeg';
      
      await store.set(
        `cover_${album.id}`,
        new Blob([imageBuffer], { type: contentType })
      );
      
      results.push({
        id: album.id,
        status: 'stored',
        artist: album.artist,
        title: album.title,
        size: imageBuffer.byteLength,
        discogs_id: release.id,
      });
      
      // Rate limit - Discogs allows 60 req/min
      await new Promise(resolve => setTimeout(resolve, 1100));
    } catch (err) {
      results.push({ id: album.id, status: 'error', reason: err.message });
    }
  }
  
  return results;
}

export const config = { path: '/api/discogs-fetch-covers' };

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  try {
    const results = await fetchAndStoreCovers();
    
    const summary = {
      total: results.length,
      stored: results.filter(r => r.status === 'stored').length,
      not_found: results.filter(r => r.status === 'not_found').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    };
    
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
