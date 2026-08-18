/**
 * Import Excel danh sách thiết bị hàng loạt (mục 11 tài liệu thiết kế).
 * Apps Script không có bộ đọc .xlsx sẵn — .xlsx thực chất là 1 file ZIP chứa các file XML (Office
 * Open XML), đọc trực tiếp bằng Utilities.unzip() + XmlService (dịch vụ có sẵn, KHÔNG cần Advanced
 * Service/Drive API) thay vì nhờ Drive chuyển đổi sang Google Sheet tạm rồi đọc lại như cách làm
 * ban đầu — cách cũ từng gây lỗi hệ thống chung chung do Drive API khai trong appsscript.json qua
 * clasp push nhưng chưa chắc đã được bật thật trên Google Cloud Project (xem CLAUDE.md). Cách mới
 * không tạo/xoá file tạm nào trên Drive, không phụ thuộc cấu hình Cloud ngoài code.
 *
 * Luồng: previewExcel() đọc + validate, trả về dòng hợp lệ/dòng lỗi cho client xem trước —
 * CHƯA ghi gì vào 01_THIET_BI. confirmImport() nhận lại đúng các dòng hợp lệ đó (client tự gửi
 * lại, không lưu trạng thái phía server giữa 2 lượt gọi) rồi mới ghi thật.
 *
 * Khớp tên cột: so khớp KHÔNG phân biệt hoa/thường và khoảng trắng thừa (đúng như mô tả trên UI
 * Import.html) — trước đây so khớp tuyệt đối theo chuỗi, không đúng như UI đã hứa, sửa lại ở đây.
 * IMPORT_HEADER_ALIASES nhận thêm tên cột từ file danh mục thiết bị thật của bệnh viện (đối chiếu
 * ở docs/Danh mục TBYT.xlsx — xem CLAUDE.md) để không bắt người dùng phải đổi tên cột thủ công.
 *
 * Danh mục (Nhóm/Loại/Khoa-phòng/Vị trí/Hãng SX/Nhà cung cấp/Người phụ trách): nếu tên không khớp
 * danh mục đã có, KHÔNG báo lỗi chặn — previewExcel() đánh dấu "sẽ tự tạo danh mục mới" (thông
 * báo, không chặn), confirmImport() tự tạo danh mục còn thiếu trước khi tạo thiết bị. Áp dụng cho
 * cả 3 trường Nhóm thiết bị/Vị trí/Người phụ trách vốn trước đây bắt buộc trùng khớp — dữ liệu tồn
 * kho thật của bệnh viện thường thiếu các trường phân loại này, quyết định theo yêu cầu người dùng
 * (2026-08-18): để trống thì tự điền nhãn tạm ("Chưa phân nhóm"/"Chưa xác định vị trí"/"Chưa phân
 * công"), bổ sung/chỉnh sửa lại sau qua Quản trị > Danh mục — không chặn việc nhập dữ liệu ban đầu.
 */

var IMPORT_MODULE = 'Import Excel / Backup';
var IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — đủ cho vài nghìn dòng thiết bị dạng text thuần
var IMPORT_MAX_ROWS = 2000;

// Tên cột template Excel chuẩn của hệ thống. * = bắt buộc theo mục 11.2 tài liệu thiết kế (đã bớt
// Nhóm thiết bị/Vị trí/Người phụ trách khỏi bắt buộc — xem ghi chú đầu file).
var IMPORT_COLUMNS = [
  'Tên thiết bị', 'Nhóm thiết bị', 'Loại thiết bị', 'Khoa/phòng', 'Vị trí', 'Người phụ trách',
  'Hãng sản xuất', 'Nước sản xuất', 'Model', 'Serial', 'Năm sản xuất', 'Phân loại', 'Nhà cung cấp',
  'Tình trạng kỹ thuật', 'Ngày đưa vào sử dụng', 'Hình thức mua sắm', 'Ngày bắt đầu bảo hành', 'Ngày hết bảo hành',
  'Đơn vị tính', 'Mã khai bảo hiểm', 'Số giấy phép NK/lưu hành', 'Nguồn kinh phí', 'Nguyên giá', 'Ghi chú',
  'Mã thiết bị cũ'
];
var IMPORT_REQUIRED_COLUMNS = ['Tên thiết bị', 'Khoa/phòng', 'Ngày đưa vào sử dụng'];

// Tên cột khác (vd file danh mục thiết bị cũ của bệnh viện) -> tên cột chuẩn IMPORT_COLUMNS.
// So khớp qua _normalizeHeader_ (không phân biệt hoa/thường, khoảng trắng thừa).
var IMPORT_HEADER_ALIASES = {
  'Mã khai BH': 'Mã khai bảo hiểm',
  'MÃ THIẾT BỊ': 'Mã thiết bị cũ',
  'TEN_TAI_SAN': 'Tên thiết bị',
  'NGUON_TS': 'Nguồn kinh phí',
  'NAM_SX': 'Năm sản xuất',
  'HANG_SX': 'Hãng sản xuất',
  'NUOC_SX': 'Nước sản xuất',
  'TG_SD': 'Ngày đưa vào sử dụng',
  'DON_VI': 'Đơn vị tính',
  'NGUYEN_GIA': 'Nguyên giá',
  'KHOA_PHONG': 'Khoa/phòng',
  'Vị trí dử dụng': 'Vị trí',
  'SỐ GIAY_PHEP NK /SỐ GPLH': 'Số giấy phép NK/lưu hành',
  'PL_TBYT': 'Phân loại',
  'NHA_CUNG_CAP': 'Nhà cung cấp',
  'HINH_THUC_MS': 'Hình thức mua sắm',
  'Tình trạng': 'Tình trạng kỹ thuật'
};

// Cột nào tra theo TÊN trong sheet danh mục nào để đổi ra ID — tự tạo danh mục mới nếu chưa có.
var IMPORT_CATEGORY_LOOKUP = {
  'Nhóm thiết bị': { field: 'NHOM_THIET_BI_ID', sheet: '03_NHOM_THIET_BI', defaultName: 'Chưa phân nhóm' },
  'Loại thiết bị': { field: 'LOAI_THIET_BI_ID', sheet: '02_LOAI_THIET_BI', defaultName: '' },
  'Khoa/phòng': { field: 'KHOA_PHONG_ID', sheet: '04_KHOA_PHONG', defaultName: '' },
  'Vị trí': { field: 'VI_TRI_ID', sheet: '05_VI_TRI', defaultName: 'Chưa xác định vị trí' },
  'Hãng sản xuất': { field: 'HANG_SAN_XUAT_ID', sheet: '06_HANG_SAN_XUAT', defaultName: '' },
  'Nhà cung cấp': { field: 'NHA_CUNG_CAP_ID', sheet: '08_NHA_CUNG_CAP', defaultName: '' },
  'Người phụ trách': { field: 'NGUOI_PHU_TRACH_ID', sheet: '09_NGUOI_PHU_TRACH', defaultName: 'Chưa phân công' }
};

var Import = {

  /** Chuẩn hoá tên cột để so khớp: bỏ dấu tiếng Việt, gộp khoảng trắng thừa, không phân biệt
   * hoa/thường. NFD tách được hầu hết dấu thanh/dấu mũ/dấu trăng (á,â,ă...) nhưng KHÔNG tách được
   * đ/ư/ơ (đây là chữ cái riêng trong bảng chữ cái tiếng Việt, không phải ký tự có dấu ghép) — phải
   * thay tay 3 chữ này trước khi bỏ dấu phần còn lại. */
  _normalizeHeader_: function (h) {
    var s = String(h || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/ư/g, 'u').replace(/Ư/g, 'U')
      .replace(/ơ/g, 'o').replace(/Ơ/g, 'O');
    return s.replace(/\s+/g, ' ').trim().toUpperCase();
  },

  /** Map tên cột đã chuẩn hoá -> tên cột chuẩn IMPORT_COLUMNS gốc (giữ dấu, đúng case để dùng làm key). */
  _buildCanonicalHeaderMap_: function () {
    var self = this;
    var map = {};
    IMPORT_COLUMNS.forEach(function (c) { map[self._normalizeHeader_(c)] = c; });
    for (var alias in IMPORT_HEADER_ALIASES) {
      map[self._normalizeHeader_(alias)] = IMPORT_HEADER_ALIASES[alias];
    }
    return map;
  },

  /** colIndex: tên cột CHUẨN (IMPORT_COLUMNS) -> vị trí cột trong file thật (đã khớp qua alias/chuẩn hoá). */
  _buildColIndex_: function (headerRow) {
    var self = this;
    var canonicalMap = this._buildCanonicalHeaderMap_();
    var colIndex = {};
    headerRow.forEach(function (h, i) {
      var canonical = canonicalMap[self._normalizeHeader_(h)];
      if (canonical && !colIndex.hasOwnProperty(canonical)) colIndex[canonical] = i;
    });
    return colIndex;
  },

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

  /** .xlsx thực chất là 1 file ZIP chứa các file XML (Office Open XML). Đọc trực tiếp bằng
   * Utilities.unzip() + XmlService (2 dịch vụ có sẵn của Apps Script, không cần Advanced Service/
   * Drive API) thay vì nhờ Drive chuyển đổi sang Google Sheet tạm rồi đọc lại — bỏ hẳn phụ thuộc
   * vào việc Drive API đã được bật trên Google Cloud Project hay chưa (nguồn gốc 1 lỗi khó chẩn
   * đoán đã gặp: Drive.Files.create() báo lỗi hệ thống chung chung khi Advanced Service khai trong
   * appsscript.json qua clasp push nhưng chưa được bật thật trên Cloud). Không tạo/xoá file tạm
   * nào trên Drive nữa — không còn rủi ro rác file hay lỗi do quyền Drive.
   */
  _parseExcelToRows_: function (base64Data, fileName) {
    Utils.assert(!Utils.isBlank(base64Data), ERROR_CODES.VALIDATION_ERROR, 'Thiếu dữ liệu file.');
    Utils.assert(/\.xlsx$/i.test(fileName || ''), ERROR_CODES.VALIDATION_ERROR, 'Chỉ chấp nhận file .xlsx.');

    var bytes = Utilities.base64Decode(base64Data);
    Utils.assert(bytes.length <= IMPORT_MAX_FILE_BYTES, ERROR_CODES.VALIDATION_ERROR,
      'File vượt quá giới hạn ' + Math.round(IMPORT_MAX_FILE_BYTES / 1024 / 1024) + 'MB.');

    var zipBlob = Utilities.newBlob(bytes, 'application/zip', fileName);
    var entries;
    try {
      entries = Utilities.unzip(zipBlob);
    } catch (e) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File không đúng định dạng .xlsx (không giải nén được — có thể file bị hỏng hoặc không phải .xlsx thật).');
    }

    var filesByName = {};
    entries.forEach(function (b) { filesByName[b.getName()] = b; });

    var sharedStrings = [];
    if (filesByName['xl/sharedStrings.xml']) {
      sharedStrings = this._parseSharedStrings_(filesByName['xl/sharedStrings.xml'].getDataAsString('UTF-8'));
    }

    // Luôn đọc sheet1.xml (sheet đầu tiên) — đúng với giả định gốc "1 sheet duy nhất" khi dùng
    // getSheets()[0] trước đây; đủ cho template chuẩn của hệ thống lẫn file danh mục thiết bị thật.
    var sheetFile = filesByName['xl/worksheets/sheet1.xml'];
    Utils.assert(sheetFile, ERROR_CODES.VALIDATION_ERROR, 'Không đọc được nội dung sheet trong file .xlsx.');

    var grid = this._parseSheetXml_(sheetFile.getDataAsString('UTF-8'), sharedStrings);
    if (grid.length === 0) return { header: [], rows: [] };

    var header = grid[0].map(function (h) { return String(h).trim(); });
    var rows = grid.slice(1).filter(function (r) { return r.some(function (c) { return !Utils.isBlank(c); }); });
    return { header: header, rows: rows };
  },

  /** <si> có thể chứa 1 <t> đơn (chuỗi thường) hoặc nhiều <r><t> (rich text nhiều định dạng trong
   * cùng 1 ô) — gom hết text con (bất kể độ sâu) rồi nối lại, đúng ngữ nghĩa nội dung hiển thị. */
  _collectText_: function (element, out) {
    if (element.getName() === 't') {
      out.push(element.getText());
      return;
    }
    var children = element.getChildren();
    for (var i = 0; i < children.length; i++) this._collectText_(children[i], out);
  },

  _parseSharedStrings_: function (xml) {
    var self = this;
    var root = XmlService.parse(xml).getRootElement();
    var ns = root.getNamespace();
    return root.getChildren('si', ns).map(function (si) {
      var out = [];
      self._collectText_(si, out);
      return out.join('');
    });
  },

  _cellRefToCol0_: function (ref) {
    var colLetters = ref.replace(/[0-9]/g, '');
    var n = 0;
    for (var i = 0; i < colLetters.length; i++) n = n * 26 + (colLetters.charCodeAt(i) - 64);
    return n - 1; // 0-based
  },

  /** Đọc <sheetData> thành mảng 2 chiều (giống SpreadsheetApp getValues()) — kể cả ô trống xen
   * giữa (Excel bỏ qua <c> không có giá trị) và dòng trống hoàn toàn bị Excel lược khỏi XML. */
  _parseSheetXml_: function (xml, sharedStrings) {
    var self = this;
    var root = XmlService.parse(xml).getRootElement();
    var ns = root.getNamespace();
    var sheetData = root.getChild('sheetData', ns);
    if (!sheetData) return [];

    var grid = [];
    sheetData.getChildren('row', ns).forEach(function (rowEl) {
      var rAttr = rowEl.getAttribute('r');
      var rowNum = rAttr ? parseInt(rAttr.getValue(), 10) : (grid.length + 1);
      while (grid.length < rowNum - 1) grid.push([]); // dòng trống hoàn toàn Excel lược khỏi XML

      var sparse = {};
      var maxCol = -1;
      rowEl.getChildren('c', ns).forEach(function (c) {
        var refAttr = c.getAttribute('r');
        var colIdx = refAttr ? self._cellRefToCol0_(refAttr.getValue()) : (maxCol + 1);
        var typeAttr = c.getAttribute('t');
        var type = typeAttr ? typeAttr.getValue() : null;
        var value = '';

        if (type === 'inlineStr') {
          var isEl = c.getChild('is', ns);
          if (isEl) { var out = []; self._collectText_(isEl, out); value = out.join(''); }
        } else {
          var vEl = c.getChild('v', ns);
          var raw = vEl ? vEl.getText() : '';
          if (raw === '') {
            value = '';
          } else if (type === 's') {
            value = sharedStrings[parseInt(raw, 10)] || '';
          } else if (type === 'str' || type === 'b') {
            value = raw;
          } else {
            value = Number(raw); // không có t = số (có thể là ngày dạng Excel serial number)
          }
        }

        sparse[colIdx] = value;
        if (colIdx > maxCol) maxCol = colIdx;
      });

      var denseRow = [];
      for (var i = 0; i <= maxCol; i++) denseRow.push(sparse.hasOwnProperty(i) ? sparse[i] : '');
      grid.push(denseRow);
    });

    var maxLen = 0;
    grid.forEach(function (r) { if (r.length > maxLen) maxLen = r.length; });
    grid.forEach(function (r) { while (r.length < maxLen) r.push(''); });
    return grid;
  },

  /** Excel/Lotus lưu ngày dạng số ngày kể từ mốc 1899-12-30 (không phải 1899-12-31 — Lotus 1-2-3
   * cố tình để lỗi năm nhuận 1900 và Excel giữ nguyên để tương thích ngược, công thức chuẩn quy
   * đổi sang mili-giây Unix đã trừ sẵn phần lệch này). SpreadsheetApp.getValues() trước đây tự làm
   * việc này khi đọc từ Google Sheet đã chuyển đổi; đọc XML thô thì phải tự quy đổi lấy. */
  _excelSerialToDate_: function (serial) {
    return new Date(Math.floor(serial - 25569) * 86400 * 1000);
  },

  _parseDateCell_: function (cell) {
    if (Utils.isBlank(cell)) return null;
    if (cell instanceof Date) return cell;
    if (typeof cell === 'number') return this._excelSerialToDate_(cell);
    var parsed = new Date(cell);
    return isNaN(parsed.getTime()) ? undefined : parsed; // undefined = không parse được (khác null = trống)
  },

  previewExcel: function (token, base64Data, fileName) {
    Auth.assertPermission(token, IMPORT_MODULE, 'CREATE');
    var parsed = this._parseExcelToRows_(base64Data, fileName);
    Utils.assert(parsed.rows.length <= IMPORT_MAX_ROWS, ERROR_CODES.VALIDATION_ERROR,
      'File có quá ' + IMPORT_MAX_ROWS + ' dòng, vui lòng chia nhỏ.');

    var colIndex = this._buildColIndex_(parsed.header);
    var missingCols = IMPORT_REQUIRED_COLUMNS.filter(function (c) { return !colIndex.hasOwnProperty(c); });
    Utils.assert(missingCols.length === 0, ERROR_CODES.VALIDATION_ERROR,
      'File thiếu cột bắt buộc: ' + missingCols.join(', ') + '. Cột cần có: ' + IMPORT_COLUMNS.join(', '));

    var categoryIndex = this._buildCategoryIndex_();

    var existingSerials = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) {
      if (d.SERIAL) existingSerials[String(d.SERIAL).trim().toLowerCase()] = true;
    });

    var validRows = [];
    var errorRows = [];
    var seenSerialsInFile = {};

    parsed.rows.forEach(function (row, rowIdx) {
      var errors = [];
      var notes = [];
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

      // Tên danh mục thô (KHÔNG resolve ra ID ở bước xem trước) — dùng thẳng cho hiển thị + gửi
      // lại confirmImport() để tự tra/tạo danh mục lúc ghi thật (tránh ID có thể lệch giữa 2 lượt).
      var categoryNames = {};
      for (var colName in IMPORT_CATEGORY_LOOKUP) {
        var cfg = IMPORT_CATEGORY_LOOKUP[colName];
        var rawValue = String(get(colName) || '').trim() || cfg.defaultName;
        categoryNames[colName] = rawValue;
        if (rawValue && !categoryIndex[colName][rawValue.toLowerCase()]) {
          notes.push('"' + colName + '": "' + rawValue + '" sẽ tự tạo danh mục mới');
        }
      }

      var maCu = String(get('Mã thiết bị cũ') || '').trim(); // không có trong template chuẩn, chỉ khi alias ánh xạ tới
      var ghiChuGoc = String(get('Ghi chú') || '').trim();

      var rowNumber = rowIdx + 2; // +2: dòng 1 là header, mảng rows 0-based
      if (errors.length > 0) {
        errorRows.push({ rowNumber: rowNumber, tenThietBi: get('Tên thiết bị'), errors: errors });
        return;
      }

      validRows.push({
        rowNumber: rowNumber,
        TEN_THIET_BI: get('Tên thiết bị'),
        categoryNames: categoryNames,
        notes: notes,
        NUOC_SAN_XUAT: get('Nước sản xuất') || '',
        MODEL: get('Model') || '',
        SERIAL: serial,
        NAM_SAN_XUAT: namSanXuat || '',
        PHAN_LOAI: get('Phân loại') || '',
        TINH_TRANG_KY_THUAT: get('Tình trạng kỹ thuật') || 'Chưa xác định',
        NGAY_DUA_VAO_SU_DUNG: ngayDuaVao ? ngayDuaVao.toISOString() : '',
        HINH_THUC_MUA_SAM: get('Hình thức mua sắm') || '',
        NGAY_BAT_DAU_BAO_HANH: ngayBaoHanhBD ? ngayBaoHanhBD.toISOString() : '',
        NGAY_HET_BAO_HANH: ngayBaoHanhKT ? ngayBaoHanhKT.toISOString() : '',
        DON_VI_TINH: get('Đơn vị tính') || '',
        MA_KHAI_BH: get('Mã khai bảo hiểm') || '',
        SO_GIAY_PHEP_NK_LH: get('Số giấy phép NK/lưu hành') || '',
        NGUON_KINH_PHI: get('Nguồn kinh phí') || '',
        NGUYEN_GIA: get('Nguyên giá') || '',
        GHI_CHU: (maCu ? ('Mã cũ: ' + maCu + '. ') : '') + ghiChuGoc
      });
    });

    return { validRows: validRows, errorRows: errorRows, totalRows: parsed.rows.length };
  },

  /** Tra ID danh mục theo tên, tự tạo mới nếu chưa có — cache trong `cacheBySheet` để không tạo
   * trùng nhiều lần cùng 1 tên trong cùng 1 lượt confirmImport (vd nhiều thiết bị cùng khoa/phòng). */
  _resolveOrCreateCategory_: function (sheetName, name, cacheBySheet, actor) {
    if (Utils.isBlank(name)) return '';
    var key = String(name).trim().toLowerCase();
    if (!cacheBySheet[sheetName]) {
      cacheBySheet[sheetName] = {};
      Database.getCategoryData(sheetName).forEach(function (row) {
        cacheBySheet[sheetName][String(row.TEN).trim().toLowerCase()] = row.ID;
      });
    }
    if (cacheBySheet[sheetName][key]) return cacheBySheet[sheetName][key];

    var result = Database.insertRow(sheetName, {
      MA: '', TEN: String(name).trim(), MO_TA: 'Tự động tạo khi Import Excel', CAP_TREN_ID: '', TRANG_THAI: 'Hoạt động'
    }, actor);
    Database.appendAuditLog(actor, 'AUTO_CREATE_CATEGORY_ON_IMPORT', sheetName, result.data.ID, null, result.data);
    cacheBySheet[sheetName][key] = result.data.ID;
    return result.data.ID;
  },

  /**
   * Ghi thật các dòng đã qua xem trước. Kiểm tra lại trùng SERIAL lần nữa (phòng trường hợp có
   * người khác nhập thêm dữ liệu giữa lúc xem trước và lúc xác nhận) bằng 1 tập hợp SERIAL dựng
   * SẴN 1 LẦN lúc bắt đầu (KHÔNG gọi Device._assertSerialNotDuplicate_ trong vòng lặp — hàm đó
   * quét lại TOÀN BỘ sheet 01_THIET_BI mỗi lần gọi, mà sheet lại phình to dần theo từng dòng vừa
   * ghi thêm trong CHÍNH đợt import này -> tổng chi phí tăng theo bình phương số dòng, đủ để "treo"
   * giữa chừng khi nhập hàng trăm dòng — đã gặp thực tế, sửa ở đây). Tự tạo danh mục còn thiếu
   * (xem ghi chú đầu file) trước khi tạo thiết bị.
   */
  confirmImport: function (token, rows) {
    var auth = Auth.assertPermission(token, IMPORT_MODULE, 'CREATE');
    Utils.assert(Array.isArray(rows) && rows.length > 0, ERROR_CODES.VALIDATION_ERROR, 'Không có dòng nào để nhập.');
    Utils.assert(rows.length <= IMPORT_MAX_ROWS, ERROR_CODES.VALIDATION_ERROR, 'Quá nhiều dòng trong 1 lượt xác nhận.');

    var insertedCount = 0;
    var failedRows = [];
    var categoryCache = {};

    var existingSerials = {};
    Database.list('01_THIET_BI', {}).items.forEach(function (d) {
      if (d.SERIAL) existingSerials[String(d.SERIAL).trim().toLowerCase()] = true;
    });

    rows.forEach(function (row) {
      try {
        var serialKey = row.SERIAL ? String(row.SERIAL).trim().toLowerCase() : '';
        if (serialKey && existingSerials[serialKey]) {
          throw new AppError(ERROR_CODES.DUPLICATE, 'Số serial "' + row.SERIAL + '" đã tồn tại trong hệ thống.');
        }

        var payload = {
          TEN_THIET_BI: row.TEN_THIET_BI,
          NUOC_SAN_XUAT: row.NUOC_SAN_XUAT || '',
          MODEL: row.MODEL || '',
          SERIAL: row.SERIAL || '',
          NAM_SAN_XUAT: row.NAM_SAN_XUAT || '',
          PHAN_LOAI: row.PHAN_LOAI || '',
          TINH_TRANG_KY_THUAT: row.TINH_TRANG_KY_THUAT || 'Chưa xác định',
          NGAY_DUA_VAO_SU_DUNG: row.NGAY_DUA_VAO_SU_DUNG,
          HINH_THUC_MUA_SAM: row.HINH_THUC_MUA_SAM || '',
          NGAY_BAT_DAU_BAO_HANH: row.NGAY_BAT_DAU_BAO_HANH || '',
          NGAY_HET_BAO_HANH: row.NGAY_HET_BAO_HANH || '',
          DON_VI_TINH: row.DON_VI_TINH || '',
          MA_KHAI_BH: row.MA_KHAI_BH || '',
          SO_GIAY_PHEP_NK_LH: row.SO_GIAY_PHEP_NK_LH || '',
          NGUON_KINH_PHI: row.NGUON_KINH_PHI || '',
          NGUYEN_GIA: row.NGUYEN_GIA || '',
          GHI_CHU: row.GHI_CHU || ''
        };

        var categoryNames = row.categoryNames || {};
        for (var colName in IMPORT_CATEGORY_LOOKUP) {
          var cfg = IMPORT_CATEGORY_LOOKUP[colName];
          var id = Import._resolveOrCreateCategory_(cfg.sheet, categoryNames[colName], categoryCache, auth.user.tenDangNhap);
          payload[cfg.field] = id;
        }

        Device._assertRequiredFields_(payload);
        var maThietBi = Database._withLock_(function () { return Database._generateDeviceCode_(); });
        payload.MA_THIET_BI = maThietBi;
        payload.TRANG_THAI_QUAN_LY = DEVICE_STATUS.DANG_TIEP_NHAN;
        payload.QR_URL = '';
        payload.FOLDER_ID = '';

        var result = Database.insertRow('01_THIET_BI', payload, auth.user.tenDangNhap);
        Database.appendAuditLog(auth.user.tenDangNhap, 'IMPORT_DEVICE', '01_THIET_BI', result.data.ID, null, result.data);
        if (serialKey) existingSerials[serialKey] = true;
        insertedCount++;
      } catch (e) {
        failedRows.push({ rowNumber: row.rowNumber, message: (e instanceof AppError) ? e.message : ('Lỗi không xác định: ' + e) });
      }
    });

    return { insertedCount: insertedCount, failedRows: failedRows };
  }
};
