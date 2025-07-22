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
 * 📊 ดึงข้อมูลจาก Google Sheets และประมวลผล (แก้ไขการเรียงลำดับแล้ว)
 */
function getPRData() {
  try {
    // เปิด Google Sheets (ใส่ ID ของ Google Sheets ที่นี่)
    const spreadsheet = SpreadsheetApp.openById('189G2MUOTfR1en6_8pjLJ2zP4TKEGQWF4gxNtwkCacj0');
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
    const remarkIndex = headers.indexOf('Remark'); // เพิ่มคอลัมน์หมายเหตุ
    
    if (dateIndex === -1 || totalPriceIndex === -1) {
      throw new Error('ไม่พบคอลัมน์ DATE หรือ TOTAL PRICE');
    }
    
    // ประมวลผลข้อมูล
    const processedData = [];
    const monthlyData = {};
    const allPRs = [];
    const uniquePRNumbers = new Set(); // เก็บ PR No. ที่ไม่ซ้ำกัน
    
    rows.forEach((row, index) => {
      // ใช้ฟังก์ชันตรวจสอบข้อมูลใหม่
      const validation = validateRowData(row, headers);
      if (!validation.valid) {
        console.log(`ข้ามแถว ${index + 2}: ${validation.reason}`);
        return;
      }
      
      const { date: dateObj, totalPrice, prNo } = validation.data;
      const status = row[statusIndex] ? row[statusIndex].toString().toLowerCase().trim() : '';
      
      // ข้าม PR ที่มีสถานะ operate หรือ cancel
      if (status === 'operate' || status === 'cancel' || status === 'cancelled') {
        console.log(`ข้ามแถว ${index + 2}: สถานะ ${status}`);
        return;
      }
      
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
          maxExpense: 0,
          uniquePRCount: 0,
          monthlyUniquePRs: new Set()
        };
      }
      
      monthlyData[monthKey].totalExpense += totalPrice;
      monthlyData[monthKey].recordCount += 1;
      monthlyData[monthKey].activeRecordCount += 1;
      monthlyData[monthKey].maxExpense = Math.max(monthlyData[monthKey].maxExpense, totalPrice);
      
      // เก็บ PR ทั้งหมด (ยกเว้นสถานะ operate/cancel) - รวมทุกรายการแม้ PR No. จะซ้ำ
      // เพิ่ม PR No. ในชุดข้อมูลสำหรับนับ unique
      if (prNo) {
        uniquePRNumbers.add(prNo);
        monthlyData[monthKey].monthlyUniquePRs.add(prNo);
      }
      
      // สร้างข้อมูล PR ที่จัดรูปแบบแล้ว
      const prData = formatPRData(row, headers, index, monthKey, validation.data);
      allPRs.push(prData);
      
      processedData.push({
        date: dateObj,
        totalPrice: totalPrice,
        month: monthKey
      });
    });
    
    // *** แก้ไขการเรียงลำดับ: วันที่ก่อน แล้วตาม PR No. (แก้ไข Error) ***
    allPRs.sort((a, b) => {
      // เปรียบเทียบวันที่ก่อน (เก่า → ใหม่)
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime(); // วันที่น้อย → มาก
      }
      
      // ถ้าวันที่เท่ากัน ให้เปรียบเทียบ PR No. (น้อย → มาก)
      // แก้ไข: ตรวจสอบประเภทข้อมูลก่อนใช้ .replace()
      function getPRNumber(prNo) {
        if (!prNo || typeof prNo !== 'string') {
          return 0; // ถ้าไม่ใช่ string หรือเป็น null/undefined
        }
        return parseInt(prNo.replace(/[^0-9]/g, '')) || 0;
      }
      
      const prNoA = getPRNumber(a.prNo);
      const prNoB = getPRNumber(b.prNo);
      
      return prNoA - prNoB; // PR No. น้อย → มาก
    });
    
    // ลบ dateObj ออกจาก allPRs เพื่อไม่ให้ส่งไปยัง frontend
    allPRs.forEach(pr => {
      delete pr.dateObj;
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
    
    // คำนวณจำนวน unique PR สำหรับแต่ละเดือน และลบ Set ออก (เพื่อไม่ให้ error ใน JSON)
    monthlySummary.forEach(month => {
      month.uniquePRCount = month.monthlyUniquePRs.size;
      delete month.monthlyUniquePRs; // ลบ Set ออกเพราะไม่สามารถ serialize เป็น JSON ได้
    });
    
    // คำนวณเปอร์เซ็นต์
    const totalExpense = monthlySummary.reduce((sum, month) => sum + month.totalExpense, 0);
    monthlySummary.forEach(month => {
      month.percentage = totalExpense > 0 ? (month.totalExpense / totalExpense * 100) : 0;
    });
    
    const result = {
      monthlySummary: monthlySummary,
      allPRs: allPRs,
      totalRecords: processedData.length,
      totalExpense: totalExpense,
      uniquePRCount: uniquePRNumbers.size, // จำนวน PR ที่ไม่ซ้ำกัน
      dateRange: {
        min: processedData.length > 0 ? Math.min(...processedData.map(d => d.date.getTime())) : null,
        max: processedData.length > 0 ? Math.max(...processedData.map(d => d.date.getTime())) : null
      }
    };
    
    console.log('ประมวลผลข้อมูลสำเร็จ:', {
      totalRecords: result.totalRecords,
      monthlyCount: result.monthlySummary.length,
      allPRsCount: result.allPRs.length,
      uniquePRCount: result.uniquePRCount,
      totalExpense: result.totalExpense,
      sortingInfo: `เรียงลำดับแล้ว: วันที่ (${result.allPRs[0]?.date}) → (${result.allPRs[result.allPRs.length-1]?.date})`
    });
    
    return result;
    
  } catch (error) {
    console.error('เกิดข้อผิดพลาด:', error.toString());
    return {
      error: error.toString(),
      monthlySummary: [],
      allPRs: [],
      totalRecords: 0,
      totalExpense: 0,
      uniquePRCount: 0
    };
  }
}

/**
 * 🔧 ฟังก์ชันตรวจสอบข้อมูลก่อนประมวลผล (แก้ไข Error)
 */
function validateRowData(row, headers) {
  const dateIndex = headers.indexOf('DATE');
  const prNoIndex = headers.indexOf('Pr No.');
  const totalPriceIndex = headers.indexOf('TOTAL PRICE');
  
  // ตรวจสอบข้อมูลพื้นฐาน
  const date = row[dateIndex];
  const totalPrice = row[totalPriceIndex];
  const prNo = row[prNoIndex];
  
  // ตรวจสอบว่ามีข้อมูลสำคัญหรือไม่
  if (!date) {
    return { valid: false, reason: 'ไม่มีวันที่' };
  }
  
  if (totalPrice === null || totalPrice === undefined || totalPrice === '') {
    return { valid: false, reason: 'ไม่มีราคา' };
  }
  
  const parsedPrice = parseFloat(totalPrice);
  if (isNaN(parsedPrice)) {
    return { valid: false, reason: 'ราคาไม่ใช่ตัวเลข' };
  }
  
  // ตรวจสอบวันที่
  let dateObj;
  if (date instanceof Date) {
    dateObj = date;
  } else {
    dateObj = new Date(date);
  }
  
  if (isNaN(dateObj.getTime())) {
    return { valid: false, reason: 'วันที่ไม่ถูกต้อง' };
  }
  
  return { 
    valid: true, 
    data: {
      date: dateObj,
      totalPrice: parsedPrice,
      prNo: prNo ? String(prNo) : null
    }
  };
}

/**
 * 🔧 ฟังก์ชันจัดรูปแบบข้อมูล PR (แก้ไข Error + เพิ่ม Remark)
 */
function formatPRData(row, headers, index, monthKey, validatedData) {
  const orderIndex = headers.indexOf('ORDER');
  const qtyIndex = headers.indexOf('QTY.');
  const unitIndex = headers.indexOf('UNIT');
  const statusIndex = headers.indexOf('STATUS');
  const remarkIndex = headers.indexOf('Remark'); // เพิ่มคอลัมน์หมายเหตุ
  
  // ใช้ข้อมูลที่ผ่านการตรวจสอบแล้ว
  const { date: dateObj, totalPrice, prNo } = validatedData;
  
  return {
    prNo: prNo || `NO_PR_${index + 2}`,
    amount: totalPrice,
    date: Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    month: monthKey,
    item: row[orderIndex] ? String(row[orderIndex]) : 'ไม่ระบุ',
    qty: row[qtyIndex] ? String(row[qtyIndex]) : '',
    unit: row[unitIndex] ? String(row[unitIndex]) : '',
    status: row[statusIndex] ? String(row[statusIndex]) : 'PENDING',
    remark: row[remarkIndex] ? String(row[remarkIndex]) : '', // เพิ่มหมายเหตุ
    rowIndex: index + 2
  };
}

/**
 * 🔧 ฟังก์ชันช่วยเหลือในการจัดรูปแบบตัวเลข (แก้ไข Error)
 */
function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
}

/**
 * 🔧 ฟังก์ชันช่วยเหลือในการจัดรูปแบบเงิน (แก้ไข Error)
 */
function formatCurrency(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0 ฿';
  return num.toLocaleString('th-TH', { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  }) + ' ฿';
}

/**
 * 🧪 ทดสอบการเพิ่มคอลัมน์หมายเหตุ
 */
function testRemarkColumn() {
  console.log('=== ทดสอบการเพิ่มคอลัมน์หมายเหตุ ===');
  
  try {
    const spreadsheet = SpreadsheetApp.openById('189G2MUOTfR1en6_8pjLJ2zP4TKEGQWF4gxNtwkCacj0');
    const sheet = spreadsheet.getSheetByName('PR');
    
    if (!sheet) {
      console.log('❌ ไม่พบ Sheet ชื่อ "PR"');
      return false;
    }
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const remarkIndex = headers.indexOf('Remark');
    
    console.log('📋 Headers ที่พบ:', headers);
    console.log(`📝 คอลัมน์ Remark: ${remarkIndex >= 0 ? `✅ พบที่ตำแหน่ง ${remarkIndex + 1}` : '❌ ไม่พบ'}`);
    
    if (remarkIndex >= 0) {
      // ทดสอบดึงข้อมูล Remark จากแถวตัวอย่าง
      const sampleData = sheet.getRange(2, 1, Math.min(5, sheet.getLastRow() - 1), sheet.getLastColumn()).getValues();
      
      console.log('📄 ตัวอย่างข้อมูล Remark:');
      sampleData.forEach((row, index) => {
        const remark = row[remarkIndex];
        console.log(`  แถว ${index + 2}: "${remark || '(ว่าง)'}" - ประเภท: ${typeof remark}`);
      });
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.error('❌ Error ใน testRemarkColumn:', error.toString());
    return false;
  }
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
 * 🧪 ทดสอบการแก้ไข TypeError
 */
function testErrorHandling() {
  console.log('=== ทดสอบการแก้ไข TypeError ===');
  
  // ทดสอบข้อมูลที่อาจทำให้เกิด error
  const testData = [
    { prNo: null, expected: 0 },
    { prNo: undefined, expected: 0 },
    { prNo: "", expected: 0 },
    { prNo: "PR001", expected: 1 },
    { prNo: "PR-123", expected: 123 },
    { prNo: "ABC456", expected: 456 },
    { prNo: 789, expected: 789 },
    { prNo: "NO-NUMBER", expected: 0 }
  ];
  
  // ฟังก์ชันทดสอบ
  function getPRNumber(prNo) {
    if (!prNo || typeof prNo !== 'string') {
      return 0;
    }
    return parseInt(prNo.replace(/[^0-9]/g, '')) || 0;
  }
  
  let allPassed = true;
  
  testData.forEach((test, index) => {
    try {
      const result = getPRNumber(test.prNo);
      const passed = result === test.expected;
      
      console.log(`Test ${index + 1}: ${passed ? '✅' : '❌'} prNo: ${test.prNo} → ${result} (expected: ${test.expected})`);
      
      if (!passed) {
        allPassed = false;
      }
    } catch (error) {
      console.log(`Test ${index + 1}: ❌ ERROR - ${error.message}`);
      allPassed = false;
    }
  });
  
  if (allPassed) {
    console.log('✅ ทุก Test ผ่านแล้ว - TypeError ถูกแก้ไขเรียบร้อย');
  } else {
    console.log('❌ บาง Test ไม่ผ่าน - ยังมี Error');
  }
  
  return { allPassed, testResults: testData };
}

/**
 * 🧪 ทดสอบการเรียงลำดับ PR
 */
function testPRSorting() {
  const data = getPRData();
  
  if (data.allPRs && data.allPRs.length > 0) {
    console.log('=== ตัวอย่างการเรียงลำดับ PR ===');
    console.log('รายการ 10 อันดับแรก:');
    
    data.allPRs.slice(0, 10).forEach((pr, index) => {
      console.log(`${index + 1}. วันที่: ${pr.date}, PR No.: ${pr.prNo}, จำนวน: ${formatCurrency(pr.amount)}`);
    });
    
    console.log('\nรายการ 10 อันดับสุดท้าย:');
    data.allPRs.slice(-10).forEach((pr, index) => {
      const actualIndex = data.allPRs.length - 10 + index + 1;
      console.log(`${actualIndex}. วันที่: ${pr.date}, PR No.: ${pr.prNo}, จำนวน: ${formatCurrency(pr.amount)}`);
    });
    
    // ตรวจสอบการเรียงลำดับ
    let sortingCorrect = true;
    for (let i = 1; i < data.allPRs.length; i++) {
      const current = data.allPRs[i];
      const previous = data.allPRs[i - 1];
      
      const currentDate = new Date(current.date);
      const previousDate = new Date(previous.date);
      
      // ตรวจสอบวันที่
      if (currentDate < previousDate) {
        sortingCorrect = false;
        console.error(`❌ เรียงลำดับผิด ที่ index ${i}: ${previous.date} > ${current.date}`);
        break;
      }
      
      // ถ้าวันที่เท่ากัน ตรวจสอบ PR No.
      if (currentDate.getTime() === previousDate.getTime()) {
        // แก้ไข: ตรวจสอบประเภทข้อมูลก่อนใช้ .replace()
        function getPRNumber(prNo) {
          if (!prNo || typeof prNo !== 'string') {
            return 0;
          }
          return parseInt(prNo.replace(/[^0-9]/g, '')) || 0;
        }
        
        const currentPRNo = getPRNumber(current.prNo);
        const previousPRNo = getPRNumber(previous.prNo);
        
        if (currentPRNo < previousPRNo) {
          sortingCorrect = false;
          console.error(`❌ เรียงลำดับ PR No. ผิด ที่ index ${i}: ${previous.prNo} > ${current.prNo}`);
          break;
        }
      }
    }
    
    if (sortingCorrect) {
      console.log('✅ การเรียงลำดับถูกต้อง: วันที่ (เก่า → ใหม่) แล้วตาม PR No. (น้อย → มาก)');
    }
    
    return {
      totalPRs: data.allPRs.length,
      uniquePRs: data.uniquePRCount,
      sortingCorrect: sortingCorrect,
      firstPR: data.allPRs[0],
      lastPR: data.allPRs[data.allPRs.length - 1]
    };
  }
  
  return { error: 'ไม่มีข้อมูล PR' };
}

/**
 * 🚀 Deploy Web App - คำแนะนำหลังเพิ่มคอลัมน์หมายเหตุ
 * ขั้นตอนการ Deploy:
 * 1. บันทึกโปรเจค
 * 2. สร้างไฟล์ HTML ชื่อ "dashboard" และคัดลอกโค้ด Frontend ไปใส่
 * 3. ทดสอบฟังก์ชันต่างๆ:
 *    - testRemarkColumn() - ทดสอบคอลัมน์หมายเหตุใหม่
 *    - testErrorHandling() - ทดสอบการแก้ไข TypeError
 *    - testGetPRData() - ทดสอบการดึงข้อมูล
 *    - testPRSorting() - ทดสอบการเรียงลำดับ
 * 4. ไปที่ Deploy > New Deployment
 * 5. เลือก Type: Web app
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. คลิก Deploy
 * 9. ทดสอบ URL ที่ได้ - ตรวจสอบว่าคอลัมน์หมายเหตุแสดงผลถูกต้อง
 * 
 * ⚠️ หมายเหตุ:
 * - ตรวจสอบให้แน่ใจว่ามีคอลัมน์ "Remark" ใน Google Sheets
 * - หากไม่มีคอลัมน์ Remark จะแสดง "-" ในคอลัมน์หมายเหตุ
 * - คอลัมน์หมายเหตุจะแสดงข้อความแบบ truncate พร้อม tooltip
 * - การแสดงผลจะเป็น 7 คอลัมน์แทน 6 คอลัมน์เดิม
 */

/**
 * 📝 ข้อมูลสำคัญสำหรับการใช้งาน (อัปเดต + เพิ่ม Remark)
 */
function getUsageInfo() {
  return {
    version: '2.1 - เพิ่มคอลัมน์หมายเหตุ',
    sheetId: '189G2MUOTfR1en6_8pjLJ2zP4TKEGQWF4gxNtwkCacj0',
    sheetName: 'PR',
    requiredColumns: [
      'DATE',        // วันที่
      'Pr No.',      // หมายเลข PR
      'TOTAL PRICE', // ราคารวม
      'ORDER',       // รายการสินค้า
      'QTY.',        // จำนวน
      'UNIT',        // หน่วย
      'STATUS',      // สถานะ
      'Remark'       // หมายเหตุ (ใหม่)
    ],
    excludedStatuses: ['operate', 'cancel', 'cancelled'],
    sortingLogic: [
      '1. วันที่ (เก่า → ใหม่)',
      '2. PR No. (น้อย → มาก) สำหรับวันที่เดียวกัน'
    ],
    errorHandling: [
      'ตรวจสอบประเภทข้อมูลก่อนใช้ .replace()',
      'แปลงข้อมูลเป็น string ก่อนประมวลผล',
      'ป้องกัน null/undefined values',
      'เพิ่มการ validate ข้อมูลอินพุต'
    ],
    features: [
      'การกรองตามเดือนและสถานะ',
      'การเรียงลำดับแบบต่างๆ',
      'กราฟแสดงข้อมูลรายเดือนและการกระจาย',
      'ข้อมูลเชิงลึกและสถิติ',
      'Responsive design',
      'Error handling ที่แข็งแกร่ง',
      'คอลัมน์หมายเหตุจากคอลัมน์ Remark' // ใหม่
    ],
    testFunctions: [
      'testGetPRData() - ทดสอบการดึงข้อมูล',
      'testPRSorting() - ทดสอบการเรียงลำดับ',
      'testErrorHandling() - ทดสอบการแก้ไข TypeError',
      'testRemarkColumn() - ทดสอบคอลัมน์หมายเหตุ (ใหม่)'
    ]
  };
}
