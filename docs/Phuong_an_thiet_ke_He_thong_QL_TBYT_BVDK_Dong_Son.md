**BỆNH VIỆN ĐA KHOA ĐÔNG SƠN**

KHOA DƯỢC - VẬT TƯ, THIẾT BỊ Y TẾ

# **PHƯƠNG ÁN THIẾT KẾ HỆ THỐNG**

# **QUẢN LÝ TRANG THIẾT BỊ Y TẾ**

*Tài liệu đầu ra Giai đoạn Thiết kế – phản hồi cho “Đặc tả hợp nhất hệ thống quản lý TBYT V1.2”*

*Phạm vi tài liệu: phân tích, chuẩn hoá yêu cầu và đề xuất kiến trúc/mô hình dữ liệu/workflow/UI/kế hoạch triển khai. KHÔNG bao gồm code triển khai. Tài liệu này cần được Bệnh viện xác nhận trước khi chuyển sang thiết kế kỹ thuật chi tiết và lập trình.*

Ngày lập: 14/08/2026

Nền tảng đề xuất: Google Apps Script + Google Sheets + Google Drive + HTML/CSS/JavaScript

## Mục lục tài liệu

- 0. Tóm tắt & chuẩn hoá yêu cầu
- 1. Sơ đồ kiến trúc tổng thể
- 2. Sơ đồ module & sitemap
- 3. ERD / mô hình dữ liệu logic
- 4. Đặc tả từng Google Sheet và từng cột
- 5. Ma trận phân quyền
- 6. State machine / workflow từng nghiệp vụ
- 7. Thiết kế cảnh báo – công việc
- 8. Thiết kế Google Drive và quản lý tài liệu
- 9. Wireframe các màn hình chính
- 10. Đặc tả API / Apps Script service
- 11. Quy tắc validation và chất lượng dữ liệu (Import Excel)
- 12. Chiến lược backup/restore và audit
- 13. Kế hoạch triển khai theo giai đoạn
- 14. Danh sách vấn đề cần Bệnh viện xác nhận trước khi lập trình

## 0. Tóm tắt & chuẩn hoá yêu cầu

Toàn bộ 30 nhóm chức năng trong Đặc tả V1.2 được chuẩn hoá thành 10 khối nghiệp vụ có quan hệ rõ ràng, lấy THIẾT BỊ làm dữ liệu lõi (hub). Việc nhóm lại phục vụ thiết kế module và phân quyền nhất quán, không loại bỏ chức năng nào so với tài liệu gốc.

| Khối | Nhóm chức năng gốc (mục trong Đặc tả) | Vai trò trong hệ thống |
|---|---|---|
| A. Danh mục & cấu hình | Danh mục chuẩn, Cấu hình quy tắc, Người dùng-phân quyền | Dữ liệu tham chiếu dùng chung |
| B. Thiết bị & hồ sơ | Danh mục thiết bị, Hồ sơ chi tiết, QR Code, Checklist hồ sơ | Lõi dữ liệu; mọi nghiệp vụ gắn vào qua THIET_BI_ID |
| C. Vòng đời tiếp nhận | Tiếp nhận, Nghiệm thu, Bàn giao, đưa vào sử dụng | Hình thành thiết bị, kích hoạt vòng đời sử dụng |
| D. Bảo đảm kỹ thuật định kỳ | Bảo hành, Bảo trì, Kiểm định, Hiệu chuẩn | Chu kỳ kỹ thuật cấu hình theo loại thiết bị |
| E. Chuyên biệt bức xạ | An toàn bức xạ, Hồ sơ phòng X-quang/CT | Nhóm điều kiện, chỉ áp dụng thiết bị liên quan bức xạ |
| F. Sự cố & khắc phục | Sự cố - sửa chữa, Downtime, Phụ tùng linh kiện | Xử lý bất thường và chi phí phát sinh |
| G. Vị trí & kiểm soát vật lý | Điều chuyển, Kiểm kê | Theo dõi thiết bị theo không gian, đối chiếu thực tế |
| H. Giám sát & tuân thủ | An toàn - cảnh báo - thu hồi, Đào tạo, Khắc phục sau audit | Đảm bảo tuân thủ và năng lực người dùng |
| I. Kết thúc vòng đời | Ngừng sử dụng - thanh lý | Đóng vòng đời, không xoá dữ liệu |
| K. Điều hành & hệ thống | Dashboard, Cảnh báo-công việc, Báo cáo, Phân tích, Xuất hồ sơ, Nhật ký, Import Excel, Backup | Lớp điều hành, giám sát, vận hành |

Nguyên tắc thiết kế xuyên suốt (áp dụng ở mọi giai đoạn, không đổi):

- THIET_BI_ID là khoá duy nhất, không đổi trong vòng đời; không dùng tên hay số dòng Sheet làm khoá.
- Mọi nghiệp vụ phát sinh bản ghi lịch sử riêng (append-only), không sửa đè dữ liệu cũ.
- Trường điều kiện (kiểm định/hiệu chuẩn/bức xạ...) luôn có 3 trạng thái Có/Không áp dụng/Chưa xác định, không để trống.
- Chu kỳ và ngưỡng cảnh báo cấu hình theo loại thiết bị (Sheet CAU_HINH), không hard-code trong code.
- Phân quyền kiểm tra ở backend (Service/Data Access layer); giao diện chỉ là lớp hiển thị.
- Không xoá thiết bị đã hình thành; kết thúc vòng đời bằng trạng thái + hồ sơ thanh lý.

## 1. Sơ đồ kiến trúc tổng thể

Kiến trúc 4 lớp theo đúng định hướng của Đặc tả: Frontend không phụ thuộc trực tiếp cấu trúc Sheet, cho phép thay lớp dữ liệu (PostgreSQL/MySQL) trong tương lai mà không viết lại giao diện và nghiệp vụ.

### 1.1. Sơ đồ khối

```
+--------------------------------------------------------------------+
| LOP 1 - FRONTEND (HTML Service)                                    |
| Index/Login/Dashboard/Devices/DeviceDetail/... .html + CSS/JS      |
| Goi qua google.script.run  |  Khong biet cau truc Sheet             |
+------------------------------------+--------------------------------+
                                     | API noi bo chuan hoa {success,data,error}
+------------------------------------v--------------------------------+
| LOP 2 - SERVICE / BUSINESS LOGIC (.gs theo module nghiep vu)        |
| Core, Auth, Device, Receipt, Acceptance, Handover, Warranty,        |
| Maintenance, Inspection, Calibration, Radiation, XrayRoom,          |
| Incident, Repair, Transfer, Document, QR, Alert, Inventory,         |
| Report, Audit -> chua toan bo quy tac, state machine, validate      |
+------------------------------------+--------------------------------+
                                     | Repository interface (CRUD theo ID)
+------------------------------------v--------------------------------+
| LOP 3 - DATA ACCESS (Database.gs - Repository pattern)              |
| Sinh ID, doc/ghi theo pham vi, LockService, CacheService,           |
| anh xa Sheet <-> doi tuong nghiep vu                                 |
+------------------------------------+--------------------------------+
                                     |
+------------------------------------v--------------------------------+
| LOP 4 - DU LIEU: Google Sheets (36 bang)  +  Google Drive (file)    |
+--------------------------------------------------------------------+
```

### 1.2. Nguyên tắc tách lớp

- Frontend chỉ gọi các hàm “Controller” công khai trong Core.gs (một cổng vào duy nhất), không gọi thẳng module nghiệp vụ hay SpreadsheetApp.
- Service layer xử lý toàn bộ quy tắc nghiệp vụ, state machine, phân quyền, sinh ID, ghi audit — không thao tác đọc/ghi Sheet trực tiếp.
- Data Access layer là nơi DUY NHẤT gọi SpreadsheetApp/DriveApp; khi chuyển sang SQL sau này chỉ cần viết lại lớp này.
- Mọi phản hồi giữa các lớp dùng cấu trúc chuẩn { success, data, error:{code,message} } để frontend xử lý lỗi nhất quán.
- Xác thực qua Google Account của đơn vị (Session.getActiveUser trong phạm vi domain bệnh viện); không lưu mật khẩu riêng.

## 2. Sơ đồ module & sitemap

### 2.1. Module backend (.gs) và trách nhiệm

| Module | Trách nhiệm chính |
|---|---|
| Core.gs | Cổng API duy nhất cho frontend (doGet, google.script.run), điều phối sang module nghiệp vụ |
| Auth.gs | Xác thực Google Account, xác định vai trò/phạm vi khoa-phòng, kiểm tra quyền từng hành động |
| Config.gs | Đọc/ghi danh mục chuẩn và CAU_HINH (chu kỳ, ngưỡng cảnh báo theo loại thiết bị) |
| Database.gs | Repository: sinh ID, CRUD theo Sheet, LockService, CacheService, lọc/phân trang hiệu năng cao |
| Device.gs | Vòng đời & hồ sơ thiết bị, trạng thái quản lý, tìm kiếm/lọc danh sách |
| Receipt / Acceptance / Handover.gs | Tiếp nhận, nghiệm thu, bàn giao — workflow hình thành thiết bị |
| Warranty.gs | Theo dõi hạn bảo hành, yêu cầu bảo hành, kết quả xử lý |
| Maintenance / Inspection / Calibration.gs | Kế hoạch, checklist, kết quả bảo trì / kiểm định / hiệu chuẩn theo cấu hình |
| Radiation / XrayRoom.gs | An toàn bức xạ và hồ sơ phòng X-quang/CT (module điều kiện) |
| Incident / Repair.gs | Báo sự cố, phiếu sửa chữa, xác nhận an toàn sau sửa chữa, downtime |
| Transfer.gs | Điều chuyển thiết bị giữa khoa/phòng, cập nhật vị trí, timeline |
| Document.gs | Quản lý Google Drive: tạo folder, upload/xoá/thay thế file, checklist hồ sơ |
| QR.gs | Sinh mã QR, in tem, xử lý thao tác nhanh khi quét |
| Alert.gs | Cảnh báo engine (time-driven trigger), sinh công việc, theo dõi hạn xử lý |
| Inventory.gs | Đợt kiểm kê, đối chiếu QR, xử lý chênh lệch |
| Report.gs | Báo cáo, phân tích quản trị, xuất bộ hồ sơ thiết bị |
| Audit.gs | Ghi và truy vấn AUDIT_LOG; chặn sửa/xoá log từ người dùng thường |
| Utils.gs | Hàm dùng chung: định dạng ngày, validate, mã hoá ID, xử lý lỗi |

### 2.2. Sitemap frontend (theo luồng điều hướng)

- Đăng nhập (Login.html) → Dashboard.html (nội dung theo vai trò)
- Thiết bị: Devices.html (danh sách, lọc, import) → DeviceDetail.html (tab: Nhận dạng | Sử dụng | Nghiệp vụ | Tài liệu | Lịch sử)
- Nghiệp vụ vòng đời: Receipt.html, Acceptance.html, Handover.html
- Bảo đảm kỹ thuật: Warranty.html, Maintenance.html, Inspection.html, Calibration.html
- Bức xạ (điều kiện): Radiation.html, XrayRoom.html
- Sự cố: Incident.html, Repair.html
- Vị trí: Transfer.html, Inventory.html (kèm giao diện quét QR trên thiết bị di động)
- Tài liệu & QR: Documents.html, QR.html
- Điều hành: Alerts.html (cảnh báo & công việc), Reports.html
- Quản trị: Admin.html (người dùng, phân quyền, danh mục, cấu hình, audit log, backup)

## 3. ERD / mô hình dữ liệu logic

36 Sheet giữ nguyên như Đặc tả (mục 16), chia thành 4 nhóm quan hệ. THIET_BI (01) là bảng lõi, quan hệ 1:N với toàn bộ bảng nghiệp vụ qua THIET_BI_ID; các bảng danh mục (02–09) được THIET_BI và các bảng nghiệp vụ tham chiếu qua *_ID.

### 3.1. Sơ đồ quan hệ mức logic

```
Danh muc 02-09 (LOAI, NHOM, HANG, NCC, KHOA_PHONG, VI_TRI...)
        \
         \__FK__  01_THIET_BI (hub, PK: ID, khoa: MA_THIET_BI)  __FK__ 27_CAU_HINH
                        |  1:N ra toan bo bang nghiep vu (THIET_BI_ID)
                        |--> 10,11,12  Tiep nhan / Nghiem thu / Ban giao
                        |--> 13,14,15,16  Bao hanh / Bao tri / Kiem dinh / Hieu chuan
                        |--> 17,18  An toan buc xa / Ho so phong XQ-CT
                        |--> 19,20,33  Su co / Sua chua / Downtime
                        |--> 32  Phu tung (FK them SUA_CHUA_ID)
                        |--> 21  Dieu chuyen
                        |--> 22,29  Tai lieu / Checklist ho so
                        |--> 24  Kiem ke (FK them DOT_KIEM_KE_ID)
                        |--> 30  Dao tao nguoi su dung
                        |--> 31  Canh bao an toan / thu hoi
                        |--> 34  Thanh ly
                        |--> 23,36  Canh bao -> Cong viec
                        |--> 35  Khac phuc audit
                        \--> 28  Audit log (doi tuong bat ky)

25_NGUOI_DUNG --FK--> 26_QUYEN  (vai tro + pham vi khoa/phong)
```

### 3.2. Quy ước khoá và quan hệ

- Khoá chính mọi bảng: cột ID dạng chuỗi có tiền tố nghiệp vụ (xem bảng 3.3), KHÔNG dùng số dòng Sheet.
- Khoá ngoại luôn là *_ID trỏ tới ID của bảng liên quan (THIET_BI_ID, LOAI_THIET_BI_ID, KHOA_PHONG_ID, NGUOI_PHU_TRACH_ID...).
- Quan hệ chuẩn: 1 THIET_BI – N bản ghi nghiệp vụ; 1 SUA_CHUA – N PHU_TUNG đã thay; 1 đợt KIEM_KE – N dòng chi tiết theo thiết bị.
- AUDIT_LOG dùng khoá ngoại đa hình: DOI_TUONG_LOAI (tên bảng) + DOI_TUONG_ID, tránh giới hạn khi mở rộng module mới.
- CANH_BAO và CONG_VIEC liên kết 1:1 hoặc 1:N tuỳ loại: 1 cảnh báo có thể sinh 1 công việc; công việc cũng có thể tạo thủ công không qua cảnh báo.

### 3.3. Quy ước tiền tố ID theo nghiệp vụ

| Tiền tố | Bảng / nghiệp vụ | Tiền tố | Bảng / nghiệp vụ |
|---|---|---|---|
| TB-YYYY-NNNNNN | Mã thiết bị (không đổi) | TRF- | Điều chuyển (21) |
| DEV- | ID nội bộ thiết bị (01) | DOC- | Tài liệu (22) |
| RCV- | Tiếp nhận (10) | CHK- | Dòng checklist hồ sơ (29) |
| ACP- | Nghiệm thu (11) | INV- | Đợt / dòng kiểm kê (24) |
| HDO- | Bàn giao (12) | ALR- | Cảnh báo (23) |
| WAR- | Bảo hành (13) | TSK- | Công việc (36) |
| MNT- | Bảo trì (14) | TRN- | Đào tạo (30) |
| INS- | Kiểm định (15) | SAF- | Cảnh báo an toàn/thu hồi (31) |
| CAL- | Hiệu chuẩn (16) | PRT- | Phụ tùng (32) |
| RAD- | An toàn bức xạ (17) | DWT- | Downtime (33) |
| XRM- | Hồ sơ phòng XQ/CT (18) | LIQ- | Thanh lý (34) |
| INC- | Sự cố (19) | AUD- | Khắc phục audit (35) |
| REP- | Sửa chữa (20) | LOG- | Audit log (28) |

## 4. Đặc tả từng Google Sheet và từng cột

Mọi bảng nghiệp vụ (10–24, 29–36) đều có 6 cột hệ thống chung, không lặp lại trong bảng bên dưới: THIET_BI_ID (FK, trừ 25-28), NGAY_TAO, NGUOI_TAO, NGAY_CAP_NHAT, NGUOI_CAP_NHAT, GHI_CHU. Bảng dưới đây liệt kê các cột NGHIỆP VỤ RIÊNG của từng Sheet.

### 4.1. Sheet lõi – 01_THIET_BI (27 cột theo Đặc tả mục 17)

| # | Cột | Kiểu dữ liệu | Ghi chú |
|---|---|---|---|
| 1 | ID | Text (DEV-...) | PK |
| 2 | MA_THIET_BI | Text (TB-YYYY-NNNNNN) | Duy nhất, không đổi khi điều chuyển |
| 3 | TEN_THIET_BI | Text |  |
| 4 | LOAI_THIET_BI_ID | Text (FK→02) |  |
| 5 | NHA_CUNG_CAP_ID | Text (FK→08) |  |
| 6 | PHAN_LOAI | Enum A/B/C/D | Theo phân loại pháp lý/chuyên môn |
| 7 | NHOM_THIET_BI_ID | Text (FK→03) |  |
| 8 | HANG_SAN_XUAT_ID | Text (FK→06) |  |
| 9 | NUOC_SAN_XUAT | Text |  |
| 10 | NAM_SAN_XUAT | Number |  |
| 11 | MODEL | Text |  |
| 12 | SERIAL | Text | Kiểm tra trùng khi thêm mới/import |
| 13 | KHOA_PHONG_ID | Text (FK→04) | Cập nhật khi điều chuyển |
| 14 | VI_TRI_ID | Text (FK→05) | Cập nhật khi điều chuyển |
| 15 | NGUOI_PHU_TRACH_ID | Text (FK→09) |  |
| 16 | TINH_TRANG_KY_THUAT | Enum | Tốt/Cần theo dõi/Hỏng... |
| 17 | TRANG_THAI_QUAN_LY | Enum (12 trạng thái mục 8) | Chỉ đổi qua workflow |
| 18 | NGAY_DUA_VAO_SU_DUNG | Date |  |
| 19 | HINH_THUC_MUA_SAM | Text |  |
| 20 | NGAY_BAT_DAU_BAO_HANH | Date | Nullable |
| 21 | NGAY_HET_BAO_HANH | Date | Nullable, dùng cho Alert.gs |
| 22 | QR_URL | Text | Sinh khi tạo thiết bị |
| 23 | FOLDER_ID | Text | ID thư mục Drive riêng |
| 24-27 | CREATED_AT/BY, UPDATED_AT/BY | Datetime/Text | Audit cơ bản |

### 4.2. Nhóm danh mục (02–09, 25–27) – cấu trúc dùng chung

Các Sheet danh mục dùng chung một khuôn mẫu để dễ quản trị và mở rộng:

| Cột | Mô tả |
|---|---|
| ID | PK, tiền tố theo bảng (VD: LOAI-, NHOM-, KP-, VT-, HSX-, NSX-, NCC-, NPT-) |
| MA | Mã ngắn gọn dùng hiển thị/lọc nhanh |
| TEN | Tên hiển thị |
| MO_TA | Mô tả thêm (VD: địa chỉ nhà cung cấp, thông tin liên hệ người phụ trách) |
| CAP_TREN_ID | Tự tham chiếu nếu danh mục có cấp bậc (VD: Khoa/phòng con) |
| TRANG_THAI | Hoạt động / Ngừng sử dụng — không xoá cứng danh mục đã dùng |
| CREATED/UPDATED_AT/BY | Audit cơ bản |

Riêng 27_CAU_HINH có thêm: LOAI_THIET_BI_ID (áp dụng cho loại nào, để trống = mặc định), LOAI_QUY_TAC (Bảo trì/Kiểm định/Hiệu chuẩn/Cảnh báo/Bảo hành), CHU_KY_THANG, SO_NGAY_CANH_BAO_TRUOC, CAN_CU_AP_DUNG, BAT_BUOC (Có/Không/Chưa xác định).

25_NGUOI_DUNG: ID, EMAIL (Google Account), HO_TEN, VAI_TRO_ID (FK→26), KHOA_PHONG_PHU_TRACH (danh sách, rỗng = toàn viện với Super Admin/Lãnh đạo), TRANG_THAI (Đang hoạt động/Khoá).

26_QUYEN: ID, VAI_TRO, MODULE, QUYEN_XEM/TAO/SUA/DUYET/XOA/KHOA (Boolean từng cột) — nguồn cho ma trận phân quyền ở mục 5.

### 4.3. Nhóm nghiệp vụ vòng đời hình thành (10–12)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 10_TIEP_NHAN | NGAY_TIEP_NHAN, NGUON_HINH_THANH, DON_VI_BAN_GIAO, HO_SO_KEM_THEO (FILE_ID), TINH_TRANG_KHI_NHAN, TRANG_THAI (Đang tiếp nhận/Hoàn tất) |
| 11_NGHIEM_THU | NGAY_NGHIEM_THU, HOI_DONG_NGHIEM_THU, KET_QUA (Đạt/Đạt có điều kiện/Không đạt), TON_TAI_GHI_NHAN, BIEN_BAN_FILE_ID |
| 12_BAN_GIAO | NGAY_BAN_GIAO, DON_VI_NHAN, NGUOI_NHAN_ID, KHOA_PHONG_NHAN_ID, VI_TRI_NHAN_ID, PHIEU_FILE_ID, XAC_NHAN (Chưa/Đã xác nhận) |

### 4.4. Nhóm bảo đảm kỹ thuật định kỳ (13–16)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 13_BAO_HANH | NGAY_BAT_DAU, NGAY_KET_THUC, DON_VI_BAO_HANH, DIEU_KIEN_PHAM_VI, LAN_YEU_CAU_THU_MAY (đếm), KET_QUA_XU_LY, FILE_HO_SO |
| 14_BAO_TRI | KY_BAO_TRI (Tháng/Quý/Năm), NGAY_KE_HOACH, NGAY_THUC_HIEN, CHECKLIST_ID (FK→loại thiết bị), NGUOI_THUC_HIEN, KET_QUA, KY_TIEP_THEO |
| 15_KIEM_DINH | CAN_CU_AP_DUNG, NGAY_THUC_HIEN, DON_VI_KIEM_DINH, TRANG_THAI (Không áp dụng/Chưa thực hiện/Đang chờ/Đạt/Không đạt/Quá hạn), NGAY_HET_HAN, CHUNG_NHAN_FILE_ID |
| 16_HIEU_CHUAN | CAN_CU_AP_DUNG, NGAY_THUC_HIEN, DON_VI_HIEU_CHUAN, TRANG_THAI (như trên), NGAY_HET_HAN, CHUNG_NHAN_FILE_ID |

### 4.5. Nhóm bức xạ – điều kiện (17–18)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 17_AN_TOAN_BUC_XA | AP_DUNG (Có/Không/Chưa xác định), SO_GIAY_PHEP, CO_QUAN_CAP, NGAY_CAP, THOI_HAN, FILE_GIAY_PHEP |
| 18_HO_SO_PHONG_XQ_CT | LOAI_PHONG, TEN_PHONG, VI_TRI_ID, SO_GIAY_CHUNG_NHAN, NGAY_CAP, HIEU_LUC_DEN, DON_VI_CAP, KET_QUA, FILE |

### 4.6. Nhóm sự cố – sửa chữa – downtime – phụ tùng (19,20,32,33)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 19_SU_CO | NGAY_BAO_SU_CO, NGUON_BAO (Dashboard/Hồ sơ/QR), MO_TA, MUC_DO (Thấp/TB/Cao/Khẩn cấp), NGUOI_BAO, TRANG_THAI |
| 20_SUA_CHUA | SU_CO_ID (FK), NGUYEN_NHAN, NOI_DUNG, BIEN_PHAP, DON_VI_THUC_HIEN, NGAY_BAT_DAU/HOAN_THANH, CHI_PHI, KET_QUA_KIEM_TRA_SAU_SUA, XAC_NHAN_SU_DUNG (Được phép/Chưa được phép) |
| 32_PHU_TUNG | SUA_CHUA_ID (FK), TEN_PHU_TUNG, PART_NUMBER, SERIAL, HANG, NGAY_THAY, SO_LUONG, DON_GIA, THANH_TIEN, NHA_CUNG_CAP, CHUNG_TU_FILE, BAO_HANH_PHU_TUNG |
| 33_DOWNTIME | SU_CO_ID (FK), THOI_DIEM_NGUNG, THOI_DIEM_BAO_SU_CO, THOI_DIEM_TIEP_NHAN, THOI_DIEM_BAT_DAU_SUA, THOI_DIEM_HOAN_THANH, THOI_DIEM_DUOC_SU_DUNG_LAI, TONG_THOI_GIAN_PHUT (tính toán) |

### 4.7. Nhóm vị trí & kiểm soát (21, 24)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 21_DIEU_CHUYEN | KHOA_PHONG_CU_ID, KHOA_PHONG_MOI_ID, VI_TRI_CU_ID, VI_TRI_MOI_ID, LY_DO, NGUOI_DUYET, TRANG_THAI (Chờ duyệt/Đã duyệt/Đã bàn giao) |
| 24_KIEM_KE | DOT_KIEM_KE_ID, NGAY_QUET, NGUOI_QUET_ID, VI_TRI_QUET, KET_QUA (Có mặt/Không tìm thấy/Sai vị trí/Đang sửa chữa/Đã điều chuyển/Khác) |

### 4.8. Nhóm giám sát – tuân thủ (29–31, 35)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 29_CHECKLIST_HO_SO | LOAI_TAI_LIEU, TRANG_THAI (Có/Thiếu/Không áp dụng), SO_NGAY_VAN_BAN, FILE_ID, NGUOI_CAP_NHAT |
| 30_DAO_TAO_NGUOI_DUNG | NGUOI_DUOC_DAO_TAO_ID, KHOA_PHONG_ID, CHUC_DANH, NGAY, HINH_THUC, NOI_DUNG, DON_VI_DAO_TAO, KET_QUA, FILE_CHUNG_NHAN |
| 31_CANH_BAO_AN_TOAN | NGUON_THONG_BAO, SO_NGAY, HANG_CO_QUAN, NOI_DUNG, MUC_DO, PHAM_VI (Model/Serial/Lô), HANH_DONG, NGUOI_PHU_TRACH, HAN_XU_LY, MINH_CHUNG_FILE, NGAY_DONG |
| 35_KHAC_PHUC_AUDIT | NGUON_AUDIT, TON_TAI, NGUOI_CHIU_TRACH_NHIEM, HAN_HOAN_THANH, TRANG_THAI, MINH_CHUNG_FILE, NGAY_XAC_NHAN_DONG |

### 4.9. Nhóm kết thúc vòng đời & điều hành (22–23, 28, 34, 36)

| Sheet | Cột nghiệp vụ riêng |
|---|---|
| 22_TAI_LIEU | NHOM_TAI_LIEU, TEN_FILE, FILE_ID, FOLDER_ID, PHIEN_BAN, NGUOI_UPLOAD |
| 23_CANH_BAO | LOAI_CANH_BAO (Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn/Hồ sơ thiếu/Sự cố/Bức xạ...), MUC_DO, NGAY_PHAT_SINH, TRANG_THAI (Mới/Đã giao việc/Đã đóng) |
| 28_AUDIT_LOG | THOI_GIAN, NGUOI_THUC_HIEN, HANH_DONG, DOI_TUONG_LOAI, DOI_TUONG_ID, GIA_TRI_TRUOC, GIA_TRI_SAU (JSON text) |
| 34_THANH_LY | NGAY_DE_NGHI, LY_DO, PHUONG_AN_DE_XUAT, HOI_DONG_DUYET, NGAY_PHE_DUYET, NGAY_THUC_HIEN, HO_SO_FILE, TRANG_THAI |
| 36_CONG_VIEC | CANH_BAO_ID (FK, nullable), LOAI_CONG_VIEC, NGUOI_PHU_TRACH_ID, HAN_XU_LY, TRANG_THAI (Mới/Đang xử lý/Chờ xác nhận/Hoàn thành/Quá hạn), MINH_CHUNG_FILE |

## 5. Ma trận phân quyền

Quy ước: X = Xem, T = Tạo, S = Sửa, D = Duyệt, Xo = Xoá (chỉ dữ liệu chưa phát sinh nghiệp vụ), K = Khoá/Đóng. Tất cả vai trò trừ Super Admin/Lãnh đạo đều bị giới hạn theo khoa/phòng được gán ở 25_NGUOI_DUNG. Kiểm tra quyền thực hiện ở Auth.gs trước khi Service layer xử lý — không chỉ ẩn nút giao diện.

| Module | Super Admin | Quản lý thiết bị | Kỹ thuật viên | Khoa/phòng | Lãnh đạo | Người xem |
|---|---|---|---|---|---|---|
| Danh mục & cấu hình | X T S Xo | X | X | - | X | X |
| Thiết bị & hồ sơ | X T S Xo K | X T S K (phạm vi) | X (phạm vi) | X (đơn vị mình) | X | X |
| Tiếp nhận/Nghiệm thu/Bàn giao | X T S D | X T S D | X (thực hiện) | X D (xác nhận nhận) | X D | X |
| Bảo hành/Bảo trì/Kiểm định/Hiệu chuẩn | X T S D | X T S D | X T S | X (xem, báo sự cố) | X D | X |
| Bức xạ / Phòng XQ-CT | X T S D | X T S D | X T S | X | X D | X |
| Sự cố/Sửa chữa/Downtime/Phụ tùng | X T S D | X T S D | X T S | X T (báo sự cố) | X D | X |
| Điều chuyển/Kiểm kê | X T S D | X T S D | X (kiểm kê) | X T D (đơn vị mình) | X D | X |
| An toàn/thu hồi, Đào tạo, Khắc phục audit | X T S D K | X T S D | X T S | X (xem, xác nhận) | X D | X |
| Thanh lý | X T S D K | X T D | - | - | D | X |
| Cảnh báo & Công việc | X T S K | X T S K (phạm vi) | X S (được giao) | X (đơn vị mình) | X | X |
| Báo cáo/Phân tích/Xuất hồ sơ | X | X | X (phạm vi) | X (đơn vị mình) | X | X |
| Người dùng & phân quyền | X T S Xo K | - | - | - | X | - |
| Audit log | X (chỉ xem) | - | - | - | X | - |
| Import Excel / Backup | X T | X T (danh mục thiết bị) | - | - | X (xem báo cáo) | - |

*Ghi chú: “phạm vi” nghĩa là giới hạn theo khoa/phòng được gán cho tài khoản; ví dụ người dùng Khoa Nội không sửa được thiết bị của Khoa Ngoại trừ khi được cấp quyền toàn viện.*

## 6. State machine / workflow từng nghiệp vụ

### 6.1. State machine trạng thái thiết bị (TRANG_THAI_QUAN_LY)

| Trạng thái hiện tại | Sự kiện | Trạng thái tiếp theo | Vai trò được phép |
|---|---|---|---|
| Đang tiếp nhận | Hoàn tất tiếp nhận, đủ hồ sơ | Chờ nghiệm thu | Quản lý thiết bị |
| Chờ nghiệm thu | Nghiệm thu Đạt | Đã nghiệm thu | Hội đồng / Quản lý thiết bị (duyệt) |
| Đã nghiệm thu | Tạo phiếu bàn giao | Chờ bàn giao | Quản lý thiết bị |
| Chờ bàn giao | Khoa/phòng xác nhận nhận | Đang sử dụng | Khoa/phòng (xác nhận) |
| Đang sử dụng | Đến kỳ / phát sinh bảo trì | Đang bảo trì | Kỹ thuật viên |
| Đang sử dụng | Báo sự cố nghiêm trọng | Đang sửa chữa | Kỹ thuật viên / Quản lý thiết bị |
| Đang bảo trì / Đang sửa chữa | Hoàn thành, cần kiểm tra an toàn | Chờ kiểm tra sau sửa chữa | Kỹ thuật viên |
| Chờ kiểm tra sau sửa chữa | Xác nhận “Được phép sử dụng” | Đang sử dụng | Quản lý thiết bị (duyệt) |
| Chờ kiểm tra sau sửa chữa | Xác nhận “Chưa được phép” | Tạm ngừng sử dụng | Quản lý thiết bị |
| Đang sử dụng | Kiểm định/hiệu chuẩn Không đạt (nếu cấu hình chặn) | Tạm ngừng sử dụng | Hệ thống tự động theo CAU_HINH |
| Đang sử dụng / Tạm ngừng | Duyệt điều chuyển | Chờ điều chuyển → Đang sử dụng (đơn vị mới) | Quản lý thiết bị (duyệt) |
| Bất kỳ trạng thái đang hoạt động | Đề nghị thanh lý được duyệt | Chờ thanh lý | Hội đồng thanh lý |
| Chờ thanh lý | Hoàn tất thủ tục thanh lý | Đã thanh lý (trạng thái khoá, không xoá bản ghi) | Super Admin / Quản lý thiết bị |

*Người dùng không nhập trạng thái tự do; mọi chuyển trạng thái phải đi qua hàm nghiệp vụ tương ứng trong Service layer, ghi Audit log kèm giá trị trước/sau.*

### 6.2. Trạng thái kiểm định / hiệu chuẩn

Không áp dụng → Chưa thực hiện → Đang chờ → (Đạt | Không đạt) → Quá hạn (tự động khi vượt NGAY_HET_HAN mà chưa có kỳ mới). Nếu Không đạt và CAU_HINH.BAT_BUOC = Có: Alert.gs sinh cảnh báo mức cao và có thể yêu cầu Device.gs chuyển trạng thái thiết bị sang Tạm ngừng sử dụng — chỉ khi quy tắc cấu hình yêu cầu, hệ thống không tự suy diễn.

### 6.3. Workflow sự cố – sửa chữa

Báo sự cố → Tiếp nhận → Đánh giá mức độ → Phân công kỹ thuật viên/đơn vị ngoài → Kiểm tra hiện trường → Sửa chữa (ghi phụ tùng, chi phí) → Kiểm tra/chạy thử sau sửa → Xác nhận Được phép/Chưa được phép sử dụng → Đóng phiếu. Mỗi bước ghi mốc thời gian vào 33_DOWNTIME.

### 6.4. Workflow kiểm kê

Tạo đợt kiểm kê (chọn phạm vi khoa/phòng hoặc toàn viện) → Quét QR từng thiết bị → Ghi kết quả (Có mặt/Không tìm thấy/Sai vị trí/Đang sửa chữa/Đã điều chuyển/Khác) → Đối chiếu tự động với TRANG_THAI_QUAN_LY và VI_TRI_ID hiện tại → Xử lý chênh lệch (tạo công việc xác minh) → Đóng đợt, xuất báo cáo.

### 6.5. Workflow thanh lý

Đề nghị (kèm lý do) → Đánh giá kỹ thuật/tài chính → Đề xuất phương án → Phê duyệt (Hội đồng) → Thực hiện thanh lý → Lưu hồ sơ thanh lý → Khoá vòng đời thiết bị (trạng thái Đã thanh lý, không xoá bản ghi, vẫn tra cứu được lịch sử).

### 6.6. Workflow khắc phục sau audit

Ghi nhận tồn tại (từ audit nội bộ/thanh tra) → Giao trách nhiệm và hạn hoàn thành → Người phụ trách xử lý, đính minh chứng → Người duyệt xác nhận đóng → Cập nhật trạng thái Hoàn thành; nếu quá hạn tự động sinh cảnh báo.

## 7. Thiết kế cảnh báo – công việc

### 7.1. Cơ chế phát sinh cảnh báo

- Time-driven trigger (Apps Script) chạy quét hằng ngày (Alert.gs): so sánh ngày hiện tại với các mốc trong 13-18 (hạn bảo hành/bảo trì/kiểm định/hiệu chuẩn/giấy phép bức xạ) theo ngưỡng SO_NGAY_CANH_BAO_TRUOC cấu hình tại 27_CAU_HINH theo từng loại thiết bị.
- Cảnh báo sự kiện tức thời: hồ sơ thiếu (khi checklist chuyển trạng thái Thiếu), sự cố mới ở mức Cao/Khẩn cấp, kết quả kiểm định Không đạt, thông báo an toàn/thu hồi mới, kiểm kê phát hiện chênh lệch.
- Cảnh báo tổng hợp định kỳ (tuần/tháng) phục vụ Dashboard: thiết bị sửa chữa nhiều lần, downtime cao, phụ tùng sắp hết bảo hành.

### 7.2. Luồng Cảnh báo → Công việc

Cảnh báo phát sinh (tự động hoặc tạo thủ công) → Ghi vào 23_CANH_BAO (loại, mức độ, thiết bị liên quan) → Alert.gs tự sinh bản ghi 36_CONG_VIEC tương ứng, gán người phụ trách theo quy tắc (VD: cảnh báo bảo trì → kỹ thuật viên phụ trách khoa/phòng đó) → Người phụ trách xử lý và đính minh chứng → Người có quyền Duyệt xác nhận đóng → Cập nhật trạng thái Hoàn thành/Quá hạn và ghi Audit.

### 7.3. Quy tắc gán và ưu tiên

- Mỗi loại cảnh báo có quy tắc gán mặc định (theo vai trò + khoa/phòng thiết bị), có thể gán lại thủ công bởi Quản lý thiết bị.
- Mức độ cảnh báo (Thấp/Trung bình/Cao/Khẩn cấp) quyết định thời hạn xử lý mặc định và hiển thị nổi bật trên Dashboard.
- Công việc quá hạn tự động nâng mức độ và lặp lại nhắc nhở; không tự đóng nếu chưa có minh chứng và xác nhận.
- Một cảnh báo có thể liên kết nhiều thiết bị (VD: thông báo thu hồi theo lô/model) — hệ thống tự tạo danh sách thiết bị bị ảnh hưởng và một công việc theo dõi tổng, có thể tách công việc con theo từng thiết bị.

## 8. Thiết kế Google Drive và quản lý tài liệu

### 8.1. Cấu trúc thư mục (theo Đặc tả mục 14, chi tiết hoá)

- QUAN_LY_TTBYT (Shared Drive của bệnh viện, không phải Drive cá nhân)
- 01_HO_SO_THIET_BI / {MA_THIET_BI} / 01_MuaSam 02_HopDong_ChungTu 03_TiepNhan_NghiemThu 04_BanGiao 05_PhapLy_KyThuat 06_DaoTao 07_BaoHanh 08_BaoTri 09_KiemDinh 10_HieuChuan 11_SuaChua_PhuTung 12_DieuChuyen 13_AnToan_ThuHoi 14_ThanhLy 15_TaiLieuKhac
- 02_BAO_CAO — báo cáo xuất định kỳ và theo yêu cầu
- 03_BIEN_BAN — biên bản nghiệm thu/kiểm kê/họp hội đồng
- 04_QR — file tem QR đã in (PDF hàng loạt và từng thiết bị)
- 05_IMPORT — file Excel gốc đã import, lưu kèm log kết quả import
- 06_EXPORT — dữ liệu xuất phục vụ backup/di chuyển nền tảng
- 07_BACKUP — bản sao Sheets định kỳ + nhật ký backup
- 08_MAU_BIEU — biểu mẫu chuẩn (phiếu tiếp nhận, bàn giao, sửa chữa...)

### 8.2. Quy tắc lưu trữ và truy cập

- Google Sheets chỉ lưu FOLDER_ID/FILE_ID và metadata (tên file, loại tài liệu, người upload, ngày) — không lưu file nhị phân trong Sheet.
- Thư mục thuộc Shared Drive do tài khoản tổ chức của bệnh viện sở hữu, KHÔNG phụ thuộc tài khoản Google cá nhân của bất kỳ nhân sự nào.
- Phân quyền truy cập Drive ánh xạ theo nhóm Google Workspace tương ứng vai trò hệ thống (VD: nhóm kythuatvien@..., nhóm khoaphong-noi@...); không chia sẻ công khai (Anyone with the link) cho hồ sơ nội bộ.
- Mọi thao tác upload/xoá/thay thế file được thực hiện qua Document.gs (không thao tác trực tiếp trên Drive UI để đảm bảo ghi Audit và cập nhật FILE_ID vào Sheet tương ứng).
- Xoá tài liệu là thao tác nguy hiểm: yêu cầu xác nhận hai bước và ghi Audit log với giá trị trước khi xoá (tên file, FILE_ID).
- Đặt tên file chuẩn hoá: {MA_THIET_BI}_{NHOM_TAI_LIEU}_{YYYYMMDD}_{MoTaNgan}.{ext} để dễ tra cứu ngoài hệ thống nếu cần.

## 9. Wireframe các màn hình chính

Wireframe mức bố cục (không phải giao diện chi tiết), phục vụ thống nhất trước khi thiết kế UI/UX kỹ thuật.

### 9.1. Dashboard (theo vai trò)

```
+---------------------------------------------------------------+
| Sidebar | Thanh tren: Ten don vi | Tim kiem | Chuong | User    |
|---------|-------------------------------------------------------|
| Trang   |  [The so lieu] Tong TB | Dang su dung | Bao tri | ... |
| chu     |  (moi the click -> mo danh sach loc san)              |
| Thiet bi|  [Canh bao noi bat] Bao hanh | Kiem dinh | Ho so thieu |
| Nghiep  |  [Bieu do] Theo khoa/phong | Theo nhom | Theo tinh trang|
| vu...   |  [Hoat dong gan day] - danh sach 10 dong                |
+---------------------------------------------------------------+
```

### 9.2. Danh sách thiết bị (Devices.html)

```
+---------------------------------------------------------------+
| [Tim kiem nhanh: ten/ma/serial] [Bo loc: khoa, nhom, trang thai]|
| [Them moi] [Import Excel] [Xuat danh sach] [Thao tac hang loat]|
|---------------------------------------------------------------|
| Ma TB | Ten | Khoa/phong | Trang thai | Canh bao | Xem chi tiet|
| ...bang du lieu co phan trang...                               |
+---------------------------------------------------------------+
```

### 9.3. Hồ sơ thiết bị (DeviceDetail.html)

```
+---------------------------------------------------------------+
| [Anh/QR]  Ten TB - Ma TB          Trang thai: [badge mau]      |
| Tabs: Nhan dang | Su dung | Nghiep vu | Tai lieu | Lich su     |
|---------------------------------------------------------------|
| Tab dang chon hien thi noi dung tuong ung.                     |
| Tab Nghiep vu: sub-tabs Bao hanh/Bao tri/Kiem dinh/Hieu chuan/  |
|   Su co-Sua chua/Dieu chuyen/Dao tao/An toan-thu hoi            |
| Tab Lich su: timeline doc theo thoi gian, moi moc co the mo     |
|   chi tiet ban ghi lien quan                                    |
| [Nut: Xuat bo ho so thiet bi]                                   |
+---------------------------------------------------------------+
```

### 9.4. Form nghiệp vụ (mẫu chung, VD Bảo trì)

```
+---------------------------------------------------------------+
| Thiet bi: [chon/hien thi san neu mo tu Ho so TB]                |
| Cac truong DIEU KIEN chi hien khi ap dung (an theo cau hinh)   |
| Checklist theo loai thiet bi: [danh sach checkbox]              |
| Ket qua | File dinh kem | Nguoi thuc hien                       |
| [Luu nhap] [Hoan thanh] -> tu sinh ky tiep theo neu ap dung     |
+---------------------------------------------------------------+
```

### 9.5. Màn hình quét QR / Kiểm kê (di động)

```
+-------------------------+
|  [Khung quet camera]     |
|  Ket qua: Ten - Ma TB    |
|  Trang thai hien tai     |
|-------------------------|
|  Thao tac nhanh:          |
|  [Xem ho so][Bao su co]  |
|  [Kiem ke: chon ket qua] |
|  [Yeu cau sua chua]      |
+-------------------------+
```

### 9.6. Trang Admin

```
+---------------------------------------------------------------+
| Tabs: Nguoi dung | Vai tro-Quyen | Danh muc | Cau hinh quy tac |
|       Audit log | Backup-Restore                                |
| Nguoi dung: danh sach + gan vai tro + pham vi khoa/phong        |
| Cau hinh: bang quy tac theo loai thiet bi (chu ky, nguong CB)   |
| Audit log: bang chi doc, loc theo nguoi/hanh dong/thoi gian     |
+---------------------------------------------------------------+
```

### 9.7. Nguyên tắc UI/UX áp dụng chung

- Màu trạng thái/cảnh báo nhất quán toàn hệ thống, luôn kèm nhãn chữ (không dùng màu là thông tin duy nhất — hỗ trợ người khó phân biệt màu).
- Form chỉ hiển thị trường điều kiện khi nghiệp vụ áp dụng (VD: trường bức xạ chỉ hiện khi thiết bị thuộc phạm vi liên quan).
- Thao tác nguy hiểm (xoá tài liệu, thanh lý, đổi quyền) luôn có hộp thoại xác nhận và ghi Audit.
- Giao diện responsive, ưu tiên tối ưu di động cho luồng QR/kiểm kê/báo sự cố tại hiện trường.

## 10. Đặc tả API / Apps Script service

Toàn bộ hàm public được gọi từ frontend qua google.script.run, tập trung khai báo tại Core.gs, trả về cấu trúc chuẩn { success, data, error:{code,message} }. Dưới đây là các nhóm endpoint chính (không liệt kê toàn bộ ~150+ hàm chi tiết, sẽ hoàn thiện ở thiết kế kỹ thuật).

| Nhóm | Hàm tiêu biểu | Mô tả |
|---|---|---|
| Auth | login(), getCurrentUser(), checkPermission(module, action) | Xác thực và kiểm tra quyền theo module/hành động/phạm vi |
| Device | listDevices(filter,page), getDeviceDetail(id), createDevice(data), updateDevice(id,data), changeDeviceStatus(id,newStatus,reason) | CRUD và chuyển trạng thái thiết bị (qua state machine) |
| Receipt/Acceptance/Handover | createReceipt(), completeAcceptance(id,result), confirmHandover(id) | Workflow hình thành thiết bị |
| Maintenance/Inspection/Calibration | getSchedule(deviceId), submitResult(id,result), getConfig(loaiTB) | Đọc cấu hình chu kỳ, ghi nhận kết quả, tạo kỳ tiếp theo |
| Incident/Repair | reportIncident(deviceId,data), createRepairTicket(incidentId), closeRepair(id, safetyCheck) | Sự cố, sửa chữa, xác nhận an toàn sau sửa |
| Transfer/Inventory | createTransfer(), approveTransfer(id), createInventorySession(), scanQR(sessionId, deviceId, result) | Điều chuyển và kiểm kê QR |
| Document | uploadFile(deviceId,group,file), deleteFile(fileId), listFiles(deviceId) | Thao tác Drive, luôn ghi Audit |
| QR | generateQR(deviceId), printLabels(deviceIds[]) | Sinh QR và tem in hàng loạt |
| Alert | runDailyScan() [trigger], getMyTasks(userId), completeTask(id, evidence) | Cảnh báo tự động, công việc |
| Report | getDashboardSummary(), buildDeviceProfileExport(deviceId), exportReport(type, filter) | Dashboard, xuất bộ hồ sơ, báo cáo |
| Admin | importExcel(fileId), getImportPreview(fileId), manageUsers(), manageConfig() | Import dữ liệu, quản trị hệ thống |
| Audit | getAuditLog(filter) | Chỉ đọc, giới hạn Super Admin/Lãnh đạo |

## 11. Quy tắc validation và chất lượng dữ liệu (Import Excel)

### 11.1. Luồng import

Upload file → Kiểm tra cấu trúc (đúng template cột) → Kiểm tra dữ liệu từng dòng → Phát hiện lỗi/trùng → Xem trước kết quả (dòng hợp lệ / dòng lỗi) → Người dùng xác nhận → Nhập chính thức (chỉ nhập dòng hợp lệ, dòng lỗi nghiêm trọng bị loại và xuất báo cáo lỗi).

### 11.2. Quy tắc kiểm tra

- Trùng SERIAL hoặc trùng MA_THIET_BI trong file và với dữ liệu đã có trong hệ thống — chặn nhập, yêu cầu xử lý thủ công.
- Thiếu trường bắt buộc: tên thiết bị, nhóm, khoa/phòng, vị trí, người phụ trách, ngày đưa vào sử dụng.
- Sai định dạng ngày, giá trị không thuộc danh mục chuẩn (khoa/phòng, hãng, loại thiết bị... phải khớp danh mục đã cấu hình), dòng trống, dữ liệu không hợp lệ về kiểu (VD: năm sản xuất không phải số).
- Không tự động nhập các dòng có lỗi nghiêm trọng (trùng khoá, thiếu trường bắt buộc); chỉ cảnh báo với lỗi nhẹ (VD: thiếu trường không bắt buộc) và cho phép nhập kèm cờ “cần bổ sung”.

### 11.3. Dashboard chất lượng dữ liệu

- Số thiết bị thiếu thông tin theo từng trường quan trọng.
- Số bản ghi trùng lặp cần xử lý (serial/mã trùng phát hiện sau import).
- Tỷ lệ hồ sơ thiếu theo checklist (29_CHECKLIST_HO_SO).
- Số thiết bị có quy tắc áp dụng (kiểm định/hiệu chuẩn/bức xạ) chưa xác định — cần bệnh viện xác nhận thay vì để hệ thống tự suy diễn.

## 12. Chiến lược backup/restore và audit

### 12.1. Backup/Restore

- Backup tự động định kỳ (đề xuất: hằng ngày) — sao chép toàn bộ Spreadsheet (Sheets + cấu trúc) vào thư mục 07_BACKUP trên Drive, đặt tên kèm timestamp.
- Ghi nhật ký backup riêng (thời điểm, kết quả, dung lượng, người/ tiến trình thực hiện) để theo dõi tính liên tục.
- Kiểm tra khả năng phục hồi định kỳ (VD: hằng quý) — thực hiện restore thử trên bản sao để xác nhận file backup dùng được.
- Quy trình restore chính thức: xác định bản backup mục tiêu → tạo bản sao làm việc → đối chiếu dữ liệu → chuyển đổi có kiểm soát, không ghi đè trực tiếp lên dữ liệu sống khi chưa xác minh.
- Hỗ trợ xuất dữ liệu/hồ sơ (Excel/CSV/PDF) theo yêu cầu để hạn chế phụ thuộc nền tảng Google về lâu dài.

### 12.2. Audit

- Ghi audit cho: đăng nhập, thêm/sửa thiết bị, điều chuyển, bảo trì/kiểm định/hiệu chuẩn, sửa chữa, upload/xoá tài liệu, thay đổi quyền, duyệt nghiệp vụ, đổi trạng thái, đóng khắc phục và mọi thay đổi quan trọng khác.
- Mỗi bản ghi log gồm: thời gian, người thực hiện, hành động, đối tượng, ID đối tượng, giá trị trước/sau (khi phù hợp).
- Người dùng thông thường (kể cả Quản lý thiết bị) không được sửa/xoá Audit log; chỉ Super Admin có quyền xem toàn bộ, các vai trò khác không truy cập trực tiếp.

### 12.3. Kiểm soát đồng thời và hiệu năng

- LockService áp dụng cho mọi thao tác ghi quan trọng (tạo thiết bị, đổi trạng thái, ghi nghiệp vụ) để tránh xung đột khi nhiều người thao tác cùng lúc.
- CacheService lưu tạm danh mục và dữ liệu tra cứu thường dùng (danh mục 02-09, 25-27) để giảm số lần đọc Sheet trực tiếp.
- Data Access layer chỉ đọc các cột/phạm vi cần thiết (không đọc toàn bộ Sheet ở mọi thao tác); dùng chỉ mục phụ trợ (VD: Sheet ánh xạ THIET_BI_ID → số dòng) để tra cứu nhanh khi số lượng thiết bị và bản ghi nghiệp vụ tăng.
- Với báo cáo/thống kê lớn, cân nhắc bảng tổng hợp trung gian được cập nhật theo lịch (không tính toán lại từ đầu mỗi lần xem Dashboard).

## 13. Kế hoạch triển khai theo giai đoạn

| Giai đoạn | Phạm vi | Đầu ra | Tiêu chí nghiệm thu |
|---|---|---|---|
| 1 — Dữ liệu nền | Danh mục chuẩn; Thiết bị & hồ sơ; Khoa/phòng, vị trí; QR; Import Excel; Phân quyền cơ bản; Audit | Sheet + Apps Script nền tảng, Devices.html, DeviceDetail.html (tab Nhận dạng/Sử dụng), Admin (danh mục, người dùng) | Nhập/tra cứu tối thiểu 200 thiết bị; mỗi thiết bị có mã & QR duy nhất, quét mở được hồ sơ; import Excel hoạt động kèm kiểm tra lỗi |
| 2 — Nghiệp vụ cốt lõi | Tiếp nhận/Nghiệm thu/Bàn giao; Bảo hành; Bảo trì; Kiểm định; Hiệu chuẩn; Sửa chữa; Điều chuyển; Kiểm kê; Cảnh báo cơ bản | Các module .gs và .html tương ứng; Alert.gs (time-driven trigger); state machine trạng thái thiết bị đầy đủ | Toàn bộ workflow ở mục 6 chạy được đầu-cuối; cảnh báo hạn tự động sinh đúng theo cấu hình; không mất lịch sử khi cập nhật |
| 3 — Nâng cao | Checklist pháp lý-kỹ thuật; Đào tạo; An toàn/thu hồi; Phụ tùng; Downtime; Thanh lý; Khắc phục audit; Xuất bộ hồ sơ | Document.gs hoàn chỉnh cấu trúc Drive; Report.gs (xuất bộ hồ sơ thiết bị); các màn hình còn lại | Xuất được bộ hồ sơ đầy đủ một thiết bị bất kỳ; checklist hồ sơ và cảnh báo hồ sơ thiếu hoạt động chính xác |
| 4 — Phân tích & hoàn thiện | Chi phí vòng đời; phân tích sửa chữa nhiều/downtime; dashboard lãnh đạo; backup/restore chính thức; kiểm thử tải và bảo mật | Report.gs mở rộng phân tích quản trị; quy trình backup/restore vận hành thực tế; tài liệu hướng dẫn sử dụng/quản trị | Dashboard lãnh đạo trả lời được các câu hỏi ở mục 30 Đặc tả; đã kiểm tra restore thành công ít nhất 1 lần; hệ thống đạt các tiêu chí hoàn thành V1.1/V1.2 (mục 27 Đặc tả) |

*Mỗi giai đoạn kết thúc bằng bước nghiệm thu với Khoa Dược - VTTBYT trước khi chuyển giai đoạn tiếp theo; không triển khai song song nhiều giai đoạn để tránh rủi ro thiếu nền tảng dữ liệu.*

## 14. Danh sách vấn đề cần Bệnh viện xác nhận trước khi lập trình

Theo nguyên tắc “không tự giả định quy định nghiệp vụ/pháp lý chưa được cung cấp” (mục 28, 31 Đặc tả), các điểm sau cần Khoa Dược - VTTBYT và các bên liên quan xác nhận trước khi chuyển sang thiết kế kỹ thuật chi tiết:

- Danh mục thực tế: danh sách đầy đủ khoa/phòng, vị trí, hãng sản xuất, nhà cung cấp hiện có (để nạp dữ liệu nền ban đầu).
- Căn cứ pháp lý áp dụng kiểm định/hiệu chuẩn theo từng loại/nhóm thiết bị cụ thể (thông tư/quy định nào áp dụng cho loại nào) — hệ thống chỉ lưu trường “căn cứ áp dụng”, không tự suy luận.
- Chu kỳ bảo trì cụ thể theo từng loại/model thiết bị (tháng/quý/năm) để nạp vào 27_CAU_HINH ban đầu.
- Quy tắc phân loại A/B/C/D áp dụng theo văn bản/tiêu chí nào của bệnh viện.
- Danh sách vai trò người dùng dự kiến ban đầu và số lượng tài khoản cần cấp, phạm vi khoa/phòng của từng người.
- Cơ chế xác thực: hệ thống có sẵn Google Workspace domain của bệnh viện hay cần thiết lập mới; chính sách cấp/thu hồi tài khoản.
- Ngưỡng cụ thể cho các cảnh báo “sửa chữa nhiều”, “downtime cao”, “thiết bị lâu năm cần xem xét” dùng trong phân tích quản trị (mục 22 Đặc tả nêu rõ đây là tiêu chí nội bộ, không phải kết luận thay thế/thanh lý).
- Quy định/thủ tục thanh lý tài sản y tế công áp dụng tại bệnh viện (hội đồng thanh lý, thẩm quyền phê duyệt theo giá trị tài sản).
- Có yêu cầu tích hợp với hệ thống HIS hoặc phần mềm khác trong giai đoạn đầu hay chỉ dự phòng kiến trúc cho tương lai.
- Mẫu biểu chính thức hiện dùng (phiếu tiếp nhận, biên bản nghiệm thu, phiếu bàn giao, phiếu sửa chữa...) để chuẩn hoá form và file xuất.
- Ngân sách/thời lượng dự kiến cho từng giai đoạn triển khai (ảnh hưởng đến việc chia nhỏ phạm vi Giai đoạn 2-3 nếu cần).
- Chính sách chia sẻ dữ liệu ra ngoài bệnh viện (nếu có, ví dụ báo cáo cho Sở Y tế) để thiết kế đúng phạm vi xuất báo cáo.
**Sau khi các nội dung trên được Bệnh viện xác nhận và phương án thiết kế này được phê duyệt, bước tiếp theo là thiết kế kỹ thuật chi tiết (cấu trúc Sheet thật, mã nguồn Apps Script, giao diện HTML/CSS/JS) theo đúng phân kỳ ở mục 13.**
