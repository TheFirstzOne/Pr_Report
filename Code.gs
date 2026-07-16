// Google Apps Script backend for the Stock Management dashboard.
// Read-only JSON API over the spreadsheet's STOCK/requests/QuotationHistory/Budget/PR sheets.

const SHEET_ID = '1oOzyZxcfzzfirdeOKUO1m9S6NjXKFUFgkfhNzNZqtV8';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'all';
  let payload;

  try {
    if (action === 'stock') {
      payload = { stock: getStock() };
    } else if (action === 'requests') {
      payload = { requests: getRequests() };
    } else if (action === 'quotes') {
      payload = { quotes: getQuotes() };
    } else if (action === 'budget') {
      payload = { budget: getBudget() };
    } else if (action === 'orders') {
      payload = { orders: getOrders() };
    } else if (action === 'all') {
      payload = {
        stock: getStock(),
        requests: getRequests(),
        quotes: getQuotes(),
        budget: getBudget(),
        orders: getOrders()
      };
    } else {
      payload = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    payload = { error: err.toString() };
  }

  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// Reads a sheet's header row (trimmed) and data rows.
function getSheetRows_(sheetName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  return { headers: headers, rows: data.slice(1) };
}

function parseMoney_(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(String(val).replace(/,/g, '')) || 0;
}

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'M/d/yyyy');
  }
  return String(val || '');
}

function getStock() {
  const sheetData = getSheetRows_('STOCK');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const catIdx = headers.indexOf('CATEGORY');
  const descIdx = headers.indexOf('DESCRIPTION');
  const qtyIdx = headers.indexOf('Qty.');
  const unitIdx = headers.indexOf('Unit');
  const reorderIdx = headers.indexOf('safety factor');
  const remarkIdx = headers.indexOf('Remark');
  const matCodeIdx = 1; // source sheet leaves this column's header blank

  return rows
    .filter(function (row) { return row[descIdx]; })
    .map(function (row) {
      return {
        id: String(row[matCodeIdx] || ''),
        name: String(row[descIdx] || ''),
        category: String(row[catIdx] || ''),
        unit: String(row[unitIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        reorder: Number(row[reorderIdx]) || 0,
        remark: String(row[remarkIdx] || '')
      };
    });
}

function getRequests() {
  const sheetData = getSheetRows_('requests');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const idIdx = headers.indexOf('req_id');
  const dateIdx = headers.indexOf('created_at');
  const whoIdx = headers.indexOf('who');
  const roleIdx = headers.indexOf('role');
  const partIdx = headers.indexOf('part');
  const qtyIdx = headers.indexOf('qty');
  const remarkIdx = headers.indexOf('remark');
  const urgentIdx = headers.indexOf('urgent');
  const statusIdx = headers.indexOf('status');
  const photoIdx = headers.indexOf('photo_url');

  return rows
    .filter(function (row) { return row[idIdx]; })
    .map(function (row) {
      return {
        id: String(row[idIdx] || ''),
        date: String(row[dateIdx] || ''),
        who: String(row[whoIdx] || ''),
        role: String(row[roleIdx] || ''),
        part: String(row[partIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        remark: String(row[remarkIdx] || ''),
        urgent: String(row[urgentIdx]).toUpperCase() === 'TRUE',
        status: String(row[statusIdx] || ''),
        photoUrl: String(row[photoIdx] || '')
      };
    });
}

function getQuotes() {
  const sheetData = getSheetRows_('QuotationHistory');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const noIdx = headers.indexOf('ลำดับ');
  const itemIdx = headers.indexOf('ชื่อสินค้า');
  const qtyIdx = headers.indexOf('จำนวน');
  const unitIdx = headers.indexOf('หน่วย');
  const unitPriceIdx = headers.indexOf('ราคาต่อหน่วย');
  const totalIdx = headers.indexOf('ราคารวม');
  const supplierIdx = headers.indexOf('บริษัทผู้เสนอราคา');
  const rfqRefIdx = headers.indexOf('ใบเสนอราคาเลขที่');
  const dateIdx = headers.indexOf('วันที่');

  return rows
    .filter(function (row) { return row[itemIdx]; })
    .map(function (row) {
      return {
        id: String(row[noIdx] || ''),
        itemName: String(row[itemIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        unit: String(row[unitIdx] || ''),
        unitPrice: Number(row[unitPriceIdx]) || 0,
        totalCost: Number(row[totalIdx]) || 0,
        supplier: String(row[supplierIdx] || ''),
        rfqRef: String(row[rfqRefIdx] || ''),
        date: String(row[dateIdx] || '')
      };
    });
}

function getBudget() {
  const sheetData = getSheetRows_('Budget');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const noIdx = headers.indexOf('No.');
  const ioIdx = headers.indexOf('IO');
  const assetIdx = headers.indexOf('ASSET');
  const costCenterIdx = headers.indexOf('COST CENTER');
  const descIdx = headers.indexOf('DESCRIPTION');
  const budgetIdx = headers.indexOf('BUDGET');
  const usedIdx = headers.indexOf('USED');
  const currentIdx = headers.indexOf('CURRENT');

  return rows
    .filter(function (row) { return row[ioIdx]; })
    .map(function (row) {
      return {
        no: Number(row[noIdx]) || 0,
        io: String(row[ioIdx] || ''),
        asset: String(row[assetIdx] || ''),
        costCenter: String(row[costCenterIdx] || ''),
        desc: String(row[descIdx] || ''),
        budget: parseMoney_(row[budgetIdx]),
        used: parseMoney_(row[usedIdx]),
        current: parseMoney_(row[currentIdx])
      };
    });
}

function getOrders() {
  const sheetData = getSheetRows_('PR');
  const headers = sheetData.headers;
  const rows = sheetData.rows;
  const dateIdx = headers.indexOf('DATE');
  const poIdx = headers.indexOf('PO No.');
  const prIdx = headers.indexOf('Pr No.');
  const matCodeIdx = headers.indexOf('MAT CODE');
  const itemIdx = headers.indexOf('ORDER');
  const qtyIdx = headers.indexOf('QTY.');
  const unitIdx = headers.indexOf('UNIT');
  const priceIdx = headers.indexOf('PRICES');
  const totalIdx = headers.indexOf('TOTAL PRICE');
  const statusIdx = headers.indexOf('STATUS');
  const categoryIdx = headers.indexOf('Category');
  const vendorIdx = headers.indexOf('VENDOR');

  return rows
    .filter(function (row) { return row[itemIdx]; })
    .map(function (row) {
      return {
        date: formatDate_(row[dateIdx]),
        poNo: String(row[poIdx] || ''),
        prNo: String(row[prIdx] || ''),
        matCode: String(row[matCodeIdx] || ''),
        itemName: String(row[itemIdx] || ''),
        qty: Number(row[qtyIdx]) || 0,
        unit: String(row[unitIdx] || ''),
        unitPrice: Number(row[priceIdx]) || 0,
        totalCost: Number(row[totalIdx]) || 0,
        status: String(row[statusIdx] || '').trim(),
        category: String(row[categoryIdx] || ''),
        vendor: String(row[vendorIdx] || '')
      };
    });
}

// Runnable self-check: in the Apps Script editor, select testAllSheets
// in the function dropdown and click Run, then read the Execution Log.
// Confirms every handler reads its sheet without throwing and returns
// an array — run this before wiring index.html to the deployed URL.
function testAllSheets() {
  const checks = [
    ['getStock', getStock],
    ['getRequests', getRequests],
    ['getQuotes', getQuotes],
    ['getBudget', getBudget],
    ['getOrders', getOrders]
  ];

  let allPass = true;
  checks.forEach(function (pair) {
    const name = pair[0];
    const fn = pair[1];
    try {
      const data = fn();
      if (!Array.isArray(data)) {
        throw new Error('expected an array, got ' + typeof data);
      }
      Logger.log('PASS ' + name + ': ' + data.length + ' rows. Sample: ' + JSON.stringify(data[0] || null));
    } catch (err) {
      allPass = false;
      Logger.log('FAIL ' + name + ': ' + err.toString());
    }
  });

  Logger.log(allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');
  return allPass;
}
