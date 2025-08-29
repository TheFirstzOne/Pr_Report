// เปลี่ยนค่า placeholder ต่อไปนี้ด้วยข้อมูลของคุณ
// 1. Google Sheet ID: ดูได้จาก URL ของ Google Sheet
// const SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE'; 

// 2. ข้อมูล Telegram Bot:
//    - TELEGRAM_BOT_TOKEN: จาก @BotFather ใน Telegram
//    - TELEGRAM_CHAT_ID: ID ของกลุ่มหรือผู้รับที่ต้องการให้ส่งข้อความไป
// const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
// const TELEGRAM_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID_HERE'; 

// ฟังก์ชันหลักที่ใช้ในการสร้างและส่งรายงาน
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
  // ตรวจสอบว่าชีทชื่อ 'PR' มีอยู่จริง
  const sheet = ss.getSheetByName('PR');
  if (!sheet) {
    Logger.log("ไม่พบชีทชื่อ 'PR'");
    return null;
  }
  
  // ดึงข้อมูลทั้งหมดจาก A2 ถึงคอลัมน์ O แถวสุดท้าย
  const lastRow = sheet.getLastRow();
  // ข้อมูลจากแถว A1:O985
  // Columns: A=DATE, K=TOTAL PRICE, N=Category
  return sheet.getRange(2, 1, lastRow - 1, 15).getValues(); 
}

// ฟังก์ชันสำหรับประมวลผลข้อมูลและสรุปยอดรวม
function processData(data) {
  const summary = {};
  
  data.forEach(row => {
    try {
      // ดึงข้อมูลจากคอลัมน์ที่ถูกต้องตามที่คุณระบุ
      const date = new Date(row[0]); // คอลัมน์แรก (index 0) สำหรับวันที่ (DATE)
      const totalPrice = parseFloat(row[9]); // คอลัมน์ที่ 10 (index 9) สำหรับค่าใช้จ่ายรวม (TOTAL PRICE)
      const category = row[14] ? String(row[14]).trim() : 'ไม่มีประเภท'; // คอลัมน์ที่ 15 (index 14) สำหรับประเภท (Category)

      // ตรวจสอบว่าค่าที่ดึงมาเป็นตัวเลขที่ถูกต้องหรือไม่
      if (isNaN(totalPrice) || totalPrice === 0) {
        return; // ถ้าไม่ใช่ตัวเลขหรือเป็น 0 ให้ข้ามรายการนี้
      }

      // จัดกลุ่มข้อมูลตามเดือนและปี
      const yearMonth = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      
      // สร้างโครงสร้างข้อมูลถ้ายังไม่มี
      if (!summary[yearMonth]) {
        summary[yearMonth] = {
          total: 0,
          categories: {}
        };
      }
      
      // เพิ่มยอดรวม
      summary[yearMonth].total += totalPrice;
      
      // เพิ่มยอดรวมตามประเภท
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

// ฟังก์ชันสำหรับจัดรูปแบบข้อความรายงาน
function createReportMessage(summary) {
  let message = "📊 *รายงานสรุปค่าใช้จ่าย* 📊\n\n";

  // เรียงลำดับเดือนจากเก่าไปใหม่
  const sortedMonths = Object.keys(summary).sort();
  
  sortedMonths.forEach(yearMonth => {
    const [year, month] = yearMonth.split('-');
    const monthName = new Date(year, parseInt(month) - 1, 1).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
    
    // Header ของเดือน
    message += `*เดือน ${monthName}*\n`;
    message += `ค่าใช้จ่ายรวม: ${summary[yearMonth].total.toLocaleString()} บาท\n`;
    
    // รายละเอียดตามประเภท
    const categories = summary[yearMonth].categories;
    for (const category in categories) {
      message += `  - ${category}: ${categories[category].toLocaleString()} บาท\n`;
    }
    
    message += "\n"; // เว้นบรรทัด
  });
  
  return message;
}

// ฟังก์ชันสำหรับส่งข้อความไปยัง Telegram
function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const options = {
    'method': 'post',
    'payload': {
      'chat_id': TELEGRAM_CHAT_ID,
      'text': text,
      'parse_mode': 'Markdown' // เพื่อให้ข้อความแสดงผลเป็นตัวหนา
    }
  };
  
  try {
    UrlFetchApp.fetch(url, options);
    Logger.log("ส่งข้อความรายงานไปยัง Telegram เรียบร้อยแล้ว");
  } catch (e) {
    Logger.log(`ไม่สามารถส่งข้อความไป Telegram ได้: ${e.message}`);
  }
}
