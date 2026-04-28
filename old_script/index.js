// get the client
//const mysql = require('mysql2/promise');
const moment = require("moment");
//const CryptoJS = require("crypto-js");
const fs = require('fs').promises;
const path = require('path');
const XLSX = require('xlsx');

moment.locale('pt');

String.prototype.allReplace = function(obj) {
    var retStr = this;
    for (var x in obj) {
        retStr = retStr.replace(new RegExp(x, 'g'), obj[x]);
    }
    return retStr;
};

async function listFilesRecursively(folderPath) {
    try {
        const entries = await fs.readdir(folderPath);
        let fileList = [];

        for (const entry of entries) {
            const entryPath = path.join(folderPath, entry);
            const stat = await fs.stat(entryPath);

            if (stat.isDirectory()) {
                // If the entry is a directory, recursively list its files
                const subdirectoryFiles = await listFilesRecursively(entryPath);
                fileList = fileList.concat(subdirectoryFiles);
            } else {
                // If the entry is a file, add its path to the list
                fileList.push(entryPath);
            }
        }

        return fileList;
    } catch (err) {
        console.error(err);
        return [];
    }
}


const validFileType = (data) => {
    const header = data.slice(0, 4).toString('hex');

    if (header === 'a7eda5db') {
        return true;
    }

    return false;
}

const readString = (hexBuffer) => {
    let index = hexBuffer.indexOf(0x00);
    index = index === -1 ? hexBuffer.length : index;
    hexBuffer = hexBuffer.slice(0, index);
    return hexBuffer.toString('latin1').trim();
}

const readWord = (hexBuffer) => {
    //return hexBuffer;
    //return hexBuffer.readInt8(0);
    return hexBuffer.readInt16LE(0);
}

const readDateTime = (hexBuffer) => {
    //return hexBuffer.readDoubleLE(2)*1000;
    return new Date(hexBuffer.readDoubleLE(2) * 1000);
}

const readFloat = (hexBuffer) => {
    return hexBuffer.readFloatLE(0);
}

const readDouble = (hexBuffer) => {
    return hexBuffer.readFloatBE(0);
}

const typeSize = (columnType, columnSize) => {

    const type = columnType;

    switch (type) {
        case 8: //Datetime
            return 10;
        case 9: //String
            return columnSize;
        case 3: //Word
            return 2;
        case 6: //Float
            return 4;
        default:
            return -1;
    }
}

const readData = (columnType, columnData) => {

    const type = columnType;

    switch (type) {
        case 8: //Datetime
            //return columnData.toString('hex');
            return readDateTime(columnData);
            //return 0;
        case 9: //String
            //return columnData.toString('hex');
            return readString(columnData);
            //return 0;
        case 3: //Word
            //return columnData.toString('hex');
            return readWord(columnData);
            //return 0;
        case 6: //Float
            //return columnData.toString('hex');
            return readFloat(columnData);
            //return 0;
        default:
            return null;
    }
}

const lines = (data) => {
    const header = data.slice(4, 6);

    //return header.readInt8(0);
    return header.readInt16LE(0);
}

const rowSize = (data) => {
    const header = data.slice(16, 18);

    return header.readInt8(0);
    //return header.readInt16BE(0);
}

const columnsCount = (data) => {
    const header = data.slice(18, 20);

    return header.readInt8(0);
    //return header.readInt16BE(0);
}

const headerSize = (columnsCount) => {
    return 24 + (columnsCount * 40)
}

const headerBuff = (data, headerSize) => {
    //Apenas o cabeçalho sem a indicação do tipo do arquivo
    return data.slice(24, headerSize);
}

const dataBuff = (data, headerSize) => {
    return data.slice(headerSize, data.length);
}

const columnsHeaders = (headerBuff, columnsCount) => {

    let columnsHeaders = [];

    for (let i = 0; i < columnsCount; i++) {
        let slicer = i * 40;
        const columnName = readString(headerBuff.slice(slicer, slicer + 36));
        const columnType = readWord(headerBuff.slice(slicer + 36, slicer + 38));
        const columnSize = typeSize(columnType, readWord(headerBuff.slice(slicer + 38, slicer + 40)));

        columnsHeaders.push({ columnName, columnType, columnSize });
    }

    return columnsHeaders;
}

const extractRowData = (dataBuff, columnsHeaders) => {
    let obj = {};
    let index = 0;
    columnsHeaders.forEach(column => {
        const _data = dataBuff.slice(index, index + column.columnSize);
        obj[column.columnName] = readData(column.columnType, _data);
        index = index + column.columnSize;
    })

    return obj;
}

const dataRows = (dataBuff, columnsHeaders, rowSize) => {
    let data = [];
    for (let i = 0; i < dataBuff.length; i = i + rowSize) {
        const _data = dataBuff.slice(i, i + rowSize);
        data.push(extractRowData(_data, columnsHeaders));
    }

    return data;
}

// Function to export an array to Excel
function exportToExcel(arrayData, outputPath) {
    // Create a new workbook
    const workbook = XLSX.utils.book_new();

    // Add a worksheet to the workbook
    const worksheet = XLSX.utils.json_to_sheet(arrayData);

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TAD');

    // Write the workbook to a file
    XLSX.writeFile(workbook, outputPath);

    console.log(`Excel file exported to: ${outputPath}`);
}

async function main(folderPath, excelOutputPath) {

    console.log("Iniciando script");

    const startTotalTime = new Date();
    /*
    const destinationConnection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '123456',
        port: 3307,
        database: 'mcarga_measurements'
    });
    */

    console.log("Conexões configuradas");


    console.log("Iniciando descriptografia...");

    //const folderPath = 'C:\\D\\tad_lia05';
    //const folderPath = 'C:\\D\\tad_lia05\\DEZEMBRO_2023\\teste';
    const files = await listFilesRecursively(folderPath) || [];

    let _dataRows = [];

    for await (const file of files) {
        console.log(file);
        const fileContent = await fs.readFile(file);
        //console.log(fileContent);
        if (validFileType(fileContent)) {
            const _linesCount = lines(fileContent);
            const _rowSize = rowSize(fileContent);
            const _columnsCount = columnsCount(fileContent);
            const _headerSize = headerSize(_columnsCount);
            const _headerBuff = headerBuff(fileContent, _headerSize);
            const _dataBuff = dataBuff(fileContent, _headerSize);
            const _columnsHeaders = columnsHeaders(_headerBuff, _columnsCount);
            const _tempDataRows = dataRows(_dataBuff, _columnsHeaders, _rowSize);
            _dataRows.push(..._tempDataRows);
        }
    }
    _dataRows = _dataRows.sort((m1, m2) => m1.DateTime - m2.DateTime)
        //const excelOutputPath = 'C:/Users/charles.jardim/Downloads/dados_tad_convertido.xlsx';

    exportToExcel(_dataRows, excelOutputPath);

    console.log(`Processo finalizado em ${(new Date() - startTotalTime)/1000} segundos`)
}

const excelOutputPath = 'C:/Users/charlesj/Downloads/dados_tad_convertido_TAD_2025_IVECO.xlsx';
const folderPath = 'C:/Users/charlesj/Downloads/TAD 2025 IVECO UN03/TAD 2025 IVECO';
//const excelOutputPath = 'C:/Users/charlesj/Downloads/dados_MBAI_teste_tvz_2025.xlsx';
//const folderPath = 'J:\\Backups MBAI\\IV170BD MGE\\IV170BD MGE\\tvz';

main(folderPath, excelOutputPath).then(_ => {

    console.log('Fim');
});