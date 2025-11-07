const { DateTime } = require('luxon');
const { getNowBRT } = require('../utils/utils');
const supabase = require('../services/supabase');

let eventsCache = [];
let lastCacheDay = null;

// 🔹 Carregar cache inicial (eventos do dia atual)
async function loadInitialEventsCache() {
  const now = getNowBRT();
  const start = now.startOf('day').toUTC().toISO();
  const end = now.endOf('day').toUTC().toISO();

  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('date', start)
    .lte('date', end)
    .eq('notified', false);

  if (error) {
    console.error('❌ Erro ao carregar cache inicial:', error);
    setTimeout(loadInitialEventsCache, 120_000);
    return;
  }

  eventsCache = data || [];
  lastCacheDay = now.toFormat('yyyy-MM-dd');

  console.log(`✅ Cache carregado para o dia ${lastCacheDay} com ${eventsCache.length} eventos.`);
  if (eventsCache.length > 0) {
    eventsCache.forEach(e => {
      console.log(`  • ${e.title} às ${DateTime.fromISO(e.date).setZone('America/Sao_Paulo').toFormat('HH:mm')}`);
    });
  }
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
    else eventsCache.push(data);
  } else if (eventType === 'DELETE') {
    eventsCache = eventsCache.filter(e => e.id !== data.id);
  }

  console.log(`🧠 Cache atualizado pelo webhook (${eventType}). Total: ${eventsCache.length}`);
}

// 🔹 Remover evento notificado
function removeEventFromCache(id) {
  eventsCache = eventsCache.filter(e => e.id !== id);
}

// 🔹 Verifica se o dia virou → recarrega o cache às 00h
function checkForDayChange() {
  const now = getNowBRT();
  const currentDay = now.toFormat('yyyy-MM-dd');

  if (currentDay !== lastCacheDay) {
    console.log('🌅 Novo dia detectado! Recarregando cache...');
    loadInitialEventsCache();
  }
}

// 🔹 Retornar cache atual
function getEventsCache() {
  return eventsCache;
}

// 🔹 Iniciar verificação automática de troca de dia
function startDayChangeWatcher() {
  // checa a cada minuto se o dia virou
  setInterval(checkForDayChange, 60_000);
}

module.exports = {
  loadInitialEventsCache,
  updateCacheFromWebhook,
  removeEventFromCache,
  getEventsCache,
  startDayChangeWatcher
};