const { executeCreate } = require('../cases/create');
const { executeEdit } = require('../cases/edit');
const { executeList } = require('../cases/list');
const { executeDelete } = require('../cases/delete');


async function handleDespesasCommand(command, userPhone) {

  try {

    const { action } = command || {};

    // 🔐 SEGURANÇA BÁSICA

    if (!userPhone) {

      console.error(
        'handleDespesasCommand: userPhone não informado.'
      );

      return '❌ Não foi possível identificar o usuário.';
    }


    // 🔀 CASES

    switch (action) {


      // ➕ CREATE

      case 'create':

        return await executeCreate(
          command,
          userPhone
        );


      // ================================================
      // ✏️ EDIT
      // ================================================

      case 'edit':

        return await executeEdit(
          command,
          userPhone
        );


      // 📋 LIST

      case 'list':

        return await executeList(
          command,
          userPhone
        );

      // 🗑️ DELETE

      case 'delete':

        return await executeDelete(
          command,
          userPhone
        );

      default:

        console.warn(
          '⚠️ Ação de despesa não reconhecida:',
          action
        );

        return '⚠️ Ação de despesa não reconhecida.';
    }


  } catch (err) {

    console.error(
      '💥 Erro em handleDespesasCommand:',
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

    return '❌ Erro interno ao processar despesas.';
  }
}


module.exports = handleDespesasCommand;