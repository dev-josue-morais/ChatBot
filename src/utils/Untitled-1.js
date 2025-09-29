import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import styles from '../css';
import { useUserId } from '../UserId';
import { fetchUserData, fetchOrcamento } from '../config';
import { formatarTipoDocumento, formatarData, formatPreco } from '../validators';
import { useRoute, useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';

const GerarPDF = () => {
    const route = useRoute();
    const { orcamentoId } = route.params || {};
    const [orcamento, setOrcamento] = useState();
    const [user, setUser] = useState();
    const userId = useUserId();
    const [loading, setLoading] = useState(false);
    const [pdfUri, setPdfUri] = useState(null);
    const [documentoTipo, setDocumentoTipo] = useState('Orçamento');

    const opcoesDocumento = [
        'Orçamento',
        'Ordem de Serviço',
        'Relatório Técnico',
        'Nota de Serviço',
        'Pedido',
        'Proposta Comercial'
    ];

    const [checkboxes, setCheckboxes] = useState([
        { id: 1, label: 'Logo da Empresa', checked: true },
        { id: 2, label: 'Lista de serviços', checked: true },
        { id: 3, label: 'Lista de Materiais', checked: true },
        { id: 4, label: 'Ocultar valor por Item(serviços)', checked: false },
        { id: 5, label: 'Observações', checked: true },
        { id: 6, label: 'Mostrar Garantia', checked: true },
        { id: 7, label: 'Mostrar Pix', checked: true },
        { id: 8, label: 'Mostrar QR Code', checked: true },
        { id: 9, label: 'Observações da Conta', checked: true },
        { id: 10, label: 'Assinatura do Cliente', checked: false },
        { id: 11, label: 'Assinatura da Empresa', checked: false },
    ]);

    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                setLoading(true);
                try {
                    const [userData, orcamentoData] = await Promise.all([
                        fetchUserData(userId),
                        fetchOrcamento(orcamentoId),
                    ]);
                    setUser(userData);
                    setOrcamento(orcamentoData);
                } catch (err) {
                    Alert.alert('Erro ao buscar os dados');
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }, [userId, orcamentoId])
    );

    const abrirPDF = async () => {
        if (!pdfUri) {
            Alert.alert("Erro", "Nenhum PDF gerado.");
            return;
        }

        try {
            const contentUri = await FileSystem.getContentUriAsync(pdfUri);
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1,
                type: 'application/pdf',
            });
        } catch (error) {
            Alert.alert("Erro", "Falha ao abrir o PDF.");
            console.error("Erro ao abrir PDF:", error);
        }
    };

    const gerarDocumento = async () => {
        if (!orcamento) {
            Alert.alert("Erro", "Nenhum orçamento disponível para gerar o PDF.");
            return;
        }
        setLoading(true);
        const opcoes = {
            listaServicos: checkboxes.find(c => c.id === 2)?.checked,
            listaMateriais: checkboxes.find(c => c.id === 3)?.checked,
            ocultarValorServicos: checkboxes.find(c => c.id === 4)?.checked,
            observacoes: checkboxes.find(c => c.id === 5)?.checked,
            garantia: checkboxes.find(c => c.id === 6)?.checked,
            mostrarPix: checkboxes.find(c => c.id === 7)?.checked,
            mostrarQrCode: checkboxes.find(c => c.id === 8)?.checked,
            userObservacoes: checkboxes.find(c => c.id === 9)?.checked,
            assinaturaCliente: checkboxes.find(c => c.id === 10)?.checked,
            assinaturaUser: checkboxes.find(c => c.id === 11)?.checked,
        };
        const totalServico = (opcoes.listaServicos && orcamento?.servicos?.length > 0)
            ? orcamento.servicos.reduce((acc, serv) => acc + (serv.preco * serv.quantidade), 0)
            : 0;
        const totalMateriais = (opcoes.listaMateriais && orcamento?.materiais?.length > 0)
            ? orcamento.materiais.reduce((acc, mat) => acc + (mat.preco * mat.quantidade), 0)
            : 0;
        const total = totalServico + totalMateriais;
        const htmlContent = `
<html>
<head>
    <style>
        @page {size: A4; margin: 10mm 5mm;}
        * {margin: 0; padding: 0; box-sizing: border-box;}
        body {font-family: Arial, sans-serif; font-size: 14px; margin: 20px; color: #333; border: 3px solid #000; padding: 20px;}
        .header {display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;}
        .header img {max-width: 120px; height: auto;}
        .company-info {text-align: left; flex: 1;}
        .container {display: flex; flex-direction: column; align-items: flex-end; width: 40%;}
        .orcamento-info, .cliente-info {text-align: right; margin-bottom: 10px;}
        .row { display: flex; justify-content: space-between; align-items: center;}
        .table-container { width: 100%; border-collapse: collapse; margin-top: 15px;}
        th, td {border: 1px solid #000; padding: 8px; text-align: left;}
        th {background-color: #e5e5e5;}
        .containertotal {display: flex; justify-content: flex-end; margin-top: 15px;}
        .totals {background-color: #f2f2f2; padding: 10px; text-align: right; font-size: 16px;}
        .total {background-color: #ddd; font-weight: bold; padding: 10px;}
        .flex-container {display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-top: 20px;}
        .pixchave {margin-right: 5px;}
        .pix-container, .observacao {display: flex; justify-content: space-between; align-items: center; border: 2px solid #000; padding: 10px;}
        .observacao {flex-direction: column;}
        .pix {text-align: center;}
        .pix img {width: 150px; height: 150px;}
        .assinaturas {display: flex; justify-content: space-between; margin-top: 50px;}
        .assinaturas div { width: 45%; text-align: center; border-top: 2px solid #000; padding-top: 5px; margin-top: 40px;}
    </style>
</head>
<body>
    <!-- Cabeçalho -->
    <div class="header">
        <div class="company-info">
            <img src="${user.business_logo}" alt="Logo da Empresa">
            <h2>EletriCaldas Eletricista Residencial e Predial</h2>
            <p><strong>${formatarTipoDocumento(user.cpf_cnpj)}:</strong> ${user.cpf_cnpj} | <strong>Tel:</strong> ${user.telefone_contato ? user.telefone_contato : user.telefone ? user.telefone : ''}</p>
            ${user.cidade_empresa || user.bairro_empresa ? `<p>
                ${user.cidade_empresa ? `<strong>Cidade:</strong> ${user.cidade_empresa}` : ''}
                ${user.cidade_empresa && user.bairro_empresa ? ' | ' : ''}
                ${user.bairro_empresa ? `<strong>Bairro:</strong> ${user.bairro_empresa}` : ''}
            </p>` : ''}
             ${user.estado_empresa || user.cep_empresa ? `<p>
                ${user.estado_empresa ? `<strong>Estado:</strong> ${user.estado_empresa}` : ''}
                ${user.estado_empresa && user.cep_empresa ? ' | ' : ''}
                ${user.cep_empresa ? `<strong>CEP:</strong> ${user.cep_empresa}` : ''}
            </p>` : ''}
        </div>

        <div class="container">
            <div class="orcamento-info">
                <h2>${documentoTipo}</h2>
                <div class="row">
                    <div class="document-info">
                        <p class="pixchave"><strong>Nº do Documento:</strong></p>
                        <p class="pixchave"><strong>Data do Documento:</strong></p>
                    </div>
                    <div class="document-dados">
                        <p>${orcamento.orcamento_numero}</p>
                        <p>${formatarData(orcamento.criado_em)}</p>
                    </div>
                </div>
            </div>

            <div class="cliente-info">
                <div class="row">
                    <div class="cliente-dados">
                        <p><strong>Cliente:</strong> ${orcamento.nome_cliente}</p>
                        <p><strong>Tel:</strong> ${orcamento.telefone_cliente}</p>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Tabela de Serviços -->
    ${(opcoes.listaServicos && orcamento?.servicos?.length > 0) ? `
        <table class="table-container">
            <tr>
                <th>Serviço</th>
                ${!opcoes.ocultarValorServicos ? `<th>Preço</th>` : ""}
                <th>Quantidade</th>
                <th>Valor</th>
            </tr>
            ${orcamento.servicos.map(serv => `
            <tr>
                <td>${serv.descricao}</td>
                ${!opcoes.ocultarValorServicos ? `<td>${formatPreco(serv.preco)}</td>` : ""}
                <td>${serv.quantidade}</td>
                <td>${formatPreco(serv.preco * serv.quantidade)}</td>
            </tr>
            `).join('')}
        </table>`
                : ''}

    <!-- Tabela de Materiais -->
    ${(opcoes.listaMateriais && orcamento?.materiais?.length > 0) ? `
        <table class="table-container">
            <tr>
                <th>Material</th>
                <th>Preço</th>
                <th>Quantidade</th>
                <th>Valor</th>
            </tr>
            ${orcamento.materiais.map(mat => `
            <tr>
                <td>${mat.nome}</td>
                <td>${formatPreco(mat.preco)}</td>
                <td>${mat.quantidade} (${mat.unidade_medida})</td>
                <td>${formatPreco(mat.preco * mat.quantidade)}</td>
            </tr>
            `).join('')}
        </table>`
                : ''}

    <!-- Totais -->
    <div class="containertotal">
        <div class="totals">
            ${(opcoes.listaServicos && orcamento?.servicos?.length > 0) ? `<p><strong>Total Serviços:</strong> ${formatPreco(totalServico)}</p>` : ''}
            ${(opcoes.listaMateriais && orcamento?.materiais?.length > 0) ? `<p><strong>Total Materiais:</strong> ${formatPreco(totalMateriais)}</p>` : ''}
            ${((opcoes.listaServicos && orcamento?.servicos?.length > 0) && (opcoes.listaMateriais && orcamento?.materiais?.length > 0)) ? `<p class="total"><strong>Preço Final:</strong> ${formatPreco(total)}</p>` : ''}
        </div>
    </div>

    <!-- Pagamento e Garantia -->
    <div class="flex-container">
    ${(opcoes.observacoes || opcoes.garantia) ? `
        <div class="observacao">
            ${opcoes.garantia ? `<p><strong>Garantia da mão de obra:</strong> 90 Dias</p>` : ''}
            ${(opcoes.observacoes && user?.observations?.length > 0) ? `<h3>Observações</h3><br><p>${user.observations || ''}</p>` : ''}
        </div>
    ` : ''}

        ${(opcoes.mostrarPix || opcoes.mostrarQrCode) ? `
            <div class="pix-container">
            ${opcoes.mostrarPix ? `<div class="pixchave">
                <h3 class="center">Pague com Pix</h3>
                <p><strong>Chave Pix:</strong> ${user.pixcode}</p>
                <p><strong>Nome:</strong> ${user.pixname}</p>
                <p><strong>Instituição:</strong> ${user.pixinstitution}</p>
            </div>`:''}
            ${opcoes.mostrarQrCode && user.pixqrcode ? `<div class="pix">
                <img src="${user.pixqrcode}" alt="QR Code Pix">
            </div>`:''}
        </div>
        `: ''}
    </div>

    <!-- Assinaturas -->
    ${opcoes.assinaturaCliente || opcoes.assinaturaUser ? `
    <div class="assinaturas">
        ${opcoes.assinaturaUser ? `
        <div><strong>${user.nome_empresa ? user.nome_empresa : user.nome ? user.nome : 'Prestador de Serviços'}</strong></div>
        `:''}
        ${opcoes.assinaturaCliente ? `
        <div><strong>Assinatura do Cliente</strong></div>
        `:''}
    </div>
    `:''}
</body>
</html>`;
        try {
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            const newPath = FileSystem.documentDirectory + "orcamento.pdf";
            await FileSystem.moveAsync({ from: uri, to: newPath });

            setPdfUri(newPath);
        } catch (error) {
            Alert.alert("Erro", "Falha ao gerar PDF.");
            console.error("Erro ao criar PDF:", error);
        } finally {
            setLoading(false);
        }
    };

    const compartilharPDF = async () => {
        if (pdfUri) {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(pdfUri);
            } else {
                Alert.alert("Erro", "Compartilhamento indisponível.");
            }
        } else {
            Alert.alert("Erro", "Nenhum PDF gerado.");
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#0000ff" />
                <Text>Carregando...</Text>
            </View>
        );
    }

    const toggleCheckbox = (id) => {
        setCheckboxes((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, checked: !item.checked } : item
            )
        );
    };

    return (
        <View style={[styles.orcamentocontainer, { flex: 1 }]}>
            <ScrollView style={{ marginTop: 40 }}>
                <View style={[styles.userinputContainer, { marginTop: 10 }]}>
                    <Text style={styles.inputLabel}>Tipo de Documento:</Text>
                    <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={documentoTipo}
                            onValueChange={(itemValue) => setDocumentoTipo(itemValue)}
                            style={styles.picker}
                            dropdownIconColor="#FFD700"
                        >
                            {opcoesDocumento.map((opcao, index) => (
                                <Picker.Item key={index} label={opcao} value={opcao} />
                            ))}
                        </Picker>
                    </View>
                </View>
                {checkboxes.map((item) => (
                    <TouchableOpacity
                        key={item.id}
                        style={styles.pdfbutton}
                        onPress={() => toggleCheckbox(item.id)}
                    >
                        <Text style={{ color: '#fff', marginRight: 20, fontSize: 20 }}>{item.label}</Text>
                        <Ionicons
                            name={item.checked ? 'checkbox-outline' : 'square-outline'}
                            size={30}
                            color={item.checked ? 'green' : 'red'}
                        />
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={[styles.buttonGroup, { backgroundColor: '#1c1c1c' }]}>
                <TouchableOpacity style={styles.userbutton} onPress={gerarDocumento} disabled={loading}>
                    <Text style={styles.userbuttonText}>
                        {loading ? 'Carregando...' : 'Gerar Documento'}
                    </Text>
                </TouchableOpacity>
            </View>

            {pdfUri && (
                <View style={styles.buttonGroup}>
                    <TouchableOpacity onPress={abrirPDF} style={[styles.logoButton, { flexDirection: 'row', }]}>
                        <Ionicons name="eye-outline" size={24} color="white" />
                        <Text style={[styles.userbuttonText, { marginLeft: 10 }]}>Abrir PDF</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={compartilharPDF} style={[styles.logoButton, { flexDirection: 'row', marginLeft: 5 }]}>
                        <Ionicons name="share-outline" size={24} color="white" />
                        <Text style={[styles.userbuttonText, { marginLeft: 10 }]}>Compartilhar</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

export default GerarPDF;