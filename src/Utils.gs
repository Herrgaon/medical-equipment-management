/**
 * Tiện ích dùng chung: bọc response chuẩn, lỗi nghiệp vụ, chống formula injection, định dạng.
 */

/** Lỗi nghiệp vụ "an toàn" — nội dung message được phép trả thẳng cho client. */
function AppError(code, message) {
  this.name = 'AppError';
  this.code = code;
  this.message = message;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var Utils = {
  success: function (data) {
    return { success: true, data: data };
  },

  fail: function (code, message) {
    return { success: false, error: { code: code, message: message } };
  },

  assert: function (condition, code, message) {
    if (!condition) throw new AppError(code, message);
  },

  isBlank: function (v) {
    return v === null || v === undefined || String(v).trim() === '';
  },

  nowIso: function () {
    return new Date().toISOString();
  },

  formatDateVN: function (date) {
    if (!date) return '';
    var d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy');
  },

  /**
   * Chống formula injection: nếu chuỗi bắt đầu bằng = + - @ (hoặc tab/CR), Sheets/Excel có thể
   * hiểu nhầm thành công thức. Thêm dấu ' phía trước để ép kiểu text thuần.
   * Cố tình KHÔNG cắt bỏ ký tự — dữ liệu hợp lệ như ghi chú "-5% hao mòn" không được phép sai lệch.
   */
  sanitizeCellValue: function (value) {
    if (typeof value !== 'string' || value.length === 0) return value;
    var firstChar = value.charAt(0);
    if (firstChar === '=' || firstChar === '+' || firstChar === '-' || firstChar === '@' ||
        firstChar === '\t' || firstChar === '\r') {
      return "'" + value;
    }
    return value;
  }
};
