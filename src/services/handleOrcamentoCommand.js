const { executeCreate } = require('../cases/create');
const { executeEdit } = require('../cases/edit');
const { executeList } = require('../cases/list');
const { executeDelete } = require('../cases/delete');
const { executePdf } = require('../cases/pdf');

async function handleOrcamentoCommand(command, userPhone) {
    try {

        switch (command.action) {

            case 'create':
                return await executeCreate(command, userPhone);

            case 'edit':
                return await executeEdit(command, userPhone);

            case 'list':
                return await executeList(command, userPhone);

            case 'delete':
                return await executeDelete(command, userPhone);

            case 'pdf':
                return await executePdf(command, userPhone);

            default:
                console.warn(
                    '⚠️ Ação de orçamento não reconhecida:',
                    command.action
                );

                return '⚠️ Ação de orçamento não reconhecida.';
        }

    } catch (err) {

        console.error(
            '💥 Erro em handleOrcamentoCommand:',
            err
        );

        console.error(
            '📦 Comando problemático:',
            JSON.stringify(command, null, 2)
        );

        return '⚠️ Erro interno ao processar orçamento.';
    }
}

module.exports = handleOrcamentoCommand;