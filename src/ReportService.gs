/**
 * Báo cáo / Phân tích / Xuất hồ sơ — mục 9.3 (nút "Xuất bộ hồ sơ thiết bị") + bảng API mục "Report"
 * tài liệu thiết kế: getDashboardSummary() đã có ở Device.gs (Trang chủ) — ở đây làm 2 phần còn
 * lại: exportReport kiểu danh sách (CSV, dựng ở client) và buildDeviceProfileExport (hồ sơ đầy đủ
 * 1 thiết bị, gộp toàn bộ sheet nghiệp vụ liên quan, hiển thị dạng có thể in/lưu PDF qua cửa sổ in
 * của trình duyệt — giống cách QR.gs đã làm với in tem, không cần thêm cơ chế xuất file mới).
 * Toàn bộ vai trò chỉ có quyền Xem (X) với module này theo ma trận mục 5 — không có thao tác ghi.
 */

var REPORT_MODULE = 'Báo cáo/Phân tích/Xuất hồ sơ';

// Các sheet nghiệp vụ có THIET_BI_ID, gộp vào hồ sơ đầy đủ 1 thiết bị — theo đúng thứ tự vòng đời
// (mục 4 tài liệu thiết kế), bỏ 28_AUDIT_LOG (có endpoint riêng cho Super Admin, không lộ vào đây).
var REPORT_PROFILE_SHEETS = [
  { sheet: '10_TIEP_NHAN', label: 'Tiếp nhận' },
  { sheet: '11_NGHIEM_THU', label: 'Nghiệm thu' },
  { sheet: '12_BAN_GIAO', label: 'Bàn giao' },
  { sheet: '13_BAO_HANH', label: 'Bảo hành' },
  { sheet: '14_BAO_TRI', label: 'Bảo trì' },
  { sheet: '15_KIEM_DINH', label: 'Kiểm định' },
  { sheet: '16_HIEU_CHUAN', label: 'Hiệu chuẩn' },
  { sheet: '17_AN_TOAN_BUC_XA', label: 'An toàn bức xạ' },
  { sheet: '18_HO_SO_PHONG_XQ_CT', label: 'Hồ sơ phòng XQ/CT' },
  { sheet: '19_SU_CO', label: 'Sự cố' },
  { sheet: '20_SUA_CHUA', label: 'Sửa chữa' },
  { sheet: '21_DIEU_CHUYEN', label: 'Điều chuyển' },
  { sheet: '24_KIEM_KE', label: 'Kiểm kê' },
  { sheet: '22_TAI_LIEU', label: 'Tài liệu' },
  { sheet: '23_CANH_BAO', label: 'Cảnh báo' }
];

var Report = {

  _categoryNameMap_: function (sheetName) {
    var map = {};
    Database.getCategoryData(sheetName).forEach(function (row) { map[row.ID] = row.TEN; });
    return map;
  },

  getFilterOptions: function (token) {
    Auth.assertPermission(token, REPORT_MODULE, 'VIEW');
    return {
      KHOA_PHONG: Database.getCategoryData('04_KHOA_PHONG'),
      NHOM_THIET_BI: Database.getCategoryData('03_NHOM_THIET_BI'),
      TRANG_THAI: Object.keys(DEVICE_STATUS).map(function (k) { return DEVICE_STATUS[k]; })
    };
  },

  /** Danh sách thiết bị để xuất báo cáo — không phân trang (khác Device.listDevices dùng cho UI danh sách),
   * đổi FK sang tên hiển thị để xuất CSV đọc được ngay, không cần tra cứu lại ID. */
  exportDeviceList: function (token, filter) {
    var auth = Auth.assertPermission(token, REPORT_MODULE, 'VIEW');
    filter = filter || {};

    var sheetFilters = {};
    if (filter.khoaPhongId) sheetFilters.KHOA_PHONG_ID = filter.khoaPhongId;
    if (filter.nhomThietBiId) sheetFilters.NHOM_THIET_BI_ID = filter.nhomThietBiId;
    if (filter.trangThai) sheetFilters.TRANG_THAI_QUAN_LY = filter.trangThai;

    var all = Database.list('01_THIET_BI', { filters: sheetFilters }).items;
    all = Device._applyScopeFilter_(all, auth.scope);

    if (!Utils.isBlank(filter.keyword)) {
      var kw = String(filter.keyword).trim().toLowerCase();
      all = all.filter(function (row) {
        return String(row.TEN_THIET_BI).toLowerCase().indexOf(kw) !== -1 ||
          String(row.MA_THIET_BI).toLowerCase().indexOf(kw) !== -1 ||
          String(row.SERIAL).toLowerCase().indexOf(kw) !== -1;
      });
    }

    var khoaMap = this._categoryNameMap_('04_KHOA_PHONG');
    var nhomMap = this._categoryNameMap_('03_NHOM_THIET_BI');
    var hangMap = this._categoryNameMap_('06_HANG_SAN_XUAT');
    var nccMap = this._categoryNameMap_('08_NHA_CUNG_CAP');

    return all.map(function (d) {
      return {
        MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI,
        KHOA_PHONG: khoaMap[d.KHOA_PHONG_ID] || '', NHOM_THIET_BI: nhomMap[d.NHOM_THIET_BI_ID] || '',
        HANG_SAN_XUAT: hangMap[d.HANG_SAN_XUAT_ID] || '', NHA_CUNG_CAP: nccMap[d.NHA_CUNG_CAP_ID] || '',
        MODEL: d.MODEL, SERIAL: d.SERIAL, NAM_SAN_XUAT: d.NAM_SAN_XUAT,
        TRANG_THAI_QUAN_LY: d.TRANG_THAI_QUAN_LY, TINH_TRANG_KY_THUAT: d.TINH_TRANG_KY_THUAT,
        NGAY_DUA_VAO_SU_DUNG: d.NGAY_DUA_VAO_SU_DUNG, NGAY_HET_BAO_HANH: d.NGAY_HET_BAO_HANH,
        NGUYEN_GIA: d.NGUYEN_GIA
      };
    }).sort(function (a, b) { return String(a.MA_THIET_BI).localeCompare(String(b.MA_THIET_BI)); });
  },

  listActiveDevices: function (token) {
    var auth = Auth.assertPermission(token, REPORT_MODULE, 'VIEW');
    var all = Database.list('01_THIET_BI', {}).items;
    all = Device._applyScopeFilter_(all, auth.scope);
    return all.map(function (d) { return { ID: d.ID, MA_THIET_BI: d.MA_THIET_BI, TEN_THIET_BI: d.TEN_THIET_BI }; });
  },

  /** Hồ sơ đầy đủ 1 thiết bị — thông tin chung (đã đổi FK sang tên) + toàn bộ bản ghi nghiệp vụ
   * liên quan, gộp theo từng sheet. Client dựng thành cửa sổ in (giống mẫu in tem QR đã có). */
  buildDeviceProfile: function (token, deviceId) {
    var auth = Auth.assertPermission(token, REPORT_MODULE, 'VIEW');
    var device = Database.getById('01_THIET_BI', deviceId);
    Utils.assert(device, ERROR_CODES.NOT_FOUND, 'Không tìm thấy thiết bị.');
    if (auth.scope.type !== 'ALL') {
      Utils.assert(auth.scope.departmentIds.indexOf(device.KHOA_PHONG_ID) !== -1,
        ERROR_CODES.PERMISSION_DENIED, 'Không có quyền xem thiết bị ngoài phạm vi khoa/phòng được giao.');
    }

    var khoaMap = this._categoryNameMap_('04_KHOA_PHONG');
    var viTriMap = this._categoryNameMap_('05_VI_TRI');
    var nhomMap = this._categoryNameMap_('03_NHOM_THIET_BI');
    var loaiMap = this._categoryNameMap_('02_LOAI_THIET_BI');
    var hangMap = this._categoryNameMap_('06_HANG_SAN_XUAT');
    var nccMap = this._categoryNameMap_('08_NHA_CUNG_CAP');
    var nptMap = this._categoryNameMap_('09_NGUOI_PHU_TRACH');

    var deviceInfo = {
      MA_THIET_BI: device.MA_THIET_BI, TEN_THIET_BI: device.TEN_THIET_BI,
      LOAI_THIET_BI: loaiMap[device.LOAI_THIET_BI_ID] || '', NHOM_THIET_BI: nhomMap[device.NHOM_THIET_BI_ID] || '',
      KHOA_PHONG: khoaMap[device.KHOA_PHONG_ID] || '', VI_TRI: viTriMap[device.VI_TRI_ID] || '',
      HANG_SAN_XUAT: hangMap[device.HANG_SAN_XUAT_ID] || '', NHA_CUNG_CAP: nccMap[device.NHA_CUNG_CAP_ID] || '',
      NGUOI_PHU_TRACH: nptMap[device.NGUOI_PHU_TRACH_ID] || '', NUOC_SAN_XUAT: device.NUOC_SAN_XUAT,
      MODEL: device.MODEL, SERIAL: device.SERIAL, NAM_SAN_XUAT: device.NAM_SAN_XUAT,
      PHAN_LOAI: device.PHAN_LOAI, TRANG_THAI_QUAN_LY: device.TRANG_THAI_QUAN_LY,
      TINH_TRANG_KY_THUAT: device.TINH_TRANG_KY_THUAT, NGAY_DUA_VAO_SU_DUNG: device.NGAY_DUA_VAO_SU_DUNG,
      HINH_THUC_MUA_SAM: device.HINH_THUC_MUA_SAM, NGAY_BAT_DAU_BAO_HANH: device.NGAY_BAT_DAU_BAO_HANH,
      NGAY_HET_BAO_HANH: device.NGAY_HET_BAO_HANH, MA_KHAI_BH: device.MA_KHAI_BH,
      SO_GIAY_PHEP_NK_LH: device.SO_GIAY_PHEP_NK_LH, NGUON_KINH_PHI: device.NGUON_KINH_PHI,
      NGUYEN_GIA: device.NGUYEN_GIA, DON_VI_TINH: device.DON_VI_TINH
    };

    var sections = REPORT_PROFILE_SHEETS.map(function (entry) {
      var rows = Database.list(entry.sheet, { filters: { THIET_BI_ID: deviceId } }).items;
      return { label: entry.label, rows: rows };
    }).filter(function (s) { return s.rows.length > 0; });

    return { device: deviceInfo, sections: sections };
  }
};
