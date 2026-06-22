/**
 * Cloudflare Worker: Last.fm Now Playing Proxy
 * 
 * Bu script, Last.fm API anahtarınızı (API Key) gizli tutarak web siteniz için
 * anlık çalınan müzik bilgisini güvenli bir şekilde sunar.
 */

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // CORS Başlıkları
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=10' // 10 saniye tarayıcı/Cloudflare önbelleklemesi
  }

  // Preflight (OPTIONS) isteklerini yanıtla
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Çevre Değişkenleri (Cloudflare Dashboard'dan tanımlanmalıdır)
  // Eğer tanımlanmamışsa hata yerine bilgilendirme döner
  const apiKey = typeof LASTFM_API_KEY !== 'undefined' ? LASTFM_API_KEY : '';
  const username = typeof LASTFM_USERNAME !== 'undefined' ? LASTFM_USERNAME : '';

  if (!apiKey || !username) {
    return new Response(
      JSON.stringify({
        error: "Configuration missing",
        message: "Lütfen Cloudflare Worker ayarlarından LASTFM_API_KEY ve LASTFM_USERNAME değişkenlerini tanımlayın."
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }

  const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${username}&api_key=${apiKey}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'durusoy-tr-now-playing-worker'
      }
    });

    if (!res.ok) {
      throw new Error(`Last.fm API returned status ${res.status}`);
    }

    const data = await res.json();
    const track = data.recenttracks?.track?.[0];

    if (!track) {
      return new Response(
        JSON.stringify({ error: "No track found" }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        }
      );
    }

    // Şarkı resmi için en yüksek çözünürlüklü olanı seç (genellikle extremerolling/large/extralarge sıralı gelir)
    const images = track.image || [];
    let imageUrl = '';
    // En büyük resmi bulmak için sondan başa tarayalım
    for (let i = images.length - 1; i >= 0; i--) {
      if (images[i]['#text']) {
        imageUrl = images[i]['#text'];
        break;
      }
    }

    // JSON formatında temiz yanıt döndür
    const responseData = {
      name: track.name,
      artist: track.artist?.['#text'] || '',
      album: track.album?.['#text'] || '',
      image: imageUrl,
      isPlaying: track['@attr']?.nowplaying === 'true',
      url: track.url || 'https://www.last.fm'
    };

    return new Response(JSON.stringify(responseData), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Fetch error", message: err.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
}
