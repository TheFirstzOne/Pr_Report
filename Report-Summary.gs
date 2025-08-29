// เปลี่ยนค่า placeholder ต่อไปนี้ด้วยข้อมูลของคุณ
// 1. Google Sheet ID: ดูได้จาก URL ของ Google Sheet
// const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; 

// 2. ข้อมูล Telegram Bot:
//    - TELEGRAM_BOT_TOKEN: จาก @BotFather ใน Telegram
//    - TELEGRAM_CHAT_ID: ID ของกลุ่มหรือผู้รับที่ต้องการให้ส่งข้อความไป
// const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
// const TELEGRAM_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID_HERE'; 

// ฟังก์ชันหลักที่ใช้ในการสร้างและส่งรายงานพร้อมกราฟ
function generateAndSendReport() {
  
  // เรียกใช้ฟังก์ชันเพื่อดึงข้อมูล
  const data = getSheetData();
  if (!data || data.length === 0) {
    Logger.log("ไม่พบข้อมูลในชีท");
    return;
  }
  
  // เรียกใช้ฟังก์ชันเพื่อประมวลผลข้อมูล
  const monthlySummary = processData(data);
  
  // เรียกใช้ฟังก์ชันเพื่อสร้างข้อความรายงาน
  const reportText = createReportMessage(monthlySummary);
  
  // เรียกใช้ฟังก์ชันเพื่อส่งข้อความไปยัง Telegram
  sendTelegramMessage(reportText);
}

// ฟังก์ชันสำหรับดึงข้อมูลทั้งหมดจากชีท 'PR'
function getSheetData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('PR');
  if (!sheet) {
    Logger.log("ไม่พบชีทชื่อ 'PR'");
    return null;
  }
  
  const lastRow = sheet.getLastRow();
  // ดึงข้อมูลทั้งหมดจาก A2 ถึงคอลัมน์ O แถวสุดท้าย
  // Columns: A=DATE, J=TOTAL PRICE, O=Category
  return sheet.getRange(2, 1, lastRow - 1, 15).getValues(); 
}

function processData(data) {
  const summary = {};
  
  data.forEach(row => {
    try {
      const date = new Date(row[0]); 
      const totalPrice = parseFloat(row[9]);
      const category = row[14] ? String(row[14]).trim() : 'ไม่มีประเภท';
      const status = row[11] ? String(row[11]).trim() : ''; 

      const allowedStatuses = ["Pr", "PO", "DEL.", "RECEIVED"];
      if (isNaN(totalPrice) || totalPrice === 0 || !allowedStatuses.includes(status)) {
        return; 
      }

      const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!summary[yearMonth]) {
        summary[yearMonth] = {
          total: 0,
          categories: {}
        };
      }
      
      summary[yearMonth].total += totalPrice;
      
      if (!summary[yearMonth].categories[category]) {
        summary[yearMonth].categories[category] = 0;
      }
      summary[yearMonth].categories[category] += totalPrice;
      
    } catch (e) {
      Logger.log(`ข้อผิดพลาดในการประมวลผลข้อมูล: ${e.message} สำหรับแถว: ${row}`);
    }
  });
  
  return summary;
}

// ฟังก์ชันใหม่: สร้างกราฟฮิสโตแกรมและแปลงเป็น Blob (ไฟล์ภาพ)
function createChartBlob(summary) {
  const dataTable = Charts.newDataTable()
    .addColumn(Charts.ColumnType.STRING, 'เดือน')
    .addColumn(Charts.ColumnType.NUMBER, 'ค่าใช้จ่ายรวม')
    .build();

  const sortedMonths = Object.keys(summary).sort();
  sortedMonths.forEach(yearMonth => {
    const [year, month] = yearMonth.split('-');
    const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
    dataTable.addRow([monthName, summary[yearMonth].total]);
  });

  const chart = Charts.newBarChart()
    .setDataTable(dataTable)
    .setTitle('กราฟสรุปค่าใช้จ่ายรายเดือน')
    .setOption('legend', { position: 'none' })
    .setOption('hAxis', { title: 'ยอดค่าใช้จ่าย (บาท)' })
    .setOption('vAxis', { title: 'เดือน', format: '' })
    .setOption('colors', ['#1E90FF'])
    .build();

  return chart.getAs('image/png');
}

// ฟังก์ชันสำหรับจัดรูปแบบข้อความรายงาน
function createReportMessage(summary) {
  let message = "📊 *รายงานสรุปค่าใช้จ่าย* 📊\n\n";
  const sortedMonths = Object.keys(summary).sort();
  
  sortedMonths.forEach(yearMonth => {
    const [year, month] = yearMonth.split('-');
    const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
    
    message += `*เดือน ${monthName}*\n`;
    message += `ค่าใช้จ่ายรวม: ${summary[yearMonth].total.toLocaleString()} บาท\n`;
    
    const categories = summary[yearMonth].categories;
    for (const category in categories) {
      message += `  - ${category}: ${categories[category].toLocaleString()} บาท\n`;
    }
    
    message += "\n";
  });
  
  return message;
}

// ฟังก์ชันใหม่: ส่งรูปภาพพร้อมข้อความไปยัง Telegram
function sendTelegramPhoto(photoBlob, captionText) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`;
  
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    photo: photoBlob,
    caption: captionText,
    parse_mode: 'Markdown'
  };

  const options = {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  };
  
  try {
    UrlFetchApp.fetch(url, options);
    Logger.log("ส่งกราฟและรายงานไปยัง Telegram เรียบร้อยแล้ว");
  } catch (e) {
      Logger.log(`ไม่สามารถส่งกราฟและรายงานไป Telegram ได้: ${e.message}`);
  }
}

// ฟังก์ชันเดิมที่ใช้ส่งข้อความอย่างเดียว เผื่อเกิดข้อผิดพลาดในการส่งรูป
function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    'method': 'post',
    'payload': {
      'chat_id': TELEGRAM_CHAT_ID,
      'text': text,
      'parse_mode': 'Markdown'
    }
  };
  
  try {
    UrlFetchApp.fetch(url, options);
    Logger.log("ส่งข้อความรายงานไปยัง Telegram เรียบร้อยแล้ว");
  } catch (e) {
    Logger.log(`ไม่สามารถส่งข้อความไป Telegram ได้: ${e.message}`);
  }
}
