// services/utils.js
const { DateTime } = require("luxon");

// Retorna a hora atual no fuso horário de Brasília
function getNowBRT() {
  return DateTime.now().setZone("America/Sao_Paulo");
}

// Formata uma data para dd/MM/yy (GMT-3)
const formatarData = (dataString) => {
  if (!dataString) return '';

  const data = DateTime.fromISO(dataString, { zone: "America/Sao_Paulo" });
  return data.toFormat("dd/MM/yy");
}

// Formata número de telefone brasileiro
function formatPhone(num) {
  if (!num) return "Número desconhecido";
  num = String(num).replace(/\D/g, '');
  if (num.startsWith('55')) num = num.slice(2);
  const ddd = num.slice(0, 2);
  const rest = num.slice(2);
  let formattedRest;
  if (rest.length === 9) formattedRest = `${rest.slice(0, 5)}-${rest.slice(5)}`;
  else if (rest.length === 8) formattedRest = `${rest.slice(0, 4)}-${rest.slice(4)}`;
  else formattedRest = rest;
  return `(0${ddd}) ${formattedRest}`;
}

// Formata datas mantendo GMT-3 (sem conversão UTC)
function formatLocal(brDateString) {
  if (!brDateString) return '';
  return DateTime.fromISO(brDateString, { zone: "America/Sao_Paulo" })
    .toFormat("dd/MM/yyyy HH:mm");
}

function formatPhoneNumber(phone) {
    if (!phone) return "";

    // Remove tudo que não for número
    let digits = phone.replace(/\D/g, "");

    // Remove o prefixo +55 ou 55
    if (digits.startsWith("55")) {
        digits = digits.substring(2);
    }

    // Se o número tiver mais de 11 dígitos, remove o extra
    if (digits.length > 11) {
        digits = digits.slice(-11);
    }

    // Monta o formato (XX) 9 XXXX-XXXX ou (XX) XXXX-XXXX
    if (digits.length === 11) {
        return `(${digits.slice(0, 2)}) ${digits[2]} ${digits.slice(3, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 10) {
        return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }

    // Se não tiver formato válido, retorna apenas os dígitos
    return digits;
}

module.exports = {
  getNowBRT,
  formatPhoneNumber,
  formatPhone,
  formatLocal,
  formatarData
};