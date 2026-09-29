const openai = require('./openai');

const { getCreatePrompt } = require('../cases/create');
const { getEditPrompt } = require('../cases/edit');
const { getListPrompt } = require('../cases/list');
const { getPdfPrompt } = require('../cases/pdf');


async function handleGPTCommand(
    userMessage,
    modulo,
    action,
    id,
    userPhone
) {

    userMessage = (userMessage || "").trim();

    let prompt = '';

    // ==================================================
    // 🔀 SELECIONA O PROMPT NO CASE CORRESPONDENTE
    // ==================================================

    switch (action) {

        // ----------------------------------------------
        // CREATE
        // ----------------------------------------------

        case 'create': {

            prompt = await getCreatePrompt(
                modulo,
                userMessage
            );

            break;
        }


        // ----------------------------------------------
        // EDIT
        // ----------------------------------------------

        case 'edit': {

            const result = await getEditPrompt(
                modulo,
                userMessage,
                id,
                userPhone
            );

            // O getEditPrompt pode retornar um erro antes
            // de gerar o prompt.
            if (result && typeof result === 'object') {
                return result;
            }

            prompt = result;

            break;
        }


        // ----------------------------------------------
        // LIST
        // ----------------------------------------------

        case 'list': {

            prompt = await getListPrompt(
                modulo,
                userMessage
            );

            break;
        }


        // ----------------------------------------------
        // PDF
        // ----------------------------------------------

        case 'pdf': {

            prompt = await getPdfPrompt(
                modulo,
                userMessage
            );

            break;
        }


        // ----------------------------------------------
        // DELETE
        // ----------------------------------------------

        case 'delete': {

            return {
                modulo,
                action,
                id
            };
        }


        // ----------------------------------------------
        // DESCONHECIDO
        // ----------------------------------------------

        default:

            return {
                erro: 'Prompt não definido',
                modulo,
                action
            };
    }


    // ==================================================
    // ⚠️ CASO O CASE NÃO TENHA GERADO PROMPT
    // ==================================================

    if (!prompt) {

        return {
            erro: 'Prompt não definido',
            modulo,
            action
        };
    }


    // ==================================================
    // 🤖 OPENAI
    // ==================================================

    try {

        const completion = await openai.chat.completions.create({

            model: 'gpt-4o-mini',

            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],

            response_format: {
                type: 'json_object'
            }
        });


        let content =
            completion.choices[0].message.content.trim();


        // Remove eventual markdown
        content = content
            .replace(/```json\s*|```/g, '')
            .trim();


        // ==================================================
        // 📦 JSON
        // ==================================================

        try {

            const parsedContent = JSON.parse(content);

            return parsedContent;

        } catch (parseErr) {

            console.error(
                '\n======================================================'
            );

            console.error(
                '❌ [GPT] ERRO AO FAZER JSON.parse()'
            );

            console.error(
                '======================================================'
            );

            console.error(
                '📩 Mensagem original:'
            );

            console.error(userMessage);


            console.error(
                '\n📦 Módulo:',
                modulo
            );

            console.error(
                '⚙️ Action:',
                action
            );

            console.error(
                '🆔 ID:',
                id
            );


            console.error(
                '\n📥 JSON QUE O GPT DEVOLVEU:'
            );

            console.error(content);


            console.error(
                '\n💥 ERRO DO JSON.parse:'
            );

            console.error(parseErr.message);


            console.error(
                '\n📚 STACK DO ERRO:'
            );

            console.error(parseErr.stack);


            console.error(
                '======================================================\n'
            );


            return {
                erro: 'JSON inválido retornado pelo GPT',
                raw: content
            };
        }


    } catch (err) {

        console.error(
            '\n======================================================'
        );

        console.error(
            '🔥 [GPT] ERRO AO CHAMAR OPENAI'
        );

        console.error(
            '======================================================'
        );


        console.error(
            '📩 Mensagem original:',
            userMessage
        );

        console.error(
            '📦 Módulo:',
            modulo
        );

        console.error(
            '⚙️ Action:',
            action
        );

        console.error(
            '🆔 ID:',
            id
        );


        console.error(
            '\n💥 Erro:',
            err
        );

        console.error(
            '\n📚 Stack:',
            err.stack
        );


        console.error(
            '======================================================\n'
        );


        return {
            erro: 'Falha ao chamar GPT',
            modulo,
            action
        };
    }
}


module.exports = {
    handleGPTCommand
};