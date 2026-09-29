const { DateTime } = require('luxon');

const { executeCreate } = require('../cases/create');
const { executeEdit } = require('../cases/edit');
const { executeList } = require('../cases/list');
const { executeDelete } = require('../cases/delete');


async function handleAgendaCommand(command, userPhone) {

  try {

    // ==========================================
    // 📅 NORMALIZAÇÃO DAS DATAS
    // ==========================================

    if (command.datetime) {

      command.datetime = DateTime
        .fromISO(
          command.datetime,
          {
            zone: 'America/Sao_Paulo'
          }
        )
        .toUTC()
        .toISO();
    }


    if (command.start_date) {

      command.start_date = DateTime
        .fromISO(
          command.start_date,
          {
            zone: 'America/Sao_Paulo'
          }
        )
        .toISO({
          includeOffset: false
        });
    }


    if (command.end_date) {

      command.end_date = DateTime
        .fromISO(
          command.end_date,
          {
            zone: 'America/Sao_Paulo'
          }
        )
        .toISO({
          includeOffset: false
        });
    }


    // ==========================================
    // 🔀 CASES
    // ==========================================

    switch (command.action) {

      // ========================================
      // ➕ CREATE
      // ========================================

      case 'create':

        return await executeCreate(
          command,
          userPhone
        );


      // ========================================
      // ✏️ EDIT
      // ========================================

      case 'edit':

        return await executeEdit(
          command,
          userPhone
        );


      // ========================================
      // 📋 LIST
      // ========================================

      case 'list':

        return await executeList(
          command,
          userPhone
        );


      // ========================================
      // 🗑 DELETE
      // ========================================

      case 'delete':

        return await executeDelete(
          command,
          userPhone
        );


      // ========================================
      // ⚠️ DESCONHECIDO
      // ========================================

      default:

        console.warn(
          '⚠️ Ação de agenda não reconhecida:',
          command.action
        );

        return '⚠️ Comando de agenda não reconhecido.';
    }


  } catch (err) {

    console.error(
      '💥 Erro em handleAgendaCommand:',
      err
    );

    console.error(
      '📦 Comando problemático:',
      JSON.stringify(
        command,
        null,
        2
      )
    );

    return '⚠️ Erro interno ao processar comando de agenda.';
  }
}


module.exports = handleAgendaCommand;