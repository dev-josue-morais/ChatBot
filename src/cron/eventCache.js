const { getNowBRT } = require('../utils/utils');
const supabase = require('../services/supabase');

let eventsCache = [];

// 🔹 Carregar cache inicial
async function loadInitialEventsCache() {
  const now = getNowBRT();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', now.toUTC().toISO())
    .eq('notified', false);

 if (error) {
  console.error('❌ Erro ao carregar cache inicial:', error);
  setTimeout(loadInitialEventsCache, 120_000);
  return;
}

  eventsCache = data || [];
  console.log(`✅ Cache inicial carregado com ${eventsCache.length} eventos futuros.`);
}

// 🔹 Atualizar cache quando vier trigger do Supabase
function updateCacheFromWebhook(eventType, data) {
  if (eventType === 'INSERT') {
  if (!eventsCache.some(e => e.id === data.id)) {
    eventsCache.push(data);
  }
} else if (eventType === 'UPDATE') {
    const idx = eventsCache.findIndex(e => e.id === data.id);
    if (idx !== -1) eventsCache[idx] = data;
    else eventsCache.push(data); // caso ainda não exista
  } else if (eventType === 'DELETE') {
    eventsCache = eventsCache.filter(e => e.id !== data.id);
  }

  console.log(`🧠 Cache atualizado pelo webhook (${eventType}). Total: ${eventsCache.length}`);
}

// 🔹 Remover evento notificado
function removeEventFromCache(id) {
  eventsCache = eventsCache.filter(e => e.id !== id);
}

function getEventsCache() {
  return eventsCache;
}

module.exports = {
  loadInitialEventsCache,
  updateCacheFromWebhook,
  removeEventFromCache,
  getEventsCache
};