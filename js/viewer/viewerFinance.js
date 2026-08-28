// viewerFinance.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let financeData = [];
let allReferees = [];
let currentUser = null;

// Initialize
async function init() {
  try {
    const auth = await requireAuth(["viewer"]);
    if (!auth) return;

    currentUser = auth;
    document.getElementById("viewerName").textContent =
      auth.user.email || "رئيس اللجنة";

    // ✅ عرض الدور
    const roleDisplay = document.getElementById("userRoleDisplay");
    const avatarIcon = document.querySelector(".sidebar-user .avatar i");
    roleDisplay.textContent = "👁️ مشاهد";
    roleDisplay.style.color = "#2196f3";
    avatarIcon.className = "fas fa-user-tie";

    document.getElementById("currentDate").textContent =
      new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    await loadReferees();
    await loadFinanceData();

    // Event listeners
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);
    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });
    document
      .getElementById("financeFilterReferee")
      .addEventListener("change", filterFinance);
    document
      .getElementById("financeFilterStatus")
      .addEventListener("change", filterFinance);
    document
      .getElementById("exportExcelBtn")
      .addEventListener("click", exportExcel);
    document
      .getElementById("exportPdfBtn")
      .addEventListener("click", exportPdf);
  } catch (error) {
    console.error("Init error:", error);
  }
}

// Load referees for filter
async function loadReferees() {
  try {
    const { data, error } = await supabase
      .from("referees")
      .select("id, full_name")
      .order("full_name");

    if (error) throw error;
    allReferees = data || [];

    const select = document.getElementById("financeFilterReferee");
    select.innerHTML = '<option value="">جميع الحكام</option>';
    allReferees.forEach((ref) => {
      select.innerHTML += `<option value="${ref.id}">${ref.full_name}</option>`;
    });
  } catch (error) {
    console.error("Error loading referees:", error);
  }
}

// Load finance data
async function loadFinanceData() {
  try {
    // ✅ جلب المباريات من مسابقات federation فقط
    const { data: matchesData, error } = await supabase
      .from("matches")
      .select(
        `
                *,
                competitions!inner(name, match_fee, payout_source),
                main_referee:referees!matches_main_referee_id_fkey(id, full_name),
                fourth_referee:referees!matches_fourth_referee_id_fkey(id, full_name),
                assistant1:referees!matches_assistant1_referee_id_fkey(id, full_name),
                assistant2:referees!matches_assistant2_referee_id_fkey(id, full_name)
            `,
      )
      .eq("is_paid", false)
      .eq("competitions.payout_source", "federation");

    if (error) throw error;

    // Calculate finance per referee
    const financeMap = new Map();

    matchesData?.forEach((match) => {
      const fee = match.competitions?.match_fee || 0;

      const referees = [
        { ref: match.main_referee, role: "main", weight: 1 },
        { ref: match.fourth_referee, role: "fourth", weight: 0.5 },
        { ref: match.assistant1, role: "assistant1", weight: 0.75 },
        { ref: match.assistant2, role: "assistant2", weight: 0.75 },
      ];

      referees.forEach(({ ref, role, weight }) => {
        if (!ref) return;

        const key = ref.id;
        if (!financeMap.has(key)) {
          financeMap.set(key, {
            referee_id: ref.id,
            referee_name: ref.full_name,
            competitions: new Map(),
            total_matches: 0,
            total_fee: 0,
            total_deduction: 0,
            net_amount: 0,
            is_paid: false,
          });
        }

        const entry = financeMap.get(key);
        const compKey = match.competition_id;

        if (!entry.competitions.has(compKey)) {
          entry.competitions.set(compKey, {
            name: match.competitions?.name || "غير محدد",
            matches: 0,
            fee: 0,
          });
        }

        const compData = entry.competitions.get(compKey);
        const matchFee = fee * weight;
        compData.matches += 1;
        compData.fee += matchFee;

        entry.total_matches += 1;
        entry.total_fee += matchFee;
      });
    });

    // Calculate deductions and net amounts
    financeData = Array.from(financeMap.values()).map((entry) => {
      const deduction = entry.total_fee * 0.1;
      const net = entry.total_fee - deduction;
      return {
        ...entry,
        total_deduction: deduction,
        net_amount: net,
        competitions: Array.from(entry.competitions.values()),
      };
    });

    // Update summary
    updateSummary(financeData);
    renderFinance(financeData);
  } catch (error) {
    console.error("Error loading finance data:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل البيانات المالية",
      confirmButtonText: "حسناً",
    });
  }
}

// Update summary cards
function updateSummary(data) {
  const totalFees = data.reduce((sum, item) => sum + item.total_fee, 0);
  const totalDeductions = data.reduce(
    (sum, item) => sum + item.total_deduction,
    0,
  );
  const totalPaid = data
    .filter((item) => item.is_paid)
    .reduce((sum, item) => sum + item.total_fee, 0);
  const totalUnpaid = totalFees - totalPaid;

  document.getElementById("totalFees").textContent = totalFees.toFixed(2);
  document.getElementById("paidFees").textContent = totalPaid.toFixed(2);
  document.getElementById("unpaidFees").textContent = totalUnpaid.toFixed(2);
  document.getElementById("deductionTotal").textContent =
    totalDeductions.toFixed(2);
}

// Render finance table
function renderFinance(data) {
  const tbody = document.getElementById("financeBody");
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="fas fa-info-circle me-2"></i>لا توجد بيانات مالية (مسابقات الاتحاد فقط)
                </td>
            </tr>
        `;
    return;
  }

  data.forEach((item) => {
    const tr = document.createElement("tr");
    const competitionsList = item.competitions
      .map((c) => `${c.name} (${c.matches} مباريات - ${c.fee.toFixed(2)} ج.م)`)
      .join("<br>");

    tr.innerHTML = `
            <td><strong>${item.referee_name}</strong></td>
            <td>${competitionsList}</td>
            <td>${item.total_matches}</td>
            <td>${item.total_fee.toFixed(2)} ج.م</td>
            <td class="text-danger">${item.total_deduction.toFixed(2)} ج.م</td>
            <td class="text-success"><strong>${item.net_amount.toFixed(2)} ج.م</strong></td>
            <td>
                <span class="badge ${item.is_paid ? "bg-success" : "bg-warning"}">
                    ${item.is_paid ? "مدفوع" : "غير مدفوع"}
                </span>
            </td>
            <td>
                <span class="text-muted">عرض فقط</span>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// Filter finance
function filterFinance() {
  const refereeId = document.getElementById("financeFilterReferee").value;
  const status = document.getElementById("financeFilterStatus").value;

  let filtered = financeData;

  if (refereeId) {
    filtered = filtered.filter((item) => item.referee_id === refereeId);
  }

  if (status === "paid") {
    filtered = filtered.filter((item) => item.is_paid);
  } else if (status === "unpaid") {
    filtered = filtered.filter((item) => !item.is_paid);
  }

  renderFinance(filtered);
}

// Export to Excel
function exportExcel() {
  try {
    const data = financeData.map((item) => ({
      "اسم الحكم": item.referee_name,
      "عدد المباريات": item.total_matches,
      "المكافأة الإجمالية": item.total_fee.toFixed(2),
      "الخصم (10%)": item.total_deduction.toFixed(2),
      الصافي: item.net_amount.toFixed(2),
      الحالة: item.is_paid ? "مدفوع" : "غير مدفوع",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "المالية");

    ws["!cols"] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    XLSX.writeFile(
      wb,
      `التقرير_المالي_${new Date().toLocaleDateString("ar-EG")}.xlsx`,
    );

    Swal.fire({
      icon: "success",
      title: "تم التصدير",
      text: "تم تصدير التقرير المالي بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error("Error exporting Excel:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تصدير الملف",
      confirmButtonText: "حسناً",
    });
  }
}

// Export to PDF
function exportPdf() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");

    doc.setFontSize(18);
    doc.text("التقرير المالي - لجنة الحكام الرئيسية - التطوير", 14, 20);

    doc.setFontSize(12);
    doc.text(`التاريخ: ${new Date().toLocaleDateString("ar-EG")}`, 14, 30);

    const tableData = financeData.map((item) => [
      item.referee_name,
      item.total_matches,
      item.total_fee.toFixed(2),
      item.total_deduction.toFixed(2),
      item.net_amount.toFixed(2),
      item.is_paid ? "مدفوع" : "غير مدفوع",
    ]);

    const headers = [
      ["اسم الحكم", "عدد المباريات", "المكافأة", "الخصم", "الصافي", "الحالة"],
    ];

    doc.autoTable({
      head: headers,
      body: tableData,
      startY: 40,
      styles: {
        fontSize: 10,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [0, 200, 83],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: {
        fillColor: [240, 240, 240],
      },
    });

    const totalFees = financeData.reduce(
      (sum, item) => sum + item.total_fee,
      0,
    );
    const totalDeductions = financeData.reduce(
      (sum, item) => sum + item.total_deduction,
      0,
    );
    const totalNet = financeData.reduce(
      (sum, item) => sum + item.net_amount,
      0,
    );

    doc.setFontSize(12);
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.text(`إجمالي المكافآت: ${totalFees.toFixed(2)} ج.م`, 14, finalY);
    doc.text(
      `إجمالي الخصومات: ${totalDeductions.toFixed(2)} ج.م`,
      14,
      finalY + 8,
    );
    doc.text(`إجمالي الصافي: ${totalNet.toFixed(2)} ج.م`, 14, finalY + 16);

    doc.save(`التقرير_المالي_${new Date().toLocaleDateString("ar-EG")}.pdf`);

    Swal.fire({
      icon: "success",
      title: "تم التصدير",
      text: "تم تصدير التقرير المالي بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });
  } catch (error) {
    console.error("Error exporting PDF:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تصدير الملف",
      confirmButtonText: "حسناً",
    });
  }
}

// Handle logout
async function handleLogout() {
  const result = await Swal.fire({
    title: "تسجيل الخروج",
    text: "هل أنت متأكد من رغبتك في تسجيل الخروج؟",
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "نعم، تسجيل الخروج",
    cancelButtonText: "إلغاء",
  });

  if (result.isConfirmed) {
    await logout();
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", init);
