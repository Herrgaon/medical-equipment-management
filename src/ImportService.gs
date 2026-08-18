/**
 * Import Excel danh sách thiết bị hàng loạt (mục 11 tài liệu thiết kế).
 * Apps Script không có bộ đọc .xlsx sẵn — chuyển đổi qua Google Sheet tạm bằng Drive API rồi đọc,
 * xoá file tạm ngay sau đó (kể cả khi lỗi, dùng finally).
 *
 * Luồng: previewExcel() đọc + validate, trả về dòng hợp lệ/dòng lỗi cho client xem trước —
 * CHƯA ghi gì vào 01_THIET_BI. confirmImport() nhận lại đúng các dòng hợp lệ đó (client tự gửi
 * lại, không lưu trạng thái phía server giữa 2 lượt gọi) rồi mới ghi thật.
 */

var IMPORT_MODULE = 'Import Excel / Backup';
var IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — đủ cho vài nghìn dòng thiết bị dạng text thuần
var IMPORT_MAX_ROWS = 2000;

// Tên cột template Excel (khớp chính xác dòng tiêu đề, không phân biệt hoa/thường/khoảng trắng thừa).
// * = bắt buộc theo mục 11.2 tài liệu thiết kế.
var IMPORT_COLUMNS = [
  'Tên thiết bị', 'Nhóm thiết bị', 'Loại thiết bị', 'Khoa/phòng', 'Vị trí', 'Người phụ trách',
  'Hãng sản xuất', 'Nước sản xuất', 'Model', 'Serial', 'Năm sản xuất', 'Phân loại', 'Nhà cung cấp',
  'Tình trạng kỹ thuật', 'Ngày đưa vào sử dụng', 'Hình thức mua sắm', 'Ngày bắt đầu bảo hành', 'Ngày hết bảo hành'
];
var IMPORT_REQUIRED_COLUMNS = ['Tên thiết bị', 'Nhóm thiết bị', 'Khoa/phòng', 'Vị trí', 'Người phụ trách', 'Ngày đưa vào sử dụng'];

// Cột nào tra theo TÊN trong sheet danh mục nào để đổi ra ID.
var IMPORT_CATEGORY_LOOKUP = {
  'Nhóm thiết bị': { field: 'NHOM_THIET_BI_ID', sheet: '03_NHOM_THIET_BI' },
  'Loại thiết bị': { field: 'LOAI_THIET_BI_ID', sheet: '02_LOAI_THIET_BI' },
  'Khoa/phòng': { field: 'KHOA_PHONG_ID', sheet: '04_KHOA_PHONG' },
  'Vị trí': { field: 'VI_TRI_ID', sheet: '05_VI_TRI' },
  'Hãng sản xuất': { field: 'HANG_SAN_XUAT_ID', sheet: '06_HANG_SAN_XUAT' },
  'Nhà cung cấp': { field: 'NHA_CUNG_CAP_ID', sheet: '08_NHA_CUNG_CAP' },
  'Người phụ trách': { field: 'NGUOI_PHU_TRACH_ID', sheet: '09_NGUOI_PHU_TRACH' }
};

var Import = {

  _buildCategoryIndex_: function () {
    var index = {};
    for (var colName in IMPORT_CATEGORY_LOOKUP) {
      var sheetName = IMPORT_CATEGORY_LOOKUP[colName].sheet;
      var byName = {};
      Database.getCategoryData(sheetName).forEach(function (row) {
        byName[String(row.TEN).trim().toLowerCase()] = row.ID;
      });
      index[colName] = byName;
    }
    return index;
  },

  _parseExcelToRows_: function (base64Data, fileName) {
    Utils.assert(!Utils.isBlank(base64Data), ERROR_CODES.VALIDATION_ERROR, 'Thiếu dữ liệu file.');
    Utils.assert(/\.xlsx$/i.test(fileName || ''), ERROR_CODES.VALIDATION_ERROR, 'Chỉ chấp nhận file .xlsx.');

    var bytes = Utilities.base64Decode(base64Data);
    Utils.assert(bytes.length <= IMPORT_MAX_FILE_BYTES, ERROR_CODES.VALIDATION_ERROR,
      'File vượt quá giới hạn ' + Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024) + 'MB.');

    var blob = Utilities.newBlob(bytes, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName);
    var tempFile = null;
    try {
      tempFile = Drive.Files.create({ name: '_import_tmp_' + Utilities.getUuid(), mimeType: MimeType.GOOGLE_SHEETS }, blob);
      var tempSs = SpreadsheetApp.openById(tempFile.id);
      var sheet = tempSs.getSheets()[0];
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow < 1 || lastCol < 1) return { header: [], rows: [] };

      var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      var header = values[0].map(function (h) { return String(h).trim(); });
      var rows = values.slice(1).filter(function (r) { return r.some(function (c) { return !Utils.isBlank(c); }); });
      return { header: header, rows: rows };
    } finally {
      // Luôn xoá file tạm kể cả khi đọc lỗi — không để rác trên Drive.
      if (tempFile) {
        try { Drive.Files.delete(tempFile.id); } catch (e) { /* đã cố gắng dọn, không chặn luồng chính vì lỗi dọn dẹp */ }
      }
    }
  },

  _parseDateCell_: function (cell) {
    if (Utils.isBlank(cell)) return null;
    if (cell instanceof Date) return cell;
    var parsed = new Date(cell);
    return isNaN(parsed.getTime()) ? undefined : parsed; // undefined = không parse được (khác null = trống)
  },

  previewExcel: function (token, base64Data, fileName) {
    Auth.assertPermission(token, IMPORT_MODULE, 'CREATE');
    var parsed = this._parseExcelToRows_(base64Data, fileName);
    Utils.assert(parsed.rows.length <= IMPORT_MAX_ROWS, ERROR_CODES.VALIDATION_ERROR,
      'File có quá ' + IMPORT_MAX_ROWS + ' dòng, vui lòng chia nhỏ.');

    var missingCols = IMPORT_REQUIRED_COLUMNS.filter(function (c) { return parsed.header.indexOf(c) === -1; });
    Utils.assert(missingCols.length === 0, ERROR_CODES.VALIDATION_ERROR,
      'File thiếu cột bắt buộc: ' + missingCols.join(', ') + '. Cột cần có: ' + IMPORT_COLUMNS.join(', '));

    var colIndex = {};
    parsed.header.forEach(function (h, i) { colIndex[h] = i; });
    var categoryIndex = this._buildCategoryIndex_();

    var existingSerials = {};
    var existingCodes = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) {
      if (d.SERIAL) existingSerials[String(d.SERIAL).trim().toLowerCase()] = true;
    });

    var validRows = [];
    var errorRows = [];
    var seenSerialsInFile = {};

    parsed.rows.forEach(function (row, rowIdx) {
      var errors = [];
      var get = function (colName) { return colIndex.hasOwnProperty(colName) ? row[colIndex[colName]] : ''; };

      IMPORT_REQUIRED_COLUMNS.forEach(function (c) {
        if (Utils.isBlank(get(c))) errors.push('Thiếu "' + c + '"');
      });

      var serial = String(get('Serial') || '').trim();
      if (serial) {
        var serialKey = serial.toLowerCase();
        if (existingSerials[serialKey]) errors.push('Serial "' + serial + '" đã tồn tại trong hệ thống');
        else if (seenSerialsInFile[serialKey]) errors.push('Serial "' + serial + '" bị trùng trong file');
        seenSerialsInFile[serialKey] = true;
      }

      var namSanXuat = get('Năm sản xuất');
      if (!Utils.isBlank(namSanXuat) && isNaN(Number(namSanXuat))) errors.push('"Năm sản xuất" không phải số');

      var ngayDuaVao = Import._parseDateCell_(get('Ngày đưa vào sử dụng'));
      if (ngayDuaVao === undefined) errors.push('"Ngày đưa vào sử dụng" sai định dạng');
      var ngayBaoHanhBD = Import._parseDateCell_(get('Ngày bắt đầu bảo hành'));
      if (ngayBaoHanhBD === undefined) errors.push('"Ngày bắt đầu bảo hành" sai định dạng');
      var ngayBaoHanhKT = Import._parseDateCell_(get('Ngày hết bảo hành'));
      if (ngayBaoHanhKT === undefined) errors.push('"Ngày hết bảo hành" sai định dạng');

      var resolvedIds = {};
      for (var colName in IMPORT_CATEGORY_LOOKUP) {
        var rawValue = String(get(colName) || '').trim();
        if (!rawValue) continue; // không bắt buộc (trừ các cột đã kiểm ở trên) -> để trống hợp lệ
        var matchedId = categoryIndex[colName][rawValue.toLowerCase()];
        if (!matchedId) errors.push('"' + colName + '": "' + rawValue + '" không khớp danh mục đã cấu hình');
        else resolvedIds[IMPORT_CATEGORY_LOOKUP[colName].field] = matchedId;
      }

      var rowNumber = rowIdx + 2; // +2: dòng 1 là header, mảng rows 0-based
      if (errors.length > 0) {
        errorRows.push({ rowNumber: rowNumber, tenThietBi: get('Tên thiết bị'), errors: errors });
        return;
      }

      validRows.push({
        rowNumber: rowNumber,
        TEN_THIET_BI: get('Tên thiết bị'),
        NHOM_THIET_BI_ID: resolvedIds.NHOM_THIET_BI_ID || '',
        LOAI_THIET_BI_ID: resolvedIds.LOAI_THIET_BI_ID || '',
        KHOA_PHONG_ID: resolvedIds.KHOA_PHONG_ID || '',
        VI_TRI_ID: resolvedIds.VI_TRI_ID || '',
        NGUOI_PHU_TRACH_ID: resolvedIds.NGUOI_PHU_TRACH_ID || '',
        HANG_SAN_XUAT_ID: resolvedIds.HANG_SAN_XUAT_ID || '',
        NHA_CUNG_CAP_ID: resolvedIds.NHA_CUNG_CAP_ID || '',
        NUOC_SAN_XUAT: get('Nước sản xuất') || '',
        MODEL: get('Model') || '',
        SERIAL: serial,
        NAM_SAN_XUAT: namSanXuat || '',
        PHAN_LOAI: get('Phân loại') || '',
        TINH_TRANG_KY_THUAT: get('Tình trạng kỹ thuật') || 'Chưa xác định',
        NGAY_DUA_VAO_SU_DUNG: ngayDuaVao ? ngayDuaVao.toISOString() : '',
        HINH_THUC_MUA_SAM: get('Hình thức mua sắm') || '',
        NGAY_BAT_DAU_BAO_HANH: ngayBaoHanhBD ? ngayBaoHanhBD.toISOString() : '',
        NGAY_HET_BAO_HANH: ngayBaoHanhKT ? ngayBaoHanhKT.toISOString() : ''
      });
    });

    return { validRows: validRows, errorRows: errorRows, totalRows: parsed.rows.length };
  },

  /**
   * Ghi thật các dòng đã qua xem trước. Kiểm tra lại trùng SERIAL lần nữa (phòng trường hợp có
   * người khác nhập thêm dữ liệu giữa lúc xem trước và lúc xác nhận) — không tin hoàn toàn vào
   * kết quả validate trước đó.
   */
  confirmImport: function (token, rows) {
    var auth = Auth.assertPermission(token, IMPORT_MODULE, 'CREATE');
    Utils.assert(Array.isArray(rows) && rows.length > 0, ERROR_CODES.VALIDATION_ERROR, 'Không có dòng nào để nhập.');
    Utils.assert(rows.length <= IMPORT_MAX_ROWS, ERROR_CODES.VALIDATION_ERROR, 'Quá nhiều dòng trong 1 lượt xác nhận.');

    var insertedCount = 0;
    var failedRows = [];

    rows.forEach(function (row) {
      try {
        Device._assertRequiredFields_(row);
        Device._assertSerialNotDuplicate_(row.SERIAL, null);
        var maThietBi = Database._withLock_(function () { return Database._generateDeviceCode_(); });
        var payload = Object.assign({}, row, {
          MA_THIET_BI: maThietBi,
          TRANG_THAI_QUAN_LY: DEVICE_STATUS.DANG_TIEP_NHAN,
          QR_URL: '',
          FOLDER_ID: ''
        });
        delete payload.rowNumber;
        var result = Database.insertRow('01_THIET_BI', payload, auth.user.tenDangNhap);
        Database.appendAuditLog(auth.user.tenDangNhap, 'IMPORT_DEVICE', '01_THIET_BI', result.data.ID, null, result.data);
        insertedCount++;
      } catch (e) {
        failedRows.push({ rowNumber: row.rowNumber, message: (e instanceof AppError) ? e.message : 'Lỗi không xác định' });
      }
    });

    return { insertedCount: insertedCount, failedRows: failedRows };
  }
};
