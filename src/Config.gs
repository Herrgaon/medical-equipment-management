/**
 * Đọc dữ liệu danh mục (02-09) phục vụ dropdown ở frontend — mỏng, chỉ bọc Database.getCategoryData
 * (đã có cache sẵn). Sprint 1.4 sẽ có Admin.gs để TẠO/SỬA danh mục qua UI; Sprint 1.2 chỉ ĐỌC.
 */

var CATEGORY_SHEETS = {
  LOAI_THIET_BI: '02_LOAI_THIET_BI',
  NHOM_THIET_BI: '03_NHOM_THIET_BI',
  KHOA_PHONG: '04_KHOA_PHONG',
  VI_TRI: '05_VI_TRI',
  HANG_SAN_XUAT: '06_HANG_SAN_XUAT',
  NUOC_SAN_XUAT: '07_NUOC_SAN_XUAT',
  NHA_CUNG_CAP: '08_NHA_CUNG_CAP',
  NGUOI_PHU_TRACH: '09_NGUOI_PHU_TRACH'
};

var Config = {
  /** Trả về toàn bộ danh mục cần cho form Thiết bị trong 1 lượt gọi (giảm số round-trip). */
  getDeviceFormOptions: function (token) {
    Auth.getCurrentUser(token); // chỉ cần đăng nhập, không giới hạn theo module/quyền cụ thể — danh mục ai cũng xem được (mục 5 tài liệu thiết kế: X cho mọi vai trò)
    var result = {};
    for (var key in CATEGORY_SHEETS) {
      result[key] = Database.getCategoryData(CATEGORY_SHEETS[key])
        .filter(function (row) { return row.TRANG_THAI !== 'Ngừng sử dụng'; });
    }
    return result;
  }
};
