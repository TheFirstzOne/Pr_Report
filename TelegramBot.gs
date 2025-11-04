// ========================
// Configuration
// ========================
var apiToken = "8510585488:AAFrMEPu2d3LwH97XNKkHTBC0cdxVlzubL4";
var apiUrl   = "https://api.telegram.org/bot"+apiToken;
var command  = {
  "/start": "welcome to my bot",
  "hi": "hello",
  "what is your name?": "my name is devisty bot"
}

// กำหนด Folder ID ของ Google Drive ที่จะเก็บไฟล์.
// ไปที่ Google Drive → สร้าง Folder ใหม่ → copy ID จาก URL
var DRIVE_FOLDER_ID = "1b8fVyWwpaWhIDknRsCiFy-BXc4vWQnLE"; // ใส่ Folder ID ของคุณ

// ========================
// ฟังก์ชั่นสำหรับ Webhook
function setWebhook(){
  var newUrl = "https://script.google.com/macros/s/AKfycbzKz-PzJa2XqAALA7orxAMuOdj68wNmcIF7z-LRqTItX_ZvIWS1BhTxVvslMavrjryCEw/exec"; // URL ใหม่ที่ได้
  var url = apiUrl + "/setwebhook?url="+newUrl;
  var res = UrlFetchApp.fetch(url).getContentText();
  Logger.log("Webhook Status: " + JSON.stringify(JSON.parse(res), null, 2));
}
// ========================
function doPost(e){
  try {
    if (!e || !e.postData) {
      Logger.log("❌ No postData");
      return HtmlService.createHtmlOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
    }
    
    var webhookData = JSON.parse(e.postData.contents);
    
    if (!webhookData.message) {
      Logger.log("❌ No message");
      return HtmlService.createHtmlOutput("OK")
        .setMimeType(ContentService.MimeType.TEXT);
    }
    
    var message = webhookData.message;
    var chatId = message.chat.id;
    var firstName = message.chat.first_name || "";
    
    Logger.log("========== MESSAGE RECEIVED ==========");
    Logger.log("Chat ID: " + chatId);
    Logger.log("Name: " + firstName);
    
    if (message.document) {
      Logger.log("📄 Document type: " + message.document.mime_type);
      handleDocument(message.document, chatId, firstName);
    } 
    else if (message.photo) {
      Logger.log("🖼️ Photo received");
      handlePhoto(message.photo, message.caption, chatId, firstName);
    }
    else if (message.text) {
      var text = message.text;
      Logger.log("💬 Text: " + text);
      
      if(typeof command[text] == 'undefined'){
        var sendText = encodeURIComponent("command not found");
      } else {
        var sendText = encodeURIComponent(command[text]);
      }
      
      var url = apiUrl + "/sendmessage?parse_mode=HTML&chat_id=" + chatId + "&text=" + sendText;
      UrlFetchApp.fetch(url, {"muteHttpExceptions": true});
    }
    
    Logger.log("========== END MESSAGE ==========");
    
    return HtmlService.createHtmlOutput("OK")
      .setMimeType(ContentService.MimeType.TEXT);
    
  } catch (error) {
    Logger.log("❌ Error in doPost: " + error.toString());
    Logger.log("Stack: " + error.stack);
    return HtmlService.createHtmlOutput("Error")
      .setMimeType(ContentService.MimeType.TEXT);
  }
}

// ✅ แก้ไข handleDocument
function handleDocument(document, chatId, userName) {
  try {
    var fileId = document.file_id;
    var fileName = document.file_name;
    var fileSize = document.file_size;
    
    Logger.log("File ID: " + fileId);
    Logger.log("File Name: " + fileName);
    Logger.log("File Size: " + fileSize);
    
    // ดาวน์โหลดไฟล์จาก Telegram
    var fileUrl = getFilePath(fileId);
    Logger.log("File URL: " + fileUrl);
    
    // ดาวน์โหลด
    var blob = UrlFetchApp.fetch(fileUrl).getBlob();
    blob.setName(fileName);
    
    // อัปโหลดไปยัง Google Drive
    var folderId = DRIVE_FOLDER_ID;
    var file = DriveApp.getFolderById(folderId).createFile(blob);
    
    Logger.log("✅ File uploaded: " + file.getName());
    
    // ✅ ใช้ชื่อตัวแปรอื่น เพื่อหลีกเลี่ยง collision
    var replyMsg = "ไฟล์ " + fileName + " อัปโหลดสำเร็จ!";
    sendMessage(chatId, replyMsg);
    
  } catch (error) {
    Logger.log("❌ Error handling document: " + error.toString());
    sendMessage(chatId, "เกิดข้อผิดพลาด: " + error.toString());
  }
}

// ✅ แก้ไข handlePhoto
function handlePhoto(photos, photoCaption, chatId, userName) {
  try {
    if (!photos || photos.length === 0) {
      throw new Error("No photos provided");
    }
    
    // เลือกรูปขนาดใหญ่สุด
    var photo = photos[photos.length - 1];
    var fileId = photo.file_id;
    
    Logger.log("Photo File ID: " + fileId);
    
    // ดาวน์โหลดรูป
    var fileUrl = getFilePath(fileId);
    var blob = UrlFetchApp.fetch(fileUrl).getBlob();
    
    // ✅ ตรวจสอบ caption
    var fileName;
    
    if (photoCaption && photoCaption.trim().length > 0) {
      // ถ้ามี caption ใช้เป็นชื่อไฟล์
      fileName = photoCaption.trim() + ".jpg";
      Logger.log("Using caption as filename: " + fileName);
    } else {
      // ถ้าไม่มี caption ใช้ timestamp
      fileName = "photo_" + new Date().getTime() + ".jpg";
      Logger.log("Using timestamp as filename: " + fileName);
    }
    
    blob.setName(fileName);
    
    // อัปโหลดไปยัง Google Drive
    var folderId = DRIVE_FOLDER_ID;
    var file = DriveApp.getFolderById(folderId).createFile(blob);
    
    Logger.log("✅ Photo uploaded: " + file.getName());
    
    // ✅ ใช้ชื่อตัวแปรอื่น
    var replyMsg = "รูปภาพ " + file.getName() + " อัปโหลดสำเร็จ!";
    sendMessage(chatId, replyMsg);
    
  } catch (error) {
    Logger.log("❌ Error handling photo: " + error.toString());
    Logger.log("Stack: " + error.stack);
    sendMessage(chatId, "เกิดข้อผิดพลาด: " + error.toString());
  }
}

// ========================
// ฟังก์ชั่นช่วย
// ========================

// ได้ URL ของไฟล์จาก File ID
function getFilePath(fileId) {
  var url = apiUrl + "/getFile?file_id=" + fileId;
  var response = UrlFetchApp.fetch(url);
  var result = JSON.parse(response.getContentText());
  
  if (result.ok) {
    var filePath = result.result.file_path;
    var fileUrl = "https://api.telegram.org/file/bot" + apiToken + "/" + filePath;
    return fileUrl;
  } else {
    throw new Error("Cannot get file path");
  }
}

// ส่งข้อความไปยัง Telegram
function sendMessage(chatId, text) {
  var url = apiUrl + "/sendmessage?chat_id=" + chatId + "&text=" + encodeURIComponent(text);
  UrlFetchApp.fetch(url, {"muteHttpExceptions": true});
  Logger.log("Message sent: " + text);
}

// ========================
// ฟังก์ชั่นทดสอบ
// ========================

function testUploadFile() {
  // ทดสอบการอัปโหลดไฟล์ทดสอบ
  var folderID = DRIVE_FOLDER_ID;
  var testContent = "This is a test file";
  var testBlob = Utilities.newBlob(testContent, "text/plain", "test.txt");
  
  var file = DriveApp.getFolderById(folderID).createFile(testBlob);
  Logger.log("Test file created: " + file.getName());
  Logger.log("File ID: " + file.getId());
}

function findGoogleDriveFolderId() {
  // ค้นหา Folder ID ของ "Telegram Files" Folder
  var folders = DriveApp.getFoldersByName("Telegram Files");
  
  if (folders.hasNext()) {
    var folder = folders.next();
    Logger.log("Folder found: " + folder.getName());
    Logger.log("Folder ID: " + folder.getId());
  } else {
    // สร้าง Folder ใหม่ถ้ายังไม่มี
    var newFolder = DriveApp.createFolder("Telegram Files");
    Logger.log("New folder created: " + newFolder.getName());
    Logger.log("Folder ID: " + newFolder.getId());
  }
}

function testDocumentReceived() {
  // สร้างข้อมูล document จำลอง
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        message: {
          message_id: 123,
          chat: {
            id: 7572101335,
            first_name: "Test User",
            type: "private"
          },
          from: {
            id: 7572101335,
            is_bot: false,
            first_name: "Test User"
          },
          document: {
            file_id: "BQACAgIAAxkBAAICfWdyNpR...", // File ID จริง
            file_unique_id: "AQADxxxxxx",
            file_name: "test_document.pdf",
            mime_type: "application/pdf",
            file_size: 12345
          },
          date: Math.floor(Date.now() / 1000)
        }
      })
    }
  };
  
  Logger.log("=== ทดสอบรับ Document ===");
  doPost(mockEvent);
}

function testPhotoReceived() {
  // สร้างข้อมูล photo จำลอง
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        message: {
          message_id: 124,
          chat: {
            id: 7572101335,
            first_name: "Test User",
            type: "private"
          },
          from: {
            id: 7572101335,
            is_bot: false,
            first_name: "Test User"
          },
          photo: [
            {
              file_id: "AgADAgADxa...",
              file_unique_id: "AQADxx",
              width: 320,
              height: 320,
              file_size: 5432
            },
            {
              file_id: "AgADAgADyb...",
              file_unique_id: "AQADyy",
              width: 800,
              height: 800,
              file_size: 15000
            }
          ],
          date: Math.floor(Date.now() / 1000)
        }
      })
    }
  };
  
  Logger.log("=== ทดสอบรับ Photo ===");
  doPost(mockEvent);
}

function doGet(e){
  return ContentService.createTextOutput("Method GET not allowed Na");
}
