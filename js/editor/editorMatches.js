// editorMatches.js
import { supabase } from "../supabaseClient.js";
import { requireAuth, logout, getEditorScope } from "../auth.js";
import {
  validateRefereeAvailability,
  showValidationErrors,
} from "../validators.js";
import Swal from "https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm";

let allMatches = [];
let allReferees = [];
let allCompetitions = [];
let scope = null;
let currentMatchId = null;
let currentUser = null;

// editorMatches.js - تحديث دالة init

async function init() {
  try {
    const auth = await requireAuth(["editor"]);
    if (!auth) return;
    currentUser = auth;

    // عرض اسم المستخدم والدور
    const userEmail = auth.user.email || "منسق";
    const editorName = document.getElementById("editorName");
    if (editorName) editorName.textContent = userEmail;

    const roleDisplay = document.getElementById("userRoleDisplay");
    if (roleDisplay) {
      roleDisplay.textContent = "📝 محرر مشروط";
      roleDisplay.style.color = "#ff9800";
    }

    const avatarIcon = document.querySelector(".sidebar-user .avatar i");
    if (avatarIcon) {
      avatarIcon.className = "fas fa-user-edit";
    }

    const currentDate = document.getElementById("currentDate");
    if (currentDate) {
      currentDate.textContent = new Date().toLocaleDateString("ar-EG", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    // تحميل المسابقات أولاً
    await loadCompetitions();

    // ✅ جلب نطاق صلاحيات المحرر (قد يكون null)
    scope = await getEditorScope(auth.user.id);
    console.log("📋 نطاق صلاحيات المحرر:", scope);

    // ✅ إذا كان هناك نطاق، عرض رسالة مناسبة
    if (scope) {
      console.log(`✅ نوع الصلاحية: ${scope.permission_type}`);
      console.log(`✅ التاريخ المحدد: ${scope.assigned_date}`);
      console.log(`✅ المسابقة: ${scope.competition_id || 'جميع المسابقات'}`);
    } else {
      console.log("⚠️ لا توجد صلاحيات للمحرر");
    }

    // عرض رسالة مناسبة
    updateScopeMessage();

    await loadReferees();
    await loadMatches();

    // Event listeners...
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);

    const sidebarToggle = document.getElementById("sidebarToggle");
    if (sidebarToggle) {
      sidebarToggle.addEventListener("click", () => {
        document.querySelector(".sidebar-wrapper").classList.toggle("show");
      });
    }

    const saveBtn = document.getElementById("saveEditorMatchBtn");
    if (saveBtn) saveBtn.addEventListener("click", saveEditorMatch);

    // Filter events
    const filterCompetition = document.getElementById("filterCompetition");
    if (filterCompetition) {
      filterCompetition.addEventListener("change", filterMatches);
    }

    const filterDate = document.getElementById("filterDate");
    if (filterDate) filterDate.addEventListener("change", filterMatches);

    const filterStatus = document.getElementById("filterStatus");
    if (filterStatus) filterStatus.addEventListener("change", filterMatches);

    populateCompetitionFilter();
  } catch (error) {
    console.error("Init error:", error);
  }
}

// ============================================
// ✅ تحديث رسالة النطاق
// ============================================
function updateScopeMessage() {
  const scopeMessage = document.getElementById("scopeMessage");
  const scopeAlert = document.getElementById("scopeAlert");
  
  if (!scopeMessage) return;

  if (!scope) {
    scopeMessage.innerHTML = "⚠️ ليس لديك صلاحيات محددة. يرجى التواصل مع المدير.";
    if (scopeAlert) scopeAlert.className = "alert alert-warning alert-dismissible fade show";
    return;
  }

  const canAssignMain = scope.permission_type === "full";
  
  let scopeText = canAssignMain
    ? "🔸 يمكنك تعيين <strong>الحكام والمساعدين</strong>"
    : "🔹 يمكنك تعيين <strong>المساعدين فقط</strong>";

  if (scope.competition_id) {
    const comp = allCompetitions.find(c => c.id === scope.competition_id);
    const compName = comp?.name || "مسابقة محددة";
    scopeText += ` في مسابقة: <strong>${compName}</strong>`;
  } else {
    scopeText += ` في <strong>جميع المسابقات</strong>`;
  }

  if (scope.assigned_date) {
    scopeText += ` لتاريخ <strong>${new Date(scope.assigned_date).toLocaleDateString("ar-EG")}</strong>`;
  } else {
    scopeText += ` لجميع التواريخ`;
  }

  if (scopeAlert) scopeAlert.className = "alert alert-info alert-dismissible fade show";
  scopeMessage.innerHTML = scopeText;
}

// ============================================
// ✅ تحميل المسابقات
// ============================================
async function loadCompetitions() {
  try {
    const { data, error } = await supabase
      .from("competitions")
      .select("id, name")
      .order("name");

    if (error) throw error;
    allCompetitions = data || [];
    console.log("✅ تم تحميل المسابقات:", allCompetitions.length);
  } catch (error) {
    console.error("Error loading competitions:", error);
  }
}

// ============================================
// ✅ تحميل الحكام
// ============================================
async function loadReferees() {
  try {
    const { data, error } = await supabase
      .from("referees")
      .select("*")
      .eq("is_suspended", false)
      .order("full_name");

    if (error) throw error;
    allReferees = data || [];
    populateDropdowns();
  } catch (error) {
    console.error("Error loading referees:", error);
  }
}

// ============================================
// ✅ تعبئة قوائم الحكام
// ============================================
function populateDropdowns() {
  const canAssignMain = scope?.permission_type === "full";

  // الحكم الرئيسي
  const mainSelect = document.getElementById("editorMainReferee");
  if (mainSelect) {
    mainSelect.innerHTML = '<option value="">اختر الحكم الرئيسي</option>';
    allReferees.forEach((ref) => {
      const label = ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
      mainSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
    });
    mainSelect.disabled = !canAssignMain;
    mainSelect.style.opacity = canAssignMain ? "1" : "0.6";
  }

  // الحكم الرابع
  const fourthSelect = document.getElementById("editorFourthReferee");
  if (fourthSelect) {
    fourthSelect.innerHTML = '<option value="">اختر الحكم الرابع</option>';
    allReferees.forEach((ref) => {
      const label = ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
      fourthSelect.innerHTML += `<option value="${ref.id}">${label}</option>`;
    });
    fourthSelect.disabled = !canAssignMain;
    fourthSelect.style.opacity = canAssignMain ? "1" : "0.6";
  }

  // مساعد أول
  const assistant1Select = document.getElementById("editorAssistant1");
  if (assistant1Select) {
    assistant1Select.innerHTML = '<option value="">اختر المساعد الأول</option>';
    allReferees.forEach((ref) => {
      const label = ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
      assistant1Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
    });
    assistant1Select.disabled = false;
    assistant1Select.style.opacity = "1";
  }

  // مساعد ثاني
  const assistant2Select = document.getElementById("editorAssistant2");
  if (assistant2Select) {
    assistant2Select.innerHTML = '<option value="">اختر المساعد الثاني</option>';
    allReferees.forEach((ref) => {
      const label = ref.degree === "New" ? `${ref.full_name} 🌟 (جديد)` : ref.full_name;
      assistant2Select.innerHTML += `<option value="${ref.id}">${label}</option>`;
    });
    assistant2Select.disabled = false;
    assistant2Select.style.opacity = "1";
  }

  // تحديث التسميات
  const mainLabel = document.getElementById("mainRefereeLabel");
  if (mainLabel) {
    mainLabel.innerHTML = canAssignMain
      ? 'الحكم الرئيسي <span class="text-success">(يمكنك تعيينه)</span>'
      : 'الحكم الرئيسي <span class="text-danger">(قراءة فقط)</span>';
  }

  const fourthLabel = document.getElementById("fourthRefereeLabel");
  if (fourthLabel) {
    fourthLabel.innerHTML = canAssignMain
      ? 'الحكم الرابع <span class="text-success">(يمكنك تعيينه)</span>'
      : 'الحكم الرابع <span class="text-danger">(قراءة فقط)</span>';
  }
}

// ============================================
// ✅ تحميل المباريات حسب النطاق
// ============================================
async function loadMatches() {
  try {
    let query = supabase.from("matches").select(`
      *,
      competitions!inner(name),
      home_team:teams!matches_home_team_id_fkey(name),
      away_team:teams!matches_away_team_id_fkey(name),
      main_referee:referees!matches_main_referee_id_fkey(full_name, id),
      fourth_referee:referees!matches_fourth_referee_id_fkey(full_name, id),
      assistant1:referees!matches_assistant1_referee_id_fkey(full_name, id),
      assistant2:referees!matches_assistant2_referee_id_fkey(full_name, id)
    `);

    // تطبيق نطاق الصلاحية إذا كان موجوداً
    if (scope) {
      console.log("🔍 تطبيق نطاق الصلاحية:", scope);
      
      if (scope.competition_id) {
        query = query.eq("competition_id", scope.competition_id);
        console.log("🔍 تصفية حسب المسابقة:", scope.competition_id);
      }

      if (scope.assigned_date) {
        query = query.eq("match_date", scope.assigned_date);
        console.log("🔍 تصفية حسب التاريخ:", scope.assigned_date);
      }
    } else {
      console.log("⚠️ لا يوجد نطاق صلاحية، سيتم عرض جميع المباريات (للتطوير فقط)");
    }

    query = query.order("match_date", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;
    allMatches = data || [];
    console.log("📊 عدد المباريات:", allMatches.length);
    renderMatches(allMatches);
    populateCompetitionFilter();
  } catch (error) {
    console.error("Error loading matches:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل المباريات",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// ✅ عرض المباريات
// ============================================
function renderMatches(matches) {
  const tbody = document.getElementById("matchesBody");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (!matches || matches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted">
          <i class="fas fa-info-circle me-2"></i>لا توجد مباريات في نطاق صلاحياتك
        </td>
      </tr>
    `;
    return;
  }

  matches.forEach((match) => {
    const tr = document.createElement("tr");

    const mainRef = match.main_referee?.full_name || "-";
    const fourthRef = match.fourth_referee?.full_name || "-";
    const asst1 = match.assistant1?.full_name || "-";
    const asst2 = match.assistant2?.full_name || "-";

    tr.innerHTML = `
      <td>${new Date(match.match_date).toLocaleDateString("ar-EG")}</td>
      <td>${match.match_time}</td>
      <td>${match.stadium}</td>
      <td><strong>${match.home_team?.name || "-"}</strong></td>
      <td><strong>${match.away_team?.name || "-"}</strong></td>
      <td>
        <div class="referee-badges">
          <span class="badge bg-primary" title="رئيسي">R: ${mainRef}</span>
          <span class="badge bg-success" title="مساعد 1">A1: ${asst1}</span>
          <span class="badge bg-success" title="مساعد 2">A2: ${asst2}</span>
          <span class="badge bg-warning" title="رابع">4th: ${fourthRef}</span>
        </div>
      </td>
      <td>${match.notes || "-"}</td>
      <td>
        <div class="btn-group" role="group">
          <button class="btn btn-sm btn-outline-primary view-match" data-id="${match.id}">
            <i class="fas fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-success edit-match" data-id="${match.id}">
            <i class="fas fa-user-plus"></i>
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  document.querySelectorAll(".view-match").forEach((btn) => {
    btn.addEventListener("click", () => viewMatchDetails(btn.dataset.id));
  });
  document.querySelectorAll(".edit-match").forEach((btn) => {
    btn.addEventListener("click", () => openEditorMatchModal(btn.dataset.id));
  });
}

// ============================================
// ✅ تصفية المباريات
// ============================================
function filterMatches() {
  const competition = document.getElementById("filterCompetition")?.value;
  const date = document.getElementById("filterDate")?.value;
  const status = document.getElementById("filterStatus")?.value;

  let filtered = allMatches.filter((match) => {
    if (competition && match.competition_id !== competition) return false;
    if (date && match.match_date !== date) return false;

    if (status === "pending") {
      return !match.assistant1_referee_id || !match.assistant2_referee_id;
    }
    if (status === "complete") {
      return match.assistant1_referee_id && match.assistant2_referee_id;
    }
    return true;
  });

  renderMatches(filtered);
}

// ============================================
// ✅ قائمة المسابقات في الفلتر
// ============================================
function populateCompetitionFilter() {
  const select = document.getElementById("filterCompetition");
  if (!select) return;
  
  const competitions = new Set();
  allMatches.forEach((m) => {
    if (m.competitions?.name) {
      competitions.add(m.competition_id);
    }
  });

  select.innerHTML = '<option value="">جميع المسابقات</option>';
  allMatches.forEach((m) => {
    if (m.competitions?.name && ![...select.options].some(opt => opt.value === m.competition_id)) {
      select.innerHTML += `<option value="${m.competition_id}">${m.competitions.name}</option>`;
    }
  });
}

// ============================================
// ✅ فتح مودال تعيين الحكام
// ============================================
async function openEditorMatchModal(id) {
  try {
    const match = allMatches.find((m) => m.id === id);
    if (!match) throw new Error("Match not found");

    currentMatchId = id;

    const canAssignMain = scope?.permission_type === "full";

    // تعبئة الحقول الثابتة
    document.getElementById("viewCompetition").value = match.competitions?.name || "-";
    document.getElementById("viewStadium").value = match.stadium;
    document.getElementById("viewDate").value = new Date(match.match_date).toLocaleDateString("ar-EG");
    document.getElementById("viewTime").value = match.match_time;
    document.getElementById("viewTeams").value = `${match.home_team?.name || "-"} vs ${match.away_team?.name || "-"}`;

    // تعبئة قوائم الحكام
    populateDropdowns();

    // تعيين القيم الحالية
    document.getElementById("editorMainReferee").value = match.main_referee_id || "";
    document.getElementById("editorFourthReferee").value = match.fourth_referee_id || "";
    document.getElementById("editorAssistant1").value = match.assistant1_referee_id || "";
    document.getElementById("editorAssistant2").value = match.assistant2_referee_id || "";

    // تفعيل/تعطيل الحقول حسب الصلاحية
    const mainSelect = document.getElementById("editorMainReferee");
    const fourthSelect = document.getElementById("editorFourthReferee");
    
    if (mainSelect) {
      mainSelect.disabled = !canAssignMain;
      mainSelect.style.opacity = canAssignMain ? "1" : "0.6";
    }
    if (fourthSelect) {
      fourthSelect.disabled = !canAssignMain;
      fourthSelect.style.opacity = canAssignMain ? "1" : "0.6";
    }

    // تحديث التسميات
    const mainLabel = document.getElementById("mainRefereeLabel");
    if (mainLabel) {
      mainLabel.innerHTML = canAssignMain
        ? 'الحكم الرئيسي <span class="text-success">(يمكنك تعيينه)</span>'
        : 'الحكم الرئيسي <span class="text-danger">(قراءة فقط)</span>';
    }

    const fourthLabel = document.getElementById("fourthRefereeLabel");
    if (fourthLabel) {
      fourthLabel.innerHTML = canAssignMain
        ? 'الحكم الرابع <span class="text-success">(يمكنك تعيينه)</span>'
        : 'الحكم الرابع <span class="text-danger">(قراءة فقط)</span>';
    }

    const modal = new bootstrap.Modal(document.getElementById("editorMatchModal"));
    modal.show();
  } catch (error) {
    console.error("Error opening editor match modal:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل بيانات المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// ✅ حفظ التعيينات
// ============================================
async function saveEditorMatch() {
  try {
    const canAssignMain = scope?.permission_type === "full";
    
    const mainReferee = document.getElementById("editorMainReferee")?.value || null;
    const fourthReferee = document.getElementById("editorFourthReferee")?.value || null;
    const assistant1 = document.getElementById("editorAssistant1")?.value || null;
    const assistant2 = document.getElementById("editorAssistant2")?.value || null;

    const match = allMatches.find((m) => m.id === currentMatchId);
    if (!match) throw new Error("Match not found");

    // التحقق من عدم تكرار الحكام
    const selectedReferees = [mainReferee, fourthReferee, assistant1, assistant2].filter(id => id);
    const uniqueReferees = new Set(selectedReferees);
    
    if (selectedReferees.length !== uniqueReferees.size) {
      Swal.fire({
        icon: "warning",
        title: "تنبيه",
        text: "لا يمكن تعيين نفس الحكم في أكثر من دور",
        confirmButtonText: "حسناً",
      });
      return;
    }

    // التحقق من توفر الحكام
    const allRefs = [
      { id: mainReferee, label: "الحكم الرئيسي", required: canAssignMain },
      { id: fourthReferee, label: "الحكم الرابع", required: canAssignMain },
      { id: assistant1, label: "مساعد أول", required: true },
      { id: assistant2, label: "مساعد ثاني", required: true },
    ];

    const errors = [];
    for (const ref of allRefs) {
      if (ref.id) {
        const result = await validateRefereeAvailability(
          ref.id,
          match.match_date,
          match.match_time,
          currentMatchId,
        );
        if (!result.valid) {
          errors.push(`${ref.label}: ${result.error}`);
        }
      }
    }

    if (errors.length > 0) {
      showValidationErrors(errors);
      return;
    }

    // بناء البيانات للتحديث
    const updateData = {
      assistant1_referee_id: assistant1,
      assistant2_referee_id: assistant2,
    };

    if (canAssignMain) {
      updateData.main_referee_id = mainReferee;
      updateData.fourth_referee_id = fourthReferee;
    }

    const { error } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", currentMatchId);

    if (error) throw error;

    Swal.fire({
      icon: "success",
      title: "تم الحفظ",
      text: canAssignMain 
        ? "تم تعيين طاقم الحكام بالكامل بنجاح"
        : "تم تعيين المساعدين بنجاح",
      timer: 2000,
      showConfirmButton: false,
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById("editorMatchModal"));
    if (modal) modal.hide();

    await loadMatches();
  } catch (error) {
    console.error("Error saving editor match:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: error.message || "حدث خطأ في حفظ التعيينات",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// ✅ عرض تفاصيل المباراة (قراءة فقط)
// ============================================
async function viewMatchDetails(id) {
  try {
    const match = allMatches.find((m) => m.id === id);
    if (!match) throw new Error("Match not found");

    const content = document.getElementById("matchDetailsContent");
    if (!content) return;
    
    content.innerHTML = `
      <div class="row">
        <div class="col-md-6">
          <h5 class="mb-3">معلومات المباراة</h5>
          <div class="info-grid">
            <div><strong>المسابقة:</strong> ${match.competitions?.name || "-"}</div>
            <div><strong>التاريخ:</strong> ${new Date(match.match_date).toLocaleDateString("ar-EG")}</div>
            <div><strong>الوقت:</strong> ${match.match_time}</div>
            <div><strong>الملعب:</strong> ${match.stadium}</div>
            <div><strong>المضيف:</strong> ${match.home_team?.name || "-"}</div>
            <div><strong>الضيف:</strong> ${match.away_team?.name || "-"}</div>
            <div><strong>الملاحظات:</strong> ${match.notes || "-"}</div>
            <div>
              <strong>حالة التبليغ:</strong>
              <span class="badge ${match.is_notified ? "bg-success" : "bg-warning"}">
                ${match.is_notified ? "تم التبليغ" : "لم يتم التبليغ"}
              </span>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <h5 class="mb-3">طاقم الحكام</h5>
          <div class="referee-crew">
            <div class="crew-member">
              <span class="role-badge bg-primary">رئيسي</span>
              <span class="referee-name">${match.main_referee?.full_name || "غير معين"}</span>
            </div>
            <div class="crew-member">
              <span class="role-badge bg-success">مساعد 1</span>
              <span class="referee-name">${match.assistant1?.full_name || "غير معين"}</span>
            </div>
            <div class="crew-member">
              <span class="role-badge bg-success">مساعد 2</span>
              <span class="referee-name">${match.assistant2?.full_name || "غير معين"}</span>
            </div>
            <div class="crew-member">
              <span class="role-badge bg-warning">رابع</span>
              <span class="referee-name">${match.fourth_referee?.full_name || "غير معين"}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById("matchDetailsModal"));
    modal.show();
  } catch (error) {
    console.error("Error viewing match details:", error);
    Swal.fire({
      icon: "error",
      title: "خطأ",
      text: "حدث خطأ في تحميل تفاصيل المباراة",
      confirmButtonText: "حسناً",
    });
  }
}

// ============================================
// ✅ تسجيل الخروج
// ============================================
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