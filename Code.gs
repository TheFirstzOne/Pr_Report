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
  const matCodeIdx = headers.indexOf('MAT.');

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

// ==================== WRITE ENDPOINT (doPost) ====================
// Reads have moved to client-side gviz fetches; Code.gs now exists solely to
// handle the 2 actions that need write access (gviz is read-only, no auth).

function findRowByColumnValue_(sheetName, matchColumnName, matchValue) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(function (h) { return String(h).trim(); });
  const colIdx = headers.indexOf(matchColumnName);
  if (colIdx === -1) throw new Error('Column not found: ' + matchColumnName);
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx]) === String(matchValue)) {
      return { sheet: sheet, headers: headers, rowNumber: i + 1 };
    }
  }
  return null;
}

function setVerify_(reqId, verifyValue) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findRowByColumnValue_('requests', 'req_id', reqId);
    if (!found) return { error: 'Request not found: ' + reqId };
    const verifyColIdx = found.headers.indexOf('verify');
    if (verifyColIdx === -1) return { error: 'verify column not found in requests sheet' };
    const value = (verifyValue === true || String(verifyValue).toUpperCase() === 'TRUE') ? 'TRUE' : 'FALSE';
    found.sheet.getRange(found.rowNumber, verifyColIdx + 1).setValue(value);
    return { success: true, reqId: reqId, verify: value };
  } finally {
    lock.releaseLock();
  }
}

// Client sends a DELTA, not an absolute value — server re-reads fresh before
// applying it, so two near-simultaneous adjustments don't clobber each other
// (a stale absolute value from the client would).
function adjustStockQty_(partId, delta) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('STOCK');
    if (!sheet) return { error: 'Sheet not found: STOCK' };
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(function (h) { return String(h).trim(); });
    const qtyIdx = headers.indexOf('Qty.');
    const matCodeIdx = headers.indexOf('MAT.');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][matCodeIdx]) === String(partId)) {
        const currentQty = Number(data[i][qtyIdx]) || 0;
        const newQty = Math.max(0, currentQty + Number(delta));
        sheet.getRange(i + 1, qtyIdx + 1).setValue(newQty);
        return { success: true, partId: partId, qty: newQty };
      }
    }
    return { error: 'Part not found: ' + partId };
  } finally {
    lock.releaseLock();
  }
}

// Core function to adjust or add stock, lock-free.
function addStockCore_(item, sheet, data, headers) {
  const catIdx = headers.indexOf('CATEGORY');
  const matCodeIdx = headers.indexOf('MAT.');
  const descIdx = headers.indexOf('DESCRIPTION');
  const qtyIdx = headers.indexOf('Qty.');
  const unitIdx = headers.indexOf('Unit');
  const reorderIdx = headers.indexOf('safety factor');
  const remarkIdx = headers.indexOf('Remark');
  const valueIdx = headers.indexOf('Value');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][matCodeIdx]) === String(item.matCode)) {
      // Existing row: only bump Qty., leave every other field (incl. Value) untouched.
      const currentQty = Number(data[i][qtyIdx]) || 0;
      const newQty = currentQty + Number(item.qty);
      sheet.getRange(i + 1, qtyIdx + 1).setValue(newQty);
      return { success: true, matCode: item.matCode, qty: newQty, isNew: false };
    }
  }

  // Not found: append a new row, placing each value by its resolved header
  // index rather than assuming a fixed column order (the sheet has already
  // drifted once — a "No." column got inserted at A after this was written).
  const newRow = new Array(headers.length).fill('');
  if (catIdx !== -1) newRow[catIdx] = item.category;
  if (matCodeIdx !== -1) newRow[matCodeIdx] = item.matCode;
  if (descIdx !== -1) newRow[descIdx] = item.description;
  if (qtyIdx !== -1) newRow[qtyIdx] = Number(item.qty) || 0;
  if (unitIdx !== -1) newRow[unitIdx] = item.unit;
  if (reorderIdx !== -1) newRow[reorderIdx] = Number(item.reorder) || 0;
  if (remarkIdx !== -1) newRow[remarkIdx] = item.remark || '';
  if (valueIdx !== -1) newRow[valueIdx] = Number(item.value) || 0;
  sheet.appendRow(newRow);
  return { success: true, matCode: item.matCode, qty: Number(item.qty) || 0, isNew: true };
}

// Exists-vs-new decided server-side under one lock, so two people adding the
// same brand-new MAT code at nearly the same moment can't both create a
// duplicate row (the risk a client-side-only check couldn't rule out).
function addStock_(item) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('STOCK');
    if (!sheet) return { error: 'Sheet not found: STOCK' };
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(function (h) { return String(h).trim(); });
    return addStockCore_(item, sheet, data, headers);
  } finally {
    lock.releaseLock();
  }
}

// Full overwrite by MAT code — distinct from adjustStockQty_'s delta semantics.
// Used by the Stock tab's edit modal to correct any field, including a
// directly-entered absolute Qty. (a deliberate user correction, not a
// receive/issue delta).
function updateStock_(item) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const found = findRowByColumnValue_('STOCK', 'MAT.', item.matCode);
    if (!found) return { error: 'Part not found: ' + item.matCode };

    const catIdx = found.headers.indexOf('CATEGORY');
    const descIdx = found.headers.indexOf('DESCRIPTION');
    const qtyIdx = found.headers.indexOf('Qty.');
    const unitIdx = found.headers.indexOf('Unit');
    const reorderIdx = found.headers.indexOf('safety factor');
    const remarkIdx = found.headers.indexOf('Remark');
    const valueIdx = found.headers.indexOf('Value');

    if (catIdx !== -1) found.sheet.getRange(found.rowNumber, catIdx + 1).setValue(item.category || '');
    if (descIdx !== -1) found.sheet.getRange(found.rowNumber, descIdx + 1).setValue(item.description || '');
    if (qtyIdx !== -1) found.sheet.getRange(found.rowNumber, qtyIdx + 1).setValue(Number(item.qty) || 0);
    if (unitIdx !== -1) found.sheet.getRange(found.rowNumber, unitIdx + 1).setValue(item.unit || '');
    if (reorderIdx !== -1) found.sheet.getRange(found.rowNumber, reorderIdx + 1).setValue(Number(item.reorder) || 0);
    if (remarkIdx !== -1) found.sheet.getRange(found.rowNumber, remarkIdx + 1).setValue(item.remark || '');
    if (valueIdx !== -1) found.sheet.getRange(found.rowNumber, valueIdx + 1).setValue(Number(item.value) || 0);

    return {
      success: true,
      matCode: item.matCode,
      category: item.category || '',
      description: item.description || '',
      qty: Number(item.qty) || 0,
      unit: item.unit || '',
      reorder: Number(item.reorder) || 0,
      remark: item.remark || '',
      value: Number(item.value) || 0
    };
  } finally {
    lock.releaseLock();
  }
}

function receiveOrder_(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const prSheet = ss.getSheetByName('PR');
    if (!prSheet) return { error: 'Sheet not found: PR' };
    const prData = prSheet.getDataRange().getValues();
    const prHeaders = prData[0].map(function (h) { return String(h).trim(); });

    const poIdx = prHeaders.indexOf('PO No.');
    const prIdx = prHeaders.indexOf('Pr No.');
    const matCodeIdx = prHeaders.indexOf('MAT CODE');
    const qtyIdx = prHeaders.indexOf('QTY.');
    const statusIdx = prHeaders.indexOf('STATUS');

    if (poIdx === -1 || prIdx === -1 || matCodeIdx === -1 || qtyIdx === -1 || statusIdx === -1) {
      return { error: 'Required columns not found in PR sheet' };
    }

    const matches = [];
    for (let i = 1; i < prData.length; i++) {
      const row = prData[i];
      const matchPo = String(row[poIdx] || '') === String(payload.poNo || '');
      const matchPr = String(row[prIdx] || '') === String(payload.prNo || '');
      const matchMat = String(row[matCodeIdx] || '') === String(payload.matCode || '');
      const matchQty = Number(row[qtyIdx]) == Number(payload.qty);

      if (matchPo && matchPr && matchMat && matchQty) {
        matches.push(i + 1);
      }
    }

    if (matches.length === 0) {
      return { error: 'ไม่พบรายการ กรุณารีเฟรชและลองใหม่' };
    }
    if (matches.length > 1) {
      return { error: 'พบข้อมูลซ้ำ กรุณารีเฟรชและลองใหม่' };
    }

    const matchedRowIndex = matches[0];

    // Set that row's STATUS cell to 'RECEIVED'
    prSheet.getRange(matchedRowIndex, statusIdx + 1).setValue('RECEIVED');

    // Open STOCK sheet
    const stockSheet = ss.getSheetByName('STOCK');
    if (!stockSheet) return { error: 'Sheet not found: STOCK' };
    const stockData = stockSheet.getDataRange().getValues();
    const stockHeaders = stockData[0].map(function (h) { return String(h).trim(); });

    // Call addStockCore_
    const stockItem = {
      matCode: payload.matCode,
      category: payload.category || '',
      description: payload.description || '',
      unit: payload.unit || 'Pc',
      qty: Number(payload.qty) || 0,
      reorder: 0,
      remark: ''
    };

    const stockResult = addStockCore_(stockItem, stockSheet, stockData, stockHeaders);
    if (stockResult.error) {
      return { error: stockResult.error };
    }

    return {
      success: true,
      matCode: payload.matCode,
      qty: stockResult.qty,
      isNew: stockResult.isNew
    };
  } finally {
    lock.releaseLock();
  }
}

// Bulk status/PO-number write driven by a client-parsed SAP export upload.
// One lock for the whole batch (not one per row) — this is one logical
// operation (one file upload), not N independent writes. Re-checks each
// row's current STATUS isn't already RECEIVED under the lock even though
// the client already filtered for this client-side, because the export was
// parsed before the confirm click — a receive could have happened in
// between (defense in depth, not redundant).
const RECEIVED_STATUS_VALUES_ = ['RECEIVED', 'ได้รับแล้ว', 'OK', 'SUCCESS'];

function updatePrStatus_(updates) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('PR');
    if (!sheet) return { error: 'Sheet not found: PR' };
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(function (h) { return String(h).trim(); });

    const prIdx = headers.indexOf('Pr No.');
    const matCodeIdx = headers.indexOf('MAT CODE');
    const qtyIdx = headers.indexOf('QTY.');
    const statusIdx = headers.indexOf('STATUS');
    const poIdx = headers.indexOf('PO No.');

    if (prIdx === -1 || matCodeIdx === -1 || qtyIdx === -1 || statusIdx === -1 || poIdx === -1) {
      return { error: 'Required columns not found in PR sheet' };
    }

    const updated = [];
    const skipped = [];

    updates.forEach(function (update) {
      const matches = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const matchPr = String(row[prIdx] || '') === String(update.prNo || '');
        const matchMat = String(row[matCodeIdx] || '') === String(update.matCode || '');
        const matchQty = Number(row[qtyIdx]) === Number(update.qty);
        if (matchPr && matchMat && matchQty) {
          matches.push(i);
        }
      }

      if (matches.length !== 1) {
        skipped.push({ prNo: update.prNo, matCode: update.matCode, reason: 'not found' });
        return;
      }

      const rowIndex = matches[0];
      const currentStatus = String(data[rowIndex][statusIdx] || '').trim().toUpperCase();
      if (RECEIVED_STATUS_VALUES_.indexOf(currentStatus) !== -1) {
        skipped.push({ prNo: update.prNo, matCode: update.matCode, reason: 'already received' });
        return;
      }

      const sheetRow = rowIndex + 1;
      sheet.getRange(sheetRow, statusIdx + 1).setValue(update.status);
      if (update.status === 'PO' && update.poNo) {
        sheet.getRange(sheetRow, poIdx + 1).setValue(update.poNo);
      }

      updated.push({
        prNo: update.prNo,
        matCode: update.matCode,
        qty: update.qty,
        status: update.status,
        poNo: update.status === 'PO' ? (update.poNo || '') : ''
      });
    });

    return { success: true, updated: updated, skipped: skipped };
  } finally {
    lock.releaseLock();
  }
}

const GITHUB_REPO = 'TheFirstzOne/Maintenance_System';

// No LockService here — unlike adjustStockQty_/setVerify_, this doesn't
// read-modify-write a shared sheet row, so there's no race to guard
// against. Each call is an independent, unconditional POST to GitHub.
function submitFeedback_(payload) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    return { error: 'GITHUB_TOKEN ยังไม่ถูกตั้งค่าใน Script Properties' };
  }

  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();
  if (!subject || !message) {
    return { error: 'กรุณากรอกหัวข้อและรายละเอียด' };
  }

  const name = String(payload.name || 'ไม่ระบุตัวตน').trim();
  const role = String(payload.role || '').trim();
  const attribution = role ? (name + ' (' + role + ')') : name;
  const body = message + '\n\n---\nผู้แจ้ง: ' + attribution + '\nส่งจาก: Maintenance System (แท็บข้อเสนอแนะ)';

  const response = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/issues', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ title: subject, body: body, labels: ['feedback'] }),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();
  const result = JSON.parse(response.getContentText());
  if (status !== 201) {
    return { error: 'สร้าง Issue ไม่สำเร็จ: ' + (result.message || status) };
  }
  return { success: true, issueUrl: result.html_url, issueNumber: result.number };
}

function doPost(e) {
  let payload;
  try {
    const body = JSON.parse(e.postData.contents); // parse manually regardless of declared content-type
    if (body.action === 'setVerify') {
      if (!body.reqId) throw new Error('Missing reqId');
      payload = setVerify_(body.reqId, body.verify);
    } else if (body.action === 'adjustStockQty') {
      if (!body.partId || typeof body.delta === 'undefined') throw new Error('Missing partId/delta');
      payload = adjustStockQty_(body.partId, body.delta);
    } else if (body.action === 'addStock') {
      if (!body.matCode || !body.category || !body.description || !body.unit) {
        throw new Error('Missing required fields');
      }
      payload = addStock_(body);
    } else if (body.action === 'updateStock') {
      if (!body.matCode || !body.category || !body.description || !body.unit) {
        throw new Error('Missing required fields');
      }
      payload = updateStock_(body);
    } else if (body.action === 'receiveOrder') {
      if ((!body.poNo && !body.prNo) || !body.matCode || !body.qty) {
        throw new Error('Missing required fields');
      }
      payload = receiveOrder_(body);
    } else if (body.action === 'updatePrStatus') {
      if (!Array.isArray(body.updates) || body.updates.length === 0) {
        throw new Error('Missing updates array');
      }
      payload = updatePrStatus_(body.updates);
    } else if (body.action === 'submitFeedback') {
      if (!body.subject || !body.message) {
        throw new Error('Missing subject/message');
      }
      payload = submitFeedback_(body);
    } else {
      payload = { error: 'Unknown action: ' + body.action };
    }
  } catch (err) {
    payload = { error: err.toString() };
  }
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
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
