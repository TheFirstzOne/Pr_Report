function sendReportToTelegram() {
 const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  // Logger.log('Spreadsheet ID is: ' + spreadsheet.getId()); // ตรวจสอบ Spreadsheet ID

  const sheet = spreadsheet.getSheetByName('PR');
  // Logger.log('Sheet name is: ' + sheet.getName()); // ตรวจสอบชื่อชีต
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values.shift(); // ดึงแถวหัวข้อออก

  const statusIndex = headers.indexOf('STATUS');
  const approvalIndex = headers.indexOf('APPROVAL');
  const prNoIndex = headers.indexOf('Pr No.');
  const orderIndex = headers.indexOf('ORDER');
  const qtyIndex = headers.indexOf('QTY.');
  const unitIndex = headers.indexOf('UNIT');
  const poNoIndex = headers.indexOf('PO No.');
  const delDateIndex = headers.indexOf('วันที่ส่ง');
  const remarkIndex = headers.indexOf('Remark');

  // สร้างอาร์เรย์ของชื่อคอลัมน์และดัชนี
  const columnChecks = [
    { name: 'STATUS', index: statusIndex },
    { name: 'Approval', index: approvalIndex },
    { name: 'PR No.', index: prNoIndex },
    { name: 'Order', index: orderIndex },
    { name: 'Qty', index: qtyIndex },
    { name: 'Unit', index: unitIndex },
    { name: 'PO No.', index: poNoIndex },
    { name: 'Remark', index: remarkIndex }
  ];

let foundAllColumns = true;

// วนลูปเพื่อตรวจสอบทีละรายการ
for (const check of columnChecks) {
  if (check.index === -1) {
    Logger.log(`ไม่พบคอลัมน์ "${check.name}"`);
    foundAllColumns = false;
  }
}

// ถ้ามีคอลัมน์ใดหายไป ให้หยุดการทำงาน
if (!foundAllColumns) {
  return;
}

  if (statusIndex === -1 || approvalIndex === -1 || prNoIndex === -1 || orderIndex === -1 || qtyIndex === -1 || unitIndex === -1 || poNoIndex === -1 || remarkIndex === -1) {
    Logger.log('ไม่พบคอลัมน์ที่จำเป็น');
    return;
  }

  const reportData = {
    'สถานะ Pr': {},
    'สถานะ PO': {},
    'สถานะ DEL.': {}
  };

  values.forEach(row => {
    const status = row[statusIndex];
    const approval = row[approvalIndex];
    const prNo = row[prNoIndex];
    const order = row[orderIndex];
    const qty = row[qtyIndex];
    const unit = row[unitIndex];
    const poNo = row[poNoIndex];
    const delDate = row[delDateIndex];
    const remark = row[remarkIndex];

    const fullItemText = `${order} จำนวน ${qty} ${unit}`;

    if (status === 'Pr') {
      if (!reportData['สถานะ Pr'][approval]) {
        reportData['สถานะ Pr'][approval] = {};
      }
      if (!reportData['สถานะ Pr'][approval][prNo]) {
        reportData['สถานะ Pr'][approval][prNo] = [];
      }
      reportData['สถานะ Pr'][approval][prNo].push(fullItemText);
    } else if (status === 'PO') {
      const displayApproval = poNo ? approval : "รอเปิด PO";
      if (!reportData['สถานะ PO'][displayApproval]) {
        reportData['สถานะ PO'][displayApproval] = {};
      }
      if (!reportData['สถานะ PO'][displayApproval][poNo]) {
        reportData['สถานะ PO'][displayApproval][poNo] = {};
      }
      if (!reportData['สถานะ PO'][displayApproval][poNo][prNo]) {
        reportData['สถานะ PO'][displayApproval][poNo][prNo] = [];
      }
      reportData['สถานะ PO'][displayApproval][poNo][prNo].push(fullItemText);
    } else if (status === 'DEL.') {
      if (!reportData['สถานะ DEL.'][poNo]) {
        reportData['สถานะ DEL.'][poNo] = {};
      }
      if (!reportData['สถานะ DEL.'][poNo][prNo]) {
        reportData['สถานะ DEL.'][poNo][prNo] = [];
      }
      const remarkInfo = remark ? ` "${remark}"` : '';
      reportData['สถานะ DEL.'][poNo][prNo].push(`${order} จำนวน ${qty} ${unit}${remarkInfo}`);
    }
  });

  const messageParts = [];
  
  // สร้างรายงานสำหรับสถานะ Pr
  messageParts.push('*สถานะ Pr*');
  for (const approval in reportData['สถานะ Pr']) {
    messageParts.push(`:${approval}`);
    for (const prNo in reportData['สถานะ Pr'][approval]) {
      messageParts.push(`>${prNo}`);
      reportData['สถานะ Pr'][approval][prNo].forEach(item => {
        messageParts.push(`>>${item}`);
      });
    }
  }

  // สร้างรายงานสำหรับสถานะ PO
  messageParts.push('\n*สถานะ PO*');
  for (const approval in reportData['สถานะ PO']) {
    messageParts.push(`:${approval}`);
    for (const poNo in reportData['สถานะ PO'][approval]) {
      messageParts.push(`>>หมายเลข Po No. ${poNo}`);
      for (const prNo in reportData['สถานะ PO'][approval][poNo]) {
        messageParts.push(`>>>หมายเลข Pr No. ${prNo}`);
        reportData['สถานะ PO'][approval][poNo][prNo].forEach(item => {
          messageParts.push(`>>>>${item}`);
        });
      }
    }
  }

  // สร้างรายงานสำหรับสถานะ DEL.
  messageParts.push('\n*สถานะ DEL.*');
  for (const poNo in reportData['สถานะ DEL.']) {
    messageParts.push(`>Po No. ${poNo}`);
    for (const prNo in reportData['สถานะ DEL.'][poNo]) {
      messageParts.push(`>>Pr No. ${prNo}`);
      reportData['สถานะ DEL.'][poNo][prNo].forEach(item => {
        messageParts.push(`>>>${item}`);
      });
    }
  }

  const fullMessage = messageParts.join('\n');
  
  if (fullMessage.length > 0) {
    splitAndSendMessage(fullMessage);
  }
}

// ฟังก์ชันใหม่สำหรับแยกข้อความและส่งทีละส่วน
function splitAndSendMessage(message) {
  const MAX_MESSAGE_LENGTH = 4000; // ตั้งค่าความยาวสูงสุดที่ปลอดภัย
  if (message.length <= MAX_MESSAGE_LENGTH) {
    sendMessage(message);
    return;
  }
  
  let currentIndex = 0;
  while (currentIndex < message.length) {
    let part = message.substring(currentIndex, currentIndex + MAX_MESSAGE_LENGTH);
    let lastNewline = part.lastIndexOf('\n');
    
    // ตัดข้อความที่บรรทัดสุดท้ายเพื่อไม่ให้ข้อความขาดกลางคัน
    if (lastNewline !== -1 && currentIndex + MAX_MESSAGE_LENGTH < message.length) {
      part = part.substring(0, lastNewline);
    }
    
    sendMessage(part);
    currentIndex += part.length;
    // หน่วงเวลาเล็กน้อยเพื่อหลีกเลี่ยงการถูกจำกัดอัตราการส่งของ Telegram
    Utilities.sleep(1000); 
  }
}

function sendMessage(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    'method': 'post',
    'payload': {
      'chat_id': TELEGRAM_CHAT_ID,
      'text': message,
      'parse_mode': 'Markdown'
    },
    'muteHttpExceptions': true
  };
  UrlFetchApp.fetch(url, options);
}
