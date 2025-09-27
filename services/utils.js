const { DateTime } = require("luxon");

function getNowBRT() {
  return DateTime.now().setZone("America/Sao_Paulo");
}

function formatLocal(utcDate) {
  return DateTime.fromISO(utcDate, { zone: "utc" })
    .setZone("America/Sao_Paulo")
    .toFormat("dd/MM/yyyy HH:mm");
}

function formatPhone(num) {
  if (!num) return "Número desconhecido";
  num = String(num).replace(/\D/g, "");
  if (num.startsWith("55")) num = num.slice(2);
  const ddd = num.slice(0, 2);
  const rest = num.slice(2);
  let formattedRest;
  if (rest.length === 9) formattedRest = `${rest.slice(0, 5)}-${rest.slice(5)}`;
  else if (rest.length === 8)
    formattedRest = `${rest.slice(0, 4)}-${rest.slice(4)}`;
  else formattedRest = rest;
  return `(0${ddd}) ${formattedRest}`;
}

module.exports = { getNowBRT, formatLocal, formatPhone };
