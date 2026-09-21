// adminEvaluations.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout } from "../auth.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let allMatches = [];
let allCompetitions = [];
let allEvaluations = [];
let currentFilter = "all";
let currentMatchId = null;

// ✅ تنسيق الوقت
function formatTime(timeString) {
  if (!timeString) return "-";

  if (timeString.includes("ص") || timeString.includes("م")) {
    return timeString;
  }

  try {
    let parts = timeString.split(":");
    let hours = parseInt(parts[0]);
    let minutes = parts[1];

    let ampm = hours >= 12 ? "م" : "ص";

    if (hours > 12) {
      hours = hours - 12;
    } else if (hours === 0) {
      hours = 12;
    }

    return `${hours}.${minutes} ${ampm}`;
  } catch (e) {
    return timeString;
  }
}

// ✅ تنسيق التاريخ
function formatDate(dateString) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ✅ أسماء الأدوار بالعربي
function getRoleName(role) {
  const roles = {
    main: "رئيسي",
    assistant1: "مساعد أول",
    assistant2: "مساعد ثاني",
    fourth: "رابع",
    var: "VAR",
    avar: "AVAR",
  };
  return roles[role] || role;
}

// ✅ كلاس الدور
function getRoleClass(role) {
  if (role === "main") return "role-main";
  if (role === "assistant1" || role === "assistant2") return "role-assistant";
  if (role === "fourth") return "role-fourth";
  if (role === "var" || role === "avar") return "role-var";
  return "";
}

// ✅ لون الدور
function getRoleBadgeColor(role) {
  if (role === "main") return "bg-primary";
  if (role === "assistant1" || role === "assistant2") return "bg-success";
  if (role === "fourth") return "bg-warning text-dark";
  if (role === "var" || role === "avar") return "bg-danger";
  return "bg-secondary";
}

// Initialize
async function init() {
  try {
    const auth = await requireAuth(["admin"]);
    if (!auth) return;

    document.getElementById("adminName").textContent =
      auth.user.email || "أدمن";
    document.getElementById("currentDate").textContent =
      new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    await loadCompetitions();
    await loadFinishedMatches();

    // Event listeners
    document
      .getElementById("logoutBtn")
      .addEventListener("click", handleLogout);

    document.getElementById("sidebarToggle").addEventListener("click", () => {
      document.querySelector(".sidebar-wrapper").classList.toggle("show");
    });

    document
      .getElementById("filterCompetition")
      .addEventListener("change", applyFilters);

    document
      .getElementById("filterDateFrom")
      .addEventListener("change", applyFilters);

    document
      .getElementById("filterDateTo")
      .addEventListener("change", applyFilters);

    document
      .getElementById("filterSearch")
      .addEventListener("input", applyFilters);

    document.querySelectorAll(".filter-tabs .btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        document
          .querySelectorAll(".filter-tabs .btn")
          .forEach((b) => b.classList.remove("active"));
        this.classList.add("active");
        currentFilter = this.dataset.filter;
        applyFilters();
      });
    });

    document
      .getElementById("saveEvaluationsBtn")
      .addEventListener("click", saveEvaluations);
  } catch (error) {
    console.error("Init error:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل الصفحة",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ تحميل المسابقات
async function loadCompetitions() {
  try {
    const { data, error } = await supabase
      .from("competitions")
      .select("*")
      .order("name");

    if (error) throw error;
    allCompetitions = data || [];

    const select = document.getElementById("filterCompetition");
    select.innerHTML = '<option value="">جميع المسابقات</option>';
    allCompetitions.forEach((comp) => {
      select.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
    });
  } catch (error) {
    console.error("Error loading competitions:", error);
  }
}

// ✅ تحميل المباريات المنتهية
async function loadFinishedMatches() {
  try {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("matches")
      .select(
        `
        *,
        competitions!inner(name),
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        main_referee:referees!matches_main_referee_id_fkey(id, full_name),
        fourth_referee:referees!matches_fourth_referee_id_fkey(id, full_name),
        assistant1:referees!matches_assistant1_referee_id_fkey(id, full_name),
        assistant2:referees!matches_assistant2_referee_id_fkey(id, full_name),
        var_referee:referees!matches_var_referee_id_fkey(id, full_name),
        avar_referee:referees!matches_avar_referee_id_fkey(id, full_name)
      `,
      )
      .lt("match_date", today)
      .order("match_date", { ascending: false });

    if (error) throw error;
    allMatches = data || [];

    // ✅ تحميل التقييمات
    await loadEvaluations();

    // ✅ حساب الإحصائيات
    updateStats();

    // ✅ عرض المباريات
    applyFilters();
  } catch (error) {
    console.error("Error loading finished matches:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل المباريات",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ تحميل التقييمات
async function loadEvaluations() {
  try {
    const { data, error } = await supabase
      .from("match_evaluations")
      .select("*");

    if (error) throw error;
    allEvaluations = data || [];
  } catch (error) {
    console.error("Error loading evaluations:", error);
    allEvaluations = [];
  }
}

// ✅ حساب الإحصائيات
function updateStats() {
  const totalFinished = allMatches.length;

  // عدد المباريات المُقيَّمة (اللي فيها تقييم واحد على الأقل)
  const evaluatedMatchIds = new Set(allEvaluations.map((e) => e.match_id));
  const totalEvaluated = evaluatedMatchIds.size;
  const totalPending = totalFinished - totalEvaluated;

  // متوسط التقييم العام
  let avgRating = "-";
  if (allEvaluations.length > 0) {
    const sum = allEvaluations.reduce((acc, e) => acc + e.rating, 0);
    avgRating = (sum / allEvaluations.length).toFixed(1);
  }

  document.getElementById("totalFinishedMatches").textContent = totalFinished;
  document.getElementById("totalEvaluatedMatches").textContent = totalEvaluated;
  document.getElementById("totalPendingMatches").textContent = totalPending;
  document.getElementById("overallAverageRating").textContent = avgRating;
}

// ✅ تطبيق الفلاتر
function applyFilters() {
  const competition = document.getElementById("filterCompetition").value;
  const dateFrom = document.getElementById("filterDateFrom").value;
  const dateTo = document.getElementById("filterDateTo").value;
  const search = document
    .getElementById("filterSearch")
    .value.trim()
    .toLowerCase();

  let filtered = [...allMatches];

  // فلتر المسابقة
  if (competition) {
    filtered = filtered.filter((m) => m.competition_id === competition);
  }

  // فلتر التاريخ من
  if (dateFrom) {
    filtered = filtered.filter((m) => m.match_date >= dateFrom);
  }

  // فلتر التاريخ إلى
  if (dateTo) {
    filtered = filtered.filter((m) => m.match_date <= dateTo);
  }

  // فلتر البحث
  if (search) {
    filtered = filtered.filter((m) => {
      const homeName = m.home_team?.name?.toLowerCase() || "";
      const awayName = m.away_team?.name?.toLowerCase() || "";
      const mainRef = m.main_referee?.full_name?.toLowerCase() || "";
      const stadium = m.stadium?.toLowerCase() || "";
      return (
        homeName.includes(search) ||
        awayName.includes(search) ||
        mainRef.includes(search) ||
        stadium.includes(search)
      );
    });
  }

  // فلتر الحالة (مُقيَّم / غير مُقيَّم)
  if (currentFilter === "evaluated") {
    const evaluatedIds = new Set(allEvaluations.map((e) => e.match_id));
    filtered = filtered.filter((m) => evaluatedIds.has(m.id));
  } else if (currentFilter === "pending") {
    const evaluatedIds = new Set(allEvaluations.map((e) => e.match_id));
    filtered = filtered.filter((m) => !evaluatedIds.has(m.id));
  }

  renderMatches(filtered);
}

// ✅ عرض المباريات
function renderMatches(matches) {
  const container = document.getElementById("matchesList");

  if (!matches || matches.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-inbox"></i>
        <h5>لا توجد مباريات</h5>
        <p>لا توجد مباريات منتهية مطابقة للفلاتر المحددة</p>
      </div>
    `;
    return;
  }

  let html = "";
  let currentDate = null;

  matches.forEach((match) => {
    // فاصل التاريخ
    if (currentDate !== match.match_date) {
      currentDate = match.match_date;
      html += `
        <div class="date-divider-content my-3">
          <span class="date-divider-text">
            📅 ${formatDate(match.match_date)}
          </span>
        </div>
      `;
    }

    // ✅ تقييمات المباراة دي
    const matchEvaluations = allEvaluations.filter(
      (e) => e.match_id === match.id,
    );
    const isEvaluated = matchEvaluations.length > 0;

    // متوسط التقييم
    let avgRating = "-";
    if (isEvaluated) {
      const sum = matchEvaluations.reduce((acc, e) => acc + e.rating, 0);
      avgRating = (sum / matchEvaluations.length).toFixed(1);
    }

    // الحكام
    const referees = [
      { role: "main", name: match.main_referee?.full_name },
      { role: "assistant1", name: match.assistant1?.full_name },
      { role: "assistant2", name: match.assistant2?.full_name },
      { role: "fourth", name: match.fourth_referee?.full_name },
      { role: "var", name: match.var_referee?.full_name },
      { role: "avar", name: match.avar_referee?.full_name },
    ].filter((r) => r.name);

    html += `
      <div class="match-eval-card ${isEvaluated ? "evaluated" : ""}">
        <div class="match-eval-header">
          <div style="flex: 1;">
            <div class="match-eval-teams">
              ${match.home_team?.name || "-"}
              <span style="color: #dc3545; margin: 0 8px;">×</span>
              ${match.away_team?.name || "-"}
            </div>
            <div class="match-eval-info">
              <i class="fas fa-trophy"></i>
              ${match.competitions?.name || "-"}
              <span class="mx-2">|</span>
              <i class="fas fa-clock"></i>
              ${formatTime(match.match_time)}
              <span class="mx-2">|</span>
              <i class="fas fa-map-marker-alt"></i>
              ${match.stadium || "-"}
            </div>
            <div class="match-eval-referees">
              ${referees
                .map(
                  (r) => `
                <span class="badge ${getRoleBadgeColor(r.role)}" title="${getRoleName(r.role)}">
                  ${r.name}
                </span>
              `,
                )
                .join("")}
            </div>
          </div>

          <div class="match-eval-rating">
            ${
              isEvaluated
                ? `
              <div class="rating-value">${avgRating}</div>
              <div class="rating-label">متوسط التقييم</div>
              <div class="rating-label">(${matchEvaluations.length} تقييم)</div>
            `
                : `
              <div class="rating-value" style="color: #dc3545;">-</div>
              <div class="rating-label">لم يتم التقييم</div>
            `
            }
          </div>

          <div>
            <button class="btn ${
              isEvaluated ? "btn-warning" : "btn-primary"
            } evaluate-btn" data-id="${match.id}">
              <i class="fas fa-star me-1"></i>
              ${isEvaluated ? "تعديل التقييم" : "تقييم"}
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Event listeners
  document.querySelectorAll(".evaluate-btn").forEach((btn) => {
    btn.addEventListener("click", () => openEvaluationModal(btn.dataset.id));
  });
}

// ✅ فتح مودال التقييم
async function openEvaluationModal(matchId) {
  try {
    currentMatchId = matchId;

    const match = allMatches.find((m) => m.id === matchId);
    if (!match) throw new Error("Match not found");

    // ✅ معلومات المباراة
    document.getElementById("evaluationMatchInfo").innerHTML = `
      <div class="alert alert-info">
        <h6 class="mb-1">
          <strong>${match.home_team?.name || "-"}</strong>
          ×
          <strong>${match.away_team?.name || "-"}</strong>
        </h6>
        <small>
          ${match.competitions?.name || "-"} |
          ${formatDate(match.match_date)} |
          ${formatTime(match.match_time)} |
          ${match.stadium || "-"}
        </small>
      </div>
    `;

    // ✅ الحكام
    const referees = [
      {
        role: "main",
        id: match.main_referee_id,
        name: match.main_referee?.full_name,
      },
      {
        role: "assistant1",
        id: match.assistant1_referee_id,
        name: match.assistant1?.full_name,
      },
      {
        role: "assistant2",
        id: match.assistant2_referee_id,
        name: match.assistant2?.full_name,
      },
      {
        role: "fourth",
        id: match.fourth_referee_id,
        name: match.fourth_referee?.full_name,
      },
      {
        role: "var",
        id: match.var_referee_id,
        name: match.var_referee?.full_name,
      },
      {
        role: "avar",
        id: match.avar_referee_id,
        name: match.avar_referee?.full_name,
      },
    ].filter((r) => r.id && r.name);

    if (referees.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "لا يوجد حكام معينين في هذه المباراة",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // ✅ التقييمات الموجودة
    const matchEvaluations = allEvaluations.filter(
      (e) => e.match_id === matchId,
    );

    // ✅ بناء القايمة
    let html = "";
    referees.forEach((ref) => {
      const existing = matchEvaluations.find((e) => e.referee_id === ref.id);
      const currentRating = existing ? existing.rating : "";
      const currentNotes = existing ? existing.notes || "" : "";

      html += `
        <div class="referee-eval-row ${getRoleClass(ref.role)}">
          <div class="d-flex justify-content-between align-items-center flex-wrap">
            <div>
              <span class="referee-role-badge badge ${getRoleBadgeColor(ref.role)}">
                ${getRoleName(ref.role)}
              </span>
              <span class="referee-name">${ref.name}</span>
            </div>
          </div>
          <div class="rating-input-group">
            <input
              type="number"
              class="form-control rating-input"
              data-referee-id="${ref.id}"
              data-role="${ref.role}"
              min="0"
              max="100"
              placeholder="0 - 100"
              value="${currentRating}"
            />
            <span class="rating-out-of">/ 100</span>
          </div>
          <div class="mt-2">
            <input
              type="text"
              class="form-control notes-input"
              data-referee-id="${ref.id}"
              placeholder="ملاحظات (اختياري)"
              value="${currentNotes}"
            />
          </div>
        </div>
      `;
    });

    document.getElementById("refereesEvaluationList").innerHTML = html;

    // ✅ فتح المودال
    const modal = new bootstrap.Modal(
      document.getElementById("evaluationModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error opening evaluation modal:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات التقييم",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ حفظ التقييمات
async function saveEvaluations() {
  try {
    if (!currentMatchId) return;

    const ratingInputs = document.querySelectorAll(".rating-input");
    const notesInputs = document.querySelectorAll(".notes-input");

    // ✅ جمع التقييمات
    const evaluations = [];

    for (const input of ratingInputs) {
      const refereeId = input.dataset.refereeId;
      const role = input.dataset.role;
      const ratingValue = input.value.trim();

      // تجاهل الخانات الفاضية
      if (ratingValue === "") continue;

      const rating = parseInt(ratingValue);

      // Validation
      if (isNaN(rating) || rating < 0 || rating > 100) {
        Swal.fire({
          icon: "warning",
          title: "تنبيه",
          text: "التقييم يجب أن يكون رقماً من 0 إلى 100",
          confirmButtonText: "حسناً",
        });
        return;
      }

      // ملاحظات
      const notesInput = document.querySelector(
        `.notes-input[data-referee-id="${refereeId}"]`,
      );
      const notes = notesInput ? notesInput.value.trim() : "";

      evaluations.push({
        match_id: currentMatchId,
        referee_id: refereeId,
        referee_role: role,
        rating: rating,
        notes: notes || null,
      });
    }

    if (evaluations.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "الرجاء إدخال تقييم واحد على الأقل",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // ✅ حذف التقييمات القديمة للمباراة دي
    const { error: deleteError } = await supabase
      .from("match_evaluations")
      .delete()
      .eq("match_id", currentMatchId);

    if (deleteError) throw deleteError;

    // ✅ إضافة التقييمات الجديدة
    const { error: insertError } = await supabase
      .from("match_evaluations")
      .insert(evaluations);

    if (insertError) throw insertError;

    Swal.fire({
      icon: "success",
      title: "تم الحفظ",
      text: `تم حفظ ${evaluations.length} تقييم بنجاح`,
      timer: 2000,
      showConfirmButton: false,
    });

    // ✅ إغلاق المودال
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("evaluationModal"),
    );
    modal.hide();

    // ✅ إعادة تحميل البيانات
    await loadEvaluations();
    updateStats();
    applyFilters();
  } catch (error) {
    console.error("Error saving evaluations:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حفظ التقييمات",
      confirmButtonText: "حسناً",
    });
  }
}

// ✅ تسجيل الخروج
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

document.addEventListener("DOMContentLoaded", init);