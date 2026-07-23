// เปลี่ยนค่าเหล่านี้ด้วยข้อมูลของคุณ
const SHEET_ID = '189G2MUOTfR1en6_8pjLJ2zP4TKEGQWF4gxNtwkCacj0'; // รหัส Google Sheet ของคุณ
const TELEGRAM_BOT_TOKEN = ''; // โทเคนของ Telegram Bot ของคุณ
const TELEGRAM_CHAT_ID = '7572101335'; // รหัสแชท Telegram ที่คุณต้องการส่งข้อความไป

// ============================================
// ✅ ฟังก์ชัน sendMessage ที่แก้ไขแล้ว
// ============================================
function sendMessage(message, retries = 3, delayMs = 500) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  if (!message || message.trim().length === 0) {
    Logger.log('⚠️  ข้อความว่าง - ไม่ส่ง');
    return false;
  }
  
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log('❌ ไม่มี BOT_TOKEN หรือ CHAT_ID');
    return false;
  }
  
  // ✅ แก้ไข 1: ลบ * ออกจากข้อความ (เพื่อไม่ให้มี Markdown ผิด)
  const plainMessage = message.replace(/\*/g, '');
  
  const options = {
    'method': 'post',
    'payload': {
      'chat_id': TELEGRAM_CHAT_ID,
      'text': plainMessage
      // ✅ แก้ไข 2: ไม่ใส่ parse_mode = ส่งเป็นข้อความธรรมดา
    },
    'muteHttpExceptions': true
  };
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const timestamp = new Date().toLocaleTimeString('th-TH');
      Logger.log('📤 [' + timestamp + '] พยายามครั้งที่ ' + attempt + '/' + retries);
      Logger.log('   ความยาว: ' + plainMessage.length + ' ตัวอักษร');
      Logger.log('   เริ่มต้น: "' + plainMessage.substring(0, 30).replace(/\n/g, '↵') + '..."');
      
      const response = UrlFetchApp.fetch(url, options);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      Logger.log('   Response Code: ' + responseCode);
      
      if (responseCode === 200) {
        try {
          const result = JSON.parse(responseText);
          
          if (result.ok) {
            Logger.log('✅ ส่งสำเร็จ - Message ID: ' + result.result.message_id);
            
            if (delayMs > 0) {
              Logger.log('⏱️  หน่วงเวลา ' + delayMs + ' ms');
              Utilities.sleep(delayMs);
            }
            
            return true;
          } else {
            Logger.log('❌ Telegram Error: ' + result.description);
            Logger.log('   Error Code: ' + (result.error_code || 'N/A'));
            
            if (result.description && result.description.includes('Too Many Requests')) {
              const retryAfter = result.parameters && result.parameters.retry_after 
                ? result.parameters.retry_after * 1000 
                : 3000 * attempt;
              
              Logger.log('⏱️  Rate Limited - รอ ' + (retryAfter / 1000) + ' วินาที');
              
              if (attempt < retries) {
                Utilities.sleep(retryAfter);
                continue;
              }
            }
            
            if (result.description && result.description.includes('too long')) {
              Logger.log('❌ ข้อความยาวเกินไป - ควรแบ่งเป็นส่วนเล็กลง');
              return false;
            }
          }
        } catch (parseError) {
          Logger.log('❌ ไม่สามารถ parse response: ' + parseError.toString());
          Logger.log('   Response: ' + responseText);
        }
      } else if (responseCode === 400) {
        // ✅ แก้ไข 3: แสดง Response Body เพื่อดู error message
        Logger.log('❌ HTTP 400 - Bad Request');
        Logger.log('   Response Body: ' + responseText);
        Logger.log('   ข้อความ 100 ตัวแรก: "' + plainMessage.substring(0, 100) + '"');
        
        // ถ้ายังเป็น 400 ให้ลองลดขนาดข้อความ
        if (plainMessage.length > 3500) {
          Logger.log('   💡 คำแนะนำ: ข้อความยาวมาก ลอง ลด MAX_MESSAGE_LENGTH เป็น 3000');
        }
      } else {
        Logger.log('❌ HTTP Error: ' + responseCode);
        Logger.log('   Response: ' + responseText.substring(0, 200));
      }
      
    } catch (error) {
      Logger.log('❌ Exception: ' + error.toString());
      Logger.log('   Stack: ' + error.stack);
    }
    
    if (attempt < retries) {
      const waitTime = 1500 * attempt;
      Logger.log('⏱️  รอ ' + (waitTime / 1000) + ' วินาที ก่อนพยายามอีกครั้ง');
      Utilities.sleep(waitTime);
    }
  }
  
  Logger.log('❌ ส่งข้อความล้มเหลวหลังจากพยายาม ' + retries + ' ครั้ง');
  Logger.log('   ข้อความที่ล้มเหลว (100 ตัวอักษรแรก):');
  Logger.log('   "' + plainMessage.substring(0, 100) + '..."');
  
  return false;
}

// ============================================
// ✅ ฟังก์ชัน splitAndSendMessage ที่แก้ไขแล้ว
// ============================================
function splitAndSendMessage(message) {
  const MAX_MESSAGE_LENGTH = 4000;
  
  Logger.log('=== เริ่มแบ่งและส่งข้อความ ===');
  Logger.log('ความยาวทั้งหมด: ' + message.length + ' ตัวอักษร');
  
  if (message.length <= MAX_MESSAGE_LENGTH) {
    Logger.log('ส่งทั้งหมดในครั้งเดียว');
    const success = sendMessage(message);
    Logger.log(success ? '✅ ส่งสำเร็จ' : '❌ ส่งล้มเหลว');
    return;
  }
  
  let currentIndex = 0;
  let partNumber = 1;
  let successCount = 0;
  let failCount = 0;
  
  while (currentIndex < message.length) {
    Logger.log('\n--- ส่วนที่ ' + partNumber + ' ---');
    
    let endIndex = Math.min(currentIndex + MAX_MESSAGE_LENGTH, message.length);
    let part = message.substring(currentIndex, endIndex);
    
    let lastNewline = part.lastIndexOf('\n');
    
    if (lastNewline !== -1 && endIndex < message.length) {
      part = part.substring(0, lastNewline);
      currentIndex += lastNewline + 1;
    } else {
      currentIndex += part.length;
    }
    
    Logger.log('ส่งส่วนที่ ' + partNumber + ' (' + part.length + ' ตัวอักษร)');
    
    // ส่งข้อความพร้อมตรวจสอบผลลัพธ์
    const success = sendMessage(part, 3, 500);
    
    if (success) {
      successCount++;
      Logger.log('✅ ส่วนที่ ' + partNumber + ' สำเร็จ');
    } else {
      failCount++;
      Logger.log('❌ ส่วนที่ ' + partNumber + ' ล้มเหลว');
      
      // ถ้าส่งล้มเหลว 3 ส่วนติดต่อกัน ให้หยุด
      if (failCount >= 3) {
        Logger.log('❌ ส่งล้มเหลว 3 ส่วนติดกัน - หยุดการส่ง');
        break;
      }
    }
    
    partNumber++;
    
    // หน่วงเวลาระหว่างส่วน
    if (currentIndex < message.length) {
      Utilities.sleep(500);
    }
  }
  
  Logger.log('\n=== สรุปการส่ง ===');
  Logger.log('ส่งทั้งหมด: ' + (partNumber - 1) + ' ส่วน');
  Logger.log('สำเร็จ: ' + successCount + ' ส่วน');
  Logger.log('ล้มเหลว: ' + failCount + ' ส่วน');
  
  if (failCount === 0) {
    Logger.log('🎉 ส่งสำเร็จทั้งหมด!');
  } else {
    Logger.log('⚠️  บางส่วนส่งล้มเหลว');
  }
}


// ============================================
// 📊 ฟังก์ชันหลัก sendReportToTelegram (อัปเดตแล้ว)
// ============================================
function sendReportToTelegram() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  Logger.log('Spreadsheet ID is: ' + spreadsheet.getId());

  const sheet = spreadsheet.getSheetByName('PR');
  Logger.log('Sheet name is: ' + sheet.getName());
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const headers = values.shift();

  const statusIndex = headers.indexOf('STATUS');
  const approvalIndex = headers.indexOf('APPROVAL');
  const prNoIndex = headers.indexOf('Pr No.');
  const orderIndex = headers.indexOf('ORDER');
  const qtyIndex = headers.indexOf('QTY.');
  const unitIndex = headers.indexOf('UNIT');
  const poNoIndex = headers.indexOf('PO No.');
  const delDateIndex = headers.indexOf('วันที่ส่ง');
  const remarkIndex = headers.indexOf('Remark');

  const columnChecks = [
    { name: 'STATUS', index: statusIndex },
    { name: 'APPROVAL', index: approvalIndex },
    { name: 'Pr No.', index: prNoIndex },
    { name: 'ORDER', index: orderIndex },
    { name: 'QTY.', index: qtyIndex },
    { name: 'UNIT', index: unitIndex },
    { name: 'PO No.', index: poNoIndex },
    { name: 'Remark', index: remarkIndex }
  ];

  let foundAllColumns = true;
  for (const check of columnChecks) {
    if (check.index === -1) {
      Logger.log(`ไม่พบคอลัมน์ "${check.name}"`);
      foundAllColumns = false;
    }
  }

  if (!foundAllColumns) {
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


// ============================================
// 🧪 ฟังก์ชันทดสอบ
// ============================================
function testTelegramConnection() {
  Logger.log('=== ทดสอบการเชื่อมต่อ Telegram ===\n');
  
  if (typeof TELEGRAM_BOT_TOKEN === 'undefined' || !TELEGRAM_BOT_TOKEN) {
    Logger.log('❌ ไม่พบ TELEGRAM_BOT_TOKEN');
    return false;
  }
  
  if (typeof TELEGRAM_CHAT_ID === 'undefined' || !TELEGRAM_CHAT_ID) {
    Logger.log('❌ ไม่พบ TELEGRAM_CHAT_ID');
    return false;
  }
  
  Logger.log('✅ พบ TELEGRAM_BOT_TOKEN');
  Logger.log('✅ พบ TELEGRAM_CHAT_ID: ' + TELEGRAM_CHAT_ID);
  
  // ทดสอบ getMe API
  Logger.log('\nทดสอบ Bot API:');
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
    const response = UrlFetchApp.fetch(url);
    const result = JSON.parse(response.getContentText());
    
    if (result.ok) {
      Logger.log('✅ Bot ทำงานปกติ');
      Logger.log('   Bot Name: ' + result.result.first_name);
      Logger.log('   Bot Username: @' + result.result.username);
    } else {
      Logger.log('❌ Bot API Error: ' + result.description);
      return false;
    }
  } catch (error) {
    Logger.log('❌ ไม่สามารถเชื่อมต่อ Telegram API: ' + error.toString());
    return false;
  }
  
  // ทดสอบส่งข้อความ
  Logger.log('\nทดสอบส่งข้อความ:');
  const testMsg = '🧪 ทดสอบการส่งข้อความ\nเวลา: ' + new Date().toLocaleString('th-TH');
  const success = sendMessage(testMsg);
  
  return success;
}


// ============================================
// 📝 คำแนะนำการใช้งาน
// ============================================
/*
วิธีใช้งาน:

1. แก้ไข Constants ด้านบน:
   - SHEET_ID: ID ของ Google Spreadsheet
   - TELEGRAM_BOT_TOKEN: Token ของ Telegram Bot
   - TELEGRAM_CHAT_ID: Chat ID ที่จะส่งข้อความไป

2. ทดสอบการเชื่อมต่อ:
   - เรียกฟังก์ชัน testTelegramConnection()
   - ตรวจสอบ Log ว่าเชื่อมต่อได้หรือไม่

3. ใช้งานจริง:
   - เรียกฟังก์ชัน sendReportToTelegram()
   - ดู Log เพื่อติดตามความคืบหน้า

4. ตรวจสอบผลลัพธ์:
   - เปิด Telegram ดูว่าได้รับข้อความครบถ้วนหรือไม่
   - ดู Execution Log ใน Apps Script

การปรับแต่ง:
- เปลี่ยน MAX_MESSAGE_LENGTH ถ้าต้องการแบ่งข้อความเป็นส่วนเล็กลง
- เปลี่ยน retries ใน sendMessage ถ้าต้องการพยายามมากขึ้น
- เปลี่ยน delayMs ถ้าต้องการหน่วงเวลามากขึ้น
*/
