/**
 * Hàm assert chạy TAY từ Apps Script editor (function picker) — không deploy, không gọi từ Core.gs.
 * Không phải test suite tự động; đủ dùng để tự kiểm tra nhanh sau khi push code mới.
 */

function test_setupDatabase_isIdempotent() {
  var first = setupDatabase();
  var second = setupDatabase();
  var pass = second.created.length === 0;
  Logger.log((pass ? 'PASS' : 'FAIL') + ': setupDatabase idempotent. Lần 2 created=' + JSON.stringify(second.created));
  return pass;
}

function test_generateId_isUniqueUnderSequentialCalls() {
  var ids = {};
  var duplicate = false;
  for (var i = 0; i < 20; i++) {
    var id = Database._withLock_(function () { return Database._generateId_('TESTX-'); });
    if (ids[id]) { duplicate = true; break; }
    ids[id] = true;
  }
  Logger.log((!duplicate ? 'PASS' : 'FAIL') + ': generateId không trùng qua 20 lần gọi liên tiếp.');
  return !duplicate;
}

function test_updateRowById_rejectsProtectedField() {
  var threw = false;
  try {
    Database.updateRowById('01_THIET_BI', 'DEV-000001', { TRANG_THAI_QUAN_LY: 'Đang sử dụng' }, 'tester@example.com');
  } catch (e) {
    threw = (e instanceof AppError) && e.code === ERROR_CODES.PROTECTED_FIELD;
  }
  Logger.log((threw ? 'PASS' : 'FAIL') + ': updateRowById từ chối field bảo vệ TRANG_THAI_QUAN_LY.');
  return threw;
}

function test_auth_rejectsUnregisteredUser() {
  var loginId = 'khong-ton-tai-' + new Date().getTime();
  var row = Database.findOne('25_NGUOI_DUNG', { TEN_DANG_NHAP: loginId });
  var pass = row === null;
  Logger.log((pass ? 'PASS' : 'FAIL') + ': tra cứu tên đăng nhập chưa đăng ký trả về null.');

  var loginThrew = false;
  try {
    Auth.login(loginId, 'bat-ky-mat-khau');
  } catch (e) {
    loginThrew = (e instanceof AppError) && e.code === ERROR_CODES.INVALID_CREDENTIALS;
  }
  Logger.log((loginThrew ? 'PASS' : 'FAIL') + ': Auth.login từ chối đúng cách với tên đăng nhập chưa tồn tại.');
  return pass && loginThrew;
}

function runAllTests() {
  test_setupDatabase_isIdempotent();
  test_generateId_isUniqueUnderSequentialCalls();
  test_updateRowById_rejectsProtectedField();
  test_auth_rejectsUnregisteredUser();
}
