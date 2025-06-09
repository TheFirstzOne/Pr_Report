// 📊 PR Expense Dashboard - Google Apps Script Backend
// วางโค้ดนี้ใน Google Apps Script Project

/**
 * 🚀 สร้าง Web App สำหรับแสดง PR Dashboard
 */
function doGet() {
  return HtmlService.createTemplateFromFile('dashboard')
    .evaluate()
    .setTitle('PR Expense Monitoring Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 📁 รวมไฟล์ HTML/CSS/JS เข้าด้วยกัน
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * 📊 ดึงข้อมูลจาก Google Sheets และประมวลผล
 */
function getPRData() {
  try {
    // เปิด Google Sheets (ใส่ ID ของ Google Sheets ที่นี่)
    const spreadsheet = SpreadsheetApp.openById('Your_Sheeet_ID');
    const sheet = spreadsheet.getSheetByName('PR');
    
    if (!sheet) {
      throw new Error('ไม่พบ Sheet ชื่อ "PR"');
    }
    
    // ดึงข้อมูลทั้งหมด
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    console.log(`ดึงข้อมูลได้ ${rows.length} แถว`);
    
    // หา index ของคอลัมน์ที่ต้องการ
    const dateIndex = headers.indexOf('DATE');
    const prNoIndex = headers.indexOf('Pr No.');
    const totalPriceIndex = headers.indexOf('TOTAL PRICE');
    const orderIndex = headers.indexOf('ORDER');
    const qtyIndex = headers.indexOf('QTY.');
    const unitIndex = headers.indexOf('UNIT');
    const statusIndex = headers.indexOf('STATUS');
    
    if (dateIndex === -1 || totalPriceIndex === -1) {
      throw new Error('ไม่พบคอลัมน์ DATE หรือ TOTAL PRICE');
    }
    
    // ประมวลผลข้อมูล
    const processedData = [];
    const monthlyData = {};
    const allPRs = [];
    
    rows.forEach((row, index) => {
      const date = row[dateIndex];
      const totalPrice = parseFloat(row[totalPriceIndex]);
      const prNo = row[prNoIndex];
      const status = row[statusIndex] ? row[statusIndex].toString().toLowerCase().trim() : '';
      
      // ข้ามแถวที่ไม่มีข้อมูลสำคัญ
      if (!date || isNaN(totalPrice)) return;
      
      // ข้าม PR ที่มีสถานะ operate หรือ cancel
      if (status === 'operate' || status === 'cancel' || status === 'cancelled') return;
      
      // แปลงวันที่
      let dateObj;
      if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }
      
      if (isNaN(dateObj.getTime())) return;
      
      // สร้าง key เดือน (ภาษาไทย)
      const monthNames = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      
      const monthKey = `${monthNames[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
      
      // รวมข้อมูลรายเดือน
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          totalExpense: 0,
          recordCount: 0,
          activeRecordCount: 0,
          maxExpense: 0
        };
      }
      
      monthlyData[monthKey].totalExpense += totalPrice;
      monthlyData[monthKey].recordCount += 1;
      monthlyData[monthKey].activeRecordCount += 1;
      monthlyData[monthKey].maxExpense = Math.max(monthlyData[monthKey].maxExpense, totalPrice);
      
      // เก็บ PR ทั้งหมด (ยกเว้นสถานะ operate/cancel)
      if (prNo) {
        allPRs.push({
          prNo: prNo,
          amount: totalPrice,
          date: Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          month: monthKey,
          item: row[orderIndex] || 'ไม่ระบุ',
          qty: row[qtyIndex] || '',
          unit: row[unitIndex] || '',
          status: row[statusIndex] || 'PENDING'
        });
      }
      
      processedData.push({
        date: dateObj,
        totalPrice: totalPrice,
        month: monthKey
      });
    });
    
    // แปลงเป็น Array และเรียงลำดับ
    const monthlySummary = Object.values(monthlyData).sort((a, b) => {
      const monthOrder = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 
        'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
        'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
      ];
      
      const aMonth = a.month.split(' ')[0];
      const bMonth = b.month.split(' ')[0];
      const aYear = parseInt(a.month.split(' ')[1]);
      const bYear = parseInt(b.month.split(' ')[1]);
      
      if (aYear !== bYear) return aYear - bYear;
      return monthOrder.indexOf(aMonth) - monthOrder.indexOf(bMonth);
    });
    
    // คำนวณเปอร์เซ็นต์
    const totalExpense = monthlySummary.reduce((sum, month) => sum + month.totalExpense, 0);
    monthlySummary.forEach(month => {
      month.percentage = totalExpense > 0 ? (month.totalExpense / totalExpense * 100) : 0;
    });
    
    // เรียงลำดับ PR ทั้งหมดตามจำนวนเงิน
    allPRs.sort((a, b) => b.amount - a.amount);
    
    const result = {
      monthlySummary: monthlySummary,
      allPRs: allPRs,
      totalRecords: processedData.length,
      totalExpense: totalExpense,
      dateRange: {
        min: processedData.length > 0 ? Math.min(...processedData.map(d => d.date.getTime())) : null,
        max: processedData.length > 0 ? Math.max(...processedData.map(d => d.date.getTime())) : null
      }
    };
    
    console.log('ประมวลผลข้อมูลสำเร็จ:', {
      totalRecords: result.totalRecords,
      monthlyCount: result.monthlySummary.length,
      allPRsCount: result.allPRs.length,
      totalExpense: result.totalExpense
    });
    
    return result;
    
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.toString());
    return {
      error: error.toString(),
      monthlySummary: [],
      allPRs: [],
      totalRecords: 0,
      totalExpense: 0
    };
  }
}

/**
 * 🔧 ฟังก์ชันช่วยเหลือในการจัดรูปแบบตัวเลข
 */
function formatNumber(num) {
  if (typeof num !== 'number') return '0';
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
}

/**
 * 🔧 ฟังก์ชันช่วยเหลือในการจัดรูปแบบเงิน
 */
function formatCurrency(num) {
  if (typeof num !== 'number') return '0 ฿';
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }) + ' ฿';
}

/**
 * 📊 ทดสอบการดึงข้อมูล (สำหรับ debug)
 */
function testGetPRData() {
  const data = getPRData();
  console.log('ผลการทดสอบ:', JSON.stringify(data, null, 2));
  return data;
}

/**
 * 🚀 Deploy Web App
 * 1. บันทึกโปรเจค
 * 2. ไปที่ Deploy > New Deployment
 * 3. เลือก Type: Web app
 * 4. Execute as: Me
 * 5. Who has access: Anyone
 * 6. คลิก Deploy
 */
